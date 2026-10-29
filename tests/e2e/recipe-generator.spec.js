import { test, expect } from '@playwright/test';
import { e2eOrigin } from './test-origin.js';

const route='/?backend=indexeddb&recipeGenerator=simulated#/forx/generar';
async function isolate(page) {
  await page.route('**/*',request=>new URL(request.request().url()).origin===e2eOrigin&&request.request().method()==='GET'?request.continue():request.abort());
  await page.emulateMedia({reducedMotion:'reduce'});
}
async function counts(page) {
  return page.evaluate(async()=>{
    const {IndexedDbEntityRepository}=await import('/src/data/entity-repository.js');
    const db=await IndexedDbEntityRepository.open('forx-v2-simulation');
    const result={recipes:(await db.list('recipes')).length,requests:(await db.list('generation_requests')).length,observations:(await db.list('price_observations')).length};db.close();return result;
  });
}
test('propuesta simulada → revisión explícita → borrador sin precio y sin escritura automática',async({page})=>{
  await isolate(page);await page.goto(route);
  await expect(page.locator('#generator-mode')).toContainText('Simulado, sin consumo');
  await page.getByLabel('Idea o nombre del platillo').fill('Pollo para probar el recorrido');
  await page.getByLabel('Porciones base de la propuesta').fill('4');
  await page.getByRole('button',{name:'Generar propuesta simulada',exact:true}).click();
  await expect(page.locator('#proposal-title')).toContainText('pollo con calabacita');
  await expect(page.locator('#proposal-result')).toContainText('600 g');
  await expect(page.locator('#proposal-result')).toContainText('Sin coincidencia exacta');
  expect(await counts(page)).toEqual({recipes:0,requests:1,observations:0});
  await expect(page.getByRole('button',{name:'Generar propuesta simulada',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Consultar estado sin generar otra'}).click();
  expect((await counts(page)).requests).toBe(1);
  await page.getByRole('button',{name:'Revisar en editor',exact:true}).click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('#recipe-form [name="status"]')).toHaveValue('draft');
  await expect(page.locator('#recipe-form [name="status"]')).toBeDisabled();
  await expect(page.getByLabel('Vincular ingrediente 1',{exact:true})).toHaveValue('');
  await expect(page.locator('#editor-summary')).toContainText('No verificable');
  await page.getByRole('button',{name:'Guardar receta',exact:true}).click();
  expect((await counts(page)).recipes).toBe(0);
  await page.getByLabel('Revisé cantidades, procedimiento y restricciones.',{exact:false}).check();
  await page.getByRole('button',{name:'Guardar receta',exact:true}).click();
  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(page.locator('#cat')).toBeVisible();
  await expect(page.locator('#cat')).toContainText('Origen: ejemplo simulado');
  expect(await counts(page)).toEqual({recipes:1,requests:1,observations:0});
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await expect(page.locator('#recipe-form [name="status"]')).toBeEnabled();
  await expect(page.locator('#recipe-form [name="status"]')).toHaveValue('draft');
});
test('estados de proveedor desactivado y formulario inválido conservan captura',async({page})=>{
  await isolate(page);await page.goto('/?backend=indexeddb#/forx/generar');
  await expect(page.locator('#generator-mode')).toContainText('desactivada');
  await expect(page.getByRole('button',{name:'Generar propuesta simulada'})).toBeDisabled();
  await page.goto(route);
  await page.getByRole('button',{name:'Generar propuesta simulada'}).click();expect((await counts(page)).requests).toBe(0);
  await page.getByLabel('Idea o nombre del platillo').fill('Conservar esta idea');
  await page.getByLabel('Porciones base de la propuesta').fill('0');
  await page.getByRole('button',{name:'Generar propuesta simulada'}).click();
  await expect(page.getByLabel('Idea o nombre del platillo')).toHaveValue('Conservar esta idea');expect((await counts(page)).requests).toBe(0);
});
test('revisión visual del generador en ambos temas, escritorio, tablet y móvil',async({page})=>{
  await isolate(page);await page.goto(route);
  await page.getByLabel('Idea o nombre del platillo').fill('Propuesta de prueba');
  await page.getByRole('button',{name:'Generar propuesta simulada'}).click();await expect(page.locator('#proposal-title')).toBeVisible();
  for(const [label,width] of [['desktop',1440],['user-1952',1952],['tablet',1024],['mobile',390]]) {
    await page.setViewportSize({width,height:width===1952?1269:1050});await page.evaluate(async()=>{window.scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`.impeccable/review/generator-${label}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1050});await page.getByRole('button',{name:'Cambiar a tema claro'}).click();await page.evaluate(()=>window.scrollTo(0,0));
  await expect(page.locator('.side-foot .local-mode')).toHaveCSS('color','rgb(142, 163, 201)');
  await expect(page.getByRole('button',{name:'Actualizar datos',exact:true})).toHaveCSS('color','rgb(142, 163, 201)');
  await page.screenshot({path:'.impeccable/review/generator-light.png',fullPage:true});
});
