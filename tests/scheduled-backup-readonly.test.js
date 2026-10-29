import {test,expect} from 'vitest';
import {backendFixture,config} from './fixtures/backend.js';
import {initializeEmptyInstance} from '../src/server/initialize-instance.js';
import {runScheduledMaintenance} from '../src/server/scheduled-maintenance.js';

test('el respaldo programado funciona sin permiso para escribir en Firestore',async()=>{
  const fixture=backendFixture({...config,maintenance:{backupsEnabled:true,approvedBy:'test',approvedAt:'2026-10-29T00:00:00Z'}});
  fixture.user('admin');
  await initializeEmptyInstance(fixture.runtime,{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`});
  const before=structuredClone([...fixture.records]);
  const original=fixture.runtime.db.collection;
  fixture.runtime.db.collection=name=>{
    const collection=original(name),doc=collection.doc;
    return {...collection,doc:id=>({...doc(id),set:async()=>{throw new Error('Firestore identity is read-only');}})};
  };
  const logs=[];
  const result=await runScheduledMaintenance(fixture.runtime,'backup',{log:event=>logs.push(event)});
  expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(logs).toContainEqual(expect.objectContaining({event:'job.completed',kind:'backup'}));
  expect([...fixture.records]).toEqual(before);
});
