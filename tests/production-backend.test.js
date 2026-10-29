import { test,expect } from 'vitest';
import { deploymentConfig,requireCloudApproval,assertBucketPolicy } from '../src/server/deployment-config.js';
import { initializeEmptyInstance } from '../src/server/initialize-instance.js';
import { RequestLimits } from '../src/server/request-limits.js';
import { config,backendFixture,bucketPolicy } from './fixtures/backend.js';
import { createCloudRuntime } from '../src/server/cloud-runtime.js';

test('configuración cloud rechaza destinos ajenos, emuladores, orígenes inseguros y credenciales locales antes del SDK',async()=>{
  expect(deploymentConfig(config,{})).toMatchObject(config);
  expect(deploymentConfig(config,{}).maintenance).toEqual({retentionEnabled:false,backupsEnabled:false,generationTextRetentionEnabled:false});
  expect(()=>deploymentConfig({...config,maintenance:{retentionEnabled:true}},{})).toThrow(/aprobación/);
  for(const change of [{projectId:'other-project'},{databaseId:'(default)'},{backupsBucket:config.originalsBucket},{origins:['http://localhost:4174']},{origins:['https://forx.example/path']},{signInProvider:'anonymous'},{limits:{}}])expect(()=>deploymentConfig({...config,...change},{})).toThrow();
  expect(()=>deploymentConfig(config,{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180'})).toThrow();
  await expect(createCloudRuntime(config,{env:{}})).rejects.toThrow(/activación/);
  const approval={FORX_ENABLE_CLOUD:'true',FORX_APPROVED_TARGET:`${config.projectId}/${config.databaseId}`};
  expect(()=>requireCloudApproval(config,approval)).toThrow(/identidad administrada/);
  expect(()=>requireCloudApproval(config,{...approval,K_SERVICE:'test',GOOGLE_APPLICATION_CREDENTIALS:'do-not-read.json'})).toThrow();
  expect(()=>requireCloudApproval(config,{...approval,K_SERVICE:'test'})).not.toThrow();
});
test('política de originales exige privacidad y rechaza retención adicional, versiones y soft delete',()=>{
  expect(()=>assertBucketPolicy(bucketPolicy(config,'originals'),config,'originals')).not.toThrow();
  for(const change of [{versioning:{enabled:true}},{softDeletePolicy:{retentionDurationSeconds:'604800'}},{retentionPolicy:{retentionPeriod:'86400'}},{labels:{}},{iamConfiguration:{publicAccessPrevention:'inherited'}}])
    expect(()=>assertBucketPolicy({...bucketPolicy(config,'originals'),...change},config,'originals')).toThrow();
});
test('inicialización explícita, acceso vigente, roles y revocación no dependen de claims antiguos',async()=>{
  const f=backendFixture();f.user('admin');f.user('editor');
  await expect(initializeEmptyInstance(f.runtime,{adminUid:'admin',confirmTarget:'wrong'})).rejects.toThrow();
  await initializeEmptyInstance(f.runtime,{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`});
  await expect(initializeEmptyInstance(f.runtime,{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`})).rejects.toThrow();
  expect((await f.runtime.access.authenticate('admin')).actor.role).toBe('admin');
  await expect(f.runtime.access.authenticate('editor')).rejects.toMatchObject({status:403});
  const change=await f.runtime.access.update({uid:'admin'},{uid:'editor',active:true,role:'editor',expectedRevision:null});
  expect(change.revision).toBe(1);expect(f.revoked).toEqual(['editor']);
  expect((await f.runtime.access.authenticate('editor')).actor.role).toBe('editor');
  await expect(f.runtime.access.update({uid:'editor'},{uid:'editor',active:true,role:'admin',expectedRevision:1})).rejects.toMatchObject({status:403});
  await f.runtime.access.update({uid:'admin'},{uid:'editor',active:false,role:'editor',expectedRevision:1});
  await expect(f.runtime.access.authenticate('editor')).rejects.toMatchObject({status:403});
  expect((await f.runtime.access.list({uid:'admin'})).length).toBe(2);
});
test('rechaza administrador del proveedor equivocado antes de crear datos de instancia',async()=>{
  const googleConfig={...config,signInProvider:'google.com'};
  const f=backendFixture(googleConfig);f.user('admin');
  f.users.get('admin').providerData=[{providerId:'password'}];
  const target=`${googleConfig.projectId}/${googleConfig.databaseId}`;
  await expect(initializeEmptyInstance(f.runtime,{adminUid:'admin',confirmTarget:target})).rejects.toMatchObject({status:400});
  expect(f.records.size).toBe(0);
  await expect(f.runtime.access.bootstrap('admin')).rejects.toMatchObject({status:400});
  expect(f.records.size).toBe(0);
  f.users.get('admin').providerData=[{providerId:'google.com'}];
  await expect(initializeEmptyInstance(f.runtime,{adminUid:'admin',confirmTarget:target})).resolves.toMatchObject({state:'ready'});
});
test('protege último administrador, revisión obsoleta y cuentas no verificadas/deshabilitadas',async()=>{
  const f=backendFixture();f.user('admin');
  await f.runtime.access.bootstrap('admin');
  await expect(f.runtime.access.update({uid:'admin'},{uid:'admin',active:false,role:'admin',expectedRevision:1})).rejects.toMatchObject({status:409});
  await expect(f.runtime.access.update({uid:'admin'},{uid:'admin',active:true,role:'admin',expectedRevision:2})).rejects.toMatchObject({status:409});
  f.users.get('admin').emailVerified=false;await expect(f.runtime.access.authenticate('admin')).rejects.toMatchObject({status:403});
  f.users.get('admin').emailVerified=true;f.users.get('admin').disabled=true;await expect(f.runtime.access.authenticate('admin')).rejects.toMatchObject({status:403});
});
test('límites compartidos entre procesos y reinicio por minuto, sin IP o token persistidos',async()=>{
  const {runtime,records}=backendFixture();let now=0;
  const limits={globalMinute:3,perUserMinute:2};
  const a=new RequestLimits(runtime.db,limits,{clock:()=>now}),b=new RequestLimits(runtime.db,limits,{clock:()=>now});
  await Promise.all([a.reserve('one'),b.reserve('one')]);await expect(a.reserve('one')).rejects.toMatchObject({status:429});
  await b.reserve('two');await expect(b.reserve('three')).rejects.toMatchObject({status:429});
  now=60000;await a.reserve('one');
  expect(JSON.stringify([...records])).not.toContain('one');
});
