import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { createEmulatorRuntime,assertEmulatorEnvironment } from '../../src/server/emulator-runtime.js';
import { createLocalCommandServer } from '../../src/server/local-http.js';
import { purchaseXml } from '../fixtures/monthly.js';
import { assertIsolatedVerification } from '../../scripts/emulator-launch.js';
import { createSimulatedRecipeProvider } from '../../src/domain/simulated-recipe-provider.js';

describe('bloqueo del servidor fuera de emuladores',()=>{
  it('rechaza proyecto real y hosts no locales antes de abrir SDK',()=>{
    expect(()=>assertEmulatorEnvironment({GCLOUD_PROJECT:'real-project'})).toThrow();
    expect(()=>assertEmulatorEnvironment({GCLOUD_PROJECT:'demo-forx-v2',FIRESTORE_EMULATOR_HOST:'remote:8180'})).toThrow();
  });
});
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('servidor real con Auth, Firestore y Storage emulados',()=>{
  let runtime,server,base,tokens={},saved;
  const origin='http://127.0.0.1:4174';
  async function request(command,input={},role='admin') {
    const response=await fetch(base+'/commands',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${tokens[role] || role}`},body:JSON.stringify({command,input})});
    return {status:response.status,...await response.json()};
  }
  beforeAll(async()=>{
    // Refuse shared ports/temp roots before ANY write or fixture cleanup.
    assertIsolatedVerification();
    assertEmulatorEnvironment();
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-forx-v2/databases/(default)/documents`,{method:'DELETE'});
    runtime=await createEmulatorRuntime();
    for(const role of ['admin','editor','viewer','inactive']){
      const uid=`test-${role}-${crypto.randomUUID()}`,email=`${uid}@forx.invalid`,password=crypto.randomUUID();
      await runtime.auth.createUser({uid,email,password});
      await runtime.auth.setCustomUserClaims(uid,{forxActive:role!=='inactive',forxRole:role==='inactive'?'admin':role});
      const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
      tokens[role]=(await response.json()).idToken;
    }
    server=createLocalCommandServer(runtime,{generationProvider:createSimulatedRecipeProvider()});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  },30000);
  afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await runtime?.close();});
  it('verifica tokens y roles, no acepta autoridad enviada por el navegador',async()=>{
    expect((await request('kitchenSnapshot',{},'forged')).status).toBe(401);
    expect((await request('kitchenSnapshot',{},'inactive')).status).toBe(403);
    expect((await request('saveRecipe',{actor:{role:'admin'}},'viewer')).status).toBe(403);
    expect((await request('kitchenSnapshot',{},'viewer')).status).toBe(200);
    const response=await fetch(base+'/commands',{method:'POST',headers:{Origin:'https://example.invalid'},body:'{}'});expect(response.status).toBe(403);
  });
  it('ingiere XML en servidor, separa bytes privados y conserva fecha de retención',async()=>{
    const content='\uFEFF'+purchaseXml({uuid:'AAAAAAAA-2222-3333-4444-555555555555',concepts:[{description:'JITOMATE CAJA',sku:'JT',quantity:'1',unit:'XBX',unitPrice:'360',amount:'360'}]});
    const response=await request('importXML',{period:'2026-09',files:[{name:'sintetico.xml',bytesBase64:Buffer.from(content).toString('base64')}]});
    expect(response.status,JSON.stringify(response)).toBe(200);expect(response.result.counts.accepted).toBe(1);
    const originals=await runtime.repository.list('originals');expect(originals).toHaveLength(1);expect(originals[0].bytes).toBeUndefined();
    const [bytes]=await runtime.bucket.file(originals[0].path).download();expect(bytes.toString()).toBe(content);
    const [metadata]=await runtime.bucket.file(originals[0].path).getMetadata();expect(metadata.metadata.expiresAt).toBe(originals[0].expiresAt);
    expect((await request('importXML',{period:'2026-09',files:[{name:'duplicado.xml',content}]})).result.counts.duplicate).toBe(1);
  },20000);
  it('dos editores no sobrescriben receta; costos y actor se recalculan en servidor',async()=>{
    const result=await request('saveRecipe',{name:'Receta servidor',type:'guisado',baseServings:'1',lines:[{name:'Pendiente',quantity:'100',unit:'g'}],cost:0,updatedBy:'forged'});
    expect(result.status,JSON.stringify(result)).toBe(200);saved=result.result;expect(saved.updatedBy).not.toBe('forged');
    const edits=await Promise.all([request('saveRecipe',{...saved,name:'Primera edición',expectedRevision:saved._revision}),request('saveRecipe',{...saved,name:'Segunda edición',expectedRevision:saved._revision})]);
    expect(edits.map(r=>r.status).sort()).toEqual([200,409]);
    const state=(await request('kitchenSnapshot')).result;expect(state.recipeCosts[saved.id].total).toBeNull();
    expect(await runtime.repository.list('recipe_versions')).toHaveLength(2);
    expect((await request('saveKitchenSettings',{...state.settings,expectedRevision:state.settings._revision},'editor')).status).toBe(400);
  },20000);
  it('carga 32 XML del mes aceptado por HTTP y conserva sus originales privados',async()=>{
    const files=Array.from({length:32},(_,index)=>({name:`septiembre-sintetico-${index+1}.xml`,content:purchaseXml({uuid:crypto.randomUUID().toUpperCase(),day:`2026-09-${String(index%28+1).padStart(2,'0')}`})}));
    const before=(await runtime.repository.list('purchase_events')).length;
    const result=await request('importXML',{period:'2026-09',files});
    expect(result.status,JSON.stringify(result)).toBe(200);
    expect(result.result).toMatchObject({status:'complete',processed:32,counts:{accepted:32,failed:0}});
    expect(await runtime.repository.list('purchase_events')).toHaveLength(before+32);
    const originals=await runtime.repository.list('originals');
    for(const original of originals){const [bytes]=await runtime.bucket.file(original.path).download();expect(bytes.length).toBeGreaterThan(0);}
    expect((await request('snapshot')).status).toBe(200);
    const blocked=await request('importXML',{period:'2026-10',files:[{name:'agosto-bloqueado.xml',content:purchaseXml({uuid:crypto.randomUUID().toUpperCase(),day:'2026-08-01'})}]});
    expect(blocked.result.counts.blocked).toBe(1);
    expect(await runtime.repository.list('purchase_events')).toHaveLength(before+32);
    expect(await runtime.repository.list('originals')).toHaveLength(originals.length);
  },30000);
  it('simulador HTTP autenticado: idempotencia, privacidad, borrador y costos pendientes',async()=>{
    const input={requestId:crypto.randomUUID(),idea:'Probar generador',type:'guisado',baseServings:'10',protein:'',restrictions:'',preferredIngredientIds:[]};
    expect((await request('generateRecipeProposal',input,'viewer')).status).toBe(403);
    expect((await request('generateRecipeProposal',{...input,model:'injected'},'editor')).status).toBe(400);
    const count=(await runtime.repository.list('recipes')).length;
    const responses=await Promise.all([request('generateRecipeProposal',input,'editor'),request('generateRecipeProposal',input,'editor')]);
    expect(responses.map(r=>r.status)).toEqual([200,200]);
    const reply=(await request('recipeProposalStatus',{requestId:input.requestId},'editor')).result;expect(reply.status).toBe('completed');
    expect(await runtime.repository.list('generation_requests')).toHaveLength(1);expect(await runtime.repository.list('recipes')).toHaveLength(count);
    expect((await request('recipeProposalStatus',{requestId:input.requestId},'admin')).status).toBe(400);
    const saved=await request('saveRecipe',{...reply.proposal.recipe,generationRequestId:reply.generationRequestId,proposalReviewed:true,status:'active'},'editor');
    expect(saved.status,JSON.stringify(saved)).toBe(200);expect(saved.result.status).toBe('draft');expect(saved.result.generation.provider).toBe('simulated');
    const view=(await request('kitchenSnapshot',{},'viewer')).result;expect(view.generation.enabled).toBe(false);expect(view.recipeCosts[saved.result.id].total).toBeNull();expect(view).not.toHaveProperty('generation_requests');
    const backup=(await request('exportBackup')).result;expect(backup.version).toBe(3);expect(backup.collections.generation_requests).toHaveLength(1);
    expect(backup.collections.generation_requests[0]).toMatchObject({context:null,proposal:null});
  },20000);
});
