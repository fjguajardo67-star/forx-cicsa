import {test,expect} from 'vitest';
import {memoryFirestore,memoryBucket,config} from './fixtures/backend.js';
import {cfdiFixture,manyConcepts} from './fixtures/cfdi.js';
import {FirestoreEntityRepository} from '../src/server/firestore-entity-repository.js';
import {PrivateOriginals} from '../src/server/private-originals.js';
import {PantryService} from '../src/domain/pantry-service.js';
import {KitchenService} from '../src/domain/kitchen-service.js';
import {ConcurrentEditError} from '../src/data/entity-repository.js';
import {MAIN_SLOTS} from '../src/domain/menus.js';
import {boundedDecimal} from '../src/domain/bounded-decimal.js';
import {normalizePrice} from '../src/domain/units.js';
import {priceForPurchase} from '../src/domain/prices.js';
import {number} from '../src/domain/recipes.js';

const fixture=()=>{
  const memory=memoryFirestore(),bucket=memoryBucket(config);let tick=Date.parse('2026-10-05T12:00:00Z');
  const repository=new FirestoreEntityRepository(memory.db,{originals:new PrivateOriginals(bucket,{clock:()=>Date.parse('2026-10-05T12:00:00Z')})});
  return {...memory,bucket,repository,pantry:new PantryService(repository,{clock:()=>new Date(tick++).toISOString()})};
};
const xml=(concepts,uuid='11111111-2222-3333-4444-555555555555')=>({name:'fixture.xml',content:cfdiFixture({concepts,uuid})});
const nextXml=()=>xml(undefined,'22222222-2222-3333-4444-555555555555');
const menu=()=>({name:'Menú de prueba',startDate:'2026-10-05',diners:'10',days:[{date:'2026-10-05',contractLineId:'comida-completa',slots:MAIN_SLOTS.map(slot=>({...slot,recipeId:null}))}]});

test('H01: rechaza expansiones enormes y escala oculta sin redondear ni guardar',async()=>{
  const f=fixture();await f.pantry.initialize();
  const category=(await f.repository.list('categories')).find(c=>c.type==='culinary');
  const ingredient=await f.pantry.createIngredient({canonicalName:'Prueba',aliases:[],categoryId:category.id,baseUnit:'kg',wastePct:'0',wasteEffectiveFrom:'2026-09-01'});
  const before=await f.repository.exportSnapshot();
  for(const value of ['1e100000000','1e-100000000','1e10000','1e-10000','1e-33','9'.repeat(100000),{},[],NaN,Infinity,'0x10']) {
    expect(()=>boundedDecimal(value)).toThrow();expect(()=>number(value,'Cantidad')).toThrow();
    await expect(f.pantry.addManualPrice({ingredientId:ingredient.id,baseUnit:'kg',normalizedPrice:value,observedAt:'2026-10-05',sourceLabel:'Prueba'})).rejects.toThrow();
    expect(normalizePrice({purchasePrice:value,contentQuantity:'1',contentUnit:'kg',baseUnit:'kg'}).ok).toBe(false);
  }
  expect(await f.repository.exportSnapshot()).toEqual(before);
  for(const value of ['1e-6','1e-32','0.000000000001','1000000000000','1.2300000000000'])expect(boundedDecimal(value).toFixed().length).toBeLessThan(40);
  expect(number('0.3333333333333333','Cantidad recuperada')).toBe('0.3333333333333333');
  expect(boundedDecimal('0.12345678901234567890123456789012').toFixed()).toBe('0.12345678901234567890123456789012');
  expect(normalizePrice({purchasePrice:'10',contentQuantity:'1',contentUnit:'kg',baseUnit:'kg',moneyDecimals:100000000}).ok).toBe(false);
  expect(()=>priceForPurchase({currency:'MXN',observedAt:'2026-09-29T12:00:00',original:{cantidad:'1e100000000',importe:'10',descuento:'0',valor_unitario:'10'}},
    {ingredientId:ingredient.id,classification:'culinary'},ingredient)).toThrow(/inválidos/);
});

test.each([148,149,301])('H03: %i conceptos y siguiente XML se confirman completos',async count=>{
  const f=fixture(),result=await f.pantry.importFiles([xml(manyConcepts(count)),nextXml()],{period:'2026-09'});
  expect(result).toMatchObject({status:'complete',processed:2,counts:{accepted:2,failed:0}});
  expect(await f.repository.list('purchase_events')).toHaveLength(count+1);
  expect(await f.repository.list('reviews')).toHaveLength(count+1);
  expect(await f.repository.list('import_concepts')).toHaveLength(count+1);
  expect(f.bucket.objects.size).toBe(2);
});

test('H03: registro excesivo falla por archivo, sin original ni compras parciales; resto continúa',async()=>{
  const f=fixture(),huge=xml([{description:'x'.repeat(300000),sku:'BIG',quantity:'1',amount:'1',unitPrice:'1'}]);
  const result=await f.pantry.importFiles([huge,nextXml()],{period:'2026-09'});
  expect(result).toMatchObject({status:'complete',processed:2,counts:{failed:1,accepted:1}});
  expect(await f.repository.list('purchase_events')).toHaveLength(1);expect(f.bucket.objects.size).toBe(1);
  const failed=(await f.repository.list('imports')).find(x=>x.status==='failed');
  expect(failed).toMatchObject({originalId:null,errors:[{code:'PERSISTENCE_INPUT_LIMIT'}]});
  expect((await f.repository.list('audit')).some(a=>a.action==='import.failed')).toBe(true);
});

test('H03: UUID inválido va a cuarentena y no detiene los XML siguientes',async()=>{
  const f=fixture(),result=await f.pantry.importFiles([xml(undefined,'path/invalid'),nextXml()],{period:'2026-09'});
  expect(result).toMatchObject({processed:2,counts:{quarantine:1,accepted:1}});
  expect(await f.repository.list('purchase_events')).toHaveLength(1);
});

test('H03: presupuesto agregado rechaza el XML completo antes de escribir Storage',async()=>{
  const f=fixture(),result=await f.pantry.importFiles([xml(manyConcepts(2000)),nextXml()],{period:'2026-09'});
  expect(result).toMatchObject({processed:2,counts:{failed:1,accepted:1}});
  expect(await f.repository.list('purchase_events')).toHaveLength(1);
  expect(await f.repository.list('import_concepts')).toHaveLength(1);
  expect(f.bucket.objects.size).toBe(1);
});

test('H02: reintento tras fallo de transacción adopta original sin renovar sus dos meses',async()=>{
  const f=fixture(),run=f.db.runTransaction.bind(f.db);let failed=false;
  f.db.runTransaction=action=>{
    if(f.bucket.objects.size && !failed){failed=true;return Promise.reject(new Error('synthetic offline'));}
    return run(action);
  };
  await expect(f.pantry.importFiles([xml()],{period:'2026-09'})).rejects.toThrow(/offline/);
  expect(await f.repository.list('imports')).toHaveLength(0);
  const original=structuredClone([...f.bucket.objects.values()][0]);
  expect((await f.pantry.importFiles([xml()],{period:'2026-09'})).counts.accepted).toBe(1);
  expect(structuredClone([...f.bucket.objects.values()][0])).toEqual(original);
  const stored=(await f.repository.list('originals'))[0],record=(await f.repository.list('imports'))[0];
  expect(stored.uploadedAt).toBe(original.metadata.metadata.uploadedAt);
  expect(record.expiresAt).toBe(original.metadata.metadata.expiresAt);
  expect((await f.pantry.importFiles([xml()],{period:'2026-09'})).counts.duplicate).toBe(1);
  expect(await f.repository.list('purchase_events')).toHaveLength(1);
});

test('H02: concurrencia conserva una compra y un original; contenido adulterado no se adopta',async()=>{
  const f=fixture();
  await Promise.all([f.pantry.importFiles([xml()],{period:'2026-09'}),f.pantry.importFiles([xml()],{period:'2026-09'})]);
  expect(await f.repository.list('purchase_events')).toHaveLength(1);expect(f.bucket.objects.size).toBe(1);
  const original=(await f.repository.list('originals'))[0];
  f.bucket.objects.get(original.path).bytes=Buffer.from('changed');
  await expect(new PrivateOriginals(f.bucket,{clock:()=>Date.parse('2026-10-05')}).retain({...original,bytes:Buffer.from(xml().content)})).rejects.toThrow(/cambió/);
});

test('H02: rechaza metadata adulterada y cambios de generación durante la lectura',async()=>{
  const f=fixture();await f.pantry.importFiles([xml()],{period:'2026-09'});
  const original=(await f.repository.list('originals'))[0],value={...original,bytes:Buffer.from(xml().content)};
  const object=f.bucket.objects.get(original.path),expires=object.metadata.metadata.expiresAt;
  const originals=new PrivateOriginals(f.bucket,{clock:()=>Date.parse('2026-10-05')});
  object.metadata.metadata.expiresAt='2027-01-01T00:00:00.000Z';
  await expect(originals.retain(value)).rejects.toThrow(/retención/);
  object.metadata.metadata.expiresAt=expires;
  const file=f.bucket.file.bind(f.bucket);
  f.bucket.file=(path,options)=>{const target=file(path,options);return {...target,download:async()=>{
    const bytes=await target.download();object.metadata.metageneration='2';return bytes;
  }};};
  await expect(originals.retain(value)).rejects.toThrow(/cambió/);
});

test('H04: 1200 recetas no inflan la transacción del menú; protege revisiones seleccionadas',async()=>{
  const f=fixture();
  for(let i=0;i<1200;i++)f.records.set(`recipes/r${i}`,{id:`r${i}`,name:`Fixture ${i}`,type:'guisado',status:'active',protein:'pollo',_revision:1});
  const kitchen=new KitchenService(f.repository),input=menu();input.days[0].slots[0].recipeId='r0';
  const commit=f.repository.commit.bind(f.repository);let calls;
  f.repository.commit=async ops=>{calls=ops;return commit(ops);};
  const saved=await kitchen.saveMenu(input);
  expect(calls.filter(op=>op.collection==='recipes').map(op=>op.id)).toEqual(['r0']);
  const r=f.records.get('recipes/r0');f.repository.commit=async ops=>{f.records.set('recipes/r0',{...r,_revision:2});return commit(ops);};
  await expect(kitchen.saveMenu({...saved,expectedRevision:1})).rejects.toBeInstanceOf(ConcurrentEditError);
  expect((await f.repository.get('menus',saved.id))._revision).toBe(1);
});
