import { PantryService } from '../domain/pantry-service.js';
import { KitchenService } from '../domain/kitchen-service.js';
import { FirestoreEntityRepository } from './firestore-entity-repository.js';

export async function initializeEmptyInstance(runtime,{adminUid,confirmTarget}={}) {
  const {db,config,access}=runtime;
  if(config.environment==='recovery' || confirmTarget!==`${config.projectId}/${config.databaseId}` || !adminUid)throw new Error('Confirma destino vacío y administrador inicial.');
  // Validate the exact configured sign-in provider before creating any system
  // record. Otherwise a verified identity unable to sign in can strand a new
  // instance in its initializing state.
  await access.eligibleUser(adminUid);
  const control=db.collection('_forx_system').doc('instance'),previous=(await control.get()).data();
  if(!previous && (await db.listCollections()).length)throw new Error('No se inicializa una base con datos existentes.');
  await db.runTransaction(async tx=>{
    const existing=(await tx.get(control)).data();
    if(existing){if(existing.state!=='initializing'||existing.bootstrapUid!==adminUid||existing.projectId!==config.projectId
      ||existing.databaseId!==config.databaseId||existing.application!=='forx-v2')throw new Error('Instancia ya inicializada o diferente.');return;}
    tx.create(control,{application:'forx-v2',projectId:config.projectId,databaseId:config.databaseId,environment:config.environment,state:'initializing',bootstrapUid:adminUid});
  });
  // No ingestion or originals during initialization, and no public API while the
  // instance is initializing. Retrying resumes this exact initial administrator.
  const repository=new FirestoreEntityRepository(db),actor={uid:adminUid,name:'Inicialización explícita',role:'admin'};
  await new PantryService(repository,{actor}).initialize();await new KitchenService(repository,{actor}).initialize();
  const accessControl=(await db.collection('_forx_system').doc('access').get()).data();
  if(!accessControl)await access.bootstrap(adminUid);
  const member=(await db.collection('_forx_access').doc(adminUid).get()).data();
  if(!member?.active||member.role!=='admin')throw new Error('El administrador inicial no está disponible.');
  await db.runTransaction(async tx=>{
    const state=(await tx.get(control)).data();if(state.state!=='initializing'||state.bootstrapUid!==adminUid)throw new Error('Inicialización concurrente.');
    tx.set(control,{...state,state:'ready',initializedAt:new Date().toISOString()});
  });
  return {state:'ready',syntheticAccount:false};
}
