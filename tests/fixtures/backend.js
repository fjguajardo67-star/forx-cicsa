import { FirestoreEntityRepository } from '../../src/server/firestore-entity-repository.js';
import { assertInstance } from '../../src/server/deployment-config.js';
import { AccessService } from '../../src/server/access-service.js';
export const config={environment:'staging',projectId:'forx-v2-test-only',databaseId:'forx-staging-test',originalsBucket:'forx-v2-test-originals',backupsBucket:'forx-v2-test-backups',origins:['https://forx.example'],signInProvider:'password',limits:{perUserMinute:60,globalMinute:600,concurrentPerProcess:4}};
export const instance=cfg=>({application:'forx-v2',projectId:cfg.projectId,databaseId:cfg.databaseId,environment:cfg.environment,state:'ready'});
export const bucketPolicy=(cfg,kind)=>({name:cfg[kind==='originals'?'originalsBucket':'backupsBucket'],labels:{forx_application:'forx-v2',forx_environment:cfg.environment},iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},softDeletePolicy:{retentionDurationSeconds:'0'}});
export function memoryFirestore() {
  const records=new Map();let queue=Promise.resolve();
  const docSnap=ref=>({id:ref.id,exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path)),ref});
  const querySnap=query=>{
    const docs=[...records.keys()].filter(key=>key.startsWith(query.path+'/')&&!key.slice(query.path.length+1).includes('/')
      &&(query.filters || []).every(([field,value])=>records.get(key)[field]===value)).slice(0,query.cap ?? Infinity).map(key=>docSnap(doc(key)));
    return {docs,size:docs.length,empty:!docs.length};
  };
  const doc=path=>({path,id:path.split('/').at(-1),get:async()=>docSnap(doc(path)),set:async value=>records.set(path,structuredClone(value))});
  const collection=path=>({path,doc:id=>doc(path+'/'+(id || crypto.randomUUID())),limit(cap){return {...this,cap};},where(field,op,value){if(op!=='==')throw new Error('test query');return {...this,filters:[...(this.filters || []),[field,value]]};},async get(){return querySnap(this);}});
  const read=ref=>ref.id?docSnap(ref):querySnap(ref);
  const db={collection,listCollections:async()=>[...new Set([...records.keys()].map(key=>key.split('/')[0]))].map(collection),
    runTransaction(action){
      const running=queue.then(async()=>{const writes=[];const result=await action({get:async ref=>read(ref),getAll:async(...refs)=>refs.map(read),
        set:(ref,value)=>writes.push(()=>records.set(ref.path,structuredClone(value))),
        create:(ref,value)=>{if(records.has(ref.path))throw new Error('already-exists');writes.push(()=>records.set(ref.path,structuredClone(value)));},
        delete:ref=>writes.push(()=>records.delete(ref.path))});writes.forEach(write=>write());return result;});
      queue=running.catch(()=>{});return running;
    }};
  return {db,records};
}
export function memoryBucket(cfg,kind='originals') {
  const objects=new Map();let generation=1;const policy=bucketPolicy(cfg,kind);
  const error=code=>Object.assign(new Error('storage private details'),{code});
  const file=(name,options={})=>({name,
    async save(bytes,opts={}){if(opts.preconditionOpts?.ifGenerationMatch===0&&objects.has(name))throw error(412);objects.set(name,{bytes:Buffer.from(bytes),metadata:{...opts.metadata,name,generation:String(generation++),metageneration:'1'}});},
    async getMetadata(){if(!objects.has(name))throw error(404);return [structuredClone(objects.get(name).metadata)];},
    async download(){if(!objects.has(name))throw error(404);return [Buffer.from(objects.get(name).bytes)];},
    async delete(){const m=objects.get(name)?.metadata;if(!m)throw error(404);const p=options.preconditionOpts;
      if(!p || p.ifGenerationMatch!==m.generation || p.ifMetagenerationMatch!==m.metageneration)throw error(412);objects.delete(name);}
  });
  return {objects,policy,file,getMetadata:async()=>[structuredClone(policy)],getFiles:async({prefix})=>[[...objects.keys()].filter(name=>name.startsWith(prefix)).map(name=>file(name)),null]};
}
export function backendFixture(cfg=config) {
  const {db,records}=memoryFirestore(),users=new Map(),revoked=[];
  const auth={getUser:async uid=>{if(!users.has(uid))throw new Error('private auth detail');return structuredClone(users.get(uid));},
    verifyIdToken:async(token,check)=>{if(check!==true||!users.has(token))throw new Error('invalid token');return {uid:token,firebase:{sign_in_provider:cfg.signInProvider},forxActive:true,forxRole:'admin'};},
    revokeRefreshTokens:async uid=>revoked.push(uid)};
  const bucket=memoryBucket(cfg),backupsBucket=memoryBucket(cfg,'backups');
  const runtime={config:cfg,db,auth,bucket,backupsBucket,repository:new FirestoreEntityRepository(db),
    assertReady:async()=>assertInstance((await db.collection('_forx_system').doc('instance').get()).data(),cfg)};
  runtime.access=new AccessService({db,auth,provider:cfg.signInProvider});
  const user=(uid)=>users.set(uid,{uid,email:`${uid}@forx.invalid`,emailVerified:true,displayName:uid,disabled:false,providerData:[{providerId:cfg.signInProvider}]});
  return {runtime,records,users,user,revoked};
}
