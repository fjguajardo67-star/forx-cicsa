import { beforeAll,afterAll,describe,test,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeTestEnvironment,assertFails } from '@firebase/rules-unit-testing';
import { getDoc,doc } from 'firebase/firestore';
import { ref,getBytes } from 'firebase/storage';
import { createEmulatorRuntime } from '../../src/server/emulator-runtime.js';
import { assertIsolatedVerification } from '../../scripts/emulator-launch.js';
import { config,bucketPolicy,instance } from '../fixtures/backend.js';
import { assertInstance } from '../../src/server/deployment-config.js';
import { initializeEmptyInstance } from '../../src/server/initialize-instance.js';
import { FirestoreEntityRepository } from '../../src/server/firestore-entity-repository.js';
import { PrivateOriginals } from '../../src/server/private-originals.js';
import { AccessService } from '../../src/server/access-service.js';
import { RequestLimits } from '../../src/server/request-limits.js';
import { createProductionServer } from '../../src/server/production-http.js';
import { createServerBackup,restoreServerBackup } from '../../src/server/server-backups.js';
import { OriginalRetention } from '../../src/server/original-retention.js';
import { PantryService } from '../../src/domain/pantry-service.js';
import { KitchenService } from '../../src/domain/kitchen-service.js';
import { file,purchaseXml,ingredientInput,productInput } from '../fixtures/monthly.js';
import { originalExpiresAt } from '../../src/domain/retention.js';
import {initializeApp as initializeClient,deleteApp as deleteClient} from 'firebase/app';
import {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithCredential,signOut} from 'firebase/auth';
import {createAuthenticatedApi} from '../../src/data/authenticated-api.js';
import { AdminRecovery } from '../../src/server/admin-recovery.js';
import {cfdiFixture,manyConcepts} from '../fixtures/cfdi.js';
import { createOpenAIRecipeTransport } from '../../src/server/openai-recipe-transport.js';
import { RecipeGenerationService } from '../../src/domain/recipe-generation.js';
import { initializeFromBackup } from '../../src/server/initialize-from-backup.js';
import { MemoryEntityRepository } from '../../src/data/entity-repository.js';
import { exportBackup } from '../../src/domain/backup.js';

describe.skipIf(!process.env.FORX_ISOLATED_TESTS)('backend preparado para producción sobre servicios exclusivamente emulados',()=>{
  let baseRuntime,runtime,server,url,ruleEnv,target;const tokens={},uids={},logs=[];
  const suffix=crypto.randomUUID().slice(0,8),origin=config.origins[0];
  const makeRuntime=(cfg)=>{
    const db=getFirestore(baseRuntime.auth.app,cfg.databaseId);db.settings({ignoreUndefinedProperties:true});
    // Emulators do not implement real bucket IAM/labels/soft-delete policy.
    // Only that control-plane response is substituted; object I/O uses real SDK.
    const bucket=(kind)=>{
      const raw=getStorage(baseRuntime.auth.app).bucket(cfg[kind==='originals'?'originalsBucket':'backupsBucket']);
      return new Proxy(raw,{get(object,key){if(key==='getMetadata')return async()=>[bucketPolicy(cfg,kind)];const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});
    };
    const r={config:cfg,db,auth:baseRuntime.auth,bucket:bucket('originals'),backupsBucket:bucket('backups')};
    r.assertReady=async()=>assertInstance((await db.collection('_forx_system').doc('instance').get()).data(),cfg);
    r.repository=new FirestoreEntityRepository(db,{originals:new PrivateOriginals(r.bucket),guardTransaction:async tx=>assertInstance((await tx.get(db.collection('_forx_system').doc('instance'))).data(),cfg)});
    r.access=new AccessService({auth:r.auth,db,provider:cfg.signInProvider});return r;
  };
  async function post(path,body={},role='admin',custom={}) {
    const response=await fetch(url+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${tokens[role] || role}`,...custom},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  beforeAll(async()=>{
    assertIsolatedVerification();baseRuntime=await createEmulatorRuntime();
    runtime=makeRuntime({...config,databaseId:`forx-staging-${suffix}`,originalsBucket:`forx-v2-originals-${suffix}`,backupsBucket:`forx-v2-backups-${suffix}`});
    const passwords={};
    for(const role of ['admin','editor','viewer','outside']) {
      uids[role]=`${role}-${suffix}`;passwords[role]=crypto.randomUUID();
      await runtime.auth.createUser({uid:uids[role],email:`${uids[role]}@forx.invalid`,password:passwords[role],emailVerified:true});
    }
    await initializeEmptyInstance(runtime,{adminUid:uids.admin,confirmTarget:`${runtime.config.projectId}/${runtime.config.databaseId}`});
    for(const role of ['editor','viewer'])await runtime.access.update({uid:uids.admin},{uid:uids[role],role,active:true,expectedRevision:null});
    for(const role of Object.keys(uids)) {
      const reply=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uids[role]}@forx.invalid`,password:passwords[role],returnSecureToken:true})});
      tokens[role]=(await reply.json()).idToken;
    }
    server=createProductionServer(runtime,{log:entry=>logs.push(entry)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
  },30000);
  afterAll(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));await ruleEnv?.cleanup();
    await target?.db.terminate();await runtime?.db.terminate();await baseRuntime?.close();
  });
  test('API sin sesión demo; Auth real emulado, origen, permiso vigente y errores sin datos privados',async()=>{
    expect((await post('/session')).status).toBe(404);
    expect((await post('/identity',{},'outside')).status).toBe(403);
    expect((await post('/identity',{},'invalid-token')).status).toBe(401);
    expect((await post('/identity',{},'admin',{Origin:'https://wrong.invalid'})).status).toBe(403);
    expect((await post('/identity',{},'editor')).body.result.role).toBe('editor');
    expect((await post('/commands',{command:'saveRecipe',input:{actor:{role:'admin'},name:'secret-in-payload'}},'viewer')).status).toBe(403);
    expect((await post('/commands',{command:'catalog'},'viewer')).status).toBe(200);
    expect((await post('/commands',{command:'catalog',actor:{role:'admin'}})).status).toBe(400);
    expect((await post('/commands',{command:'snapshot'},'admin',{'Content-Type':'text/plain'})).status).toBe(415);
    expect(JSON.stringify(logs)).not.toContain('secret-in-payload');expect(JSON.stringify(logs)).not.toContain(tokens.admin);
    expect(logs.every(log=>log.requestId&&log.durationMs>=0)).toBe(true);
  });
  test('carga inicial real emulada desde respaldo local v3 activa solo un destino nuevo y conserva sus registros',async()=>{
    const app=initializeClient({projectId:'demo-forx-v2',apiKey:'demo'},`initial-load-${suffix}`),auth=getAuth(app);
    connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
    const cfg={...runtime.config,databaseId:`forx-staging-initial-${suffix}`,signInProvider:'google.com'};
    const destination=makeRuntime(cfg);
    try {
      const credential=GoogleAuthProvider.credential(JSON.stringify({sub:`initial-${suffix}`,email:`initial-${suffix}@forx.invalid`,email_verified:true}));
      const {user}=await signInWithCredential(auth,credential);
      const local=new MemoryEntityRepository();
      await new PantryService(local).initialize();await new KitchenService(local).initialize();
      await new KitchenService(local).saveRecipe({name:'Carga inicial aislada',type:'guisado',baseServings:1,lines:[{name:'Sin precio',quantity:1,unit:'kg'}]});
      const backup=await exportBackup(local),options={adminUid:user.uid,confirmTarget:`${cfg.projectId}/${cfg.databaseId}`,confirmChecksum:backup.checksum};
      expect(await initializeFromBackup(destination,JSON.stringify(backup),options)).toMatchObject({state:'ready'});
      await destination.assertReady();
      const loaded=await destination.repository.exportSnapshot();
      for(const name of Object.keys(backup.collections)) {
        const byId=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
        expect(byId(loaded[name]),name).toEqual(byId(backup.collections[name]));
      }
      expect((await destination.db.collection('_forx_access').doc(user.uid).get()).data()).toMatchObject({role:'admin',active:true});
      expect(await initializeFromBackup(destination,JSON.stringify(backup),options)).toMatchObject({alreadyInitialized:true});
    } finally {await destination.db.terminate();await deleteClient(app);}
  },20000);
  test('administración de roles protege al último admin y revoca acceso ya autenticado',async()=>{
    expect((await post('/access/list',{},'editor')).status).toBe(403);
    expect((await post('/access/update',{uid:uids.admin,role:'viewer',active:true,expectedRevision:1})).status).toBe(409);
    const changed=await post('/access/update',{uid:uids.editor,role:'editor',active:false,expectedRevision:1});expect(changed.status).toBe(200);
    expect([401,403]).toContain((await post('/identity',{},'editor')).status);
    expect((await post('/access/list')).body.result.find(r=>r.uid===uids.editor).active).toBe(false);
  });
  test('cuotas distribuidas atómicas; mantenimiento bloquea comandos y escrituras',async()=>{
    const a=new RequestLimits(runtime.db,{perUserMinute:1,globalMinute:20},{clock:()=>Date.parse('2026-01-01T00:00:00Z')}),b=new RequestLimits(runtime.db,{perUserMinute:1,globalMinute:20},{clock:()=>Date.parse('2026-01-01T00:00:00Z')});
    const results=await Promise.allSettled([a.reserve('same'),b.reserve('same')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const marker=runtime.db.collection('_forx_system').doc('instance'),before=(await marker.get()).data();await marker.set({...before,state:'maintenance'});
    expect((await post('/commands',{command:'catalog'})).status).toBe(503);
    await expect(new KitchenService(runtime.repository).saveRecipe({name:'No guardar',type:'guisado',baseServings:1,lines:[{name:'A',quantity:1,unit:'g'}]})).rejects.toThrow(/mantenimiento/);
    await marker.set(before);
  });
  test('panel de acceso: lookup privado, revisión optimista, desactivación incluso con Auth inhabilitado',async()=>{
    const uid=`panel-${suffix}`;
    await runtime.auth.createUser({uid,email:`${uid}@forx.invalid`,emailVerified:true});
    expect((await post('/access/lookup',{uid},'viewer')).status).toBe(403);
    expect((await post('/access/lookup',{uid:'../invalid'})).status).toBe(400);
    expect((await post('/access/lookup',{uid:`missing-${suffix}`})).status).toBe(404);
    const lookup=await post('/access/lookup',{uid});expect(lookup.status).toBe(200);expect(lookup.body.result).toMatchObject({uid,email:`${uid}@forx.invalid`,membership:null});
    expect((await post('/access/update',{uid,role:'viewer',active:true,expectedRevision:null})).status).toBe(200);
    expect((await post('/access/lookup',{uid})).body.result.membership.revision).toBe(1);
    const changes=await Promise.all(['editor','viewer'].map(role=>post('/access/update',{uid,role,active:true,expectedRevision:1})));
    expect(changes.map(r=>r.status).sort()).toEqual([200,409]);
    await runtime.auth.updateUser(uid,{disabled:true});
    expect((await post('/access/update',{uid,role:'viewer',active:true,expectedRevision:2})).status).toBe(400);
    expect((await post('/access/update',{uid,role:'viewer',active:false,expectedRevision:2})).body.result).toMatchObject({active:false,revision:3});
    expect((await post('/access/list')).body.result.find(r=>r.uid===uid).active).toBe(false);
  });
  test('respaldo y recuperación Firestore → Storage → Firestore vacío conservan precio e identidades',async()=>{
    const pantry=new PantryService(runtime.repository),kitchen=new KitchenService(runtime.repository);
    await pantry.importFiles([file('synthetic.xml',purchaseXml({uuid:crypto.randomUUID().toUpperCase()}))],{period:'2026-09'});
    const event=(await pantry.snapshot()).purchase_events[0],ingredient=await pantry.createIngredient(ingredientInput);
    await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});await pantry.validatePrice(event.id);
    const recipe=await kitchen.saveRecipe({name:'Recuperación real emulada',type:'guisado',baseServings:1,lines:[{name:'Jitomate',ingredientId:ingredient.id,quantity:100,unit:'g'}]});
    const before=await runtime.repository.exportSnapshot(),receipt=await createServerBackup(runtime),artifact=JSON.parse((await runtime.backupsBucket.file(receipt.path).download())[0]);
    target=makeRuntime({...runtime.config,environment:'recovery',databaseId:`forx-recovery-${suffix}`});
    const result=await restoreServerBackup(target,artifact,{confirmChecksum:receipt.checksum});expect(result.state).toBe('recovered');
    expect((await new KitchenService(target.repository).snapshot()).recipeCosts[recipe.id]).toEqual((await kitchen.snapshot()).recipeCosts[recipe.id]);
    expect((await target.db.collection('_forx_access').get()).empty).toBe(true);
    expect(await runtime.repository.exportSnapshot()).toEqual(before);
    expect(()=>createProductionServer(target)).toThrow(/recuperación/);
    expect((await target.repository.list('originals'))[0]).toMatchObject({bytes:null,path:null,status:'not_included'});
  },30000);
  test('Firestore confirma nueva observación XML automática solo tras aprobación humana del SKU',async()=>{
    const cfg={...runtime.config,databaseId:`forx-staging-auto-price-${suffix}`,originalsBucket:`forx-v2-auto-price-${suffix}`};
    const isolated=makeRuntime(cfg);
    try {
      await initializeEmptyInstance(isolated,{adminUid:uids.admin,confirmTarget:`${cfg.projectId}/${cfg.databaseId}`});
      const pantry=new PantryService(isolated.repository);
      await pantry.importFiles([file('primera.xml',purchaseXml({uuid:crypto.randomUUID().toUpperCase()}))],{period:'2026-09'});
      const first=(await isolated.repository.list('purchase_events'))[0],ingredient=await pantry.createIngredient({...ingredientInput,wasteEffectiveFrom:'2026-10-07'});
      await pantry.saveProduct(first.id,{...productInput,ingredientId:ingredient.id});
      expect(await isolated.repository.list('price_observations')).toHaveLength(0);
      await pantry.validatePrice(first.id);
      await pantry.importFiles([file('posterior.xml',purchaseXml({uuid:crypto.randomUUID().toUpperCase(),day:'2026-09-21',price:'480'}))],{period:'2026-09'});
      const observations=await isolated.repository.list('price_observations');
      expect(observations).toHaveLength(2);
      const automatic=observations.find(item=>item.validationMode==='automatic');
      expect(automatic).toMatchObject({productId:first.productId,normalizedPrice:'44.4444'});
      expect(await isolated.repository.get('reviews',automatic.eventId)).toMatchObject({status:'validated',observationId:automatic.id});
    } finally {await isolated.db.terminate();}
  },30000);
  test('retención en Storage con precondición, huérfano y bitácora sin modificar compras/precios',async()=>{
    const before=await runtime.repository.exportSnapshot();
    for(const tracked of [true,false]) {
      const bytes=Buffer.from(`<synthetic>${suffix}-${tracked}</synthetic>`),hash=createHash('sha256').update(bytes).digest('hex'),id=`xml_${hash}`,path=`originals/${id}.xml`;
      const uploadedAt='2026-07-31T12:00:00.000Z',expiresAt=originalExpiresAt(uploadedAt);
      await runtime.bucket.file(path).save(bytes,{resumable:false,metadata:{metadata:{sha256:hash,uploadedAt,expiresAt}}});
      if(tracked)await runtime.db.collection('originals').doc(id).set({id,hash,path,uploadedAt,expiresAt,status:'retained',_revision:1});
    }
    const worker=new OriginalRetention(runtime,{clock:()=> '2026-10-05T12:00:00.000Z'}),plan=await worker.preview();expect(plan.items).toHaveLength(2);
    const result=await worker.apply(plan,{confirmDigest:plan.digest});expect(result).toMatchObject({expired:1,orphans:1,failed:0});
    expect((await worker.apply(plan,{confirmDigest:plan.digest})).alreadyDone).toBe(2);
    const after=await runtime.repository.exportSnapshot();
    for(const name of ['purchase_events','price_observations','recipes','products','ingredients'])expect(after[name]).toEqual(before[name]);
  },20000);
  test('Google emulado → ID token SDK → API → membresía; cuenta externa y provider password rechazados',async()=>{
    assertIsolatedVerification();
    const app=initializeClient({projectId:'demo-forx-v2',apiKey:'demo'},`google-${suffix}`),auth=getAuth(app);
    connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
    const googleRuntime={...runtime,access:new AccessService({auth:runtime.auth,db:runtime.db,provider:'google.com'})};
    const googleServer=createProductionServer(googleRuntime,{log:()=>{}});
    await new Promise(resolve=>googleServer.listen(0,'127.0.0.1',resolve));
    let api;
    try {
      // Literal JSON is a documented Auth-emulator credential, never valid at Google.
      const credential=GoogleAuthProvider.credential(JSON.stringify({sub:`google-${suffix}`,email:`google-${suffix}@forx.invalid`,email_verified:true}));
      const {user}=await signInWithCredential(auth,credential);
      const decoded=await runtime.auth.verifyIdToken(await user.getIdToken());expect(decoded.firebase.sign_in_provider).toBe('google.com');
      api=createAuthenticatedApi({endpoint:`http://127.0.0.1:${googleServer.address().port}`,auth,user,
        fetchImpl:(url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:origin}})});
      await expect(api.request('/identity')).rejects.toMatchObject({status:403});
      await runtime.access.update({uid:uids.admin},{uid:user.uid,role:'viewer',active:true,expectedRevision:null});
      await user.getIdToken(true);
      expect(await api.request('/identity')).toMatchObject({uid:user.uid,role:'viewer'});
      expect(await api.request('/commands',{command:'kitchenSnapshot',input:{}})).toHaveProperty('recipes');
      await expect(api.request('/commands',{command:'createIngredient',input:{}})).rejects.toMatchObject({status:403});
      const wrong=await fetch(`http://127.0.0.1:${googleServer.address().port}/identity`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${tokens.admin}`},body:'{}'});
      expect(wrong.status).toBe(403);
      await signOut(auth);await expect(api.request('/identity')).rejects.toMatchObject({status:401});
    } finally {api?.close();await deleteClient(app);await new Promise(resolve=>googleServer.close(resolve));}
  },20000);
  test('recuperación administrativa aislada con identidades Google emuladas, sin ruta pública ni datos culinarios alterados',async()=>{
    assertIsolatedVerification();
    const app=initializeClient({projectId:'demo-forx-v2',apiKey:'demo'},`recovery-google-${suffix}`),auth=getAuth(app);
    connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
    const now=new Date().toISOString();
    const cfg={...runtime.config,databaseId:`forx-staging-admin-${suffix}`,signInProvider:'google.com',
      adminRecovery:{enabled:true,jobName:'forx-recovery-test',approvedBy:'Ensayo ficticio',approvedAt:now,expiresAt:new Date(Date.parse(now)+3600000).toISOString()}};
    const isolated=makeRuntime(cfg);let recoveryServer;
    const credential=name=>GoogleAuthProvider.credential(JSON.stringify({sub:`recovery-${name}-${suffix}`,email:`recovery-${name}-${suffix}@forx.invalid`,email_verified:true}));
    try {
      const lost=(await signInWithCredential(auth,credential('lost'))).user,oldToken=await lost.getIdToken();
      await signOut(auth);
      const next=(await signInWithCredential(auth,credential('next'))).user;
      await initializeEmptyInstance(isolated,{adminUid:lost.uid,confirmTarget:`${cfg.projectId}/${cfg.databaseId}`});
      await new KitchenService(isolated.repository).saveRecipe({name:'No modificar durante recuperación',type:'guisado',baseServings:1,lines:[{name:'Ingrediente sin precio',quantity:1,unit:'kg'}]});
      const before=await isolated.repository.exportSnapshot();
      const recovery=new AdminRecovery(isolated),plan=await recovery.preview({lostUid:lost.uid,replacementUid:next.uid,reason:'Cuenta ficticia perdida en ensayo aislado.'});
      expect(await isolated.repository.exportSnapshot()).toEqual(before);
      await isolated.auth.updateUser(lost.uid,{disabled:true});
      expect(await recovery.apply(plan,{confirmDigest:plan.digest})).toMatchObject({state:'applied',revocationPending:[]});
      expect(await recovery.apply(plan,{confirmDigest:plan.digest})).toMatchObject({alreadyApplied:true});
      expect(await isolated.repository.exportSnapshot()).toEqual(before);
      const entered=(await signInWithCredential(auth,credential('next'))).user,newToken=await entered.getIdToken(true);
      recoveryServer=createProductionServer(isolated,{log:()=>{}});await new Promise(resolve=>recoveryServer.listen(0,'127.0.0.1',resolve));
      const call=async(route,token,body={})=>fetch(`http://127.0.0.1:${recoveryServer.address().port}${route}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
      expect([401,403]).toContain((await call('/identity',oldToken)).status);
      expect((await (await call('/identity',newToken)).json()).result.role).toBe('admin');
      expect((await call('/admin-recovery',newToken)).status).toBe(404);
      expect((await call('/commands',newToken,{command:'recoverAdmin',input:plan})).status).toBe(400);
      expect((await isolated.db.collection('_forx_security_audit').where('action','==','access.recovered').get()).size).toBe(1);
    } finally {if(recoveryServer)await new Promise(resolve=>recoveryServer.close(resolve));await isolated.db.terminate();await deleteClient(app);}
  },30000);
  test('regresiones de auditoría: 301 conceptos atómicos y original huérfano recuperable con SDK real',async()=>{
    const cfg={...runtime.config,databaseId:`forx-staging-volume-${suffix}`,originalsBucket:`forx-v2-volume-${suffix}`};
    const isolated=makeRuntime(cfg);
    try {
      await initializeEmptyInstance(isolated,{adminUid:uids.admin,confirmTarget:`${cfg.projectId}/${cfg.databaseId}`});
      const pantry=new PantryService(isolated.repository),uuid=crypto.randomUUID().toUpperCase();
      const large=file('301.xml',cfdiFixture({uuid,concepts:manyConcepts(301)}));
      expect((await pantry.importFiles([large],{period:'2026-09'})).counts.accepted).toBe(1);
      expect(await isolated.repository.list('purchase_events')).toHaveLength(301);
      expect(await isolated.repository.list('reviews')).toHaveLength(301);
      expect((await pantry.importFiles([large],{period:'2026-09'})).counts.duplicate).toBe(1);
      const originalStore=isolated.repository.originals,guard=isolated.repository.guardTransaction;let armed=false,failed=false;
      isolated.repository.originals={retain:async value=>{const metadata=await originalStore.retain(value);armed=true;return metadata;}};
      isolated.repository.guardTransaction=async tx=>{await guard(tx);if(armed&&!failed){failed=true;throw new Error('synthetic interruption after Storage');}};
      const retry=file('retry.xml',cfdiFixture({uuid:crypto.randomUUID().toUpperCase()}));
      await expect(pantry.importFiles([retry],{period:'2026-09'})).rejects.toThrow(/synthetic interruption/);
      const hash=createHash('sha256').update(retry.content).digest('hex'),path=`originals/xml_${hash}.xml`;
      const before=(await isolated.bucket.file(path).getMetadata())[0];
      expect((await pantry.importFiles([retry],{period:'2026-09'})).counts.accepted).toBe(1);
      const after=(await isolated.bucket.file(path).getMetadata())[0];
      expect(after.generation).toBe(before.generation);expect(after.metadata).toEqual(before.metadata);
      expect((await isolated.repository.get('originals',`xml_${hash}`)).expiresAt).toBe(before.metadata.expiresAt);
      expect(await isolated.repository.list('purchase_events')).toHaveLength(302);
    } finally {await isolated.db.terminate();}
  },30000);
  test('reserva monetaria Firestore bloquea una segunda llamada antes del proveedor; uso libera la retención',async()=>{
    const cfg={...runtime.config,databaseId:`forx-staging-budget-${suffix}`},isolated=makeRuntime(cfg);
    try {
      await initializeEmptyInstance(isolated,{adminUid:uids.admin,confirmTarget:`${cfg.projectId}/${cfg.databaseId}`});
      let announce,release,calls=0;
      const sent=new Promise(resolve=>announce=resolve),waiting=new Promise(resolve=>release=resolve);
      const fixture={id:'resp_budget_firestore',model:'fixture-model',service_tier:'default',status:'completed',
        usage:{input_tokens:100,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens:100,
          output_tokens_details:{reasoning_tokens:0},total_tokens:200},
        output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',
          text:JSON.stringify({name:'Agua de prueba',type:'agua',region:'',protein:'',baseServings:10,minutes:5,
            lines:[{name:'Agua',quantity:2,unit:'l'}],steps:['Mezclar.'],adaptations:[],warnings:[]})}]}]};
      const provider=createOpenAIRecipeTransport({apiKey:'FAKE_TEST_KEY_NEVER_REAL',model:'fixture-model',maxOutputTokens:2000,timeoutMs:1000,
        fetchImpl:async()=>{calls++;announce();await waiting;return new Response(JSON.stringify(fixture),{headers:{'content-type':'application/json'}});}});
      const budgetPolicy={approvalRef:'TEST_ONLY_0001',priceVersion:'TEST_RATE_0001',model:'fixture-model',maxInputTokens:40960,maxOutputTokens:2000,
        priceUSDPerMillion:{input:'1',cachedInput:'0.5',cacheWrite:'1.25',output:'5'},monthlyBudgetUSD:'0.10',dailyUserBudgetUSD:'0.10',
        perRequestBudgetUSD:'0.08',userDailyRequests:10,projectMonthlyRequests:100,concurrentRequests:2};
      const actor={uid:uids.admin,role:'admin'},clock=()=> '2026-10-05T12:00:00.000Z';
      const generator=()=>new RecipeGenerationService(isolated.repository,{actor,clock,provider,budgetPolicy});
      const input=()=>({requestId:crypto.randomUUID(),idea:'Agua para el comedor',type:'agua',protein:'',baseServings:'10',restrictions:'',preferredIngredientIds:[]});
      const first=generator().generate(input());await sent;
      await expect(generator().generate(input())).rejects.toThrow(/presupuesto diario/);
      expect(calls).toBe(1);
      expect((await isolated.repository.get('generation_quotas','month_2026-10')).budget.heldNanoUSD).toBe('61200000');
      release();expect((await first).status).toBe('completed');
      expect((await isolated.repository.get('generation_quotas','month_2026-10')).budget).toEqual({heldNanoUSD:'0',estimatedNanoUSD:'600000'});
    } finally {await isolated.db.terminate();}
  },30000);
  test('reglas de producción no permiten acceso directo, ni con claims admin de demo',async()=>{
    ruleEnv=await initializeTestEnvironment({projectId:'demo-forx-v2',firestore:{host:'127.0.0.1',port:8188,rules:await readFile('firestore.production.rules','utf8')},storage:{host:'127.0.0.1',port:9298,rules:await readFile('storage.production.rules','utf8')}});
    const client=ruleEnv.authenticatedContext('fake-admin',{forxActive:true,forxRole:'admin'});
    for(const collection of ['products','price_observations','originals','_forx_access','_forx_system','_forx_admin_recoveries','_forx_security_audit'])await assertFails(getDoc(doc(client.firestore(),collection,'test')));
    await assertFails(getBytes(ref(client.storage(),'originals/test.xml')));
  },20000);
});
