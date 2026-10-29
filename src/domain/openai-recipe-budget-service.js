import { put, ConcurrentEditError } from '../data/entity-repository.js';
import { atomicWork } from '../data/unit-of-work.js';
import { exactKeys, validateGenerationInput, RECIPE_PROMPT_VERSION } from './recipe-proposal.js';
import { validateRecipe } from './recipes.js';
import { budgetQuota, estimatedCostNanoUSD, readNanoUSD, validateRecipeBudgetPolicy } from './recipe-budget.js';

const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
const money = (held, estimated) => ({ heldNanoUSD: held.toString(), estimatedNanoUSD: estimated.toString() });
const errorText = 'No se obtuvo una propuesta utilizable. No se reintentó la solicitud.';
const uncertainText = 'El consumo o resultado sigue sin confirmar. La reserva se conserva y no se reintentó.';
async function retryAtomic(repository, action) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await atomicWork(repository, action); }
    catch (error) { if (!(error instanceof ConcurrentEditError) || attempt === 4) throw error; }
  }
}

export class OpenAIRecipeBudgetService {
  constructor(repository, { actor, clock = () => new Date().toISOString(), transport, policy }) {
    this.repository = repository; this.actor = actor; this.clock = clock; this.transport = transport;
    this.policy = validateRecipeBudgetPolicy(policy, transport);
  }
  async retry(action) {
    return retryAtomic(this.repository, action);
  }
  authorize(admin = false) {
    if (!this.actor?.uid || !(admin ? ['admin'] : ['admin', 'editor']).includes(this.actor.role)) throw new Error('No tienes permiso para esta operación.');
  }
  async reserve(raw) {
    this.authorize();
    const input = validateGenerationInput(raw), fingerprint = await hash(JSON.stringify(input));
    const id = `gen_${await hash(this.actor.uid + ':' + input.requestId)}`;
    const now = this.clock(), actorHash = await hash(this.actor.uid);
    const quotaIds = [`day_${now.slice(0, 10)}_${actorHash}`, `month_${now.slice(0, 7)}`, 'concurrency'];
    return this.retry(async repository => {
      const previous = await repository.get('generation_requests', id);
      if (previous) {
        if (previous.fingerprint !== fingerprint || previous.mode !== 'openai') throw new Error('Esta identidad ya se usó con otra solicitud.');
        return { existing: previous };
      }
      const preferredIngredients = [];
      for (const ingredientId of input.preferredIngredientIds) {
        const ingredient = await repository.get('ingredients', ingredientId);
        if (!ingredient || ingredient.status !== 'active' || typeof ingredient.canonicalName !== 'string' || ingredient.canonicalName.length > 180
          || !['kg', 'l', 'pz'].includes(ingredient.baseUnit)) throw new Error('Un ingrediente preferido ya no está disponible.');
        preferredIngredients.push({ name: ingredient.canonicalName, unit: ingredient.baseUnit });
      }
      const quotas = await Promise.all(quotaIds.map(key => repository.get('generation_quotas', key)));
      if ((quotas[0]?.count || 0) >= this.policy.userDailyRequests) throw new Error('Se alcanzó el límite diario de solicitudes.');
      if ((quotas[1]?.count || 0) >= this.policy.projectMonthlyRequests) throw new Error('Se alcanzó el límite mensual de solicitudes.');
      if ((quotas[2]?.count || 0) >= this.policy.concurrentRequests) throw new Error('Hay solicitudes reservadas en curso o inciertas.');
      const reservation = readNanoUSD(this.policy.reservationNanoUSD);
      for (const [index, limit] of [[0, this.policy.dailyLimitNanoUSD], [1, this.policy.monthlyLimitNanoUSD]]) {
        const balance = budgetQuota(quotas[index]?.budget);
        if (readNanoUSD(balance.heldNanoUSD) + readNanoUSD(balance.estimatedNanoUSD) + reservation > readNanoUSD(limit)) {
          throw new Error(index === 0 ? 'Se alcanzó el presupuesto diario aprobado.' : 'Se alcanzó el presupuesto mensual aprobado.');
        }
      }
      const { requestId, preferredIngredientIds, ...culinary } = input;
      const context = { ...culinary, preferredIngredients };
      const budget = { unit: 'nanoUSD', approvalRef: this.policy.approvalRef, priceVersion: this.policy.priceVersion,
        ratesNanoUSDPerMillion: this.policy.ratesNanoUSDPerMillion, maxInputTokens: this.policy.maxInputTokens,
        maxOutputTokens: this.policy.maxOutputTokens, reservedNanoUSD: this.policy.reservationNanoUSD,
        estimatedNanoUSD: null, usage: null, settlement: 'held', responseId: null,
        reportedUsage: null, reportedModel: null, reportedTier: null };
      const record = { id, requestId, fingerprint, actorUid: this.actor.uid, mode: 'openai', model: this.policy.model,
        promptVersion: RECIPE_PROMPT_VERSION, requestedAt: now, status: 'pending', context, quotaIds,
        proposal: null, recipeId: null, budget };
      const updated = quotas.map((quota, index) => {
        const value = { id: quotaIds[index], count: (quota?.count || 0) + 1, updatedAt: now };
        if (index < 2) {
          const prior = budgetQuota(quota?.budget);
          value.budget = money(readNanoUSD(prior.heldNanoUSD) + reservation, readNanoUSD(prior.estimatedNanoUSD));
        }
        return put('generation_quotas', value, quota);
      });
      await repository.commit([put('generation_requests', record), ...updated]);
      return { record, context };
    });
  }

  async settle(id, outcome) {
    return this.retry(async repository => {
      const record = await repository.get('generation_requests', id);
      if (!record || record.mode !== 'openai' || record.status !== 'pending' || record.budget?.settlement !== 'held') {
        throw new Error('La solicitud requiere conciliación administrativa; no se volvió a consumir.');
      }
      const known = outcome.usage && outcome.actualModel === record.model && outcome.serviceTier === 'default';
      let estimated = null;
      if (known) {
        try { estimated = estimatedCostNanoUSD(outcome.usage, record.budget.ratesNanoUSDPerMillion); }
        catch { /* An inconsistent report leaves the reservation held. */ }
      }
      const release = outcome.dispatched === false && !outcome.usage;
      const settled = estimated != null;
      const settlement = settled ? 'estimated' : release ? 'released' : 'held';
      let proposal = null;
      if (settled && outcome.status === 'completed' && estimated <= readNanoUSD(record.budget.reservedNanoUSD)
        && outcome.usage.inputTokens <= record.budget.maxInputTokens
        && outcome.usage.outputTokens <= record.budget.maxOutputTokens) {
        try {
          const candidate = outcome.proposal;
          validateRecipe(candidate.recipe);
          if (candidate.recipe.status !== 'draft' || candidate.recipe.lines.some(line => line.ingredientId || line.gramsPerPiece || line.yieldFactor !== '1')) throw new Error();
          proposal = candidate;
        } catch { /* A malformed adapter result never enters the recipe catalog. */ }
      }
      const status = !settled && !release ? 'uncertain' : proposal ? 'completed' : 'failed';
      const budget = { ...record.budget, settlement, estimatedNanoUSD: settled ? estimated.toString() : null,
        usage: settled ? outcome.usage : null, responseId: outcome.responseId || null,
        reportedUsage: outcome.usage || null, reportedModel: outcome.actualModel || null,
        reportedTier: outcome.serviceTier || null };
      const now = this.clock(), operations = [put('generation_requests', { ...record, status,
        error: status === 'completed' ? null : status === 'uncertain' ? uncertainText : errorText,
        proposal, budget, finishedAt: now }, record)];
      if (settlement !== 'held') {
        for (const quotaId of record.quotaIds.slice(0, 2)) {
          const quota = await repository.get('generation_quotas', quotaId);
          if (!quota) throw new Error('La reserva monetaria está incompleta.');
          const prior = budgetQuota(quota.budget), held = readNanoUSD(prior.heldNanoUSD) - readNanoUSD(budget.reservedNanoUSD);
          if (held < 0n) throw new Error('La reserva monetaria está inconsistente.');
          operations.push(put('generation_quotas', { ...quota, budget: money(held, readNanoUSD(prior.estimatedNanoUSD) + (estimated || 0n)), updatedAt: now }, quota));
        }
        const concurrent = await repository.get('generation_quotas', 'concurrency');
        if (!concurrent || concurrent.count < 1) throw new Error('La concurrencia está inconsistente.');
        operations.push(put('generation_quotas', { ...concurrent, count: concurrent.count - 1, updatedAt: now }, concurrent));
      }
      await repository.commit(operations);
      return { status, budget, proposal };
    });
  }

  async generate(raw) {
    const reserved = await this.reserve(raw);
    if (reserved.existing) return reserved.existing;
    let outcome;
    try {
      outcome = await this.transport.request(reserved.context);
      if (!outcome || !['completed', 'refused', 'incomplete', 'invalid'].includes(outcome.status)) throw new Error('Invalid adapter result');
    } catch (error) {
      outcome = { status: 'invalid', usage: null, dispatched: error?.dispatched === false ? false : true };
    }
    await this.settle(reserved.record.id, outcome);
    return this.repository.get('generation_requests', reserved.record.id);
  }

  async reconcile(input) {
    return reconcileOpenAIRecipeBudget(this.repository, { actor: this.actor, clock: this.clock, input });
  }
}

// An operator can reconcile an old, uncertain request without reactivating the
// provider or possessing its API key. Only stored rate snapshots are used.
export async function reconcileOpenAIRecipeBudget(repository, { actor, clock = () => new Date().toISOString(), input, expectedRevision }) {
    if (!actor?.uid || actor.role !== 'admin') throw new Error('No tienes permiso para esta operación.');
    exactKeys(input, ['generationRequestId', 'evidenceRef', 'usage', 'noCharge', 'model', 'serviceTier', 'responseId'], 'Conciliación');
    const { generationRequestId, evidenceRef, usage = null, noCharge = false, model, serviceTier, responseId = null } = input;
    if (!/^gen_[a-f0-9]{64}$/.test(generationRequestId || '') || !/^[a-zA-Z0-9_.:-]{8,160}$/.test(evidenceRef || '')
      || (noCharge === true) === (usage != null) || serviceTier !== 'default'
      || (responseId != null && !/^resp_[a-zA-Z0-9_-]{1,120}$/.test(responseId))) throw new Error('Se requiere evidencia y un solo resultado de consumo.');
    return retryAtomic(repository, async staged => {
      const record = await staged.get('generation_requests', generationRequestId);
      if (!record || record.mode !== 'openai') throw new Error('Solicitud no disponible.');
      if (record.budget?.evidenceRef === evidenceRef) {
        if (record.budget.settlement === (noCharge ? 'released' : 'estimated')
          && (noCharge || model === record.model)
          && (noCharge || JSON.stringify(record.budget.usage) === JSON.stringify(usage))
          && (responseId == null || record.budget.responseId === responseId)) return record;
        throw new Error('La evidencia ya se usó con otro resultado.');
      }
      if (expectedRevision !== undefined && record._revision !== expectedRevision) throw new ConcurrentEditError();
      if (record.budget?.settlement !== 'held' || !['pending', 'uncertain'].includes(record.status)) throw new Error('Esta solicitud ya fue conciliada.');
      if (record.status === 'pending' && Date.parse(clock()) - Date.parse(record.requestedAt) < 60 * 60 * 1000) throw new Error('La solicitud aún puede estar en curso.');
      if (!noCharge && model !== record.model) throw new Error('El modelo reportado no coincide; la reserva se conserva.');
      const amount = noCharge ? 0n : estimatedCostNanoUSD(usage, record.budget.ratesNanoUSDPerMillion);
      const now = clock(), reserved = readNanoUSD(record.budget.reservedNanoUSD);
      const budget = { ...record.budget, settlement: noCharge ? 'released' : 'estimated',
        estimatedNanoUSD: noCharge ? null : amount.toString(), usage: noCharge ? null : usage,
        responseId, evidenceRef, reconciledBy: actor.uid, reconciledAt: now };
      const operations = [put('generation_requests', { ...record, status: 'failed', proposal: null,
        error: 'Conciliada administrativamente; no se recuperó una receta.', finishedAt: now, budget }, record)];
      for (const quotaId of record.quotaIds.slice(0, 2)) {
        const quota = await staged.get('generation_quotas', quotaId);
        if (!quota) throw new Error('La reserva monetaria está incompleta.');
        const before = budgetQuota(quota.budget), held = readNanoUSD(before.heldNanoUSD) - reserved;
        if (held < 0n) throw new Error('La reserva monetaria está inconsistente.');
        operations.push(put('generation_quotas', { ...quota, budget: money(held, readNanoUSD(before.estimatedNanoUSD) + amount), updatedAt: now }, quota));
      }
      const concurrent = await staged.get('generation_quotas', 'concurrency');
      if (!concurrent || concurrent.count < 1) throw new Error('La concurrencia está inconsistente.');
      operations.push(put('generation_quotas', { ...concurrent, count: concurrent.count - 1, updatedAt: now }, concurrent));
      operations.push(put('audit', { id: `audit_${crypto.randomUUID()}`, action: 'recipe.generation.budget.reconciled', entityId: record.id,
        actorUid: actor.uid, actorName: actor.name || actor.uid, occurredAt: now, reason: evidenceRef }));
      await staged.commit(operations);
      return { ...record, status: 'failed', budget };
    });
}
