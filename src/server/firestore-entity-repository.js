import { COLLECTIONS, validateOperations } from '../data/entity-repository.js';
import { validatePersistenceInput } from './persistence-limits.js';

// Server-side adapter. The caller supplies an authenticated Admin Firestore
// instance; this module contains no project IDs, credentials or cloud bootstrap.
export class FirestoreEntityRepository {
  constructor(db, { originals, guardTransaction } = {}) { this.db = db; this.originals = originals; this.guardTransaction=guardTransaction; }
  ref(collection, id) {
    if (!COLLECTIONS.includes(collection) || !id || id.includes('/')) throw new Error('Entidad inválida.');
    return this.db.collection(collection).doc(id);
  }
  async get(collection, id) {
    const snapshot = await this.ref(collection, id).get();
    return snapshot.exists ? snapshot.data() : null;
  }
  async list(collection) {
    if (!COLLECTIONS.includes(collection)) throw new Error('Colección inválida.');
    const snapshot = await this.db.collection(collection).get();
    return snapshot.docs.map(doc => doc.data());
  }
  async exportSnapshot() {
    return this.db.runTransaction(async transaction => {
      const snapshots = await Promise.all(COLLECTIONS.map(name => transaction.get(this.db.collection(name))));
      return Object.fromEntries(COLLECTIONS.map((name, i) => [name, snapshots[i].docs.map(doc => doc.data())]));
    }, { readOnly: true });
  }
  async commit(operations) {
    if (!operations.length) return;
    // XML bytes belong to private object storage, never a Firestore document.
    // Until that adapter is supplied, refuse instead of pretending this handles
    // cloud ingestion/retention. Review/catalog commands are fully supported.
    if (!this.originals && operations.some(op => op.collection === 'originals' && !op.checkOnly)) {
      throw new Error('Los originales requieren el adaptador de Storage privado y su política de retención.');
    }
    // Validate ALL paths and payload budgets before creating any Storage object.
    validatePersistenceInput(operations);
    operations.forEach(op=>this.ref(op.collection,op.id));
    const staged = [];
    const retained=new Map();
    for (const op of operations) {
      if (op.collection !== 'originals' || op.checkOnly) { staged.push(op); continue; }
      if (op.delete || op.value.status !== 'retained') throw new Error('La retención se ejecuta exclusivamente mediante el proceso de servidor.');
      const canonical=await this.originals.retain(op.value);
      const { bytes, ...metadata } = op.value;
      const value={...metadata,...canonical};
      retained.set(op.id,value);
      staged.push({ ...op, value });
    }
    operations = staged.map(op=>op.collection==='imports' && retained.has(op.value?.originalId)
      ? {...op,value:{...op.value,expiresAt:retained.get(op.value.originalId).expiresAt}} : op);
    const refs = operations.map(op => this.ref(op.collection, op.id));
    await this.db.runTransaction(async transaction => {
      if (this.guardTransaction) await this.guardTransaction(transaction);
      const snapshots = await transaction.getAll(...refs);
      const current = new Map(operations.map((op,index) => [`${op.collection}/${op.id}`, snapshots[index].exists ? snapshots[index].data() : null]));
      validateOperations(operations, current);
      for (let index=0; index<operations.length; index++) {
        const op = operations[index];
        if (op.checkOnly) continue;
        if (op.delete) transaction.delete(refs[index]);
        else transaction.set(refs[index], { ...op.value, _revision:(op.expected || 0)+1 });
      }
    });
  }
}
