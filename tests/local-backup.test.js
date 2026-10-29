import { test, expect, vi } from 'vitest';
import { mkdtemp, readFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { readLocalBackup, readFirestoreEmulatorBackup, verifyLocalBackup, saveLocalBackup } from '../scripts/local-backup.js';

async function fixture() {
  const repository = new MemoryEntityRepository(), pantry = new PantryService(repository), kitchen = new KitchenService(repository);
  await pantry.initialize(); await kitchen.initialize();
  await kitchen.saveRecipe({ name: 'Sin precio', type: 'guisado', baseServings: '1', lines: [{ name: 'Pendiente', quantity: '1', unit: 'kg' }] });
  return { repository, backup: await pantry.exportBackup() };
}
function session(aud = 'demo-forx-v2') {
  return { token: 'fake.' + Buffer.from(JSON.stringify({ aud, iss: `https://securetoken.google.com/${aud}`, sub: 'local-admin' })).toString('base64url') + '.fake', actor: { uid: 'local-admin', role: 'admin' } };
}
test('respaldo local solo pide sesión y snapshot exportado, sin permitir comandos de escritura ni redirecciones', async () => {
  const { backup } = await fixture();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(session()))).mockResolvedValueOnce(new Response(JSON.stringify({ result: backup })));
  expect(await readLocalBackup(fetcher)).toEqual(backup);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8788/session', 'http://127.0.0.1:8788/commands']);
  expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({ command: 'exportBackup' }));
  expect(fetcher.mock.calls.every(([, options]) => options.redirect === 'error')).toBe(true);
});
test('rechaza proyecto distinto, fallos de sesión y destino dentro del repositorio antes de capturar', async () => {
  const wrong = vi.fn(async () => new Response(JSON.stringify(session('not-forx'))));
  await expect(readLocalBackup(wrong)).rejects.toThrow(/emulador/); expect(wrong).toHaveBeenCalledTimes(1);
  await expect(readLocalBackup(async () => new Response('{}', { status: 503 }))).rejects.toThrow(/servidor/);
  const unused = vi.fn(); await expect(saveLocalBackup('./private-backup', { fetchImpl: unused })).rejects.toThrow(/Vite/); expect(unused).not.toHaveBeenCalled();
});
test('rescate directo de Firestore rechaza hosts, proyectos y credenciales cloud antes de conectar', async () => {
  for (const env of [
    {},
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8188' },
    { FIRESTORE_EMULATOR_HOST: 'localhost:8180' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', GCLOUD_PROJECT: 'forx-v2-production' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', GOOGLE_APPLICATION_CREDENTIALS: '/private/key.json' }
  ]) await expect(readFirestoreEmulatorBackup(env)).rejects.toThrow(/Solo se admite Firestore local/);
});
test('restaura copia en fábrica aislada y compara registros, costos y faltantes sin modificar el origen', async () => {
  const { repository, backup } = await fixture(), before = await repository.exportSnapshot();
  expect(await verifyLocalBackup(JSON.stringify(backup))).toMatchObject({ verified: true, recordsPreserved: true, costsEqual: true, counts: { recipes: 1 } });
  expect(await repository.exportSnapshot()).toEqual(before);
  await expect(verifyLocalBackup(JSON.stringify({ ...backup, checksum: '0'.repeat(64) }))).rejects.toThrow(/integridad/);
});
test('copia privada se relee desde disco y nunca reemplaza un directorio existente', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'forx-backup-test-')), folder = path.join(temp, 'snapshot');
  const { backup } = await fixture();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(session()))).mockResolvedValueOnce(new Response(JSON.stringify({ result: backup })));
  expect(await saveLocalBackup(folder, { fetchImpl: fetcher })).toMatchObject({ verified: true, counts: { recipes: 1 } });
  expect(JSON.parse(await readFile(path.join(folder, 'backup.json'), 'utf8'))).toEqual(backup);
  expect(JSON.parse(await readFile(path.join(folder, 'verification.json'), 'utf8')).costsEqual).toBe(true);
  expect((await stat(folder)).mode & 0o077).toBe(0);
  expect((await stat(path.join(folder, 'backup.json'))).mode & 0o077).toBe(0);
  await expect(saveLocalBackup(folder, { fetchImpl: fetcher })).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
  const link = path.join(temp, 'served-link'); await symlink(process.cwd(), link);
  await expect(saveLocalBackup(path.join(link, 'snapshot'), { fetchImpl: fetcher })).rejects.toThrow(/Vite/);
});
