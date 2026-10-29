import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { emulatorLaunch, assertIsolatedVerification } from '../scripts/emulator-launch.js';

const require = createRequire(import.meta.url);
const { Persistence } = require('firebase-tools/lib/emulator/storage/persistence.js');
const pathFromChild = env => execFileSync(process.execPath, ['-e', "const {StorageEmulator}=require('firebase-tools/lib/emulator/storage');process.stdout.write(StorageEmulator.prototype.getPersistenceTmpDir.call({}));"], { env, encoding: 'utf8' });

test('puertos separados también usan temporales distintos; parar una suite no borra la otra', async () => {
  const root = mkdtempSync(join(tmpdir(), 'forx-isolation-check-'));
  try {
    const demo = emulatorLaunch('services', { tempParent: root });
    const trial = emulatorLaunch('rules', { tempParent: root });
    const demoPath = pathFromChild(demo.env), trialPath = pathFromChild(trial.env);
    expect(demoPath).not.toBe(trialPath);
    const live = new Persistence(demoPath), isolated = new Persistence(trialPath);
    const liveFile = live.appendBytes('xml-demo', Buffer.from('<xml>demo</xml>'));
    isolated.appendBytes('xml-test', Buffer.from('<xml>test</xml>'));
    await isolated.deleteAll(); // the actual Firebase stop cleanup, only under root
    expect(readFileSync(liveFile, 'utf8')).toBe('<xml>demo</xml>');
    expect(()=>live.appendBytes('siguiente', Buffer.from('<xml/>'))).not.toThrow();
    expect(demo.args).toContain('storage,auth');
    expect(demo.args).not.toContain('firestore,storage,auth');
    expect(trial.args).toContain('firebase.verification.json');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bloquea suites destructivas sobre demo, con puertos de prueba sin TMPDIR aislado o endpoints heredados', () => {
  const root = mkdtempSync(join(tmpdir(), 'forx-guard-check-'));
  try {
    const launch = emulatorLaunch('rules', { tempParent: root, env: { FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180' } });
    expect(launch.env.FIRESTORE_EMULATOR_HOST).toBeUndefined();
    const env={...launch.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8188',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9298'};
    expect(()=>assertIsolatedVerification(env)).not.toThrow();
    for(const invalid of [{...env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180'},{...env,TMPDIR:tmpdir()},{...env,FORX_ISOLATED_TESTS:''},{...env,GCLOUD_PROJECT:'another-project'}]) expect(()=>assertIsolatedVerification(invalid)).toThrow(/bloqueada/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
