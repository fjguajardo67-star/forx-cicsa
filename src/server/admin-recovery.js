import { backupDigest } from '../domain/backup.js';
import { assertInstance } from './deployment-config.js';

const uidValid = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const operationValid = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const fail = message => { throw new Error(`Recuperación administrativa: ${message}`); };
const PLAN_MS = 15 * 60 * 1000;
const target = config => `${config.projectId}/${config.databaseId}`;
const identity = user => ({ uid: user.uid, email: user.email, emailVerified: user.emailVerified,
  disabled: Boolean(user.disabled), providers: [...new Set(user.providerData?.map(p => p.providerId) || [])].sort() });

export function recoveryPolicy(value, now = new Date().toISOString()) {
  if (!value || value.enabled !== true || !/^[a-z][a-z0-9-]{2,62}$/.test(value.jobName || '')
    || typeof value.approvedBy !== 'string' || !value.approvedBy.trim() || value.approvedBy.length > 180
    || !Number.isFinite(Date.parse(value.approvedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) fail('requiere aprobación temporal explícita.');
  const start = Date.parse(value.approvedAt), end = Date.parse(value.expiresAt), time = Date.parse(now);
  if (!Number.isFinite(time) || end <= start || end - start > 3600000 || time < start || time >= end) fail('aprobación vencida o fuera de su ventana máxima de una hora.');
  return value;
}

// Run only from the separate operator job, never from a public route. Its IAM
// identity is the authority; a digest is confirmation/integrity, NOT a secret.
export function requireRecoveryJob(config, env = process.env, now) {
  recoveryPolicy(config.adminRecovery, now);
  if (config.environment === 'recovery' || config.signInProvider !== 'google.com'
    || env.K_SERVICE || env.CLOUD_RUN_JOB !== config.adminRecovery.jobName
    || env.FORX_ADMIN_RECOVERY_TARGET !== target(config)) fail('requiere un trabajo exclusivo y destino confirmado, no el servidor web.');
}

export class AdminRecovery {
  constructor(runtime, { clock = () => new Date().toISOString() } = {}) { this.runtime = runtime; this.clock = clock; }
  async guard() {
    const { config } = this.runtime;
    if (!['staging', 'production'].includes(config.environment) || config.signInProvider !== 'google.com') fail('destino o proveedor no permitido.');
    recoveryPolicy(config.adminRecovery, this.clock());
    await this.runtime.assertReady();
  }
  receiptRef(operationId) {
    if (!operationValid(operationId)) fail('identificador inválido.');
    return this.runtime.db.collection('_forx_admin_recoveries').doc(operationId);
  }
  async state(tx) {
    const { db, config } = this.runtime;
    const read = ref => tx ? tx.get(ref) : ref.get();
    const instance = (await read(db.collection('_forx_system').doc('instance'))).data();
    assertInstance(instance, config);
    const control = (await read(db.collection('_forx_system').doc('access'))).data();
    const snapshot = await read(db.collection('_forx_access').limit(101));
    if (snapshot.size > 100) fail('más de 100 cuentas requieren otro procedimiento aprobado.');
    const members = snapshot.docs.map(doc => {
      const row = doc.data();
      if (row.uid !== doc.id || !uidValid(row.uid) || !['admin', 'editor', 'viewer'].includes(row.role)
        || typeof row.active !== 'boolean' || !Number.isSafeInteger(row.revision) || row.revision < 1) fail('membresía inconsistente.');
      return row;
    }).sort((a, b) => a.uid.localeCompare(b.uid));
    const count = members.filter(row => row.active && row.role === 'admin').length;
    if (!Number.isSafeInteger(control?.adminCount) || control.adminCount < 1 || control.adminCount !== count) fail('control de administradores inconsistente; no se reparará automáticamente.');
    return { instance, control, members };
  }
  validatePair(state, lostUid, replacementUid) {
    if (!uidValid(lostUid) || !uidValid(replacementUid) || lostUid === replacementUid) fail('se requieren dos UID distintos válidos.');
    const lost = state.members.find(row => row.uid === lostUid), replacement = state.members.find(row => row.uid === replacementUid);
    if (!lost?.active || lost.role !== 'admin' || !Number.isSafeInteger(lost.revision) || lost.revision < 1) fail('la cuenta perdida debe ser administradora activa.');
    if (replacement?.active && replacement.role === 'admin') fail('la cuenta sustituta ya administra FORX; usar el panel normal.');
    if (replacement && (!Number.isSafeInteger(replacement.revision) || replacement.revision < 1)) fail('revisión de la cuenta sustituta inválida.');
    return { lost, replacement };
  }
  async preview({ lostUid, replacementUid, reason } = {}) {
    await this.guard();
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 500 || /[\u0000-\u001f]/.test(reason)) fail('registrar motivo de 10 a 500 caracteres, sin secretos.');
    const state = await this.runtime.db.runTransaction(tx => this.state(tx), { readOnly: true });
    const { lost, replacement } = this.validatePair(state, lostUid, replacementUid);
    const user = await this.runtime.access.eligibleUser(replacementUid), createdAt = this.clock();
    const payload = { version: 1, operationId: crypto.randomUUID(), target: target(this.runtime.config),
      createdAt, expiresAt: new Date(Math.min(Date.parse(createdAt) + PLAN_MS, Date.parse(this.runtime.config.adminRecovery.expiresAt))).toISOString(),
      approvalDigest: await backupDigest(this.runtime.config.adminRecovery),
      lostUid, lostEmail: lost.email, replacementUid, replacementEmail: user.email,
      replacementPreviousRole: replacement?.role ?? null, reason: reason.trim(),
      identityDigest: await backupDigest(identity(user)), stateDigest: await backupDigest(state) };
    return { ...payload, digest: await backupDigest(payload) };
  }
  async checkedPlan(plan, confirmDigest) {
    const keys = ['version', 'operationId', 'target', 'createdAt', 'expiresAt', 'approvalDigest', 'lostUid', 'lostEmail', 'replacementUid', 'replacementEmail', 'replacementPreviousRole', 'reason', 'identityDigest', 'stateDigest', 'digest'];
    if (!plan || Object.keys(plan).length !== keys.length || Object.keys(plan).some(key => !keys.includes(key))
      || plan.version !== 1 || !operationValid(plan.operationId) || plan.target !== target(this.runtime.config)
      || !uidValid(plan.lostUid) || !uidValid(plan.replacementUid) || plan.lostUid === plan.replacementUid
      || typeof plan.reason !== 'string' || plan.reason.trim().length < 10 || plan.reason.length > 500 || /[\u0000-\u001f]/.test(plan.reason)
      || !/^[a-f0-9]{64}$/.test(plan.digest || '') || confirmDigest !== plan.digest) fail('plan o confirmación inválidos.');
    const { digest, ...payload } = plan;
    if (await backupDigest(payload) !== digest) fail('plan alterado.');
  }
  async apply(plan, { confirmDigest } = {}) {
    await this.guard(); await this.checkedPlan(plan, confirmDigest);
    const { db, config, access } = this.runtime, receipt = this.receiptRef(plan.operationId);
    const existing = (await receipt.get()).data();
    if (existing) {
      if (existing.digest !== plan.digest) fail('identificador ya utilizado para otro plan.');
      return { ...existing, alreadyApplied: true };
    }
    const current = Date.parse(this.clock()), created = Date.parse(plan.createdAt), expires = Date.parse(plan.expiresAt);
    if (![current, created, expires].every(Number.isFinite) || current < created || current >= expires || expires - created > PLAN_MS
      || expires > Date.parse(config.adminRecovery.expiresAt) || await backupDigest(config.adminRecovery) !== plan.approvalDigest) fail('plan vencido o aprobación modificada; generar otra vista previa.');
    const user = await access.eligibleUser(plan.replacementUid);
    if (await backupDigest(identity(user)) !== plan.identityDigest || user.email !== plan.replacementEmail) fail('la identidad sustituta cambió.');
    const committed = await db.runTransaction(async tx => {
      const prior = (await tx.get(receipt)).data();
      if (prior) { if (prior.digest !== plan.digest) fail('identificador reutilizado.'); return false; }
      const state = await this.state(tx);
      if (await backupDigest(state) !== plan.stateDigest) fail('permisos o instancia cambiaron; revisar de nuevo.');
      const { lost, replacement } = this.validatePair(state, plan.lostUid, plan.replacementUid);
      if (plan.lostEmail !== lost.email || plan.replacementPreviousRole !== (replacement?.role ?? null)) fail('el resumen no corresponde a los permisos revisados.');
      const occurredAt = this.clock();
      if (Date.parse(occurredAt) >= expires) fail('plan vencido durante la confirmación.');
      const stamp = { updatedAt: occurredAt, updatedBy: `recovery:${plan.operationId}` };
      tx.set(db.collection('_forx_access').doc(lost.uid), { ...lost, ...stamp, active: false, revision: lost.revision + 1 });
      tx.set(db.collection('_forx_access').doc(user.uid), { uid: user.uid, email: user.email, role: 'admin', active: true,
        revision: (replacement?.revision || 0) + 1, ...stamp });
      // One admin replaced by one admin; never a zero-admin intermediate state.
      tx.set(db.collection('_forx_system').doc('access'), state.control);
      const result = { operationId: plan.operationId, digest: plan.digest, target: plan.target, state: 'applied',
        lostUid: lost.uid, replacementUid: user.uid, occurredAt, revocationPending: [lost.uid, user.uid],
        approvedBy: config.adminRecovery.approvedBy, approvedAt: config.adminRecovery.approvedAt };
      tx.create(receipt, result);
      tx.create(db.collection('_forx_security_audit').doc(`recovery_${plan.operationId}`), {
        action: 'access.recovered', operationId: plan.operationId, digest: plan.digest, occurredAt,
        lostUid: lost.uid, replacementUid: user.uid, reason: plan.reason,
        previous: { lostRole: lost.role, replacementRole: replacement?.role ?? null },
        approvedBy: config.adminRecovery.approvedBy, jobName: config.adminRecovery.jobName
      });
      return true;
    });
    if (!committed) return { ...(await receipt.get()).data(), alreadyApplied: true };
    // Receipt was committed atomically first. A crash here cannot lose evidence
    // or require repeating the permission change. Membership blocks old tokens.
    return this.retryRevocations(plan.operationId, { confirmDigest });
  }
  async status(operationId) {
    await this.guard(); const receipt = (await this.receiptRef(operationId).get()).data();
    if (!receipt) fail('operación no encontrada.'); return receipt;
  }
  async retryRevocations(operationId, { confirmDigest } = {}) {
    const receipt = await this.status(operationId), ref = this.receiptRef(operationId);
    if (receipt.digest !== confirmDigest) fail('confirmar la operación exacta antes de invalidar sesiones.');
    for (const uid of receipt.revocationPending) {
      try { await this.runtime.auth.revokeRefreshTokens(uid); }
      catch (error) { if (error.code !== 'auth/user-not-found') continue; }
      await this.runtime.db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.digest !== receipt.digest) fail('recibo cambiado.');
        tx.set(ref, { ...current, revocationPending: current.revocationPending.filter(item => item !== uid), revocationCheckedAt: this.clock() });
      });
    }
    return this.status(operationId);
  }
}
