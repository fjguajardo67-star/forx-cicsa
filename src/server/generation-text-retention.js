import { put } from '../data/entity-repository.js';
import { backupDigest } from '../domain/backup.js';
import { eraseGenerationText, generationTextIsDue, hasGenerationText } from '../domain/generation-text-retention.js';

const MAX_ITEMS = 500;
const PLAN_MS = 15 * 60 * 1000;
const target = config => `${config.projectId}/${config.databaseId}`;
const fail = message => { throw new Error(`Retención de propuestas: ${message}`); };

// Private job only. The plan contains hashes and revisions, never culinary text.
export class GenerationTextRetention {
  constructor(runtime, { clock = () => new Date().toISOString() } = {}) {
    this.runtime = runtime;
    this.clock = clock;
  }
  async preview() {
    await this.runtime.assertReady();
    const createdAt = this.clock();
    const records = await this.runtime.repository.list('generation_requests');
    const due = records.filter(record => generationTextIsDue(record, createdAt));
    if (due.length > MAX_ITEMS) fail('más de 500 solicitudes vencidas; preparar un trabajo paginado antes de depurar.');
    const items = await Promise.all(due.map(async record => ({ id: record.id, revision: record._revision,
      requestedAt: record.requestedAt, contentDigest: await backupDigest({ context: record.context, proposal: record.proposal }) })));
    items.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id));
    const payload = { version: 1, target: target(this.runtime.config), createdAt, items };
    return { ...payload, digest: await backupDigest(payload) };
  }
  async apply(plan, { confirmDigest } = {}) {
    const { config, repository } = this.runtime;
    if (!config.maintenance?.generationTextRetentionEnabled || !config.maintenance.approvedBy
      || !Number.isFinite(Date.parse(config.maintenance.approvedAt))) fail('trabajo no aprobado ni activado.');
    const { digest, ...payload } = plan || {};
    if (!plan || confirmDigest !== digest || digest !== await backupDigest(payload)
      || payload.version !== 1 || payload.target !== target(config) || !Array.isArray(payload.items)
      || payload.items.length > MAX_ITEMS || new Set(payload.items.map(item => item.id)).size !== payload.items.length)
      fail('confirma la vista previa exacta del entorno autorizado.');
    const start = Date.parse(payload.createdAt), now = Date.parse(this.clock());
    if (![start, now].every(Number.isFinite) || now < start || now - start > PLAN_MS) fail('vista previa vencida; genera una nueva.');
    await this.runtime.assertReady();
    const result = { erased: 0, alreadyDone: 0, changed: 0, failed: 0 };
    for (const item of payload.items) {
      if (!/^gen_[a-f0-9]{64}$/.test(item?.id || '') || !Number.isSafeInteger(item.revision)
        || item.revision < 1 || !Number.isFinite(Date.parse(item.requestedAt))
        || !/^[a-f0-9]{64}$/.test(item.contentDigest || '')) fail('selección inválida.');
      try {
        const record = await repository.get('generation_requests', item.id);
        if (!record) { result.failed++; continue; }
        if (!hasGenerationText(record)) { result.alreadyDone++; continue; }
        if (record._revision !== item.revision || record.requestedAt !== item.requestedAt
          || await backupDigest({ context: record.context, proposal: record.proposal }) !== item.contentDigest) {
          result.changed++; continue;
        }
        const erasedAt = this.clock();
        if (!generationTextIsDue(record, erasedAt)) fail('solicitud todavía no vencida.');
        const auditId = `audit_generation_text_${record.id}`;
        const priorAudit = await repository.get('audit', auditId);
        if (priorAudit) fail('bitácora previa inconsistente; revisar antes de continuar.');
        await repository.commit([put('generation_requests', eraseGenerationText(record, erasedAt), record),
          put('audit', { id: auditId, action: 'recipe.generation.text_erased', entityId: record.id,
            actorUid: 'generation-text-retention-worker', occurredAt: erasedAt,
            reason: 'Venció el texto intermedio de generación a los 30 días; se conserva la reserva, cuota y receta guardada.' })]);
        result.erased++;
      } catch { result.failed++; }
    }
    return result;
  }
}
