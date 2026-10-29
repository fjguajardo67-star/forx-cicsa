import { test, expect } from 'vitest';
import { initializeFromBackup } from '../src/server/initialize-from-backup.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { exportBackup } from '../src/domain/backup.js';
import { config, memoryFirestore } from './fixtures/backend.js';
import { FirestoreEntityRepository } from '../src/server/firestore-entity-repository.js';

async function fixture() {
  const local=new MemoryEntityRepository();
  await new PantryService(local).initialize();await new KitchenService(local).initialize();
  await new KitchenService(local).saveRecipe({name:'Receta recuperada',type:'guisado',baseServings:1,lines:[{name:'Sin precio',quantity:1,unit:'kg'}]});
  const backup=await exportBackup(local),{db,records}=memoryFirestore();
  const runtime={config:{...config,signInProvider:'google.com'},db,repository:new FirestoreEntityRepository(db),
    access:{eligibleUser:async()=>({uid:'admin'}),bootstrap:async uid=>{
      await db.collection('_forx_system').doc('access').set({adminCount:1});
      await db.collection('_forx_access').doc(uid).set({uid,role:'admin',active:true,revision:1});
    }}};
  return {runtime,records,source:JSON.stringify(backup),options:{adminUid:'admin',confirmTarget:`${config.projectId}/${config.databaseId}`,confirmChecksum:backup.checksum}};
}

test('inicializa destino vacío conservando registros, sin restaurar cuentas ni sobrescribir una base activa',async()=>{
  const {runtime,source,options}=await fixture();
  expect(await initializeFromBackup(runtime,source,options)).toMatchObject({state:'ready',originalsIncluded:false,identitiesIncluded:false});
  expect((await runtime.repository.list('recipes'))[0].name).toBe('Receta recuperada');
  const before=await runtime.repository.exportSnapshot();
  expect(await initializeFromBackup(runtime,source,options)).toMatchObject({alreadyInitialized:true});
  expect(await runtime.repository.exportSnapshot()).toEqual(before);
});

test('destino ocupado, checksum incorrecto o identidad no elegible fallan sin cargar datos',async()=>{
  for (const mode of ['occupied','checksum','identity']) {
    const {runtime,records,source,options}=await fixture();
    if(mode==='occupied')await runtime.db.collection('unknown').doc('existing').set({preserve:true});
    if(mode==='checksum')options.confirmChecksum='0'.repeat(64);
    if(mode==='identity')runtime.access.eligibleUser=async()=>{throw new Error('Cuenta no elegible');};
    const before=structuredClone([...records]);
    await expect(initializeFromBackup(runtime,source,options)).rejects.toThrow();
    expect([...records]).toEqual(before);
  }
});

test('una recuperación independiente no se convierte en producción cambiando un marcador',async()=>{
  const {runtime,source,options}=await fixture();runtime.config.environment='recovery';
  await expect(initializeFromBackup(runtime,source,options)).rejects.toThrow();
});
