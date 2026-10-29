import { beforeAll, afterAll, describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, getMetadata, uploadBytes, deleteObject } from 'firebase/storage';
import { assertIsolatedVerification } from '../../scripts/emulator-launch.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const suite = enabled ? describe : describe.skip;
let env;
const claims = role => ({ forxRole: role, forxActive: true });
suite('autorización exclusiva FORX v2, emuladores', () => {
  beforeAll(async () => {
    assertIsolatedVerification();
    env = await initializeTestEnvironment({ projectId: 'demo-forx-v2', firestore: { rules: readFileSync('firestore.rules','utf8') }, storage: { rules: readFileSync('storage.rules','utf8') } });
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      for (const collection of ['products','ingredients','price_observations','imports','purchase_events','audit','reviews']) {
        await setDoc(doc(context.firestore(), collection, 'one'), { id: 'one', _revision: 1, updatedBy: 'editor', identityBasis: 'supplier+sku' });
      }
      await uploadBytes(ref(context.storage(), 'originals/xml_test.xml'), new TextEncoder().encode('<xml/>'), { contentType: 'application/xml' });
    });
  }, 30000);
  afterAll(async () => { await env?.cleanup(); });
  const db = role => role ? env.authenticatedContext(role, claims(role)).firestore() : env.unauthenticatedContext().firestore();
  const storage = role => role ? env.authenticatedContext(role, claims(role)).storage() : env.unauthenticatedContext().storage();

  test('sin sesión no hay catálogo ni evidencia pública', async () => {
    for (const collection of ['ingredients','products','price_observations','imports']) await assertFails(getDoc(doc(db(null),collection,'one')));
  });
  test('viewer consulta catálogo/precios, pero no evidencia ni edición', async () => {
    for (const collection of ['ingredients','products','price_observations']) await assertSucceeds(getDoc(doc(db('viewer'),collection,'one')));
    await assertFails(getDoc(doc(db('viewer'),'imports','one')));
    await assertFails(setDoc(doc(db('viewer'),'products','new'), { id:'new', _revision:1, updatedBy:'viewer' }));
  });
  test('catálogo se modifica solo mediante comandos autorizados en servidor', async () => {
    for (const collection of ['products','ingredients','categories','ingredient_keys','settings']) {
      await assertFails(setDoc(doc(db('editor'),collection,'two'), { id:'two', _revision:1, updatedBy:'editor' }));
      await assertFails(setDoc(doc(db('admin'),collection,'two'), { id:'two', _revision:1, updatedBy:'admin' }));
      await assertFails(updateDoc(doc(db('editor'),collection,'one'), { _revision:2, updatedBy:'editor' }));
      await assertFails(deleteDoc(doc(db('admin'),collection,'one')));
    }
  });
  test('ni admin de cliente fabrica precios, reescribe historia o decisiones', async () => {
    for (const collection of ['imports','purchase_events','price_observations','reviews','audit']) {
      await assertFails(setDoc(doc(db('admin'),collection,'fabricated'), { id:'fabricated', _revision:1, updatedBy:'admin' }));
      await assertFails(updateDoc(doc(db('admin'),collection,'one'), { _revision:2, updatedBy:'admin' }));
      await assertFails(deleteDoc(doc(db('admin'),collection,'one')));
    }
  });
  test('cuenta sin claims FORX e inactiva quedan denegadas', async () => {
    const unrelated = env.authenticatedContext('other', { admin:true }).firestore();
    const inactive = env.authenticatedContext('inactive', { forxRole:'admin', forxActive:false }).firestore();
    await assertFails(getDoc(doc(unrelated,'ingredients','one')));
    await assertFails(getDoc(doc(inactive,'ingredients','one')));
  });
  test('rutas fuera del modelo quedan cerradas', async () => {
    for (const collection of ['datos','usuarios','pantry_workspaces','finanzas','unknown']) {
      await assertFails(getDoc(doc(db('admin'),collection,'one')));
      await assertFails(setDoc(doc(db('admin'),collection,'one'), { id:'one', _revision:1, updatedBy:'admin' }));
    }
  });
  test('solicitudes y cuotas no se leen ni escriben directamente, incluso como administrador',async()=>{
    for(const role of ['viewer','editor','admin'])for(const collection of ['generation_requests','generation_quotas']) {
      await assertFails(getDoc(doc(db(role),collection,'one')));
      await assertFails(setDoc(doc(db(role),collection,'one'),{id:'one',_revision:1}));
    }
  });
  test('XML privado; ningún cliente carga, modifica ni elimina originales', async () => {
    await assertSucceeds(getMetadata(ref(storage('editor'),'originals/xml_test.xml')));
    await assertFails(getMetadata(ref(storage('viewer'),'originals/xml_test.xml')));
    await assertFails(getMetadata(ref(storage(null),'originals/xml_test.xml')));
    await assertFails(uploadBytes(ref(storage('admin'),'originals/new.xml'), new Uint8Array([1]), { contentType:'application/xml' }));
    await assertFails(deleteObject(ref(storage('admin'),'originals/xml_test.xml')));
  });
});

describe('frontera de producción', () => {
  test('ningún código de ejecución ni configuración apunta a servicios ajenos', () => {
    const sourceFiles = readdirSync('src', { recursive:true, withFileTypes:true }).filter(item=>item.isFile() && /\.(js|css)$/.test(item.name)).map(item=>`${item.parentPath}/${item.name}`);
    for (const file of [...sourceFiles,'firestore.rules','storage.rules','firebase.json','.firebaserc','index.html']) {
      expect(readFileSync(file,'utf8'), file).not.toMatch(/cicsa-egresos|datos\/precios|pantry_workspaces|supabase|railway|api\.anthropic|cicsa_apikey/i);
    }
  });
  test('el navegador usa la base local nueva y no inicializa SDK cloud ni almacenamiento legado', () => {
    expect(readFileSync('src/data/entity-repository.js','utf8')).toContain("name = 'forx-v2-local'");
    expect(readFileSync('src/app.js','utf8')).not.toMatch(/firebase|localStorage/);
    expect(JSON.parse(readFileSync('.firebaserc','utf8')).projects).toEqual({ default:'demo-forx-v2' });
  });
});
