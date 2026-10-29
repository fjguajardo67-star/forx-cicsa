import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { deploymentConfig } from './deployment-config.js';
import { clientConfig } from '../data/client-config.js';

const fail = message => { throw new Error(`Prepublicación FORX: ${message}`); };
const REQUIRED = ['config/recipe-ai-pilot.policy.json', 'firestore.production.rules',
  'storage.production.rules', 'package.json', 'package-lock.json'];
const CONFIG_KEYS = ['environment', 'projectId', 'databaseId', 'originalsBucket', 'backupsBucket', 'apiOrigin',
  'origins', 'signInProvider', 'limits', 'maintenance', 'adminRecovery',
  'recipeBudgetReconciliation', 'recipeGeneration'];
const CLIENT_KEYS = ['enabled', 'environment', 'appOrigin', 'apiOrigin', 'firebase'];
const FIREBASE_CLIENT_KEYS = ['projectId', 'authDomain', 'apiKey', 'appId'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
function rejectSecretFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/secret|api.?key|credential|private.?key|password|access.?token/i.test(key))
      fail('la configuración no debe incluir credenciales.');
    rejectSecretFields(child);
  }
}

export function validateReleaseConfiguration(raw, approvedPolicy, { candidate = false } = {}) {
  const config = deploymentConfig(raw, {});
  if (!candidate) return config;
  rejectSecretFields(raw);
  if (Object.keys(raw).some(key => !CONFIG_KEYS.includes(key))) fail('la configuración contiene campos no aprobados.');
  if (!['staging', 'production'].includes(config.environment) || !config.apiOrigin
    || [config.projectId, config.databaseId, config.originalsBucket, config.backupsBucket, config.apiOrigin, ...config.origins]
      .some(value => /pendiente|\.invalid\b/i.test(value))) fail('destinos de ejemplo no se pueden publicar.');
  if (!config.maintenance.retentionEnabled || !config.maintenance.backupsEnabled
    || !config.maintenance.generationTextRetentionEnabled)
    fail('retención de XML y propuestas, y respaldo programables deben tener aprobación explícita.');
  if (config.signInProvider !== 'google.com') fail('el acceso publicado debe usar Google.');
  if (!config.recipeGeneration.enabled || !isDeepStrictEqual(config.recipeGeneration.budgetPolicy, approvedPolicy)
    || config.recipeGeneration.model !== approvedPolicy.model
    || config.recipeGeneration.maxOutputTokens !== approvedPolicy.maxOutputTokens)
    fail('la generación real requiere la política aprobada exacta.');
  if (config.environment === 'production' && !config.origins.includes('https://menu-cicsa.cicsacomedores.com.mx'))
    fail('el origen FORX confirmado no figura en producción.');
  return config;
}

export function validateReleaseClientConfiguration(raw, serverConfig) {
  if (!exactKeys(raw, CLIENT_KEYS) || !exactKeys(raw.firebase, FIREBASE_CLIENT_KEYS))
    fail('la configuración pública del navegador contiene campos faltantes o no aprobados.');
  let client;
  try { client = clientConfig(JSON.stringify(raw), new URL(raw.appOrigin)); }
  catch { fail('la configuración pública de Google/API no es válida.'); }
  if (client.environment !== serverConfig.environment || client.firebase.projectId !== serverConfig.projectId
    || client.apiOrigin !== serverConfig.apiOrigin
    || !serverConfig.origins.includes(client.appOrigin)
    || (serverConfig.environment === 'production' && client.appOrigin !== 'https://menu-cicsa.cicsacomedores.com.mx')
    || (serverConfig.environment === 'staging' && client.appOrigin === 'https://menu-cicsa.cicsacomedores.com.mx'))
    fail('el navegador y el backend no apuntan al mismo entorno, proyecto y origen aprobado.');
  return client;
}

async function hashTree(root, relative) {
  const full = path.join(root, relative), info = await lstat(full);
  if (info.isSymbolicLink()) fail('el artefacto contiene un vínculo simbólico.');
  if (info.isFile()) return [{ path: relative.replaceAll(path.sep, '/'), sha256: sha256(await readFile(full)) }];
  if (!info.isDirectory()) fail('el artefacto contiene un tipo de archivo no permitido.');
  const names = (await readdir(full)).sort();
  const entries = (await Promise.all(names.map(name => hashTree(root, path.join(relative, name))))).flat();
  if (entries.length > 1000) fail('demasiados archivos en el artefacto.');
  return entries;
}

// Read-only evidence. No account, bucket, DNS, billing or deploy operation is
// performed here. External approvals remain separate from this static result.
export async function releasePreflight({ root, configPath, clientConfigPath, approvedPolicy, candidate = false, commit, clean }) {
  if (!root || !configPath || !/^[a-f0-9]{40}$/.test(commit || '') || typeof clean !== 'boolean')
    fail('faltan raíz, configuración o estado de Git.');
  const resolved = path.resolve(configPath), repo = path.resolve(root);
  if (candidate && !clean) fail('el candidato requiere un commit sin cambios locales.');
  const raw = JSON.parse(await readFile(resolved, 'utf8'));
  const config = validateReleaseConfiguration(raw, approvedPolicy, { candidate });
  let client = null, clientBytes = null;
  if (candidate) {
    if (!clientConfigPath) fail('el candidato requiere la configuración pública exacta usada para compilar el navegador.');
    clientBytes = await readFile(path.resolve(clientConfigPath));
    client = validateReleaseClientConfiguration(JSON.parse(clientBytes.toString('utf8')), config);
  }
  const files = [];
  for (const relative of REQUIRED) files.push(...await hashTree(repo, relative));
  files.push(...await hashTree(repo, 'dist'));
  if (!files.some(item => item.path === 'dist/index.html')) fail('falta la compilación de interfaz.');
  files.push({ path: 'deployment-config', sha256: sha256(await readFile(resolved)) });
  if (clientBytes) files.push({ path: 'client-config', sha256: sha256(clientBytes) });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { format: 'forx-release-preflight', version: 1, candidate, commit, clean,
    target: `${config.projectId}/${config.databaseId}`, environment: config.environment,
    ...(client ? { appOrigin: client.appOrigin, apiOrigin: client.apiOrigin } : {}),
    files, artifactDigest: sha256(JSON.stringify(files)), network: false, deployed: false,
    externalAcceptanceRequired: ['auditoría y pruebas completas', 'cuenta/IAM/secretos y límite externo OpenAI',
      'datos y menú aceptados', 'ensayo en URL temporal', 'ventana de publicación y reversión'] };
}
