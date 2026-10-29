import { test, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryEntityRepository, IndexedDbEntityRepository } from '../src/data/entity-repository.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { RecipeGenerationService } from '../src/domain/recipe-generation.js';
import { OpenAIRecipeBudgetService, reconcileOpenAIRecipeBudget } from '../src/domain/openai-recipe-budget-service.js';
import { nanoUSD, estimatedCostNanoUSD, validateRecipeBudgetPolicy } from '../src/domain/recipe-budget.js';
import { createOpenAIRecipeTransport } from '../src/server/openai-recipe-transport.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { inspectBackup, backupDigest } from '../src/domain/backup.js';
import { restoreLocalCopy } from '../src/data/local-recovery.js';
import { createSimulatedRecipeProvider } from '../src/domain/simulated-recipe-provider.js';

const actor = { uid: 'budget-test-editor', name: 'Editor de prueba', role: 'editor' };
const admin = { uid: 'budget-test-admin', name: 'Admin de prueba', role: 'admin' };
const now = () => '2026-10-05T12:00:00.000Z';
const policy = (overrides = {}) => ({ approvalRef: 'TEST_ONLY_0001', priceVersion: 'TEST_RATE_0001',
  model: 'fixture-model', maxInputTokens: 40960, maxOutputTokens: 2000,
  priceUSDPerMillion: { input: '1', cachedInput: '0.5', cacheWrite: '1.25', output: '5' },
  monthlyBudgetUSD: '0.20', dailyUserBudgetUSD: '0.10', perRequestBudgetUSD: '0.08',
  userDailyRequests: 10, projectMonthlyRequests: 100, concurrentRequests: 2, ...overrides });
const request = () => ({ requestId: crypto.randomUUID(), idea: 'Agua de limón para comedor', type: 'agua', protein: '', baseServings: '10', restrictions: 'Sin azúcar', preferredIngredientIds: [] });
const proposal = { name: 'Agua de limón sin azúcar', type: 'agua', region: '', protein: '', baseServings: 10, minutes: 10,
  lines: [{ name: 'Limón', quantity: 100, unit: 'g' }, { name: 'Agua', quantity: 2, unit: 'l' }],
  steps: ['Exprimir y mezclar.'], adaptations: [], warnings: ['Confirmar cantidad.'] };
const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
  output_tokens: 200, output_tokens_details: { reasoning_tokens: 30 }, total_tokens: 300 };
const envelope = (overrides = {}) => ({ id: 'resp_fixture_1', model: 'fixture-model', service_tier: 'default', status: 'completed', usage,
  output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }], ...overrides });
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const transport = fetchImpl => createOpenAIRecipeTransport({ apiKey: 'FAKE_TEST_KEY_NEVER_REAL', model: 'fixture-model',
  maxOutputTokens: 2000, timeoutMs: 1000, fetchImpl });
async function setup(fetchImpl = async () => response(envelope()), options = {}) {
  const repo = options.repo || new MemoryEntityRepository(), provider = transport(fetchImpl), budgetPolicy = policy(options.policy);
  const pantry = new PantryService(repo, { actor, clock: now }); await pantry.initialize();
  const kitchen = new KitchenService(repo, { actor, clock: now, generationProvider: provider, generationBudgetPolicy: budgetPolicy });
  await kitchen.initialize();
  return { repo, provider, budgetPolicy, kitchen, pantry, service: kitchen.generator.openAI };
}

test('aritmética decimal exacta: caché de lectura/escritura, reasoning incluido en salida, redondeo conservador', () => {
  expect(nanoUSD('0.000000001')).toBe(1n);
  for (const amount of ['1e6', '-1', '0', '0.1234567891', 1, '1000000000']) expect(() => nanoUSD(amount)).toThrow();
  const rates = { input: '1000000000', cachedInput: '500000000', cacheWrite: '1250000000', output: '5000000000' };
  const normalized = { inputTokens: 100, cachedInputTokens: 20, cacheWriteTokens: 10, outputTokens: 200, reasoningTokens: 30, totalTokens: 300 };
  // 70 ordinary + 20 cached * 0.5 + 10 cache-write * 1.25 + 200 output * 5.
  expect(estimatedCostNanoUSD(normalized, rates)).toBe(1_092_500n);
  expect(estimatedCostNanoUSD({ ...normalized, inputTokens: 101, totalTokens: 301 }, rates)).toBe(1_093_500n);
  expect(() => estimatedCostNanoUSD({ ...normalized, cachedInputTokens: 91 }, rates)).toThrow();
});

test('política incompleta, modelo divergente o reserva mayor que el tope no habilitan llamadas', async () => {
  const fetchImpl = vi.fn(), provider = transport(fetchImpl);
  for (const bad of [{ monthlyBudgetUSD: undefined }, { priceUSDPerMillion: { input: '1', cachedInput: '0.5', output: '5' } },
    { model: 'another-model' }, { dailyUserBudgetUSD: '0.01' }, { perRequestBudgetUSD: '0.01' },
    { maxInputTokens: 100 }, { userDailyRequests: 0 }, { priceVersion: '' }]) {
    expect(() => validateRecipeBudgetPolicy(policy(bad), provider)).toThrow();
  }
  expect(fetchImpl).not.toHaveBeenCalled();
  const repo = new MemoryEntityRepository();
  const disabled = new RecipeGenerationService(repo, { actor, provider });
  await expect(disabled.generate(request())).rejects.toThrow(/desactivada/);
  expect(await repo.list('generation_requests')).toEqual([]);
});

test('ruta autenticada reserva primero, concilia uso, devuelve borrador y no crea precio', async () => {
  const fetchImpl = vi.fn(async () => response(envelope())), { repo, provider, budgetPolicy } = await setup(fetchImpl);
  let pendingAtDispatch;
  const observed = vi.fn(async (...args) => {
    pendingAtDispatch = await repo.list('generation_requests');
    const quotas = await repo.list('generation_quotas');
    expect(pendingAtDispatch).toHaveLength(1);
    expect(pendingAtDispatch[0].budget.settlement).toBe('held');
    expect(quotas.find(q => q.id.startsWith('month_')).budget.heldNanoUSD).toBe(pendingAtDispatch[0].budget.reservedNanoUSD);
    return fetchImpl(...args);
  });
  const live = transport(observed);
  const auth = { uid: actor.uid, token: { forxActive: true, forxRole: 'editor' } }, input = request();
  const result = await executePantryCommand(repo, auth, { command: 'generateRecipeProposal', input }, { clock: now, generationProvider: live, generationBudgetPolicy: budgetPolicy });
  expect(result).toMatchObject({ status: 'completed', mode: 'openai', proposal: { recipe: { status: 'draft', salePrice: null } } });
  expect(result).not.toHaveProperty('budget'); expect(observed).toHaveBeenCalledTimes(1);
  const stored = (await repo.list('generation_requests'))[0];
  expect(stored.budget).toMatchObject({ settlement: 'estimated', reservedNanoUSD: '61200000', estimatedNanoUSD: '1092500',
    usage: { inputTokens: 100, cachedInputTokens: 20, cacheWriteTokens: 10 }, responseId: 'resp_fixture_1' });
  expect((await repo.get('generation_quotas', 'month_2026-10')).budget).toEqual({ heldNanoUSD: '0', estimatedNanoUSD: '1092500' });
  expect((await repo.get('generation_quotas', 'concurrency')).count).toBe(0);
  const again = await executePantryCommand(repo, auth, { command: 'generateRecipeProposal', input }, { clock: now, generationProvider: live, generationBudgetPolicy: budgetPolicy });
  expect(again).toEqual(result); expect(observed).toHaveBeenCalledTimes(1);
  expect(await repo.list('recipes')).toEqual([]); expect(await repo.list('price_observations')).toEqual([]);
  expect(JSON.stringify(await repo.exportSnapshot())).not.toContain('FAKE_TEST_KEY_NEVER_REAL');
});

test('concurrencia y presupuesto se comprueban en la misma transacción; otra cuenta no evade el mes', async () => {
  let release; const fetchImpl = vi.fn(async () => fetchImpl.mock.calls.length === 1
    ? new Promise(resolve => { release = () => resolve(response(envelope())); }) : response(envelope()));
  const { repo, provider } = await setup(fetchImpl, { policy: { dailyUserBudgetUSD: '0.10', monthlyBudgetUSD: '0.10' } });
  const first = new RecipeGenerationService(repo, { actor, clock: now, provider, budgetPolicy: policy({ monthlyBudgetUSD: '0.10' }) });
  const second = new RecipeGenerationService(repo, { actor, clock: now, provider, budgetPolicy: policy({ monthlyBudgetUSD: '0.10' }) });
  const one = request(), task = first.generate(one);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect((await second.generate(one)).status).toBe('pending');
  await expect(second.generate(request())).rejects.toThrow(/presupuesto diario/);
  const other = new RecipeGenerationService(repo, { actor: { ...actor, uid: 'another-editor' }, clock: now, provider, budgetPolicy: policy({ monthlyBudgetUSD: '0.10' }) });
  await expect(other.generate(request())).rejects.toThrow(/presupuesto mensual/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  release(); expect((await task).status).toBe('completed');
  expect((await second.generate(request())).status).toBe('completed');
});

test('rechazo con usage se cobra estimado; uso faltante y metadatos distintos dejan reserva incierta', async () => {
  const rejected = await setup(async () => response(envelope({ output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] })));
  expect((await rejected.kitchen.generateRecipeProposal(request())).status).toBe('failed');
  expect((await rejected.repo.list('generation_requests'))[0].budget.settlement).toBe('estimated');
  for (const variation of [{ usage: null }, { model: 'unexpected-model' }, { service_tier: 'priority' }]) {
    const { kitchen, repo } = await setup(async () => response(envelope(variation)));
    const input = request(), result = await kitchen.generateRecipeProposal(input);
    expect(result.status).toBe('uncertain'); expect(result).not.toHaveProperty('proposal');
    expect((await repo.list('generation_requests'))[0].budget.settlement).toBe('held');
    if (variation.model) expect((await repo.list('generation_requests'))[0].budget.reportedModel).toBe('unexpected-model');
    if (variation.service_tier) expect((await repo.list('generation_requests'))[0].budget.reportedTier).toBe('priority');
    expect((await repo.get('generation_quotas', 'month_2026-10')).budget.heldNanoUSD).toBe('61200000');
    expect((await repo.get('generation_quotas', 'concurrency')).count).toBe(1);
    expect((await kitchen.generateRecipeProposal(input)).status).toBe('uncertain');
  }
});

test('fallo previo al envío libera saldo; fallo HTTP posterior conserva reserva y no reintenta', async () => {
  const noSend = await setup();
  noSend.service.transport = { ...noSend.provider, request: vi.fn(async () => { throw { dispatched: false }; }) };
  expect((await noSend.kitchen.generateRecipeProposal(request())).status).toBe('failed');
  expect((await noSend.repo.get('generation_quotas', 'month_2026-10')).budget.heldNanoUSD).toBe('0');
  expect((await noSend.repo.list('generation_requests'))[0].budget.settlement).toBe('released');
  const fetchImpl = vi.fn(async () => new Response('temporary', { status: 503 }));
  const sent = await setup(fetchImpl);
  expect((await sent.kitchen.generateRecipeProposal(request())).status).toBe('uncertain');
  expect((await sent.repo.get('generation_quotas', 'month_2026-10')).budget.heldNanoUSD).toBe('61200000');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('conciliación administrativa con evidencia es atómica, idempotente y sin nueva generación', async () => {
  const fetchImpl = vi.fn(async () => response(envelope({ usage: null })));
  const { repo, provider, budgetPolicy, kitchen } = await setup(fetchImpl);
  const result = await kitchen.generateRecipeProposal(request());
  expect(result.status).toBe('uncertain');
  await expect(kitchen.generator.openAI.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'provider-ticket-101',
    usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 }, model: 'fixture-model', serviceTier: 'default' })).rejects.toThrow(/permiso/);
  const adminService = new OpenAIRecipeBudgetService(repo, { actor: admin, clock: now, transport: provider, policy: budgetPolicy });
  const counted = { inputTokens: 100, cachedInputTokens: 20, cacheWriteTokens: 10, outputTokens: 200, reasoningTokens: 30, totalTokens: 300 };
  await expect(adminService.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'provider-ticket-101', usage: counted,
    model: 'wrong-model', serviceTier: 'default' })).rejects.toThrow(/modelo/);
  expect((await adminService.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'provider-ticket-101', usage: counted,
    model: 'fixture-model', serviceTier: 'default' })).budget.estimatedNanoUSD).toBe('1092500');
  await adminService.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'provider-ticket-101', usage: counted,
    model: 'fixture-model', serviceTier: 'default' });
  await expect(adminService.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'provider-ticket-101',
    noCharge: true, serviceTier: 'default' })).rejects.toThrow(/otro resultado/);
  expect((await repo.get('generation_quotas', 'month_2026-10')).budget).toEqual({ heldNanoUSD: '0', estimatedNanoUSD: '1092500' });
  expect((await repo.get('generation_quotas', 'concurrency')).count).toBe(0);
  expect(await repo.list('audit')).toHaveLength(1); expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(adminService.reconcile({ generationRequestId: result.generationRequestId, evidenceRef: 'different-ticket', noCharge: true,
    serviceTier: 'default' })).rejects.toThrow(/ya fue conciliada/);
});

test('sin consumo comprobado se libera solo con evidencia; pendiente reciente no se puede cerrar', async () => {
  const fetchImpl = vi.fn(async () => response(envelope({ usage: null })));
  const { repo, provider, budgetPolicy, kitchen } = await setup(fetchImpl);
  const result = await kitchen.generateRecipeProposal(request());
  const noCharge = { generationRequestId: result.generationRequestId, evidenceRef: 'billing-proof-0002', noCharge: true, serviceTier: 'default' };
  await expect(reconcileOpenAIRecipeBudget(repo, { actor, clock: now, input: noCharge })).rejects.toThrow(/permiso/);
  await expect(reconcileOpenAIRecipeBudget(repo, { actor: admin, clock: now, input: { ...noCharge, responseId: 'invalid id' } })).rejects.toThrow(/evidencia/);
  expect((await reconcileOpenAIRecipeBudget(repo, { actor: admin, clock: now, input: noCharge })).budget.settlement).toBe('released');
  expect((await repo.get('generation_quotas', 'month_2026-10')).budget).toEqual({ heldNanoUSD: '0', estimatedNanoUSD: '0' });
  const second = await setup(async () => new Promise(() => {}));
  const pending = await second.service.reserve(request());
  await expect(new OpenAIRecipeBudgetService(second.repo, { actor: admin, clock: now, transport: second.provider,
    policy: second.budgetPolicy }).reconcile({ generationRequestId: pending.record.id, evidenceRef: 'billing-proof-0003', noCharge: true,
    serviceTier: 'default' })).rejects.toThrow(/aún puede estar en curso/);
  const later = new OpenAIRecipeBudgetService(second.repo, { actor: admin, clock: () => '2026-10-05T13:01:00.000Z', transport: second.provider,
    policy: second.budgetPolicy });
  expect((await later.reconcile({ generationRequestId: pending.record.id, evidenceRef: 'billing-proof-0003', noCharge: true,
    serviceTier: 'default' })).budget.settlement).toBe('released');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('dos solicitudes simultáneas compiten por el mismo presupuesto, sin reservar más del aprobado', async () => {
  let release; const fetchImpl = vi.fn(async () => new Promise(resolve => { release = () => resolve(response(envelope())); }));
  const { repo, provider } = await setup(fetchImpl, { policy: { dailyUserBudgetUSD: '0.10', monthlyBudgetUSD: '0.10' } });
  const instance = () => new RecipeGenerationService(repo, { actor, clock: now, provider, budgetPolicy: policy({ monthlyBudgetUSD: '0.10' }) });
  const tasks = [instance().generate(request()), instance().generate(request())];
  const outcomesPromise = Promise.allSettled(tasks);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await vi.waitFor(async () => expect((await repo.list('generation_requests')).length).toBe(1));
  release();
  const outcomes = await outcomesPromise;
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(outcomes[0].status === 'rejected' ? outcomes[0].reason.message : outcomes[1].reason.message).toMatch(/presupuesto diario/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await repo.get('generation_quotas', 'month_2026-10')).budget.heldNanoUSD).toBe('0');
});

test('respuesta con costo mayor al máximo consume saldo y no entrega receta; gastos futuros se bloquean', async () => {
  const highUsage = { ...usage, input_tokens: 80000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 20000, total_tokens: 100000 };
  const { kitchen, repo } = await setup(async () => response(envelope({ usage: highUsage })));
  const result = await kitchen.generateRecipeProposal(request());
  expect(result.status).toBe('failed'); expect(result).not.toHaveProperty('proposal');
  expect((await repo.list('generation_requests'))[0].budget.estimatedNanoUSD).toBe('180000000');
  await expect(kitchen.generateRecipeProposal(request())).rejects.toThrow(/presupuesto diario/);
});

test('salida que rebasa tokens configurados se contabiliza sin entregar propuesta', async () => {
  const overTokens = { ...usage, output_tokens: 2001, total_tokens: 2101 };
  const { kitchen, repo } = await setup(async () => response(envelope({ usage: overTokens })));
  const result = await kitchen.generateRecipeProposal(request());
  expect(result.status).toBe('failed'); expect(result).not.toHaveProperty('proposal');
  expect((await repo.list('generation_requests'))[0].budget.settlement).toBe('estimated');
});

test('respaldo/recuperación conservan y auditan ledger; alteración coherente con checksum se rechaza', async () => {
  const { repo, kitchen, pantry } = await setup(); await kitchen.generateRecipeProposal(request());
  const backup = await pantry.exportBackup(), checked = await inspectBackup(JSON.stringify(backup));
  expect(checked.counts.generation_requests).toBe(1);
  const factory = new IDBFactory(), copy = await restoreLocalCopy(JSON.stringify(backup), { factory, now: now() });
  const db = await IndexedDbEntityRepository.open(copy.name, factory);
  expect((await db.get('generation_quotas', 'month_2026-10')).budget).toEqual((await repo.get('generation_quotas', 'month_2026-10')).budget);
  db.close();
  const bad = structuredClone(backup);
  bad.collections.generation_quotas.find(q => q.id === 'month_2026-10').budget.heldNanoUSD = '1';
  const { checksum, ...payload } = bad; bad.checksum = await backupDigest(payload);
  await expect(inspectBackup(JSON.stringify(bad))).rejects.toThrow(/saldo monetario/);
});

test('cuotas de simulador y OpenAI comparten contador sin borrar saldo monetario', async () => {
  const { repo, kitchen } = await setup(); await kitchen.generateRecipeProposal(request());
  const balance = (await repo.get('generation_quotas', 'month_2026-10')).budget;
  const simulator = new RecipeGenerationService(repo, { actor, clock: now, provider: createSimulatedRecipeProvider() });
  expect((await simulator.generate(request())).status).toBe('completed');
  expect((await repo.get('generation_quotas', 'month_2026-10')).budget).toEqual(balance);
  const pantry = new PantryService(repo, { actor, clock: now });
  await expect(pantry.exportBackup()).resolves.toHaveProperty('version', 3);
});
