import { validateRecipeBudgetPolicy } from '../domain/recipe-budget.js';
import { createOpenAIRecipeTransport } from './openai-recipe-transport.js';

const disabled = Object.freeze({ enabled: false });

// Configuration contains approvals and rates, never the API key. A disabled
// deployment cannot obtain a transport merely by having a secret present.
export function recipeAIConfiguration(value) {
  if (value == null) return disabled;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['enabled', 'model', 'maxOutputTokens', 'timeoutMs', 'budgetPolicy'].includes(key)))
    throw new Error('Configuración FORX: generación IA inválida.');
  if (value.enabled === false && Object.keys(value).length === 1) return disabled;
  if (value.enabled !== true || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 120000)
    throw new Error('Configuración FORX: la generación IA exige aprobación y plazo explícitos.');
  if (typeof value.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value.model)
    || !Number.isSafeInteger(value.maxOutputTokens) || value.maxOutputTokens < 1 || value.maxOutputTokens > 16000)
    throw new Error('Configuración FORX: modelo o límite de salida inválidos.');
  const descriptor = { mode: 'openai', model: value.model, maxOutputTokens: value.maxOutputTokens, maxRequestBytes: 32768 };
  // Validate here for --check, but pass the original policy to the service,
  // which validates and snapshots its rates when a request is reserved.
  validateRecipeBudgetPolicy(value.budgetPolicy, descriptor);
  return Object.freeze({ enabled: true, model: value.model, maxOutputTokens: value.maxOutputTokens,
    timeoutMs: value.timeoutMs, budgetPolicy: structuredClone(value.budgetPolicy) });
}

export function createRecipeAIProvider(configuration, { env = process.env, fetchImpl } = {}) {
  if (!configuration?.enabled) return { generationProvider: null, generationBudgetPolicy: null };
  if (env.FORX_ENABLE_RECIPE_AI !== 'true')
    throw new Error('Configuración FORX: falta la activación explícita de generación IA.');
  const generationProvider = createOpenAIRecipeTransport({ apiKey: env.FORX_OPENAI_API_KEY,
    model: configuration.model, maxOutputTokens: configuration.maxOutputTokens,
    timeoutMs: configuration.timeoutMs, fetchImpl });
  return { generationProvider, generationBudgetPolicy: configuration.budgetPolicy };
}
