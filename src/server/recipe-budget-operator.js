import { backupDigest } from '../domain/backup.js';
import { estimatedCostNanoUSD } from '../domain/recipe-budget.js';
import { reconcileOpenAIRecipeBudget } from '../domain/openai-recipe-budget-service.js';
import { exactKeys } from '../domain/recipe-proposal.js';

const fail = message => { throw new Error(`Conciliación de recetas: ${message}`); };
const target = config => `${config.projectId}/${config.databaseId}`;
const ID = /^gen_[a-f0-9]{64}$/;
const EVIDENCE = /^[a-zA-Z0-9_.:-]{8,160}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PLAN_MS = 15 * 60 * 1000;

export function budgetReconciliationPolicy(value = { enabled: false }, now = null) {
  if (value?.enabled === false && Object.keys(value).length === 1) return Object.freeze({ enabled: false });
  if (!value || value.enabled !== true || Object.keys(value).some(key => !['enabled', 'jobName', 'approvedBy', 'approvedAt', 'expiresAt'].includes(key))
    || !/^[a-z][a-z0-9-]{2,62}$/.test(value.jobName || '')
    || typeof value.approvedBy !== 'string' || value.approvedBy.trim().length < 3 || value.approvedBy.length > 180
    || ![value.approvedAt, value.expiresAt].every(date => Number.isFinite(Date.parse(date)))
    || Date.parse(value.expiresAt) <= Date.parse(value.approvedAt)
    || Date.parse(value.expiresAt) - Date.parse(value.approvedAt) > 60 * 60 * 1000
    || (now !== null && (!Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(value.approvedAt)
      || Date.parse(now) >= Date.parse(value.expiresAt))))
    fail('requiere aprobación temporal explícita de hasta una hora.');
  return Object.freeze({ ...value });
}

// The managed job identity is the authority. A digest confirms the reviewed
// plan, but is not a credential. This job never runs in the public API process.
export function requireBudgetReconciliationJob(config, env = process.env, now = new Date().toISOString()) {
  const policy = budgetReconciliationPolicy(config.recipeBudgetReconciliation, now);
  if (!policy.enabled || !['staging', 'production'].includes(config.environment)
    || env.K_SERVICE || env.CLOUD_RUN_JOB !== policy.jobName
    || env.FORX_RECIPE_BUDGET_TARGET !== target(config))
    fail('requiere trabajo privado exclusivo y destino confirmado.');
  return policy;
}

export class RecipeBudgetOperator {
  constructor(runtime, { env = process.env, clock = () => new Date().toISOString() } = {}) {
    Object.assign(this, { runtime, env, clock });
  }
  async guard() {
    const policy = requireBudgetReconciliationJob(this.runtime.config, this.env, this.clock());
    await this.runtime.assertReady();
    return policy;
  }
  async status() {
    await this.guard();
    const records = await this.runtime.repository.list('generation_requests');
    if (records.length > 5000) fail('demasiadas solicitudes; requiere consulta paginada antes de operar.');
    const pending = records.filter(row => row.mode === 'openai' && row.budget?.settlement === 'held'
      && ['pending', 'uncertain'].includes(row.status))
      .map(row => ({ generationRequestId: row.id, revision: row._revision, requestedAt: row.requestedAt,
        status: row.status, model: row.model, reservedNanoUSD: row.budget.reservedNanoUSD,
        responseId: row.budget.responseId || null }))
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.generationRequestId.localeCompare(b.generationRequestId));
    return { target: target(this.runtime.config), pending, count: pending.length };
  }
  async preview(decision) {
    const policy = await this.guard();
    exactKeys(decision, ['generationRequestId', 'evidenceRef', 'usage', 'noCharge', 'model', 'serviceTier', 'responseId'], 'Evidencia');
    if (!ID.test(decision?.generationRequestId || '') || !EVIDENCE.test(decision.evidenceRef || '')
      || (decision.noCharge === true) === (decision.usage != null) || decision.serviceTier !== 'default'
      || (decision.responseId != null && !/^resp_[a-zA-Z0-9_-]{1,120}$/.test(decision.responseId)))
      fail('evidencia inválida o resultado ambiguo.');
    const record = await this.runtime.repository.get('generation_requests', decision.generationRequestId);
    if (!record || record.mode !== 'openai' || record.budget?.settlement !== 'held'
      || !['pending', 'uncertain'].includes(record.status)) fail('solicitud sin reserva conciliable.');
    if (record.status === 'pending' && Date.parse(this.clock()) - Date.parse(record.requestedAt) < 60 * 60 * 1000)
      fail('la solicitud aún puede estar en curso.');
    let estimated = 0n;
    if (!decision.noCharge) {
      if (decision.model !== record.model) fail('modelo distinto; conservar la reserva.');
      estimated = estimatedCostNanoUSD(decision.usage, record.budget.ratesNanoUSDPerMillion);
    }
    const createdAt = this.clock();
    const payload = { version: 1, target: target(this.runtime.config), jobName: policy.jobName,
      approvalDigest: await backupDigest(policy), createdAt,
      expiresAt: new Date(Math.min(Date.parse(createdAt) + PLAN_MS, Date.parse(policy.expiresAt))).toISOString(),
      expectedRevision: record._revision, budgetDigest: await backupDigest(record.budget),
      reservedNanoUSD: record.budget.reservedNanoUSD, estimatedNanoUSD: estimated.toString(), decision };
    return { ...payload, digest: await backupDigest(payload) };
  }
  async apply(plan, { confirmDigest } = {}) {
    const policy = await this.guard();
    const keys = ['version', 'target', 'jobName', 'approvalDigest', 'createdAt', 'expiresAt', 'expectedRevision',
      'budgetDigest', 'reservedNanoUSD', 'estimatedNanoUSD', 'decision', 'digest'];
    if (!plan || Object.keys(plan).length !== keys.length || Object.keys(plan).some(key => !keys.includes(key))
      || plan.version !== 1 || plan.target !== target(this.runtime.config) || plan.jobName !== policy.jobName
      || !DIGEST.test(plan.digest || '') || confirmDigest !== plan.digest || !DIGEST.test(plan.budgetDigest || '')
      || !Number.isSafeInteger(plan.expectedRevision) || plan.expectedRevision < 1) fail('plan o confirmación inválidos.');
    const { digest, ...payload } = plan;
    if (await backupDigest(payload) !== digest || await backupDigest(policy) !== plan.approvalDigest)
      fail('plan o aprobación cambiados.');
    const now = Date.parse(this.clock()), start = Date.parse(plan.createdAt), end = Date.parse(plan.expiresAt);
    if (![now, start, end].every(Number.isFinite) || now < start || now >= end || end - start > PLAN_MS
      || end > Date.parse(policy.expiresAt)) fail('plan vencido; generar una vista nueva.');
    const record = await this.runtime.repository.get('generation_requests', plan.decision?.generationRequestId);
    if (!record || record.mode !== 'openai') fail('solicitud no disponible.');
    const projected = plan.decision.noCharge ? 0n
      : estimatedCostNanoUSD(plan.decision.usage, record.budget.ratesNanoUSDPerMillion);
    if (plan.reservedNanoUSD !== record.budget.reservedNanoUSD || plan.estimatedNanoUSD !== projected.toString())
      fail('los importes revisados ya no coinciden.');
    const actor = { uid: `technical-job:${policy.jobName}`, name: `Trabajo privado; aprobado por ${policy.approvedBy}`, role: 'admin' };
    if (record.budget?.evidenceRef === plan.decision.evidenceRef) {
      const prior = await reconcileOpenAIRecipeBudget(this.runtime.repository, { actor, clock: this.clock, input: plan.decision });
      return { generationRequestId: prior.id, settlement: prior.budget.settlement,
        estimatedNanoUSD: prior.budget.estimatedNanoUSD || '0', alreadyApplied: true };
    }
    if (record._revision !== plan.expectedRevision || await backupDigest(record.budget) !== plan.budgetDigest)
      fail('reserva modificada; revisar de nuevo.');
    const result = await reconcileOpenAIRecipeBudget(this.runtime.repository, { actor, clock: this.clock,
      input: plan.decision, expectedRevision: plan.expectedRevision });
    return { generationRequestId: result.id, settlement: result.budget.settlement,
      estimatedNanoUSD: result.budget.estimatedNanoUSD || '0', alreadyApplied: false };
  }
}
