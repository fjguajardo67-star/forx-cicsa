import { test, expect, vi } from 'vitest';
import { AdminRecovery, requireRecoveryJob, recoveryPolicy } from '../src/server/admin-recovery.js';
import { initializeEmptyInstance } from '../src/server/initialize-instance.js';
import { backupDigest } from '../src/domain/backup.js';
import { config, backendFixture } from './fixtures/backend.js';
import { deploymentConfig } from '../src/server/deployment-config.js';

const start = '2026-10-05T18:00:00.000Z';
const policy = { enabled: true, jobName: 'forx-emergency-access', approvedBy: 'Responsable ficticio', approvedAt: start, expiresAt: '2026-10-05T19:00:00.000Z' };
const input = { lostUid: 'lost', replacementUid: 'next', reason: 'Pérdida confirmada de la cuenta administradora.' };
async function setup() {
  const f = backendFixture({ ...config, signInProvider: 'google.com', adminRecovery: { ...policy } });
  for (const uid of ['lost', 'next', 'third']) f.user(uid);
  await initializeEmptyInstance(f.runtime, { adminUid: 'lost', confirmTarget: `${config.projectId}/${config.databaseId}` });
  let now = start; const service = new AdminRecovery(f.runtime, { clock: () => now });
  return { ...f, service, setNow: value => { now = value; } };
}
const apply = (service, plan) => service.apply(plan, { confirmDigest: plan.digest });

test('recuperación apagada por defecto; exige trabajo exclusivo, Google, destino y aprobación temporal', () => {
  expect(deploymentConfig(config, {}).adminRecovery).toEqual({ enabled: false });
  const cfg = { ...config, signInProvider: 'google.com', adminRecovery: policy };
  const env = { CLOUD_RUN_JOB: policy.jobName, FORX_ADMIN_RECOVERY_TARGET: `${config.projectId}/${config.databaseId}` };
  expect(() => requireRecoveryJob(cfg, env, start)).not.toThrow();
  for (const change of [{}, { ...env, K_SERVICE: 'web' }, { ...env, CLOUD_RUN_JOB: 'other-job' }, { ...env, FORX_ADMIN_RECOVERY_TARGET: 'wrong' }])
    expect(() => requireRecoveryJob(cfg, change, start)).toThrow();
  for (const bad of [{ ...cfg, environment: 'recovery' }, { ...cfg, signInProvider: 'password' }, { ...cfg, adminRecovery: { enabled: false } }])
    expect(() => requireRecoveryJob(bad, env, start)).toThrow();
  for (const change of [{ enabled: false }, { approvedBy: '' }, { approvedAt: 'bad' }, { expiresAt: '2026-10-05T20:00:00Z' }, { jobName: '../web' }])
    expect(() => recoveryPolicy({ ...policy, ...change }, start)).toThrow();
  expect(() => recoveryPolicy(policy, policy.expiresAt)).toThrow(/vencida/);
});
test('vista previa no escribe: identidad Google mínima, motivo, destino, vencimiento y digest', async () => {
  const f = await setup(), before = structuredClone([...f.records]);
  const plan = await f.service.preview(input);
  expect(plan).toMatchObject({ lostUid: 'lost', replacementUid: 'next', replacementEmail: 'next@forx.invalid', replacementPreviousRole: null, expiresAt: '2026-10-05T18:15:00.000Z' });
  expect([...f.records]).toEqual(before); expect(f.revoked).toHaveLength(0);
  const { digest, ...payload } = plan; expect(await backupDigest(payload)).toBe(digest);
  for (const change of [{ lostUid: 'next' }, { replacementUid: 'lost' }, { reason: 'short' }, { replacementUid: '../x' }])
    await expect(f.service.preview({ ...input, ...change })).rejects.toThrow();
});
test('reemplaza atómicamente al único administrador perdido sin tocar datos culinarios ni otras membresías', async () => {
  const f = await setup();
  await f.runtime.access.update({ uid: 'lost' }, { uid: 'third', role: 'viewer', active: true, expectedRevision: null });
  const culinary = await f.runtime.repository.exportSnapshot(), other = structuredClone(f.records.get('_forx_access/third'));
  const plan = await f.service.preview(input); f.users.delete('lost');
  f.runtime.auth.revokeRefreshTokens = async uid => { if (uid === 'lost') throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); f.revoked.push(uid); };
  const result = await apply(f.service, plan);
  expect(result).toMatchObject({ state: 'applied', revocationPending: [] });
  expect(f.records.get('_forx_access/lost')).toMatchObject({ active: false, revision: 2 });
  expect(f.records.get('_forx_access/next')).toMatchObject({ active: true, role: 'admin', revision: 1 });
  expect(f.records.get('_forx_system/access').adminCount).toBe(1);
  expect(f.records.get('_forx_access/third')).toEqual(other);
  expect(await f.runtime.repository.exportSnapshot()).toEqual(culinary);
  expect((await f.runtime.access.authenticate('next')).actor.role).toBe('admin');
  const before = structuredClone([...f.records]);
  expect(await apply(f.service, plan)).toMatchObject({ alreadyApplied: true });
  expect([...f.records]).toEqual(before);
});
test('niega identidad sustituta deshabilitada, no verificada, sin Google o cambiada tras revisar', async () => {
  for (const patch of [{ disabled: true }, { emailVerified: false }, { providerData: [] }, { email: 'cambiado@forx.invalid' }]) {
    const f = await setup(), plan = await f.service.preview(input), before = structuredClone([...f.records]);
    Object.assign(f.users.get('next'), patch);
    await expect(apply(f.service, plan)).rejects.toThrow(); expect([...f.records]).toEqual(before);
  }
});
test('rechaza planes alterados, confirmación incorrecta, vencimiento, nuevo destino y cambio de aprobación', async () => {
  const f = await setup(), plan = await f.service.preview(input), before = structuredClone([...f.records]);
  await expect(f.service.apply(plan, { confirmDigest: '0'.repeat(64) })).rejects.toThrow();
  for (const change of [{ reason: 'Cambiar sin confirmar el resumen.' }, { target: 'other/db' }, { extra: true }])
    await expect(apply(f.service, { ...plan, ...change })).rejects.toThrow();
  f.runtime.config.adminRecovery.approvedBy = 'Otro responsable'; await expect(apply(f.service, plan)).rejects.toThrow(/aprobación/);
  f.runtime.config.adminRecovery.approvedBy = policy.approvedBy;
  f.setNow(plan.expiresAt); await expect(apply(f.service, plan)).rejects.toThrow(/vencido/);
  expect([...f.records]).toEqual(before);
});
test('permisos concurrentes, contador inconsistente o mantenimiento bloquean recuperación sin arreglos automáticos', async () => {
  for (const mode of ['member', 'counter', 'maintenance']) {
    const f = await setup(), plan = await f.service.preview(input);
    if (mode === 'member') await f.runtime.access.update({ uid: 'lost' }, { uid: 'next', role: 'viewer', active: true, expectedRevision: null });
    if (mode === 'counter') f.records.set('_forx_system/access', { adminCount: 9 });
    if (mode === 'maintenance') f.records.get('_forx_system/instance').state = 'maintenance';
    const before = structuredClone([...f.records]);
    await expect(apply(f.service, plan)).rejects.toThrow(); expect([...f.records]).toEqual(before);
  }
});
test('dos planes concurrentes no sustituyen dos veces; conserva solo un nuevo administrador', async () => {
  const f = await setup();
  const a = await f.service.preview(input), b = await f.service.preview({ ...input, replacementUid: 'third' });
  const results = await Promise.allSettled([apply(f.service, a), apply(f.service, b)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect([...f.records].filter(([key, row]) => key.startsWith('_forx_access/') && row.active && row.role === 'admin')).toHaveLength(1);
  expect([...f.records].filter(([key]) => key.startsWith('_forx_security_audit/recovery_'))).toHaveLength(1);
});
test('revocación pendiente conserva recibo; reintento explícito invalida sesiones sin repetir permisos', async () => {
  const f = await setup(), plan = await f.service.preview(input);
  const revoke = vi.fn(async () => { throw new Error('fallo privado de Auth'); }); f.runtime.auth.revokeRefreshTokens = revoke;
  expect(await apply(f.service, plan)).toMatchObject({ revocationPending: ['lost', 'next'] });
  expect((await f.service.status(plan.operationId)).state).toBe('applied');
  await expect(f.runtime.access.authenticate('lost')).rejects.toMatchObject({ status: 403 });
  const next = structuredClone(f.records.get('_forx_access/next'));
  await apply(f.service, plan); expect(revoke).toHaveBeenCalledTimes(2);
  await expect(f.service.retryRevocations(plan.operationId, { confirmDigest: 'wrong' })).rejects.toThrow();
  f.runtime.auth.revokeRefreshTokens = async () => {};
  expect(await f.service.retryRevocations(plan.operationId, { confirmDigest: plan.digest })).toMatchObject({ revocationPending: [] });
  expect(f.records.get('_forx_access/next')).toEqual(next);
});
test('promueve membresía existente sin perder control de otros administradores y detecta membresías corruptas', async () => {
  const f = await setup();
  await f.runtime.access.update({ uid: 'lost' }, { uid: 'next', role: 'editor', active: true, expectedRevision: null });
  await f.runtime.access.update({ uid: 'lost' }, { uid: 'third', role: 'admin', active: true, expectedRevision: null });
  const plan = await f.service.preview(input); await apply(f.service, plan);
  expect(f.records.get('_forx_access/next')).toMatchObject({ revision: 2, role: 'admin' });
  expect(f.records.get('_forx_system/access').adminCount).toBe(2);
  await expect(f.service.preview({ ...input, lostUid: 'third' })).rejects.toThrow(/ya administra/);
  f.records.get('_forx_access/lost').uid = 'mismatch';
  await expect(f.service.preview({ ...input, lostUid: 'third' })).rejects.toThrow(/inconsistente/);
});
test('interrupción después de confirmar deja recibo consultable y no repite el cambio', async () => {
  const f = await setup(), plan = await f.service.preview(input);
  vi.spyOn(f.service, 'retryRevocations').mockRejectedValueOnce(new Error('interrupción simulada'));
  await expect(apply(f.service, plan)).rejects.toThrow(/interrupción/);
  expect(await f.service.status(plan.operationId)).toMatchObject({ state: 'applied', revocationPending: ['lost', 'next'] });
  const before = structuredClone([...f.records]);
  expect(await apply(f.service, plan)).toMatchObject({ alreadyApplied: true });
  expect([...f.records]).toEqual(before);
  expect(await f.service.retryRevocations(plan.operationId, { confirmDigest: plan.digest })).toMatchObject({ revocationPending: [] });
});
test('dos envíos del mismo plan dejan un solo recibo y una sola revisión nueva', async () => {
  const f = await setup(), plan = await f.service.preview(input);
  const results = await Promise.all([apply(f.service, plan), apply(f.service, plan)]);
  expect(results.every(r => r.state === 'applied')).toBe(true);
  expect(f.records.get('_forx_access/lost').revision).toBe(2);
  expect(f.records.get('_forx_access/next').revision).toBe(1);
  expect([...f.records].filter(([key]) => key.startsWith('_forx_admin_recoveries/'))).toHaveLength(1);
});
