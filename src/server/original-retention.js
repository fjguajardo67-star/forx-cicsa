import { createHash } from 'node:crypto';
import { originalExpiresAt } from '../domain/retention.js';
import { backupDigest } from '../domain/backup.js';
import { assertInstance, assertBucketPolicy } from './deployment-config.js';

function evidence(name,meta,now) {
  const match=/^originals\/xml_([a-f0-9]{64})\.xml$/.exec(name);
  const m=meta?.metadata;
  if (!match || !m || m.sha256!==match[1] || !m.uploadedAt || !m.expiresAt) return null;
  try {if(m.expiresAt!==originalExpiresAt(m.uploadedAt) || Date.parse(m.expiresAt)>Date.parse(now))return null;}catch{return null;}
  if (!/^\d+$/.test(String(meta.generation)) || !/^\d+$/.test(String(meta.metageneration))) return null;
  return {id:`xml_${match[1]}`,hash:match[1],path:name,uploadedAt:m.uploadedAt,expiresAt:m.expiresAt,
    generation:String(meta.generation),metageneration:String(meta.metageneration)};
}
function compatible(record,item) {
  return !record || record.id===item.id && record.hash===item.hash && record.uploadedAt===item.uploadedAt
    && record.expiresAt===item.expiresAt && (record.path===item.path || record.path==null&&['expired','not_included'].includes(record.status));
}

// A CLI/job only. No public retention endpoint. Preview is the default; apply
// requires the exact preview digest and rechecks server time and object version.
export class OriginalRetention {
  constructor(runtime,{clock=()=>new Date().toISOString()}={}) {this.runtime=runtime;this.clock=clock;}
  async preview() {
    const {db,bucket,config}=this.runtime;await this.runtime.assertReady();
    assertBucketPolicy((await bucket.getMetadata())[0],config,'originals');
    const now=this.clock(),items=[],skipped=[];let query={prefix:'originals/',autoPaginate:false,maxResults:100},scanned=0;
    do {
      const [files,next]=await bucket.getFiles(query);
      for(const file of files) {
        if(++scanned>5000)throw new Error('La vista previa supera 5000 objetos; requiere un recorrido paginado adicional. No se borró nada.');
        const meta=(await file.getMetadata())[0],item=evidence(file.name,meta,'9999-12-31T23:59:59.999Z');
        if(!item){skipped.push({id:file.name,reason:'unverifiable_metadata'});continue;}
        if(Date.parse(item.expiresAt)>Date.parse(now))continue;
        const record=(await db.collection('originals').doc(item.id).get()).data();
        if(!compatible(record,item)){skipped.push({id:item.id,reason:'metadata_conflict'});continue;}
        items.push({...item,kind:record?.status==='retained'?'tracked':'orphan'});
      }
      query=next;
    } while(query);
    // A prior job may have removed the blob but not yet committed Firestore.
    // Include its durable evidence so a scheduled retry can finish the ledger.
    const pending=await db.collection('_forx_jobs').where('kind','==','retention').where('state','==','pending').limit(201).get();
    if(pending.size>200)throw new Error('Hay más de 200 retenciones pendientes; requiere reconciliación por lotes. No se borró nada.');
    for(const doc of pending.docs) {
      const item=doc.data().item;
      if(!items.some(current=>current.path===item.path&&current.generation===item.generation))items.push(item);
    }
    items.sort((a,b)=>a.path.localeCompare(b.path));
    const plan={version:1,projectId:config.projectId,databaseId:config.databaseId,bucket:config.originalsBucket,createdAt:now,items,skipped};
    return {...plan,digest:await backupDigest(plan)};
  }
  async apply(plan,{confirmDigest}={}) {
    const {digest,...payload}=plan || {},{db,bucket,config}=this.runtime;
    if(confirmDigest!==digest || digest!==await backupDigest(payload) || payload.version!==1
      || payload.projectId!==config.projectId || payload.databaseId!==config.databaseId || payload.bucket!==config.originalsBucket
      || !Array.isArray(payload.items) || payload.items.length>5000)throw new Error('Confirma la vista previa exacta del entorno autorizado.');
    await this.runtime.assertReady();assertBucketPolicy((await bucket.getMetadata())[0],config,'originals');
    const result={expired:0,orphans:0,alreadyDone:0,failed:0};
    for(const item of payload.items) {
      const now=this.clock();
      const valid=evidence(item.path,{metadata:{sha256:item.hash,uploadedAt:item.uploadedAt,expiresAt:item.expiresAt},generation:item.generation,metageneration:item.metageneration},now);
      if(!valid || valid.id!==item.id || !['tracked','orphan'].includes(item.kind))throw new Error('Selección inválida o todavía no vencida.');
      const id=createHash('sha256').update(`${item.path}:${item.generation}`).digest('hex');
      const job=db.collection('_forx_jobs').doc(`retention_${id}`),original=db.collection('originals').doc(item.id),audit=db.collection('audit').doc(`retention_${id}`);
      try {
        const done=await db.runTransaction(async tx=>{
          const [instance,previous,source]=await tx.getAll(db.collection('_forx_system').doc('instance'),job,original);
          assertInstance(instance.data(),config);
          if(previous.data()?.state==='done')return true;
          if(!compatible(source.data(),item))throw new Error('El original cambió.');
          if(previous.exists && previous.data().planItemDigest!==await backupDigest(item))throw new Error('La evidencia cambió.');
          if(!previous.exists)tx.create(job,{kind:'retention',state:'pending',item,planItemDigest:await backupDigest(item),startedAt:now});
          return false;
        });
        if(done){result.alreadyDone++;continue;}
        const file=bucket.file(item.path);let metadata;
        try{metadata=(await file.getMetadata())[0];}catch(error){if(Number(error.code)!==404)throw error;}
        if(metadata) {
          const current=evidence(item.path,metadata,now);
          if(!current || await backupDigest(current)!==await backupDigest(valid))throw new Error('La versión del objeto cambió.');
          try{await bucket.file(item.path,{preconditionOpts:{ifGenerationMatch:item.generation,ifMetagenerationMatch:item.metageneration}}).delete();}
          catch(error){if(Number(error.code)!==404)throw error;}
        }
        const changed=await db.runTransaction(async tx=>{
          const [prior,source,logged]=await tx.getAll(job,original,audit);
          if(prior.data()?.state==='done')return false;
          const record=source.data();if(!compatible(record,item))throw new Error('El original cambió tras retirar el objeto; revisar bitácora del trabajo.');
          if(record?.status==='retained')tx.set(original,{...record,bytes:null,path:null,status:'expired',expiredAt:now,_revision:record._revision+1});
          if(!logged.exists)tx.create(audit,{id:audit.id,_revision:1,action:record?'original.expired':'original.orphan_expired',entityId:item.id,
            actorUid:'retention-worker',occurredAt:now,reason:'Retención vencida; se retiró exclusivamente el original temporal o se confirmó su ausencia.'});
          tx.set(job,{...prior.data(),state:'done',finishedAt:now});return true;
        });
        if(changed)result[item.kind==='tracked'?'expired':'orphans']++;else result.alreadyDone++;
      } catch {
        // A durable pending item can be retried with the same saved plan after a
        // delete/Firestore interruption; never delete a replacement generation.
        result.failed++;
      }
    }
    return result;
  }
}
