import { initializeApp, deleteApp, cert } from 'firebase-admin/app';
import { generateKeyPairSync } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FirestoreEntityRepository } from './firestore-entity-repository.js';
import { PrivateOriginals } from './private-originals.js';
import { PantryService } from '../domain/pantry-service.js';
import { KitchenService } from '../domain/kitchen-service.js';

export function assertEmulatorEnvironment(env=process.env) {
  if (env.GCLOUD_PROJECT !== 'demo-forx-v2') throw new Error('Solo se permite demo-forx-v2. No hay arranque cloud.');
  for (const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']) {
    if (!/^127\.0\.0\.1:\d{2,5}$/.test(env[key] || '')) throw new Error(`${key}: requiere emulador en 127.0.0.1.`);
  }
  if (env.STORAGE_EMULATOR_HOST && env.STORAGE_EMULATOR_HOST !== `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}`) throw new Error('Storage debe usar el mismo emulador local.');
}
export async function createEmulatorRuntime() {
  assertEmulatorEnvironment();
  // Synthetic in-memory certificate prevents Application Default Credential
  // discovery. It identifies no real service account and is never persisted.
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const credential=cert({projectId:'demo-forx-v2',clientEmail:'emulator@demo-forx-v2.iam.gserviceaccount.com',privateKey});
  const app=initializeApp({credential,projectId:'demo-forx-v2',storageBucket:'demo-forx-v2.appspot.com'},`forx-${crypto.randomUUID()}`);
  const db=getFirestore(app);db.settings({ignoreUndefinedProperties:true});
  const repository=new FirestoreEntityRepository(db,{originals:new PrivateOriginals(getStorage(app).bucket())});
  const actor={uid:'emulator-bootstrap',name:'Inicialización de emuladores',role:'admin'};
  await new PantryService(repository,{actor}).initialize();
  await new KitchenService(repository,{actor}).initialize();
  return {repository,auth:getAuth(app),db,bucket:getStorage(app).bucket(),close:()=>deleteApp(app)};
}
