import { test, expect } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { priceEvidenceMarkup } from '../src/ui/forx/price-evidence-view.js';
import { ingredientInput, productInput, purchaseXml, file } from './fixtures/monthly.js';

async function setup(sku='JT-12') {
  const repository=new MemoryEntityRepository();let now='2026-10-02T12:00:00.000Z';
  const pantry=new PantryService(repository,{clock:()=>now}),kitchen=new KitchenService(repository);
  await pantry.initialize();await kitchen.initialize();
  const ingredient=await pantry.createIngredient(ingredientInput);
  await pantry.importFiles([file('compra.xml',purchaseXml({concepts:[{description:'JITOMATE CAJA',sku,quantity:'2',unit:'XBX',unitPrice:'384',amount:'768',discount:'48'}]}))],{period:'2026-09'});
  const event=(await pantry.snapshot()).purchase_events[0];
  await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});
  const price=await pantry.validatePrice(event.id);
  const input={ingredientId:ingredient.id,observationId:price.id};
  return {repository,pantry,kitchen,ingredient,event,price,input,setNow:value=>now=value};
}

test('origen une ingrediente, observación, producto y compra exactos con cálculo neto guardado',async()=>{
  const {kitchen,ingredient,event,price,input}=await setup();
  const state=await kitchen.snapshot(),proof=await kitchen.priceEvidence(input);
  expect(state.priceSources[ingredient.id]).toMatchObject({observationId:price.id,eventId:event.id,productId:event.productId,supplierSku:'JT-12'});
  expect(proof.purchase).toMatchObject({cfdiUuid:event.cfdiUuid,quantity:'2',amount:'768',discount:'48',supplierRfc:'PRO010101AAA'});
  expect(proof.calculation).toMatchObject({netAmount:'720',packageCount:'2',contentQuantity:'12',baseQuantity:'24',usableQuantity:'21.6',wastePct:'10',normalizedPrice:'33.3333'});
  expect(proof.validation.reviewedBy).toBe('local-operator');
  expect(JSON.stringify(proof)).not.toMatch(/Sello|bytes|originalId|storagePath|xml_sha256|receptor/);
});

test('varios SKU/proveedores: elige el que originó el precio, no una compra posterior sin validar',async()=>{
  const {pantry,kitchen,ingredient,event,input}=await setup();
  const uuid='22222222-2222-3333-4444-555555555555';
  const xml=purchaseXml({uuid,day:'2026-09-28',concepts:[{description:'JITOMATE BOLSA',sku:'OTRO-3',quantity:'1',unit:'XPK',unitPrice:'90',amount:'90'}]}).replace('PRO010101AAA','OTR010101AAA');
  await pantry.importFiles([file('posterior.xml',xml)],{period:'2026-09'});
  const other=(await pantry.snapshot()).purchase_events.find(e=>e.cfdiUuid===uuid);
  await pantry.saveProduct(other.id,{...productInput,contentQuantity:'3',ingredientId:ingredient.id});
  expect((await kitchen.priceEvidence(input)).source.eventId).toBe(event.id);
  expect((await kitchen.snapshot()).priceSources[ingredient.id].supplierSku).toBe('JT-12');
  const next=await pantry.validatePrice(other.id);
  await expect(kitchen.priceEvidence(input)).rejects.toThrow(/cambió/);
  const proof=await kitchen.priceEvidence({...input,observationId:next.id});
  expect(proof.purchase).toMatchObject({supplierSku:'OTRO-3',supplierRfc:'OTR010101AAA',cfdiUuid:uuid});
});

test('vencimiento del XML no borra referencia ni fórmula; precio manual no tiene origen validado',async()=>{
  const {repository,pantry,kitchen,input,setNow,ingredient}=await setup();
  const before=await kitchen.priceEvidence(input);
  setNow('2026-12-02T12:00:00.000Z');await pantry.expireLocalOriginals();
  expect((await repository.list('originals'))[0].bytes).toBeNull();
  expect(await kitchen.priceEvidence(input)).toEqual(before);
  const manual=await pantry.createIngredient({...ingredientInput,canonicalName:'Manual',aliases:[]});
  await pantry.addManualPrice({ingredientId:manual.id,baseUnit:'kg',observedAt:'2026-10-02',sourceLabel:'Prueba',normalizedPrice:'45'});
  expect((await kitchen.snapshot()).priceSources[manual.id]).toBeNull();
  await expect(kitchen.priceEvidence({...input,ingredientId:manual.id})).rejects.toThrow(/vigente/);
  expect(before.ingredient.id).toBe(ingredient.id);
});

test('sin SKU no se inventa identificador y la vista escapa textos de evidencia',async()=>{
  const {kitchen,input}=await setup(null);
  const proof=await kitchen.priceEvidence(input);
  expect(proof.source.supplierSku).toBeNull();
  proof.purchase.description='<img src=x onerror=alert(1)>';
  const html=priceEvidenceMarkup(proof);
  expect(html).toContain('Sin SKU en XML');expect(html).not.toContain('<img');expect(html).toContain('&lt;img');
});

test('cambiar presentación invalida la referencia; un ID ajeno o inventado no muestra otra compra',async()=>{
  const {repository,pantry,kitchen,ingredient,event,input}=await setup();
  await expect(kitchen.priceEvidence({...input,observationId:'inventado'})).rejects.toThrow(/cambió/);
  const product=await repository.get('products',event.productId);
  await pantry.saveProduct(event.id,{...productInput,contentQuantity:'6',ingredientId:ingredient.id,expectedRevision:product._revision});
  expect((await kitchen.snapshot()).priceSources[ingredient.id]).toBeNull();
  await expect(kitchen.priceEvidence(input)).rejects.toThrow(/vigente/);
});

test('comando protege evidencia fiscal y no acepta rol ni precio aportados por cliente',async()=>{
  const {repository,input}=await setup();
  const auth=role=>({uid:'trusted',token:{forxActive:true,forxRole:role}});
  const request={command:'priceEvidence',input:{...input,actor:{role:'admin'},normalizedPrice:'0.01'}};
  await expect(executePantryCommand(repository,null,request)).rejects.toMatchObject({code:'permission-denied'});
  await expect(executePantryCommand(repository,auth('viewer'),request)).rejects.toMatchObject({code:'permission-denied'});
  const viewer=await executePantryCommand(repository,auth('viewer'),{command:'kitchenSnapshot'});
  expect(viewer.canInspectPrices).toBe(false);expect(viewer.priceSources).toEqual({});
  expect(JSON.stringify(viewer)).not.toMatch(/cfdiUuid|supplierSku|supplierRfc|priceBasis/);
  const editor=await executePantryCommand(repository,auth('editor'),request);
  expect(editor.calculation.normalizedPrice).toBe('33.3333');
});
