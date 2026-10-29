import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { deploymentConfig } from '../src/server/deployment-config.js';
import { validateRecipeBudgetPolicy } from '../src/domain/recipe-budget.js';
import { createRecipeAIProvider, recipeAIConfiguration } from '../src/server/recipe-ai-configuration.js';
import { runtimeRecipeGeneration } from '../src/server/cloud-runtime.js';
import { config as fixture } from './fixtures/backend.js';

const policy = { approvalRef: 'TEST_ONLY_0001', priceVersion: 'TEST_RATE_0001', model: 'fixture-model',
  maxInputTokens: 40960, maxOutputTokens: 2000,
  priceUSDPerMillion: { input: '1', cachedInput: '0.5', cacheWrite: '1.25', output: '5' },
  monthlyBudgetUSD: '0.20', dailyUserBudgetUSD: '0.10', perRequestBudgetUSD: '0.08',
  userDailyRequests: 10, projectMonthlyRequests: 100, concurrentRequests: 2 };
const enabled = { enabled: true, model: 'fixture-model', maxOutputTokens: 2000, timeoutMs: 1000, budgetPolicy: policy };
const approved = JSON.parse(readFileSync(new URL('../config/recipe-ai-pilot.policy.json', import.meta.url), 'utf8'));

test('el despliegue mantiene IA apagada por defecto; un secreto aislado no la habilita', () => {
  const config = deploymentConfig(fixture, {});
  expect(config.recipeGeneration).toEqual({ enabled: false });
  expect(recipeAIConfiguration({ enabled: false })).toEqual({ enabled: false });
  expect(createRecipeAIProvider(config.recipeGeneration, { env: { FORX_OPENAI_API_KEY: 'FAKE_TEST_KEY_NEVER_REAL' } }))
    .toEqual({ generationProvider: null, generationBudgetPolicy: null });
});

test('modelo, tarifas y topes completos son requisito antes de activar', () => {
  expect(deploymentConfig({ ...fixture, recipeGeneration: enabled }, {}).recipeGeneration.budgetPolicy).toEqual(policy);
  for (const bad of [{ enabled: true }, { ...enabled, model: 'otro-modelo' }, { ...enabled, maxOutputTokens: 0 },
    { ...enabled, budgetPolicy: { ...policy, approvalRef: '' } },
    { ...enabled, budgetPolicy: { ...policy, perRequestBudgetUSD: '0.01' } },
    { enabled: false, model: 'fixture-model' }, { enabled: true, apiKey: 'bad' }])
    expect(() => recipeAIConfiguration(bad)).toThrow();
});

test('política aprobada Sol: tarifas oficiales versionadas y reserva máxima bajo US$0.15', () => {
  expect(approved).toMatchObject({ approvalRef: 'francisco-2026-10-06-ai-pilot', model: 'gpt-6.1-sol',
    monthlyBudgetUSD: '5', dailyUserBudgetUSD: '1', perRequestBudgetUSD: '0.15',
    priceUSDPerMillion: { input: '2', cachedInput: '0.10', cacheWrite: '2.50', output: '10' } });
  const validated = recipeAIConfiguration({ enabled: true, model: approved.model,
    maxOutputTokens: approved.maxOutputTokens, timeoutMs: 90000, budgetPolicy: approved });
  expect(validated.budgetPolicy.maxInputTokens).toBe(40960);
  // 40,960 × $2.50/M (máxima tarifa de entrada) + 4,000 × $10/M.
  expect(validateRecipeBudgetPolicy(approved, { mode: 'openai', model: approved.model,
    maxOutputTokens: approved.maxOutputTokens, maxRequestBytes: 32768 }).reservationNanoUSD).toBe('142400000');
  expect(deploymentConfig({ ...fixture, recipeGeneration: { enabled: true, model: approved.model,
    maxOutputTokens: approved.maxOutputTokens, timeoutMs: 90000, budgetPolicy: approved } }, {}).recipeGeneration.enabled).toBe(true);
});

test('dos cerrojos adicionales: activación explícita y secreto solo en servidor; ninguna llamada de red al configurar', () => {
  const configuration = recipeAIConfiguration(enabled), fetchImpl = vi.fn();
  expect(() => createRecipeAIProvider(configuration, { env: { FORX_OPENAI_API_KEY: 'FAKE_TEST_KEY_NEVER_REAL' }, fetchImpl }))
    .toThrow(/activación explícita/);
  expect(() => createRecipeAIProvider(configuration, { env: { FORX_ENABLE_RECIPE_AI: 'true' }, fetchImpl })).toThrow();
  const wired = createRecipeAIProvider(configuration, { env: { FORX_ENABLE_RECIPE_AI: 'true',
    FORX_OPENAI_API_KEY: 'FAKE_TEST_KEY_NEVER_REAL' }, fetchImpl });
  expect(wired.generationProvider).toMatchObject({ mode: 'openai', model: 'fixture-model', maxOutputTokens: 2000 });
  expect(wired.generationBudgetPolicy).toBe(configuration.budgetPolicy);
  expect(JSON.stringify(wired)).not.toContain('FAKE_TEST_KEY_NEVER_REAL');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('trabajos privados no reciben transporte IA aunque el API tenga política habilitada', () => {
  const configuration = recipeAIConfiguration(enabled), fetchImpl = vi.fn();
  expect(runtimeRecipeGeneration(configuration, { connectRecipeAI: false, env: {}, fetchImpl }))
    .toEqual({ generationProvider: null, generationBudgetPolicy: null });
  expect(() => runtimeRecipeGeneration(configuration, { env: {}, fetchImpl })).toThrow(/activación explícita/);
  expect(fetchImpl).not.toHaveBeenCalled();
});
