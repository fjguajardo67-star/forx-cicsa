import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { generateKeyPairSync } from 'node:crypto';
import { initializeApp, deleteApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { inspectBackup, backupDigest, exportBackup, BACKUP_MAX_BYTES } from '../src/domain/backup.js';
import { MemoryEntityRepository, IndexedDbEntityRepository, COLLECTIONS } from '../src/data/entity-repository.js';
import { restoreLocalCopy } from '../src/data/local-recovery.js';
import { KitchenService } from '../src/domain/kitchen-service.js';

// Maintenance of the shared LOCAL demo only. No SDK, cloud fallback, server
// restart, import, retention or writes to the source. No tokens are persisted.
export async function readLocalBackup(fetchImpl = fetch) {
  const endpoint = 'http://127.0.0.1:8788';
  const headers = { Origin: 'http://127.0.0.1:4174', 'Content-Type': 'application/json' };
  async function request(route, options) {
    const response = await fetchImpl(endpoint + route, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), ...options
    });
    if (!response.ok) throw new Error('El servidor local no pudo entregar el respaldo. No se reiniciarán servicios.');
    const text = await response.text();
    if (Buffer.byteLength(text) > BACKUP_MAX_BYTES) throw new Error('Respuesta superior a 64 MB.');
    return JSON.parse(text);
  }
  const { token, actor } = await request('/session', { headers });
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { throw new Error('Sesión local inválida.'); }
  if (claims.aud !== 'demo-forx-v2' || claims.iss !== 'https://securetoken.google.com/demo-forx-v2'
    || actor?.role !== 'admin' || actor.uid !== claims.sub) throw new Error('Solo se admite administración del emulador demo-forx-v2.');
  const { result } = await request('/commands', {
    headers: { ...headers, Authorization: `Bearer ${token}` }, body: JSON.stringify({ command: 'exportBackup' })
  });
  await inspectBackup(JSON.stringify(result));
  return result;
}

// Rescue an already-running Firestore emulator when its HTTP/Auth companion is
// unavailable. This is a read-only snapshot, never an emulator import/restart.
export async function readFirestoreEmulatorBackup(env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180'
    || (env.GCLOUD_PROJECT && env.GCLOUD_PROJECT !== 'demo-forx-v2')
    || env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Solo se admite Firestore local demo-forx-v2 en 127.0.0.1:8180, sin credenciales cloud.');
  }
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const app = initializeApp({ projectId: 'demo-forx-v2', credential: cert({
    projectId: 'demo-forx-v2', clientEmail: 'rescue@demo-forx-v2.iam.gserviceaccount.com', privateKey
  }) }, `forx-rescue-${crypto.randomUUID()}`);
  try {
    const db = getFirestore(app);
    return exportBackup({ exportSnapshot: () => db.runTransaction(async tx => {
      const snapshots = await Promise.all(COLLECTIONS.map(name => tx.get(db.collection(name))));
      return Object.fromEntries(COLLECTIONS.map((name, i) => [name, snapshots[i].docs.map(doc => doc.data())]));
    }, { readOnly: true }) });
  } finally { await deleteApp(app); }
}

export async function verifyLocalBackup(source) {
  const inspected = await inspectBackup(source), factory = new IDBFactory();
  const restored = await restoreLocalCopy(source, { factory });
  const target = await IndexedDbEntityRepository.open(restored.name, factory);
  try {
    const actual = await target.exportSnapshot();
    // The recovery adds exactly its own local marker and one audit event.
    for (const name of COLLECTIONS) {
      const original = inspected.collections[name].filter(r => name !== 'settings' || r.id !== 'local_recovery');
      const originalIds = new Set(original.map(row => row.id));
      const index = new Map(actual[name].map(r => [r.id, r]));
      for (const row of original) {
        if (!index.has(row.id) || await backupDigest(row) !== await backupDigest(index.get(row.id)))
          throw new Error(`La recuperación no conserva los registros de ${name}.`);
      }
      const extra = actual[name].filter(r => !originalIds.has(r.id));
      if (name === 'settings') {
        if (extra.length !== 1 || extra[0].id !== 'local_recovery' || extra[0].sourceChecksum !== inspected.backup.checksum) throw new Error('Marcador de recuperación incorrecto.');
      } else if (name === 'audit') {
        if (extra.length !== 1 || extra[0].action !== 'backup.restored') throw new Error('Auditoría de recuperación incorrecta.');
      } else if (extra.length) throw new Error(`La recuperación añadió registros a ${name}.`);
    }
    const baseline = new MemoryEntityRepository();
    for (const [name, rows] of Object.entries(inspected.collections)) for (const row of rows) baseline.records.set(`${name}/${row.id}`, structuredClone(row));
    const before = await new KitchenService(baseline).snapshot(), after = await new KitchenService(target).snapshot();
    for (const key of ['recipeCosts', 'menuCosts', 'settings']) {
      if (await backupDigest(before[key]) !== await backupDigest(after[key])) throw new Error(`Diferencia en ${key} al recuperar.`);
    }
    const sorted = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    for (const key of ['catalog', 'recipes', 'menus']) {
      if (await backupDigest(sorted(before[key])) !== await backupDigest(sorted(after[key]))) throw new Error(`Diferencia en ${key} al recuperar.`);
    }
    return { verified: true, method: 'isolated-fake-indexeddb', sourceCreatedAt: inspected.backup.createdAt,
      checksum: inspected.backup.checksum, counts: inspected.counts, total: inspected.total,
      recordsPreserved: true, costsEqual: true, originalsIncluded: false, identitiesIncluded: false,
      scope: 'Copia local aislada en memoria; no certifica restauración cloud ni reemplaza la base de trabajo.' };
  } finally { target.close(); }
}

export async function saveLocalBackup(folder, { fetchImpl = fetch, reader = () => readLocalBackup(fetchImpl) } = {}) {
  const repository = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const destination = path.join(await realpath(path.dirname(path.resolve(folder))), path.basename(path.resolve(folder)));
  if (destination === repository || destination.startsWith(repository + path.sep)) throw new Error('Guardar fuera del repositorio servido por Vite.');
  // Exclusive new directory/files: never replace a prior copy, including symlinks.
  await mkdir(destination, { mode: 0o700 });
  const backup = await reader(), filename = path.join(destination, 'backup.json');
  await writeFile(filename, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
  const report = await verifyLocalBackup(await readFile(filename, 'utf8'));
  await writeFile(path.join(destination, 'verification.json'), JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  return { directory: destination, ...report };
}

async function main() {
  const [mode, filename, ...extra] = process.argv.slice(2);
  if (extra.length || !filename || !['capture', 'capture-firestore', 'verify'].includes(mode)) throw new Error('Uso: local-backup.js capture|capture-firestore DIRECTORIO_NUEVO | verify ARCHIVO_JSON');
  if (mode === 'capture' || mode === 'capture-firestore') console.log(JSON.stringify(await saveLocalBackup(filename,
    mode === 'capture-firestore' ? { reader: readFirestoreEmulatorBackup } : {}), null, 2));
  else {
    if ((await stat(filename)).size > BACKUP_MAX_BYTES) throw new Error('Respaldo superior a 64 MB.');
    console.log(JSON.stringify(await verifyLocalBackup(await readFile(filename, 'utf8')), null, 2));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error('Respaldo o comprobación incompletos. Conservar los archivos creados para diagnóstico; no se modificó la base origen ni se reiniciaron servicios.');
  process.exitCode = 1;
});
