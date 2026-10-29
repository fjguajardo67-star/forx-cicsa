import { inspectBackup, backupDigest } from '../domain/backup.js';
import { COLLECTIONS } from '../data/entity-repository.js';
import { validatePersistenceInput } from './persistence-limits.js';

const sorted=data=>Object.fromEntries(COLLECTIONS.map(name=>[name,[...data[name]].sort((a,b)=>a.id.localeCompare(b.id))]));

// Operator-only initial loading, never an HTTP command or an in-place restore.
// A checksum and exact destination are required; interrupted loads can resume
// only for the same source and administrator. No accounts come from the backup.
export async function initializeFromBackup(runtime, source, { adminUid, confirmTarget, confirmChecksum } = {}) {
  const {db,config,access}=runtime;
  const inspected=await inspectBackup(source);
  if (!['staging','production'].includes(config.environment) || config.signInProvider!=='google.com'
    || confirmTarget!==`${config.projectId}/${config.databaseId}` || !adminUid
    || inspected.backup.version!==3 || confirmChecksum!==inspected.backup.checksum)
    throw new Error('Confirma destino, administrador Google y checksum de un respaldo v3 sin XML ni texto de IA.');
  if (!['catalog','kitchen'].every(id=>inspected.collections.settings.some(row=>row.id===id)))
    throw new Error('Se requiere un respaldo completo de FORX integrado con ajustes de catálogo y cocina.');
  await access.eligibleUser(adminUid);
  const checksum=inspected.backup.checksum,control=db.collection('_forx_system').doc('instance');
  const records=COLLECTIONS.flatMap(collection=>inspected.collections[collection].map(value=>({collection,value})));
  // Reject invalid Firestore paths/payloads before acquiring or populating a target.
  for (const {collection,value} of records) validatePersistenceInput([{collection,id:value.id,value,expected:null}]);
  const previous=(await control.get()).data();
  if (!previous && (await db.listCollections()).length) throw new Error('El destino no está vacío; no se reemplazaron datos.');
  await db.runTransaction(async tx=>{
    const state=(await tx.get(control)).data();
    if (state) {
      if (state.application!=='forx-v2' || state.projectId!==config.projectId || state.databaseId!==config.databaseId
        || state.environment!==config.environment || state.bootstrapUid!==adminUid || state.bootstrapChecksum!==checksum
        || !['initializing','ready'].includes(state.state)) throw new Error('El destino pertenece a otra instancia o carga.');
      return;
    }
    for (const name of COLLECTIONS) if (!(await tx.get(db.collection(name).limit(1))).empty) throw new Error('El destino contiene datos.');
    tx.create(control,{application:'forx-v2',projectId:config.projectId,databaseId:config.databaseId,
      environment:config.environment,state:'initializing',bootstrapUid:adminUid,bootstrapChecksum:checksum,
      sourceCreatedAt:inspected.backup.createdAt});
  });
  // Once activated, a retry must never fill, reconcile or rewrite a working base.
  const state=(await control.get()).data();
  if (state.state==='ready') return {state:'ready',alreadyInitialized:true,checksum};
  for (let offset=0;offset<records.length;offset+=100) {
    const chunk=records.slice(offset,offset+100),refs=chunk.map(row=>db.collection(row.collection).doc(row.value.id));
    validatePersistenceInput(chunk.map(({collection,value})=>({collection,id:value.id,value,expected:null})));
    await db.runTransaction(async tx=>{
      const marker=(await tx.get(control)).data();
      if (marker.state!=='initializing'||marker.bootstrapChecksum!==checksum) throw new Error('La carga cambió.');
      const prior=await tx.getAll(...refs);
      for (let i=0;i<chunk.length;i++) {
        if (prior[i].exists) {
          if (await backupDigest(prior[i].data())!==await backupDigest(chunk[i].value)) throw new Error('Registro diferente; no se sobrescribió.');
        } else tx.create(refs[i],chunk[i].value);
      }
    });
  }
  if (await backupDigest(sorted(await runtime.repository.exportSnapshot()))!==await backupDigest(sorted(inspected.collections)))
    throw new Error('El destino no coincide con el respaldo; permanece cerrado.');
  const membersControl=(await db.collection('_forx_system').doc('access').get()).data();
  if (!membersControl) await access.bootstrap(adminUid);
  const member=(await db.collection('_forx_access').doc(adminUid).get()).data();
  if (!member?.active || member.role!=='admin') throw new Error('El administrador inicial no está disponible.');
  await db.runTransaction(async tx=>{
    const marker=(await tx.get(control)).data();
    if (marker.state!=='initializing'||marker.bootstrapChecksum!==checksum||marker.bootstrapUid!==adminUid) throw new Error('La carga cambió.');
    tx.set(control,{...marker,state:'ready',initializedAt:new Date().toISOString()});
  });
  return {state:'ready',checksum,records:inspected.total,originalsIncluded:false,identitiesIncluded:false};
}
