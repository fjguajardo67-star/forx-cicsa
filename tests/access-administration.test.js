import {test,expect,vi} from 'vitest';
import {backendFixture,config} from './fixtures/backend.js';
import {createAccessClient} from '../src/data/access-client.js';

async function setup(){const f=backendFixture({...config,signInProvider:'google.com'});for(const uid of ['admin','other','reader'])f.user(uid);await f.runtime.access.bootstrap('admin');return f;}
test('consulta de UID solo por admin; verifica Google/correo y no crea permisos',async()=>{
  const f=await setup(),service=f.runtime.access;
  const before=structuredClone([...f.records]);
  expect(await service.lookup({uid:'admin'},{uid:'other'})).toMatchObject({uid:'other',email:'other@forx.invalid',membership:null});
  expect([...f.records]).toEqual(before);
  const read=vi.spyOn(f.runtime.auth,'getUser');
  await expect(service.lookup({uid:'reader'},{uid:'other'})).rejects.toMatchObject({status:403});expect(read).not.toHaveBeenCalled();
  for(const input of [{uid:'../wrong'},{uid:'other',email:'x'},{}])await expect(service.lookup({uid:'admin'},input)).rejects.toMatchObject({status:400});
  for(const patch of [{emailVerified:false},{disabled:true},{providerData:[{providerId:'password'}]}]){
    f.user('other');Object.assign(f.users.get('other'),patch);
    await expect(service.lookup({uid:'admin'},{uid:'other'})).rejects.toMatchObject({status:400});
    await expect(service.update({uid:'admin'},{uid:'other',role:'viewer',active:true,expectedRevision:null})).rejects.toMatchObject({status:400});
  }
});
test('alta comprobada, edición, desactivación y reactivación mantienen revisión y auditoría',async()=>{
  const f=await setup(),s=f.runtime.access,actor={uid:'admin'};
  for(const [role,active,revision] of [['viewer',true,null],['editor',true,1],['editor',false,2],['viewer',true,3]]){
    const result=await s.update(actor,{uid:'other',role,active,expectedRevision:revision});expect(result).toMatchObject({role,active,revision:(revision||0)+1,sessionRevocationPending:false});
  }
  expect((await s.lookup(actor,{uid:'other'})).membership.revision).toBe(4);
  expect([...f.records].filter(([path])=>path.startsWith('_forx_security_audit/'))).toHaveLength(5);
  const before=structuredClone([...f.records]);
  await expect(s.update(actor,{uid:'other',role:'admin',active:true,expectedRevision:1})).rejects.toMatchObject({status:409});
  expect([...f.records]).toEqual(before);
});
test('dos cambios simultáneos no retiran al último administrador y un rol revocado no modifica',async()=>{
  const f=await setup(),s=f.runtime.access;
  await s.update({uid:'admin'},{uid:'other',role:'admin',active:true,expectedRevision:null});
  const results=await Promise.allSettled(['admin','other'].map(uid=>s.update({uid},{uid,role:'viewer',active:true,expectedRevision:1})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(f.records.get('_forx_system/access').adminCount).toBe(1);
  const revoked=['admin','other'].find(uid=>f.records.get('_forx_access/'+uid).role==='viewer');
  await expect(s.update({uid:revoked},{uid:'reader',role:'admin',active:true,expectedRevision:null})).rejects.toMatchObject({status:403});
});
test('desactivar sigue disponible cuando Auth se deshabilitó; fallo de revocación no oculta cambio',async()=>{
  const f=await setup(),s=f.runtime.access;
  await s.update({uid:'admin'},{uid:'other',role:'viewer',active:true,expectedRevision:null});
  f.users.get('other').disabled=true;f.runtime.auth.revokeRefreshTokens=async()=>{throw new Error('private');};
  expect(await s.update({uid:'admin'},{uid:'other',role:'viewer',active:false,expectedRevision:1})).toMatchObject({active:false,sessionRevocationPending:true});
  expect(f.records.get('_forx_access/other').active).toBe(false);
  await expect(s.update({uid:'admin'},{uid:'reader',role:'viewer',active:false,expectedRevision:null})).rejects.toMatchObject({status:400});
});
test('adaptador solo usa rutas autenticadas explícitas, sin enviar correo ni actor',async()=>{
  const api={request:vi.fn(async()=>[])},client=createAccessClient(api);
  await client.list();await client.lookup('target');await client.update({uid:'target',role:'viewer',active:true,expectedRevision:null});
  expect(api.request.mock.calls).toEqual([['/access/list'],['/access/lookup',{uid:'target'}],['/access/update',{uid:'target',role:'viewer',active:true,expectedRevision:null}]]);
});
