import { test, expect } from 'vitest';
import { FirestoreEntityRepository } from '../src/server/firestore-entity-repository.js';
import { put, check } from '../src/data/entity-repository.js';

function firestoreDouble() {
  const records = new Map();
  const snap = key => ({ exists:records.has(key), data:()=>structuredClone(records.get(key)) });
  const db = {
    collection: collection => ({
      doc: id => ({ key:`${collection}/${id}`, get:async()=>snap(`${collection}/${id}`) }),
      get:async()=>({ docs:[...records.keys()].filter(key=>key.startsWith(`${collection}/`)).map(snap) })
    }),
    async runTransaction(work) {
      const writes = [];
      await work({ getAll:async(...refs)=>refs.map(ref=>snap(ref.key)),
        set:(ref,value)=>writes.push(()=>records.set(ref.key,structuredClone(value))),
        delete:ref=>writes.push(()=>records.delete(ref.key)) });
      writes.forEach(write=>write());
    }
  };
  return { db, records };
}
test('adaptador Firestore: revisión por registro e inmutabilidad dentro de transacción', async () => {
  const { db, records } = firestoreDouble();
  const repository = new FirestoreEntityRepository(db);
  await repository.commit([put('products', { id:'p1', contentQuantity:'12' })]);
  const first = await repository.get('products','p1');
  await repository.commit([put('products', { ...first, contentQuantity:'6' }, first)]);
  await expect(repository.commit([put('audit',{ id:'wrong' }), put('products',{ ...first, contentQuantity:'8' },first)])).rejects.toThrow(/otra sesión/);
  expect(records.has('audit/wrong')).toBe(false);
  expect((await repository.list('products'))[0].contentQuantity).toBe('6');
  await repository.commit([put('price_observations',{ id:'price1', normalizedPrice:'32' })]);
  const observation = await repository.get('price_observations','price1');
  await expect(repository.commit([put('price_observations',{ ...observation, normalizedPrice:'0' },observation)])).rejects.toThrow(/inmutable/);
  await expect(repository.commit([check('products',first)])).rejects.toThrow(/otra sesión/);
});
test('adaptador Firestore nunca guarda bytes XML ni acepta colecciones arbitrarias', async () => {
  const repository = new FirestoreEntityRepository(firestoreDouble().db);
  await expect(repository.commit([put('originals',{ id:'xml', bytes:new Uint8Array([1]) })])).rejects.toThrow(/Storage privado/);
  await expect(repository.get('outside','id')).rejects.toThrow(/Entidad/);
  await expect(repository.get('products','nested/id')).rejects.toThrow(/Entidad/);
});
