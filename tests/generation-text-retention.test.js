import { test, expect } from 'vitest';
import { backendFixture, config, instance } from './fixtures/backend.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { createSimulatedRecipeProvider } from '../src/domain/simulated-recipe-provider.js';
import { GenerationTextRetention } from '../src/server/generation-text-retention.js';
import { generationTextExpiresAt } from '../src/domain/generation-text-retention.js';
import { put } from '../src/data/entity-repository.js';
import { backupDigest, inspectBackup } from '../src/domain/backup.js';
import { runScheduledMaintenance } from '../src/server/scheduled-maintenance.js';
import { createServerBackup } from '../src/server/server-backups.js';

const requestedAt = '2026-10-01T12:00:00.000Z';
const expiresAt = '2026-10-31T12:00:00.000Z';
const actor = { uid: 'chef', role: 'editor', name: 'Cocina de prueba' };
const input = requestId => ({ requestId, idea: 'Pollo de prueba confidencial', type: 'guisado', protein: '',
  baseServings: '10', restrictions: '', preferredIngredientIds: [] });
async function setup(generatedAt = requestedAt) {
  const f = backendFixture();
  await f.runtime.db.collection('_forx_system').doc('instance').set(instance(config));
  f.runtime.config = { ...config, maintenance: { generationTextRetentionEnabled: true,
    approvedBy: 'admin-test', approvedAt: requestedAt } };
  const kitchen = new KitchenService(f.runtime.repository, { actor, clock: () => generatedAt,
    generationProvider: createSimulatedRecipeProvider() });
  await new PantryService(f.runtime.repository, { actor, clock: () => generatedAt }).initialize();
  await kitchen.initialize();
  return { f, kitchen };
}

test('30 días exactos: se retira solo texto intermedio, no receta, cuota ni bitácora', async () => {
  const { f, kitchen } = await setup();
  const saved = await kitchen.generateRecipeProposal(input('saved-request-0001'));
  const recipe = await kitchen.saveRecipe({ ...saved.proposal.recipe, generationRequestId: saved.generationRequestId, proposalReviewed: true });
  const unsaved = await kitchen.generateRecipeProposal(input('unsaved-request-01'));
  expect(generationTextExpiresAt(requestedAt)).toBe(expiresAt);
  const overdue = new KitchenService(f.runtime.repository, { actor, clock: () => expiresAt,
    generationProvider: createSimulatedRecipeProvider() });
  expect((await overdue.recipeProposalStatus({ requestId: 'unsaved-request-01' })).status).toBe('expired');
  await expect(overdue.saveRecipe({ ...unsaved.proposal.recipe, generationRequestId: unsaved.generationRequestId,
    proposalReviewed: true })).rejects.toThrow(/no está disponible/);
  const early = await new GenerationTextRetention(f.runtime, { clock: () => '2026-10-31T11:59:59.999Z' }).preview();
  expect(early.items).toEqual([]);
  const worker = new GenerationTextRetention(f.runtime, { clock: () => expiresAt });
  const plan = await worker.preview();
  expect(plan.items).toHaveLength(2);
  expect(JSON.stringify(plan)).not.toContain('confidencial');
  await expect(worker.apply(plan, { confirmDigest: 'incorrecto' })).rejects.toThrow();
  expect(await worker.apply(plan, { confirmDigest: plan.digest })).toEqual({ erased: 2, alreadyDone: 0, changed: 0, failed: 0 });
  expect(await worker.apply(plan, { confirmDigest: plan.digest })).toEqual({ erased: 0, alreadyDone: 2, changed: 0, failed: 0 });
  const records = await f.runtime.repository.list('generation_requests');
  expect(records.every(row => row.context === null && row.proposal === null && row.textErasedAt === expiresAt)).toBe(true);
  expect((await kitchen.recipeProposalStatus({ requestId: 'saved-request-0001' })).status).toBe('saved');
  expect((await kitchen.recipeProposalStatus({ requestId: 'unsaved-request-01' })).status).toBe('expired');
  await expect(kitchen.saveRecipe({ ...unsaved.proposal.recipe, generationRequestId: unsaved.generationRequestId,
    proposalReviewed: true })).rejects.toThrow(/no está disponible/);
  expect(await f.runtime.repository.get('recipes', recipe.id)).toMatchObject({ id: recipe.id, name: recipe.name });
  expect((await f.runtime.repository.list('generation_quotas')).length).toBe(3);
  expect((await f.runtime.repository.list('audit')).filter(row => row.action === 'recipe.generation.text_erased')).toHaveLength(2);
});

test('vista previa obsoleta no depura una revisión cambiada; el trabajo programado requiere aprobación', async () => {
  const { f, kitchen } = await setup('2026-09-01T12:00:00.000Z');
  await kitchen.generateRecipeProposal(input('stale-request-0001'));
  const worker = new GenerationTextRetention(f.runtime, { clock: () => expiresAt });
  const plan = await worker.preview();
  const old = await f.runtime.repository.get('generation_requests', plan.items[0].id);
  await f.runtime.repository.commit([put('generation_requests', { ...old, error: 'Estado revisado' }, old)]);
  expect(await worker.apply(plan, { confirmDigest: plan.digest })).toEqual({ erased: 0, alreadyDone: 0, changed: 1, failed: 0 });
  expect((await f.runtime.repository.get('generation_requests', old.id)).context).not.toBeNull();
  f.runtime.config = { ...f.runtime.config, maintenance: { generationTextRetentionEnabled: false } };
  await expect(runScheduledMaintenance(f.runtime, 'generation-text')).rejects.toThrow(/no aprobada/);
  f.runtime.config = { ...f.runtime.config, maintenance: { generationTextRetentionEnabled: true,
    approvedBy: 'admin-test', approvedAt: requestedAt } };
  // The scheduler uses wall-clock time; the synthetic request is already due.
  expect((await runScheduledMaintenance(f.runtime, 'generation-text', { log: () => {} })).erased).toBe(1);
});

test('respaldo nuevo excluye texto aun antes de 30 días y rechaza su reintroducción', async () => {
  const { f, kitchen } = await setup();
  await kitchen.generateRecipeProposal(input('backup-request-001'));
  const source = await f.runtime.repository.list('generation_requests');
  const backup = await new PantryService(f.runtime.repository, { actor, clock: () => requestedAt }).exportBackup();
  expect(backup.version).toBe(3);
  expect(backup.generationTextPolicy).toBe('excluded');
  expect(JSON.stringify(backup)).not.toContain('Pollo de prueba confidencial');
  expect(backup.collections.generation_requests[0]).toMatchObject({ context: null, proposal: null });
  expect(source[0].context.idea).toContain('confidencial');
  expect((await inspectBackup(JSON.stringify(backup))).counts.generation_requests).toBe(1);
  const receipt = await createServerBackup(f.runtime, { now: requestedAt });
  const stored = (await f.runtime.backupsBucket.file(receipt.path).download())[0].toString();
  expect(stored).not.toContain('Pollo de prueba confidencial');
  expect(JSON.parse(stored).backup.generationTextPolicy).toBe('excluded');
  const forged = structuredClone(backup);
  forged.collections.generation_requests[0].context = source[0].context;
  const { checksum, ...payload } = forged;
  forged.checksum = await backupDigest(payload);
  await expect(inspectBackup(JSON.stringify(forged))).rejects.toThrow(/texto de generación/);
});
