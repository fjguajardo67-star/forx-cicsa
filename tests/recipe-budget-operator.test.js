import { test, expect } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { OpenAIRecipeBudgetService, reconcileOpenAIRecipeBudget } from '../src/domain/openai-recipe-budget-service.js';
import { RecipeBudgetOperator, budgetReconciliationPolicy, requireBudgetReconciliationJob } from '../src/server/recipe-budget-operator.js';
import { deploymentConfig } from '../src/server/deployment-config.js';
import { config as fixture } from './fixtures/backend.js';

const policy = { approvalRef: 'TEST_ONLY_0001', priceVersion: 'TEST_RATE_0001', model: 'fixture-model',
  maxInputTokens: 40960, maxOutputTokens: 2000,
  priceUSDPerMillion: { input: '1', cachedInput: '0.5', cacheWrite: '1.25', output: '5' },
  monthlyBudgetUSD: '0.20', dailyUserBudgetUSD: '0.10', perRequestBudgetUSD: '0.08',
  userDailyRequests: 10, projectMonthlyRequests: 100, concurrentRequests: 2 };
const approval = { enabled: true, jobName: 'forx-recipe-budget-test', approvedBy: 'Francisco/test-ticket',
  approvedAt: '2026-10-05T14:00:00.000Z', expiresAt: '2026-10-05T15:00:00.000Z' };
const clock = () => '2026-10-05T14:02:00.000Z';
const env = { CLOUD_RUN_JOB: approval.jobName, FORX_RECIPE_BUDGET_TARGET: `${fixture.projectId}/${fixture.databaseId}` };
const request = () => ({ requestId: crypto.randomUUID(), idea: 'Agua de limón para comedor', type: 'agua', protein: '',
  baseServings: '10', restrictions: 'Sin azúcar', preferredIngredientIds: [] });
const usage = { inputTokens: 100, cachedInputTokens: 20, cacheWriteTokens: 10,
  outputTokens: 200, reasoningTokens: 30, totalTokens: 300 };

async function setup() {
  const repository = new MemoryEntityRepository();
  const config = deploymentConfig({ ...fixture, recipeBudgetReconciliation: approval });
  const runtime = { config, repository, assertReady: async () => {} };
  const service = new OpenAIRecipeBudgetService(repository, { actor: { uid: 'editor-test', role: 'editor' },
    clock: () => '2026-10-05T12:00:00.000Z', transport: { mode: 'openai', model: policy.model,
      maxOutputTokens: policy.maxOutputTokens, maxRequestBytes: 32768 }, policy });
  const reserved = await service.reserve(request());
  return { repository, runtime, reserved, operator: new RecipeBudgetOperator(runtime, { clock, env }) };
}

test('trabajo privado requiere aprobación temporal, nombre exacto y destino; la app sigue desactivada', () => {
  const config = deploymentConfig({ ...fixture, recipeBudgetReconciliation: approval });
  expect(config.recipeGeneration).toEqual({ enabled: false });
  expect(requireBudgetReconciliationJob(config, env, clock())).toMatchObject(approval);
  for (const bad of [{ ...env, K_SERVICE: 'api' }, { ...env, CLOUD_RUN_JOB: 'another-job' },
    { ...env, FORX_RECIPE_BUDGET_TARGET: 'other/database' }])
    expect(() => requireBudgetReconciliationJob(config, bad, clock())).toThrow(/privado/);
  expect(() => requireBudgetReconciliationJob(config, env, '2026-10-05T15:00:00.000Z')).toThrow(/aprobación/);
  for (const bad of [{ ...approval, approvedBy: '' }, { ...approval, expiresAt: '2026-10-05T16:00:00.000Z' },
    { enabled: false, jobName: approval.jobName }]) expect(() => budgetReconciliationPolicy(bad)).toThrow();
  expect(deploymentConfig(fixture).recipeBudgetReconciliation).toEqual({ enabled: false });
});

test('estado y vista previa privados omiten texto culinario; el plan caduca y detecta cambios', async () => {
  const { repository, reserved, operator } = await setup();
  const listed = await operator.status();
  expect(listed).toMatchObject({ count: 1, pending: [{ generationRequestId: reserved.record.id, status: 'pending' }] });
  expect(JSON.stringify(listed)).not.toContain('Sin azúcar');
  const decision = { generationRequestId: reserved.record.id, evidenceRef: 'billing-proof-1001', noCharge: true, serviceTier: 'default' };
  const plan = await operator.preview(decision);
  expect(plan.expiresAt).toBe('2026-10-05T14:17:00.000Z');
  expect(plan.estimatedNanoUSD).toBe('0');
  expect(JSON.stringify(plan)).not.toContain('Sin azúcar');
  await expect(operator.apply({ ...plan, expectedRevision: 9 }, { confirmDigest: plan.digest })).rejects.toThrow(/cambiados/);
  await expect(operator.apply(plan, { confirmDigest: 'wrong' })).rejects.toThrow(/confirmación/);
  const current = await repository.get('generation_requests', reserved.record.id);
  await repository.commit([{ collection: 'generation_requests', id: current.id,
    value: { ...current, status: 'uncertain' }, expected: current._revision }]);
  await expect(operator.apply(plan, { confirmDigest: plan.digest })).rejects.toThrow(/modificada/);
});

test('conciliación sin cargo usa evidencia y queda idempotente, sin llamada a OpenAI', async () => {
  const { repository, reserved, operator } = await setup();
  const decision = { generationRequestId: reserved.record.id, evidenceRef: 'billing-proof-1002', noCharge: true, serviceTier: 'default' };
  const plan = await operator.preview(decision);
  expect(await operator.apply(plan, { confirmDigest: plan.digest })).toEqual({ generationRequestId: reserved.record.id,
    settlement: 'released', estimatedNanoUSD: '0', alreadyApplied: false });
  expect(await operator.apply(plan, { confirmDigest: plan.digest })).toMatchObject({ alreadyApplied: true });
  expect((await operator.status()).count).toBe(0);
  expect((await repository.get('generation_quotas', 'month_2026-10')).budget.heldNanoUSD).toBe('0');
  expect((await repository.list('audit'))[0]).toMatchObject({ action: 'recipe.generation.budget.reconciled', reason: 'billing-proof-1002' });
});

test('uso real se estima con tarifa histórica; evidencia y modelo divergentes no liberan la reserva', async () => {
  const { repository, reserved, operator } = await setup();
  const decision = { generationRequestId: reserved.record.id, evidenceRef: 'billing-proof-1003',
    usage, model: 'fixture-model', serviceTier: 'default', responseId: 'resp_fixture_3' };
  await expect(operator.preview({ ...decision, model: 'other-model' })).rejects.toThrow(/modelo/);
  await expect(operator.preview({ ...decision, usage: { ...usage, totalTokens: 1 } })).rejects.toThrow(/inconsistente/);
  const plan = await operator.preview(decision);
  expect(plan.estimatedNanoUSD).toBe('1092500');
  expect(await operator.apply(plan, { confirmDigest: plan.digest })).toMatchObject({ settlement: 'estimated' });
  expect((await repository.get('generation_quotas', 'month_2026-10')).budget).toEqual({ heldNanoUSD: '0', estimatedNanoUSD: '1092500' });
  expect((await repository.get('generation_requests', reserved.record.id)).budget.reconciledBy).toBe(`technical-job:${approval.jobName}`);
});

test('la revisión esperada se comprueba dentro de la transacción, no solo en la vista previa', async () => {
  const { repository, reserved } = await setup();
  await expect(reconcileOpenAIRecipeBudget(repository, { actor: { uid: 'operator-test', role: 'admin' }, clock,
    expectedRevision: 999, input: { generationRequestId: reserved.record.id, evidenceRef: 'billing-proof-1004',
      noCharge: true, serviceTier: 'default' } })).rejects.toThrow(/cambió/);
  expect((await repository.get('generation_requests', reserved.record.id)).budget.settlement).toBe('held');
});
