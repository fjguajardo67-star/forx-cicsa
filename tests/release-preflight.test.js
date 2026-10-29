import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releasePreflight, validateReleaseConfiguration, validateReleaseClientConfiguration } from '../src/server/release-preflight.js';
import { config as fixture } from './fixtures/backend.js';

const policy = JSON.parse(readFileSync(new URL('../config/recipe-ai-pilot.policy.json', import.meta.url), 'utf8'));
const candidate = { ...fixture, environment: 'production', databaseId: 'forx-production-test',
  apiOrigin: 'https://forx-api.cicsacomedores.com.mx',
  origins: ['https://menu-cicsa.cicsacomedores.com.mx'], signInProvider: 'google.com',
  maintenance: { retentionEnabled: true, backupsEnabled: true, generationTextRetentionEnabled: true,
    approvedBy: 'test-approval', approvedAt: '2026-10-06T00:00:00.000Z' },
  recipeGeneration: { enabled: true, model: policy.model, maxOutputTokens: policy.maxOutputTokens,
    timeoutMs: 90000, budgetPolicy: policy } };
const client = { enabled: true, environment: 'production', appOrigin: 'https://menu-cicsa.cicsacomedores.com.mx',
  apiOrigin: 'https://forx-api.cicsacomedores.com.mx',
  firebase: { projectId: fixture.projectId, authDomain: `${fixture.projectId}.firebaseapp.com`,
    apiKey: `AIza${'A'.repeat(35)}`, appId: '1:123456:web:abcdef123456' } };

test('prepublicación exige destino propio, retención/respaldo, URL confirmada y política IA intacta', () => {
  expect(validateReleaseConfiguration(candidate, policy, { candidate: true }).environment).toBe('production');
  for (const bad of [
    { ...candidate, databaseId: 'forx-production-pendiente' },
    { ...candidate, origins: ['https://other.example'] },
    { ...candidate, apiOrigin: 'https://forx-api-pendiente.invalid' },
    { ...candidate, apiOrigin: undefined },
    { ...candidate, apiKey: 'NOT_A_REAL_KEY' },
    { ...candidate, maintenance: { ...candidate.maintenance, accessToken: 'NOT_A_REAL_TOKEN' } },
    { ...candidate, signInProvider: 'password' },
    { ...candidate, maintenance: { ...candidate.maintenance, retentionEnabled: false } },
    { ...candidate, maintenance: { ...candidate.maintenance, generationTextRetentionEnabled: false } },
    { ...candidate, recipeGeneration: { enabled: false } },
    { ...candidate, recipeGeneration: { ...candidate.recipeGeneration,
      budgetPolicy: { ...policy, monthlyBudgetUSD: '50' } } }
  ]) expect(() => validateReleaseConfiguration(bad, policy, { candidate: true })).toThrow();
});

test('ejemplo inactivo se puede inspeccionar sin convertirse en candidato', () => {
  const example = JSON.parse(readFileSync(new URL('../config/deployment.example.json', import.meta.url), 'utf8'));
  expect(validateReleaseConfiguration(example, policy).recipeGeneration).toEqual({ enabled: false });
  expect(() => validateReleaseConfiguration(example, policy, { candidate: true })).toThrow();
});

test('el piloto sin IA es explícito, conserva destino y respaldos y prohíbe activar consumo',()=>{
  const pilot={...candidate,recipeGeneration:{enabled:false},maintenance:{...candidate.maintenance,generationTextRetentionEnabled:false}};
  expect(()=>validateReleaseConfiguration(pilot,policy,{candidate:true})).toThrow();
  expect(validateReleaseConfiguration(pilot,policy,{candidate:true,pilotWithoutAI:true}).recipeGeneration.enabled).toBe(false);
  expect(()=>validateReleaseConfiguration(candidate,policy,{candidate:true,pilotWithoutAI:true})).toThrow();
  expect(()=>validateReleaseConfiguration({...pilot,maintenance:{...pilot.maintenance,backupsEnabled:false}},policy,{candidate:true,pilotWithoutAI:true})).toThrow();
});

test('candidato liga navegador y backend; rechaza proyecto, entorno, origen y campos extra', () => {
  expect(validateReleaseClientConfiguration(client, candidate)).toMatchObject({ appOrigin: client.appOrigin,
    apiOrigin: client.apiOrigin, firebase: { projectId: fixture.projectId } });
  for (const bad of [
    { ...client, environment: 'staging' },
    { ...client, appOrigin: 'https://otro.cicsacomedores.com.mx' },
    { ...client, apiOrigin: 'https://otro-api.cicsacomedores.com.mx' },
    { ...client, firebase: { ...client.firebase, projectId: 'forx-v2-ajeno' } },
    { ...client, privateKey: 'no debe publicarse' },
    { ...client, firebase: { ...client.firebase, credential: 'no debe publicarse' } }
  ]) expect(() => validateReleaseClientConfiguration(bad, candidate)).toThrow();
});

test('manifiesto sin red liga hashes, commit y destino sin afirmar despliegue ni aceptación', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'forx-preflight-test-'));
  try {
    await mkdir(path.join(root, 'config'));
    await mkdir(path.join(root, 'dist'));
    const files = { 'config/recipe-ai-pilot.policy.json': JSON.stringify(policy),
      'firestore.production.rules': 'rules_version = 2;', 'storage.production.rules': 'rules_version = 2;',
      'package.json': '{}', 'package-lock.json': '{}', 'dist/index.html': '<!doctype html>' };
    await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(root, name), content)));
    const configPath = path.join(root, 'config/deployment.json');
    const clientConfigPath = path.join(root, 'config/client.json');
    await writeFile(configPath, JSON.stringify(candidate));
    await writeFile(clientConfigPath, JSON.stringify(client));
    const input = { root, configPath, clientConfigPath, approvedPolicy: policy, candidate: true, commit: 'a'.repeat(40), clean: true };
    const first = await releasePreflight(input), second = await releasePreflight(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ candidate: true, target: `${fixture.projectId}/forx-production-test`,
      appOrigin: client.appOrigin, apiOrigin: client.apiOrigin,
      network: false, deployed: false });
    expect(first.files.some(file => file.path === 'dist/index.html' && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(first.files.some(file => file.path === 'client-config' && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    await expect(releasePreflight({ ...input, clientConfigPath: undefined })).rejects.toThrow(/configuración pública exacta/);
    await expect(releasePreflight({ ...input, clean: false })).rejects.toThrow(/commit sin cambios/);
  } finally { await rm(root, { recursive: true }); }
});
