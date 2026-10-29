import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { purchaseXml,ingredientInput,productInput } from '../fixtures/monthly.js';

test('Precios: SKU de compra vigente, evidencia, búsqueda, CSV y enlace exacto a MiDespensa',async({page})=>{
  test.setTimeout(60000);
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto('/#/forx/precios');
  await expect(page.getByRole('button',{name:'Precios',exact:true})).toBeVisible();
  const xml1=purchaseXml({concepts:[{description:'JITOMATE CAJA 12 KG',sku:'JT-12',quantity:'2',unit:'XBX',unitPrice:'384',amount:'768',discount:'48'}]});
  const xml2=purchaseXml({uuid:'22222222-2222-3333-4444-555555555555',day:'2026-09-28',
    concepts:[{description:'JITOMATE OTRA PRESENTACION',sku:'JT-12',quantity:'2',unit:'XBX',unitPrice:'600',amount:'1200'}]});
  const xml3=purchaseXml({uuid:'33333333-2222-3333-4444-555555555555',concepts:[{description:'SAL A GRANEL',sku:null,quantity:'1',unit:'KGM',unitPrice:'24',amount:'24'}]});
  const data=await page.evaluate(async({xml1,xml2,xml3,ingredientInput,productInput})=>{
    const {IndexedDbEntityRepository}=await import('/src/data/entity-repository.js');
    const {PantryService}=await import('/src/domain/pantry-service.js');
    const repo=await IndexedDbEntityRepository.open(),pantry=new PantryService(repo);
    const ingredient=await pantry.createIngredient(ingredientInput);
    await pantry.importFiles([{name:'validada.xml',content:xml1}],{period:'2026-09'});
    const event=(await pantry.snapshot()).purchase_events[0];
    await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});
    const price=await pantry.validatePrice(event.id);
    // A later invoice with changed description requires review even for the
    // same SKU; compatible unchanged purchases auto-validate after approval.
    await pantry.importFiles([{name:'pendiente.xml',content:xml2},{name:'sin-sku.xml',content:xml3}],{period:'2026-09'});
    const sal=await pantry.createIngredient({...ingredientInput,canonicalName:'Sal a granel',aliases:[],wastePct:'0'});
    const salEvent=(await pantry.snapshot()).purchase_events.find(e=>e.original.descripcion_original==='SAL A GRANEL');
    await pantry.saveProduct(salEvent.id,{...productInput,preferredDescription:'Sal a granel',contentQuantity:'1',ingredientId:sal.id});
    await pantry.validatePrice(salEvent.id);
    await pantry.createIngredient({...ingredientInput,canonicalName:'Ingrediente pendiente',aliases:[]});
    repo.close();return {ingredientId:ingredient.id,productId:event.productId,observationId:price.id,uuid:event.cfdiUuid};
  },{xml1,xml2,xml3,ingredientInput,productInput});
  await page.reload();
  const row=page.locator(`[data-price-ingredient="${data.ingredientId}"]`);
  await expect(row).toContainText('JT-12');await expect(row).toContainText('2026-09-20');
  await expect(row).not.toContainText('2026-09-28');
  await expect(page.locator('#tpre')).toContainText('Sin SKU en XML');
  await expect(page.locator('#tpre')).toContainText('Sin precio validado');
  await page.getByRole('searchbox',{name:'Buscar ingrediente, proveedor o SKU'}).fill('JT-12');
  await expect(page.locator('[data-price-ingredient]')).toHaveCount(1);
  const download=page.waitForEvent('download');await page.locator('[data-click="exportarPrecios"]').click();
  const text=await readFile(await (await download).path(),'utf8');expect(text).toContain('SKU de origen');expect(text).toContain('JT-12');expect(text).toContain(data.observationId);
  await page.getByRole('searchbox').fill('PROVEEDOR FICTICIO');await expect(page.locator('[data-price-ingredient]')).toHaveCount(2);
  await page.getByRole('searchbox').fill('');
  for(const [name,width,height] of [['desktop',1440,1050],['user-1952',1952,1269],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(async()=>{window.scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.screenshot({path:`.impeccable/review/prices-${name}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await row.getByRole('button',{name:'Ver origen'}).click();
  const origin=page.getByRole('region',{name:'Origen del precio'});
  await expect(origin).toContainText(data.uuid);await expect(origin).toContainText('720 MXN');await expect(origin).toContainText('21.6 kg');await expect(origin).toContainText('33.3333 MXN/kg');
  for(const [name,width,height] of [['mobile',390,844],['desktop',1440,1050]]){
    await page.setViewportSize({width,height});await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.screenshot({path:`.impeccable/review/prices-origin-${name}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Cambiar a tema claro'}).click();
  await page.screenshot({path:'.impeccable/review/prices-origin-light.png',fullPage:true,animations:'disabled'});
  await origin.getByRole('button',{name:'Abrir producto y compra en MiDespensa'}).click();
  await expect(page).toHaveURL(new RegExp('/despensa/producto/'));
  const reference=page.locator('[data-price-reference]');
  await expect(reference).toContainText(data.observationId);await expect(reference).toContainText(data.uuid);await expect(reference).not.toContainText('22222222-2222-3333-4444-555555555555');
  await page.setViewportSize({width:1952,height:1269});await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await page.screenshot({path:'.impeccable/review/prices-midespensa-reference.png',fullPage:true,animations:'disabled'});
  await page.reload();await expect(reference).toContainText(data.observationId);
  await page.goto(`/#/despensa/producto/${encodeURIComponent(data.productId)}?observacion=inexistente`);
  await expect(page.getByRole('alert')).toContainText('No se encontró el producto y la compra');
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
