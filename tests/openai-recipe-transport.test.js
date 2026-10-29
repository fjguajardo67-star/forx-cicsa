import { test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOpenAIRecipeTransport, readRecipeTokenUsage } from '../src/server/openai-recipe-transport.js';

const key = 'FAKE_TEST_KEY_NEVER_REAL';
const context = { idea: 'Agua de limón', type: 'agua', protein: '', baseServings: '10', restrictions: 'Sin azúcar', preferredIngredients: [{ name: 'Limón', unit: 'kg' }] };
const proposal = { name: 'Agua de limón', type: 'agua', region: '', protein: '', baseServings: 10, minutes: 10,
  lines: [{ name: 'Limón', quantity: 100, unit: 'g' }, { name: 'Agua', quantity: 2, unit: 'l' }],
  steps: ['Exprimir los limones y mezclar con agua potable.'], adaptations: [], warnings: ['Revisar cantidades.'] };
const usage = { input_tokens: 100, output_tokens: 200, total_tokens: 300,
  input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 30 } };
const envelope = (changes = {}) => ({ id:'resp_offline', model:'test-model-not-approved', service_tier:'default', status: 'completed', usage, output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }], ...changes });
const response = (data = envelope()) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const config = fetchImpl => ({ apiKey: key, model: 'test-model-not-approved', maxOutputTokens: 2000, timeoutMs: 1000, fetchImpl });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('transporte explícito, destino fijo, contexto mínimo y propuesta sin precios ni vínculos', async () => {
  const globalFetch = vi.fn(() => { throw new Error('Network forbidden'); }); vi.stubGlobal('fetch', globalFetch);
  const fetchImpl = vi.fn(async () => response()), transport = createOpenAIRecipeTransport(config(fetchImpl));
  const result = await transport.request(context);
  expect(globalFetch).not.toHaveBeenCalled(); expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0], body = JSON.parse(options.body);
  expect(url).toBe('https://api.openai.com/v1/responses'); expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}` } });
  expect(body).toMatchObject({ model: 'test-model-not-approved', store: false, service_tier: 'default', max_output_tokens: 2000, text: { format: { type: 'json_schema', strict: true } } });
  expect(Object.keys(body).sort()).toEqual(['input', 'instructions', 'max_output_tokens', 'model', 'service_tier', 'store', 'text']);
  expect(JSON.parse(body.input[0].content)).toEqual(context); expect(options.body).not.toContain(key);
  expect(result).toMatchObject({ status: 'completed', consumption: 'reported', actualModel:'test-model-not-approved', serviceTier:'default', responseId:'resp_offline', usage: { inputTokens: 100, cachedInputTokens: 20, cacheWriteTokens:0, outputTokens: 200, reasoningTokens: 30, totalTokens: 300 }, proposal: { recipe: { status: 'draft', salePrice: null } } });
  result.proposal.recipe.lines.forEach(line => expect(line).toMatchObject({ ingredientId: null, yieldFactor: '1', gramsPerPiece: null }));
  expect(JSON.stringify(transport)).not.toContain(key); expect(JSON.stringify(result)).not.toContain(key);
});

test('configuración incompleta/inyección rechazada sin fallback a secretos o fetch global', () => {
  const fetchImpl = vi.fn(), valid = config(fetchImpl);
  for (const field of Object.keys(valid)) { const bad = { ...valid }; delete bad[field]; expect(() => createOpenAIRecipeTransport(bad)).toThrow(); }
  for (const change of [{ endpoint: 'https://elsewhere.invalid' }, { apiKey: 'key\r\nHeader: injected' }, { model: '' }, { model: '../model' }, { maxOutputTokens: 0 }, { maxOutputTokens: 16001 }, { timeoutMs: Infinity }]) expect(() => createOpenAIRecipeTransport({ ...valid, ...change })).toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each(['apiKey', 'model', 'price', 'sku', 'xml', 'endpoint', 'systemPrompt'])('contexto rechaza %s antes de enviar', async field => {
  const fetchImpl = vi.fn(), transport = createOpenAIRecipeTransport(config(fetchImpl));
  await expect(transport.request({ ...context, [field]: 'injected' })).rejects.toMatchObject({ code: 'invalid-context', dispatched: false, uncertain: false });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('ingredientes preferidos acotados y sin metadatos de compras', async () => {
  const fetchImpl = vi.fn(), transport = createOpenAIRecipeTransport(config(fetchImpl));
  for (const preferredIngredients of [[{ name: 'Limón', unit: 'kg', sku: 'private' }], [{ name: 'A', unit: 'taza' }], [{ name: 'A'.repeat(201), unit: 'kg' }], Array(21).fill({ name: 'A', unit: 'kg' })]) await expect(transport.request({ ...context, preferredIngredients })).rejects.toMatchObject({ dispatched: false });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([401, 429, 500, 503, 307])('HTTP %s no filtra cuerpo ni reintenta ni supone consumo cero', async status => {
  const cancel = vi.fn(), fetchImpl = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status }));
  const error = await createOpenAIRecipeTransport(config(fetchImpl)).request(context).catch(e => e);
  expect(error).toMatchObject({ code: 'http-error', dispatched: true, uncertain: true });
  expect(error.cause).toBeUndefined(); expect(error.message).not.toContain(key); expect(cancel).toHaveBeenCalledTimes(1); expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('fallo de conexión saneado; no reproduce error, causa ni cabeceras sensibles', async () => {
  const fetchImpl = vi.fn(async () => { throw new Error(`Authorization Bearer ${key}`); });
  const error = await createOpenAIRecipeTransport(config(fetchImpl)).request(context).catch(e => e);
  expect(error).toMatchObject({ code: 'transport-error', uncertain: true });
  expect(JSON.stringify(error) + error.stack).not.toContain(key); expect(error.cause).toBeUndefined(); expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('aborto previo no envía; aborto posterior mantiene consumo incierto', async () => {
  const controller = new AbortController(), fetchImpl = vi.fn(() => new Promise(() => {})), transport = createOpenAIRecipeTransport(config(fetchImpl));
  controller.abort(key);
  await expect(transport.request(context, { signal: controller.signal })).rejects.toMatchObject({ dispatched: false, uncertain: false });
  expect(fetchImpl).not.toHaveBeenCalled();
  const running = new AbortController(), task = transport.request(context, { signal: running.signal });
  running.abort(key);
  await expect(task).rejects.toMatchObject({ code: 'aborted', dispatched: true, uncertain: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1); expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
});

test('timeout termina aun si fetch ignora abort y cancela una respuesta tardía', async () => {
  vi.useFakeTimers(); let resolve;
  const fetchImpl = vi.fn(() => new Promise(r => { resolve = r; }));
  const task = createOpenAIRecipeTransport({ ...config(fetchImpl), timeoutMs: 10 }).request(context);
  const assertion = expect(task).rejects.toMatchObject({ code: 'aborted', uncertain: true });
  await vi.advanceTimersByTimeAsync(11); await assertion;
  const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(1); expect(cancel).toHaveBeenCalledTimes(1); expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('timeout cubre lectura del cuerpo y cancela el stream', async () => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }));
  const task = createOpenAIRecipeTransport({ ...config(fetchImpl), timeoutMs: 10 }).request(context);
  const assertion = expect(task).rejects.toMatchObject({ uncertain: true });
  await vi.advanceTimersByTimeAsync(11); await assertion; expect(cancel).toHaveBeenCalledTimes(1);
});

test('limita bytes reales aunque no exista Content-Length y cancela el cuerpo excesivo', async () => {
  const cancel = vi.fn();
  const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel }), { headers: { 'content-type': 'application/json' } }));
  await expect(createOpenAIRecipeTransport(config(fetchImpl)).request(context)).rejects.toMatchObject({ uncertain: true });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test.each(['html', 'invalid-json', 'length', 'utf8'])('rechaza respuesta %s sin devolver contenido', async kind => {
  const headers = { 'content-type': kind === 'html' ? 'text/html' : 'application/json', ...(kind === 'length' ? { 'content-length': '262145' } : {}) };
  const fetchImpl = vi.fn(async () => new Response(kind === 'utf8' ? new Uint8Array([255]) : key, { headers }));
  const error = await createOpenAIRecipeTransport(config(fetchImpl)).request(context).catch(e => e);
  expect(error).toMatchObject({ uncertain: true }); expect(error.message).not.toContain(key);
});

test.each(['refused', 'incomplete', 'invalid', 'bad-proposal', 'tool', 'multiple-messages', 'wrong-role'])('salida %s no crea receta, pero conserva consumo reportado', async kind => {
  const data = envelope();
  if (kind === 'refused') data.output[0].content = [{ type: 'refusal', refusal: key }];
  if (kind === 'incomplete') { data.status = 'incomplete'; data.incomplete_details = { reason: 'max_output_tokens' }; }
  if (kind === 'invalid') data.output[0].content[0].text = '{"name":';
  if (kind === 'bad-proposal') data.output[0].content[0].text = JSON.stringify({ ...proposal, price: 999 });
  if (kind === 'tool') data.output.push({ type: 'function_call', name: 'writePrices' });
  if (kind === 'multiple-messages') data.output.push(structuredClone(data.output[0]));
  if (kind === 'wrong-role') data.output[0].role = 'user';
  const result = await createOpenAIRecipeTransport(config(async () => response(data))).request(context);
  expect(result).toMatchObject({ status: ['refused', 'incomplete'].includes(kind) ? kind : 'invalid', proposal: null, consumption: 'reported', usage: { totalTokens: 300 } });
  expect(JSON.stringify(result)).not.toContain(key);
});

test('uso ausente o incoherente nunca equivale a gratuito', async () => {
  for (const value of [null, {}, { ...usage, total_tokens: 1 }, { ...usage, input_tokens: -1 }, { ...usage, input_tokens: '100' }, { ...usage, input_tokens_details: { cached_tokens: 101 } }, { ...usage, output_tokens_details: { reasoning_tokens: 201 } }]) expect(readRecipeTokenUsage(value)).toBeNull();
  const result = await createOpenAIRecipeTransport(config(async () => response(envelope({ usage: null })))).request(context);
  expect(result).toMatchObject({ status: 'completed', consumption: 'unknown', usage: null });
});

test('el simulador y el servidor local no aceptan secretos ni habilitan OpenAI', () => {
  for (const path of ['src/server/emulator-runtime.js', 'scripts/local-server.js']) expect(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).not.toContain('openai-recipe-transport');
  const service = readFileSync(new URL('../src/domain/recipe-generation.js', import.meta.url), 'utf8');
  expect(service).toContain("if(this.provider?.mode!=='simulated')throw");
});
