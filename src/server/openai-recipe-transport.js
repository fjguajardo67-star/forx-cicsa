import { buildOpenAIRecipeRequest, parseOpenAIRecipeResponse } from './openai-recipe-contract.js';
import { exactKeys, validateGenerationInput, validateProposal } from '../domain/recipe-proposal.js';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const REQUEST_BYTES = 32768;
const RESPONSE_BYTES = 262144;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

// A transport alone cannot generate: the cloud runtime only injects it alongside
// an approved monetary policy and explicit activation. There is no global-fetch
// or environment-secret fallback inside this module. The service reserves money
// atomically before dispatch and reconciles usage afterwards.
export class RecipeTransportError extends Error {
  constructor(code, dispatched) {
    super('No se obtuvo una respuesta utilizable de OpenAI. No se reintentó la solicitud.');
    this.name = 'RecipeTransportError';
    this.code = code;
    this.dispatched = dispatched;
    // Even HTTP errors do not constitute evidence of zero billed consumption.
    this.uncertain = dispatched;
  }
}

function culinaryContext(value) {
  exactKeys(value, ['idea', 'type', 'protein', 'baseServings', 'restrictions', 'preferredIngredients'], 'Contexto culinario');
  const { preferredIngredients = [], ...fields } = value;
  const { requestId, preferredIngredientIds, ...input } = validateGenerationInput({
    ...fields, requestId: 'transport_validation', preferredIngredientIds: []
  });
  if (!Array.isArray(preferredIngredients) || preferredIngredients.length > 20) throw new Error('Contexto inválido.');
  const ingredients = preferredIngredients.map(item => {
    exactKeys(item, ['name', 'unit'], 'Ingrediente preferido');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !['kg', 'l', 'pz'].includes(item.unit)) throw new Error('Contexto inválido.');
    return { name: item.name.trim(), unit: item.unit };
  });
  return { ...input, preferredIngredients: ingredients };
}

// Missing/inconsistent usage is unknown, NEVER zero and never grounds for a
// refund. Reasoning tokens are a subset of output_tokens, not added twice.
export function readRecipeTokenUsage(usage) {
  if (!usage || !['input_tokens', 'output_tokens', 'total_tokens'].every(key => integer(usage[key], 0, 1e9))) return null;
  const cached = usage.input_tokens_details?.cached_tokens;
  const cacheWrite = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const reasoning = usage.output_tokens_details?.reasoning_tokens;
  if (!integer(cached, 0, usage.input_tokens) || !integer(cacheWrite, 0, usage.input_tokens - cached)
    || !integer(reasoning, 0, usage.output_tokens)
    || usage.total_tokens !== usage.input_tokens + usage.output_tokens) return null;
  return { inputTokens: usage.input_tokens, cachedInputTokens: cached, cacheWriteTokens: cacheWrite, outputTokens: usage.output_tokens,
    reasoningTokens: reasoning, totalTokens: usage.total_tokens };
}

async function boundedJson(response, signal) {
  const length = response.headers.get('content-length');
  if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > RESPONSE_BYTES))) {
    void response.body?.cancel().catch(() => {});
    throw new Error('invalid-response');
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0, complete = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTES) throw new Error('response-too-large');
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('aborted');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    complete = true;
    return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

export function createOpenAIRecipeTransport(options = {}) {
  exactKeys(options, ['apiKey', 'model', 'maxOutputTokens', 'timeoutMs', 'fetchImpl'], 'Configuración de transporte');
  const { apiKey, model, maxOutputTokens, timeoutMs, fetchImpl } = options;
  if (typeof fetchImpl !== 'function' || typeof apiKey !== 'string' || !/^[\x21-\x7e]{8,512}$/.test(apiKey)
    || typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model)
    || !integer(maxOutputTokens, 1, 16000) || !integer(timeoutMs, 1, 120000)) {
    throw new RecipeTransportError('invalid-configuration', false);
  }
  return Object.freeze({ mode: 'openai', model, maxOutputTokens, maxRequestBytes: REQUEST_BYTES,
    async request(context, { signal } = {}) {
      let input, body;
      try {
        input = culinaryContext(context);
        body = JSON.stringify(buildOpenAIRecipeRequest(input, { model, maxOutputTokens }));
        if (new TextEncoder().encode(body).byteLength > REQUEST_BYTES) throw new Error();
      } catch { throw new RecipeTransportError('invalid-context', false); }
      if (signal?.aborted) throw new RecipeTransportError('aborted', false);
      const controller = new AbortController();
      let dispatched = false, timer, rejectAbort;
      const aborted = new Promise((_, reject) => { rejectAbort = reject; });
      const abort = () => {
        controller.abort();
        rejectAbort(new RecipeTransportError('aborted', dispatched));
      };
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, timeoutMs);
      try {
        const operation = (async () => {
          dispatched = true;
          const response = await fetchImpl(ENDPOINT, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body
          });
          // Never read or expose a provider error body, even on 401/429/5xx.
          if (!response.ok || controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw new RecipeTransportError('http-error', true);
          }
          const envelope = await boundedJson(response, controller.signal);
          const usage = readRecipeTokenUsage(envelope?.usage);
          const actualModel = typeof envelope?.model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(envelope.model) ? envelope.model : null;
          const serviceTier = typeof envelope?.service_tier === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(envelope.service_tier) ? envelope.service_tier : null;
          const responseId = typeof envelope?.id === 'string' && /^resp_[a-zA-Z0-9_-]{1,120}$/.test(envelope.id) ? envelope.id : null;
          const base = { usage, consumption: usage ? 'reported' : 'unknown', actualModel, serviceTier, responseId };
          // Usage is retained even if the content is refused, incomplete or bad.
          if (!envelope || envelope.status !== 'completed' || envelope.error || envelope.incomplete_details) return { ...base, status: 'incomplete', proposal: null };
          if (!Array.isArray(envelope.output)) return { ...base, status: 'invalid', proposal: null };
          const messages = envelope.output.filter(item => item?.type === 'message');
          if (messages.some(item => Array.isArray(item.content) && item.content.some(part => part?.type === 'refusal'))) return { ...base, status: 'refused', proposal: null };
          try {
            if (messages.length !== 1 || messages[0].role !== 'assistant' || messages[0].status !== 'completed'
              || !Array.isArray(messages[0].content) || messages[0].content.length !== 1 || messages[0].content[0]?.type !== 'output_text'
              || envelope.output.some(item => !['message', 'reasoning'].includes(item?.type))) throw new Error();
            const proposal = validateProposal(parseOpenAIRecipeResponse(envelope), input);
            return { ...base, status: 'completed', proposal };
          } catch { return { ...base, status: 'invalid', proposal: null }; }
        })();
        return await Promise.race([operation, aborted]);
      } catch (error) {
        controller.abort();
        if (error instanceof RecipeTransportError) throw error;
        // No original cause, headers, payload, key or provider message escapes.
        throw new RecipeTransportError('transport-error', dispatched);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    }
  });
}
