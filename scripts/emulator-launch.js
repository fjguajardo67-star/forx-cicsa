import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, isAbsolute, resolve } from 'node:path';

const modes = {
  server: { config: 'firebase.json', only: 'firestore,storage,auth', command: 'scripts/local-server.js' },
  services: { config: 'firebase.json', only: 'storage,auth' },
  rules: { config: 'firebase.verification.json', only: 'firestore,storage,auth', command: 'node_modules/vitest/vitest.mjs run tests/security/rules.test.js tests/security/server.test.js --no-file-parallelism', test: true },
  recovery: { config: 'firebase.verification.json', only: 'firestore,storage,auth', command: 'node_modules/vitest/vitest.mjs run tests/security/recovery-isolated.test.js', test: true },
  backend: { config: 'firebase.verification.json', only: 'firestore,storage,auth', command: 'node_modules/vitest/vitest.mjs run tests/security/production-backend.test.js --no-file-parallelism', test: true }
};

// Firebase CLI stores Storage blobs under its temporary root
// and removes that directory when a suite stops. Different ports are NOT enough.
// A fresh, private temp root also isolates the emulator hub locator for each run.
export function emulatorLaunch(mode, { env = process.env, tempParent = tmpdir(), node = process.execPath } = {}) {
  const settings = modes[mode];
  if (!settings) throw new Error('Modo local desconocido: server, services, rules, recovery o backend.');
  const temporaryRoot = mkdtempSync(join(resolve(tempParent), settings.test ? 'forx-test-' : 'forx-demo-'));
  const childEnv = { ...env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot,
    FORX_EMULATOR_SANDBOX: temporaryRoot, GCLOUD_PROJECT: 'demo-forx-v2' };
  // Never inherit endpoints from another running suite or an operator shell.
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'FORX_ISOLATED_TESTS']) delete childEnv[key];
  if (settings.test) childEnv.FORX_ISOLATED_TESTS = '1';
  const args = ['node_modules/firebase-tools/lib/bin/firebase.js', settings.command ? 'emulators:exec' : 'emulators:start',
    '--config', settings.config, '--project', 'demo-forx-v2', '--only', settings.only];
  if (settings.command) args.push(`'${node.replaceAll("'", "'\\''")}' ${settings.command}`);
  return { args, env: childEnv, temporaryRoot };
}

export function assertIsolatedVerification(env = process.env) {
  const ports = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8188', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9298' };
  if (env.FORX_ISOLATED_TESTS !== '1' || env.GCLOUD_PROJECT !== 'demo-forx-v2'
    || Object.entries(ports).some(([key, value]) => env[key] !== value)
    || !env.TMPDIR || !isAbsolute(env.TMPDIR) || !basename(env.TMPDIR).startsWith('forx-test-')
    || env.TMPDIR !== env.FORX_EMULATOR_SANDBOX) {
    throw new Error('Prueba bloqueada: requiere puertos y carpeta temporal aislados. Usa npm run test:rules o test:recovery; nunca la demo abierta.');
  }
}
