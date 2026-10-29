import { exportBackup, inspectBackup, backupDigest, BACKUP_MAX_BYTES } from '../domain/backup.js';
import { COLLECTIONS } from '../data/entity-repository.js';
import { assertBucketPolicy } from './deployment-config.js';

const sorted=data=>Object.fromEntries(COLLECTIONS.map(name=>[name,[...data[name]].sort((a,b)=>a.id.localeCompare(b.id))]));
export async function createServerBackup(runtime,{now=new Date().toISOString()}={}) {
  await runtime.assertReady();assertBucketPolicy((await runtime.backupsBucket.getMetadata())[0],runtime.config,'backups');
  const backup=await exportBackup(runtime.repository,{now});
  const manifest={version:1,application:'forx-v2',sourceProject:runtime.config.projectId,sourceDatabase:runtime.config.databaseId,
    createdAt:now,checksum:backup.checksum,originals:'excluded',identities:'excluded'};
  const artifact={manifest,backup},bytes=Buffer.from(JSON.stringify(artifact));
  if(bytes.length>BACKUP_MAX_BYTES)throw new Error('El respaldo supera el límite; requiere exportación particionada antes de continuar.');
  const path=`derived/${runtime.config.environment}/${runtime.config.databaseId}/${backup.checksum}.json`;
  try {await runtime.backupsBucket.file(path).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},
    metadata:{contentType:'application/json',cacheControl:'private, no-store',metadata:{forxApplication:'forx-v2',sha256:backup.checksum}}});}
  catch(error){if(Number(error.code)!==412)throw error;}
  // Read back the saved object, not merely the source buffer.
  const downloaded=(await runtime.backupsBucket.file(path).download())[0];
  if(!downloaded.equals(bytes))throw new Error('El respaldo guardado no coincide; no se considera completo.');
  await inspectBackup(JSON.stringify(JSON.parse(downloaded).backup));
  return {path,checksum:backup.checksum,bytes:bytes.length,createdAt:now};
}

export async function inspectServerBackup(artifact) {
  if(!artifact || artifact.manifest?.version!==1 || artifact.manifest.application!=='forx-v2'
    || artifact.manifest.originals!=='excluded' || artifact.manifest.identities!=='excluded'
    || artifact.manifest.checksum!==artifact.backup?.checksum || !/^forx-v2-[a-z0-9-]+$/.test(artifact.manifest.sourceProject || '')
    || !/^forx-(production|staging|recovery)-[a-z0-9-]+$/.test(artifact.manifest.sourceDatabase || ''))throw new Error('Manifiesto de respaldo inválido.');
  const inspected=await inspectBackup(JSON.stringify(artifact.backup));
  return {...inspected,manifest:artifact.manifest};
}

// Isolated recovery only. Never overwrite an existing record, create Auth users,
// recreate XML, or make a recovered database available to the public API.
export async function restoreServerBackup(runtime,artifact,{confirmChecksum}={}) {
  const inspected=await inspectServerBackup(artifact),{db,config}=runtime;
  if(config.environment!=='recovery' || inspected.manifest.sourceProject===config.projectId&&inspected.manifest.sourceDatabase===config.databaseId
    || confirmChecksum!==inspected.backup.checksum)throw new Error('Solo se permite recuperar en un destino recovery separado, con checksum confirmado.');
  const control=db.collection('_forx_system').doc('instance'),checksum=inspected.backup.checksum;
  // Refuse any unknown collections (including identities) on first use.
  const prior=(await control.get()).data();
  if(!prior && (await db.listCollections()).length)throw new Error('El destino no está vacío.');
  await db.runTransaction(async tx=>{
    const state=(await tx.get(control)).data();
    if(state){if(state.application!=='forx-v2' || state.restoreChecksum!==checksum || !['restoring','recovered'].includes(state.state)
      || state.projectId!==config.projectId || state.databaseId!==config.databaseId)throw new Error('El destino pertenece a otra recuperación.');return;}
    // Recheck every application collection inside the acquisition transaction.
    for(const name of COLLECTIONS)if(!(await tx.get(db.collection(name).limit(1))).empty)throw new Error('El destino no está vacío.');
    tx.create(control,{application:'forx-v2',projectId:config.projectId,databaseId:config.databaseId,environment:'recovery',state:'restoring',restoreChecksum:checksum});
  });
  const records=COLLECTIONS.flatMap(collection=>inspected.collections[collection].map(value=>({collection,value})));
  for(let offset=0;offset<records.length;offset+=200){
    const chunk=records.slice(offset,offset+200),refs=chunk.map(r=>db.collection(r.collection).doc(r.value.id));
    await db.runTransaction(async tx=>{
      const existing=await tx.getAll(...refs);
      for(let i=0;i<chunk.length;i++) {
        if(existing[i].exists){if(await backupDigest(existing[i].data())!==await backupDigest(chunk[i].value))throw new Error('Hay un registro diferente en el destino; no se reemplazó.');}
        else tx.create(refs[i],chunk[i].value);
      }
    });
  }
  const actual=await runtime.repository.exportSnapshot();
  if(await backupDigest(sorted(actual))!==await backupDigest(sorted(inspected.collections)))throw new Error('La recuperación no coincide; permanece aislada.');
  await db.runTransaction(async tx=>{
    const state=(await tx.get(control)).data();if(state.restoreChecksum!==checksum)throw new Error('La recuperación cambió.');
    tx.set(control,{...state,state:'recovered',verifiedAt:new Date().toISOString()});
  });
  return {checksum,records:inspected.total,state:'recovered',publicAccess:false};
}
