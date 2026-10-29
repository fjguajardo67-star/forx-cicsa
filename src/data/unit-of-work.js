import { validateOperations } from './entity-repository.js';

// Compose existing domain commands without partially saving a category,
// ingredient or link if a subsequent validation fails. The final repository
// still verifies each record's original revision atomically.
export async function atomicWork(repository, action) {
  const original = new Map();
  const current = new Map();
  const writes = new Map();
  const key = (collection, id) => `${collection}/${id}`;
  const remember = (collection, id, record) => {
    const k = key(collection, id);
    if (!original.has(k)) { original.set(k, { collection, id, record }); current.set(k, structuredClone(record)); }
    return structuredClone(current.get(k));
  };
  const staged = {
    async get(collection, id) {
      const k = key(collection, id);
      if (current.has(k)) return structuredClone(current.get(k));
      return remember(collection, id, await repository.get(collection, id));
    },
    async list(collection) {
      for (const record of await repository.list(collection)) remember(collection, record.id, record);
      return [...current].filter(([k, record]) => k.startsWith(`${collection}/`) && record).map(([, record]) => structuredClone(record));
    },
    async commit(operations) {
      for (const op of operations) await this.get(op.collection, op.id);
      validateOperations(operations, current);
      for (const op of operations) {
        if (op.checkOnly) continue;
        const k = key(op.collection, op.id);
        current.set(k, op.delete ? null : { ...structuredClone(op.value), _revision: (op.expected || 0) + 1 });
        writes.set(k, op);
      }
    }
  };
  const result = await action(staged);
  const operations = [...original].map(([k, { collection, id, record }]) => {
    const op = writes.get(k);
    return op ? { ...op, expected: record?._revision ?? null, value: current.get(k) }
      : { collection, id, expected: record?._revision ?? null, checkOnly: true };
  });
  await repository.commit(operations);
  return result;
}
