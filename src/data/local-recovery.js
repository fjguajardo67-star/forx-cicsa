import { IndexedDbEntityRepository } from './entity-repository.js';
import { inspectBackup } from '../domain/backup.js';

export const RECOVERY_NAME = /^forx-v2-recovery-[a-f0-9-]{36}$/;
export async function restoreLocalCopy(source, { factory = globalThis.indexedDB, now = new Date().toISOString() } = {}) {
  const { backup, collections } = await inspectBackup(source);
  const name = `forx-v2-recovery-${crypto.randomUUID()}`;
  const repository = await IndexedDbEntityRepository.open(name, factory);
  try {
    const data = structuredClone(collections);
    const previous = data.settings.find(s => s.id === 'local_recovery');
    data.settings = data.settings.filter(s => s.id !== 'local_recovery');
    data.settings.push({ id: 'local_recovery', _revision: (previous?._revision || 0) + 1, recoveredAt: now, sourceCreatedAt: backup.createdAt, sourceChecksum: backup.checksum });
    data.audit.push({ id: `audit_${crypto.randomUUID()}`, _revision: 1, action: 'backup.restored', entityId: name,
      actorUid: 'local-operator', actorName: 'Recuperación local', occurredAt: now,
      reason: 'Copia independiente restaurada. Sin reemplazar datos ni recuperar originales XML.' });
    await repository.seedEmpty(data);
    return { name, sourceCreatedAt: backup.createdAt };
  } catch (error) {
    repository.close();
    // Only this new, randomly named recovery database; never the source.
    factory.deleteDatabase(name);
    throw error;
  } finally { repository.close(); }
}
