import { test,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { backendFixture,config,instance } from './fixtures/backend.js';
import { originalExpiresAt } from '../src/domain/retention.js';
import { OriginalRetention } from '../src/server/original-retention.js';
import { PrivateOriginals } from '../src/server/private-originals.js';
import { createServerBackup,restoreServerBackup } from '../src/server/server-backups.js';
import { initializeEmptyInstance } from '../src/server/initialize-instance.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { backupDigest } from '../src/domain/backup.js';
import { runScheduledMaintenance } from '../src/server/scheduled-maintenance.js';

async function object(f,text,uploadedAt,{tracked=true}={}) {
  const bytes=Buffer.from(text),hash=createHash('sha256').update(bytes).digest('hex'),id=`xml_${hash}`,path=`originals/${id}.xml`,expiresAt=originalExpiresAt(uploadedAt);
  await f.runtime.bucket.file(path).save(bytes,{metadata:{metadata:{sha256:hash,uploadedAt,expiresAt}}});
  const record={id,hash,path,uploadedAt,expiresAt,status:'retained',_revision:1};
  if(tracked)await f.runtime.db.collection('originals').doc(id).set(record);return record;
}
async function ready() {const f=backendFixture();await f.runtime.db.collection('_forx_system').doc('instance').set(instance(config));return f;}
test('retención: vista previa exacta, dos meses naturales, huérfanos y derivados intactos',async()=>{
  const f=await ready();const expired=await object(f,'<synthetic expired/>','2026-08-05T12:00:00.000Z');
  const orphan=await object(f,'<synthetic orphan/>','2026-08-01T00:00:00.000Z',{tracked:false});
  const future=await object(f,'<synthetic future/>','2026-08-05T12:00:00.001Z');
  await f.runtime.bucket.file('originals/unknown.xml').save(Buffer.from('<unknown/>'));
  await f.runtime.db.collection('purchase_events').doc('keep').set({id:'keep',privateDerived:'not deleted'});
  const worker=new OriginalRetention(f.runtime,{clock:()=> '2026-10-05T12:00:00.000Z'}),plan=await worker.preview();
  expect(plan.items.map(x=>x.id).sort()).toEqual([expired.id,orphan.id].sort());
  expect(plan.skipped).toEqual([{id:'originals/unknown.xml',reason:'unverifiable_metadata'}]);
  expect(f.runtime.bucket.objects.size).toBe(4); // Preview is read-only.
  await expect(worker.apply(plan,{confirmDigest:'wrong'})).rejects.toThrow();
  expect(await worker.apply(plan,{confirmDigest:plan.digest})).toEqual({expired:1,orphans:1,alreadyDone:0,failed:0});
  expect(f.runtime.bucket.objects.has(future.path)).toBe(true);expect(f.runtime.bucket.objects.size).toBe(2);
  expect((await f.runtime.db.collection('originals').doc(expired.id).get()).data()).toMatchObject({status:'expired',path:null,bytes:null});
  expect((await f.runtime.db.collection('purchase_events').doc('keep').get()).data()).toMatchObject({privateDerived:'not deleted'});
  expect((await worker.apply(plan,{confirmDigest:plan.digest})).alreadyDone).toBe(2);
  expect((await f.runtime.db.collection('audit').get()).size).toBe(2);
});
test('retención: generación o metadatos cambiados no se borran; selección futura tampoco',async()=>{
  const f=await ready(),record=await object(f,'<old/>','2026-08-01T00:00:00.000Z');
  const worker=new OriginalRetention(f.runtime,{clock:()=> '2026-10-05T12:00:00.000Z'}),plan=await worker.preview();
  f.runtime.bucket.objects.get(record.path).metadata.generation='999';
  expect((await worker.apply(plan,{confirmDigest:plan.digest})).failed).toBe(1);expect(f.runtime.bucket.objects.has(record.path)).toBe(true);
  const fresh=await worker.preview();fresh.items[0].uploadedAt='2026-10-04T00:00:00.000Z';fresh.items[0].expiresAt=originalExpiresAt(fresh.items[0].uploadedAt);
  const {digest,...payload}=fresh;fresh.digest=await backupDigest(payload);
  await expect(worker.apply(fresh,{confirmDigest:fresh.digest})).rejects.toThrow(/no vencida/);
});
test('retención: fallo tras borrar se recupera con el mismo plan sin borrar sustitutos ni duplicar auditoría',async()=>{
  const f=await ready(),record=await object(f,'<retry/>','2026-08-01T00:00:00.000Z');
  const worker=new OriginalRetention(f.runtime,{clock:()=> '2026-10-05T12:00:00.000Z'}),plan=await worker.preview();
  const run=f.runtime.db.runTransaction.bind(f.runtime.db);let calls=0;
  f.runtime.db.runTransaction=async action=>{if(++calls===2)throw new Error('firestore interruption');return run(action);};
  expect((await worker.apply(plan,{confirmDigest:plan.digest})).failed).toBe(1);expect(f.runtime.bucket.objects.has(record.path)).toBe(false);
  f.runtime.db.runTransaction=run;
  const retryPlan=await worker.preview();expect(retryPlan.items).toHaveLength(1);
  expect((await worker.apply(retryPlan,{confirmDigest:retryPlan.digest})).expired).toBe(1);
  expect((await f.runtime.db.collection('audit').get()).size).toBe(1);
});

test('tareas programables desactivadas por defecto, sin registrar cron ni ejecutar sin aprobación',async()=>{
  const f=await ready();await expect(runScheduledMaintenance(f.runtime,'retention')).rejects.toThrow(/no aprobada/);
  expect((await f.runtime.db.collection('_forx_jobs').get()).empty).toBe(true);
  f.runtime.config={...config,maintenance:{retentionEnabled:true,approvedBy:'synthetic-admin',approvedAt:new Date().toISOString()}};
  const logs=[],result=await runScheduledMaintenance(f.runtime,'retention',{log:item=>logs.push(item)});
  expect(result.failed).toBe(0);expect(logs[0]).toMatchObject({event:'job.completed',kind:'retention'});
});
test('originales: no renovar retención de objeto existente ni reintroducir un original vencido',async()=>{
  const f=await ready(),record=await object(f,'<same/>','2026-08-01T00:00:00.000Z');
  const store=new PrivateOriginals(f.runtime.bucket,{clock:()=>Date.parse('2026-09-01T00:00:00Z')});
  await store.retain({...record,bytes:Buffer.from('<same/>')});
  const before=structuredClone(f.runtime.bucket.objects.get(record.path));
  await expect(store.retain({...record,bytes:Buffer.from('<same/>'),uploadedAt:'2026-09-01T00:00:00.000Z',expiresAt:'2026-11-01T00:00:00.000Z'})).resolves.toEqual({uploadedAt:record.uploadedAt,expiresAt:record.expiresAt});
  expect(structuredClone(f.runtime.bucket.objects.get(record.path))).toEqual(before);
  await expect(new PrivateOriginals(f.runtime.bucket,{clock:()=>Date.parse('2026-10-05T00:00:00Z')}).retain({...record,bytes:Buffer.from('<same/>')})).rejects.toThrow(/vencimiento/);
});
test('respaldo servidor privado y restauración aislada conserva IDs/revisiones/costos, sin cuentas ni XML',async()=>{
  const source=backendFixture();source.user('admin');await initializeEmptyInstance(source.runtime,{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`});
  const kitchen=new KitchenService(source.runtime.repository),recipe=await kitchen.saveRecipe({name:'Sopa de prueba',type:'guisado',baseServings:1,lines:[{name:'Jitomate pendiente',quantity:100,unit:'g'}]});
  await object(source,'<not included/>','2026-10-05T00:00:00.000Z');
  const receipt=await createServerBackup(source.runtime,{now:'2026-10-05T12:00:00.000Z'});
  const bytes=(await source.runtime.backupsBucket.file(receipt.path).download())[0],artifact=JSON.parse(bytes);
  expect(bytes.toString()).not.toContain('<not included/>');expect(bytes.toString()).not.toContain('_forx_access');
  const target=backendFixture({...config,environment:'recovery',databaseId:'forx-recovery-test'});
  const before=await source.runtime.repository.exportSnapshot();
  const result=await restoreServerBackup(target.runtime,artifact,{confirmChecksum:artifact.backup.checksum});
  expect(result).toMatchObject({state:'recovered',publicAccess:false});
  expect((await target.runtime.repository.get('recipes',recipe.id))._revision).toBe(recipe._revision);
  expect((await new KitchenService(target.runtime.repository).snapshot()).recipeCosts[recipe.id]).toEqual((await kitchen.snapshot()).recipeCosts[recipe.id]);
  expect((await target.runtime.repository.list('originals'))[0]).toMatchObject({bytes:null,path:null,status:'not_included'});
  expect((await target.runtime.db.collection('_forx_access').get()).empty).toBe(true);
  expect(await source.runtime.repository.exportSnapshot()).toEqual(before);
  await expect(restoreServerBackup(source.runtime,artifact,{confirmChecksum:artifact.backup.checksum})).rejects.toThrow(/separado/);
  expect((await restoreServerBackup(target.runtime,artifact,{confirmChecksum:artifact.backup.checksum})).state).toBe('recovered');
});
test('restauración: rechaza destino ocupado, checksum corrupto y no sobreescribe registros divergentes',async()=>{
  const source=backendFixture();source.user('admin');await initializeEmptyInstance(source.runtime,{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`});
  const receipt=await createServerBackup(source.runtime),artifact=JSON.parse((await source.runtime.backupsBucket.file(receipt.path).download())[0]);
  const target=backendFixture({...config,environment:'recovery',databaseId:'forx-recovery-test'});
  await target.runtime.db.collection('products').doc('existing').set({keep:true});
  await expect(restoreServerBackup(target.runtime,artifact,{confirmChecksum:artifact.backup.checksum})).rejects.toThrow(/no está vacío/);
  expect((await target.runtime.db.collection('products').doc('existing').get()).data()).toEqual({keep:true});
  const empty=backendFixture({...config,environment:'recovery',databaseId:'forx-recovery-empty'});
  const corrupted=structuredClone(artifact);corrupted.backup.collections.categories=[];
  await expect(restoreServerBackup(empty.runtime,corrupted,{confirmChecksum:artifact.backup.checksum})).rejects.toThrow(/integridad/);
  await restoreServerBackup(empty.runtime,artifact,{confirmChecksum:artifact.backup.checksum});
  await empty.runtime.db.collection('categories').doc(artifact.backup.collections.categories[0].id).set({changed:true});
  await expect(restoreServerBackup(empty.runtime,artifact,{confirmChecksum:artifact.backup.checksum})).rejects.toThrow(/diferente/);
});
