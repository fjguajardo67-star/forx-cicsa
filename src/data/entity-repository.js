export const COLLECTIONS = Object.freeze([
  'batches', 'imports', 'import_keys', 'import_concepts', 'purchase_events', 'products', 'ingredients',
  'ingredient_keys', 'categories', 'reviews', 'price_observations', 'audit', 'settings', 'originals',
  'recipes', 'recipe_names', 'recipe_versions', 'menus', 'generation_requests', 'generation_quotas'
]);
export const IMMUTABLE = new Set(['imports', 'import_keys', 'import_concepts', 'purchase_events', 'price_observations', 'audit', 'recipe_versions']);
export class ConcurrentEditError extends Error {
  constructor() { super('Este registro cambió en otra sesión. Recarga y revisa el cambio antes de guardar.'); this.name = 'ConcurrentEditError'; }
}
const copy = value => value == null ? null : structuredClone(value);
const key = (collection, id) => `${collection}/${id}`;
export const put = (collection, value, before = null) => ({ collection, id: value.id, value, expected: before?._revision ?? null });
export const check = (collection, record) => ({ collection, id: record.id, expected: record._revision, checkOnly: true });

export function validateOperations(operations, current) {
  const writes = new Set();
  for (const op of operations) {
    if (!COLLECTIONS.includes(op.collection) || !op.id || op.id.includes('/')) throw new Error('Entidad inválida.');
    const prior = current.get(key(op.collection, op.id));
    if ((prior?._revision ?? null) !== op.expected) throw new ConcurrentEditError();
    if (op.checkOnly) continue;
    const target = key(op.collection, op.id);
    if (writes.has(target)) throw new Error('Escritura repetida en una transacción.');
    writes.add(target);
    if (IMMUTABLE.has(op.collection) && prior) throw new Error('El registro histórico es inmutable.');
    if (op.delete && op.collection !== 'originals') throw new Error('Solo se pueden eliminar originales vencidos.');
    if (!op.delete && op.value.id !== op.id) throw new Error('Identidad inconsistente.');
  }
}

export class MemoryEntityRepository {
  constructor() { this.records = new Map(); }
  async exportSnapshot() { return Object.fromEntries(COLLECTIONS.map(c => [c, [...this.records.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, v]) => copy(v))])); }
  async get(collection, id) { return copy(this.records.get(key(collection, id))); }
  async list(collection) { return [...this.records.entries()].filter(([k]) => k.startsWith(`${collection}/`)).map(([, value]) => copy(value)); }
  async commit(operations) {
    validateOperations(operations, this.records);
    for (const op of operations) {
      if (op.checkOnly) continue;
      if (op.delete) this.records.delete(key(op.collection, op.id));
      else this.records.set(key(op.collection, op.id), { ...copy(op.value), _revision: (op.expected || 0) + 1 });
    }
  }
}

// Cada entidad ocupa su propio registro. La transacción comprueba revisiones
// únicamente de los registros que el comando consultó o modificó.
export class IndexedDbEntityRepository {
  constructor(db) { this.db = db; }
  static async open(name = 'forx-v2-local', factory = globalThis.indexedDB) {
    if (!factory) throw new Error('Este navegador no permite guardar datos locales. Abre FORX en un navegador con IndexedDB habilitado.');
    const request = factory.open(name, 3);
    request.onupgradeneeded = () => {
      for (const collection of COLLECTIONS) if (!request.result.objectStoreNames.contains(collection)) request.result.createObjectStore(collection, { keyPath: 'id' });
    };
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(new IndexedDbEntityRepository(request.result));
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Cierra otras pestañas de FORX y vuelve a intentar.'));
    });
  }
  read(collection, action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(collection, 'readonly');
      const request = action(tx.objectStore(collection));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  get(collection, id) { return this.read(collection, store => store.get(id)); }
  list(collection) { return this.read(collection, store => store.getAll()); }
  exportSnapshot() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(COLLECTIONS, 'readonly'), data = {};
      for (const collection of COLLECTIONS) {
        const request = tx.objectStore(collection).getAll();
        request.onsuccess = () => { data[collection] = request.result; };
      }
      tx.oncomplete = () => resolve(data);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('No se pudo leer un respaldo consistente.'));
    });
  }
  // Only used in a newly generated, empty recovery database. Preserve revision
  // numbers so history, recipe version IDs and optimistic locks still agree.
  seedEmpty(data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(COLLECTIONS, 'readwrite'); let remaining = COLLECTIONS.length, failure;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error || new Error('La copia no se restauró.'));
      tx.onerror = () => {};
      for (const collection of COLLECTIONS) {
        const request = tx.objectStore(collection).count();
        request.onsuccess = () => {
          if (request.result) { failure = new Error('La restauración solo admite una base vacía.'); tx.abort(); return; }
          if (--remaining) return;
          for (const name of COLLECTIONS) for (const record of data[name]) tx.objectStore(name).add(record);
        };
      }
    });
  }
  commit(operations) {
    if (!operations.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([...new Set(operations.map(op => op.collection))], 'readwrite');
      const current = new Map();
      let remaining = operations.length;
      let failure;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error || new Error('No se pudo guardar. El estado anterior permanece intacto.'));
      tx.onerror = () => {};
      for (const op of operations) {
        const request = tx.objectStore(op.collection).get(op.id);
        request.onsuccess = () => {
          current.set(key(op.collection, op.id), request.result);
          if (--remaining) return;
          try {
            validateOperations(operations, current);
            for (const write of operations) {
              if (write.checkOnly) continue;
              const store = tx.objectStore(write.collection);
              if (write.delete) store.delete(write.id);
              else store.put({ ...write.value, _revision: (write.expected || 0) + 1 });
            }
          } catch (error) { failure = error; tx.abort(); }
        };
      }
    });
  }
  close() { this.db.close(); }
}
