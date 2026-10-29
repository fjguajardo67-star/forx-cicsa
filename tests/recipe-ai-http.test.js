import { test, expect, vi } from 'vitest';
import { backendFixture, config as fixtureConfig } from './fixtures/backend.js';
import { initializeEmptyInstance } from '../src/server/initialize-instance.js';
import { createProductionServer } from '../src/server/production-http.js';
import { createRecipeAIProvider, recipeAIConfiguration } from '../src/server/recipe-ai-configuration.js';

const secret = 'FAKE_TEST_KEY_NEVER_REAL';
const policy = { approvalRef: 'TEST_ONLY_0001', priceVersion: 'TEST_RATE_0001', model: 'fixture-model',
  maxInputTokens: 40960, maxOutputTokens: 2000,
  priceUSDPerMillion: { input: '1', cachedInput: '0.5', cacheWrite: '1.25', output: '5' },
  monthlyBudgetUSD: '0.20', dailyUserBudgetUSD: '0.10', perRequestBudgetUSD: '0.08',
  userDailyRequests: 10, projectMonthlyRequests: 100, concurrentRequests: 2 };
const proposal = { name: 'Agua de limón sin azúcar', type: 'agua', region: '', protein: '', baseServings: 10, minutes: 10,
  lines: [{ name: 'Limón', quantity: 100, unit: 'g' }, { name: 'Agua', quantity: 2, unit: 'l' }],
  steps: ['Exprimir y mezclar.'], adaptations: [], warnings: ['Confirmar cantidad.'] };

test.skipIf(!process.env.FORX_ISOLATED_TESTS)('API de producción: proveedor inyectado, reserva antes de OpenAI y estado recuperable sin segunda llamada', async () => {
  const f = backendFixture();f.user('admin');
  await initializeEmptyInstance(f.runtime, { adminUid: 'admin', confirmTarget: `${fixtureConfig.projectId}/${fixtureConfig.databaseId}` });
  let reservedAtDispatch = false;
  const fetchImpl = vi.fn(async () => {
    const records = await f.runtime.repository.list('generation_requests');
    reservedAtDispatch = records.length === 1 && records[0].budget.settlement === 'held';
    return new Response(JSON.stringify({ id: 'resp_fixture_http', model: 'fixture-model', service_tier: 'default', status: 'completed',
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: 200, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 300 },
      output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }] }),
    { headers: { 'content-type': 'application/json' } });
  });
  const configuration = recipeAIConfiguration({ enabled: true, model: 'fixture-model', maxOutputTokens: 2000, timeoutMs: 1000, budgetPolicy: policy });
  Object.assign(f.runtime, createRecipeAIProvider(configuration, { env: { FORX_ENABLE_RECIPE_AI: 'true', FORX_OPENAI_API_KEY: secret }, fetchImpl }));
  const logs = [], server = createProductionServer(f.runtime, { log: item => logs.push(item) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const command = async (name, input = {}) => {
    const response = await fetch(`${url}/commands`, { method: 'POST', headers: { Origin: fixtureConfig.origins[0],
      Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ command: name, input }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const snapshot = await command('kitchenSnapshot');
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.result.generation).toMatchObject({ mode: 'openai', enabled: true, limits: { userDaily: 10, projectMonthly: 100 } });
    const input = { requestId: crypto.randomUUID(), idea: 'Agua de limón para comedor', type: 'agua', protein: '',
      baseServings: '10', restrictions: 'Sin azúcar', preferredIngredientIds: [] };
    const generated = await command('generateRecipeProposal', input);
    expect(generated.status).toBe(200);
    expect(generated.body.result).toMatchObject({ status: 'completed', mode: 'openai', proposal: { recipe: { status: 'draft', salePrice: null } } });
    expect(reservedAtDispatch).toBe(true);
    expect((await command('recipeProposalStatus', { requestId: input.requestId })).body.result.generationRequestId)
      .toBe(generated.body.result.generationRequestId);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await f.runtime.repository.get('generation_quotas', 'concurrency')).count).toBe(0);
    expect(JSON.stringify([generated, logs, await f.runtime.repository.list('generation_requests')])).not.toContain(secret);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
