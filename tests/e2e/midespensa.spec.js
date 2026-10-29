import { test, expect } from '@playwright/test';
import { monthlyFiles, purchaseXml } from '../fixtures/monthly.js';
import { e2eOrigin } from './test-origin.js';

async function importFiles(page, files, period='2026-09') {
  await page.getByRole('button', { name:'Importar XML', exact:true }).first().click();
  await page.getByLabel('Periodo del lote').fill(period);
  await page.locator('#xml-files').setInputFiles(files.map(file => ({ name:file.name, mimeType:'application/xml', buffer:Buffer.from(file.content) })));
  await expect(page.getByRole('heading', { name:'Resumen del lote' })).toBeVisible();
}
test('UI original: lote, revisión, precio, histórico, exclusión, archivo y restauración', async ({ page }) => {
  const external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    // This test owns a fresh Playwright context and IndexedDB only. Deny all
    // command servers (including loopback) and every non-GET network request.
    if (new URL(route.request().url()).origin !== e2eOrigin || route.request().method()!=='GET') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/?backend=indexeddb#/despensa');
  await expect(page.getByRole('heading', { name:'Cola de revisión' })).toBeVisible();
  await importFiles(page, monthlyFiles());
  await expect(page.getByText('conflicto.xml', { exact:true })).toBeVisible();
  await page.getByRole('button', { name:'Ir a la cola de revisión' }).click();
  await expect(page.locator('[data-review-row]')).toHaveCount(3);
  const row = page.locator('[data-review-row]').filter({ hasText:'JITOMATE CAJA 12 KG' });
  await row.click();
  await page.getByRole('button', { name:'Editar producto', exact:true }).click();
  await page.getByLabel('Presentación', { exact:true }).fill('Caja');
  await page.getByLabel('Contenido por presentación').fill('12');
  await page.getByRole('combobox', { name:'Unidad de contenido', exact:true }).selectOption('kg');
  await page.getByRole('combobox', { name:'Categoría', exact:true }).selectOption('cat_frutas');
  await page.getByRole('button', { name:'Guardar producto', exact:true }).click();
  await page.getByRole('button', { name:'Crear ingrediente', exact:true }).click();
  await page.getByLabel('Nombre del ingrediente').fill('Jitomate');
  await page.getByLabel('Merma (%)', { exact:true }).fill('10');
  await page.getByLabel('Merma confirmada el').fill('2026-10-07');
  await page.getByRole('button', { name:'Crear y vincular', exact:true }).click();
  await expect(page.getByRole('button', { name:'Validar precio real', exact:true })).toBeEnabled();
  await page.getByRole('button', { name:'Validar precio real', exact:true }).click();
  await expect(row).toContainText('Validado');
  await page.getByRole('button', { name:'Productos', exact:true }).click();
  await page.getByRole('combobox', { name:'Filtrar productos por estado' }).selectOption('validated');
  await expect(page.locator('.catalog-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.catalog-table')).toContainText('JITOMATE CAJA 12 KG');
  await page.screenshot({ path:'.impeccable/review/products-validated-desktop.png', fullPage:true, animations:'disabled' });
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:'.impeccable/review/products-validated-mobile.png', fullPage:true, animations:'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width:1440, height:1050 });
  await page.getByRole('combobox', { name:'Filtrar productos por estado' }).selectOption('pending');
  await expect(page.locator('.catalog-table tbody tr')).toHaveCount(2);
  await page.getByRole('combobox', { name:'Filtrar productos por estado' }).selectOption('excluded');
  await expect(page.getByText('Sin resultados en este filtro')).toBeVisible();
  await page.getByRole('button', { name:/^Revisión/ }).click();
  await row.click();
  await page.getByRole('button', { name:'Editar producto', exact:true }).click();
  await page.getByLabel('Contenido por presentación').fill('6');
  await expect(page.getByRole('button', { name:'Revalidar precio real', exact:true })).toBeDisabled();
  await page.getByRole('button', { name:'Guardar producto', exact:true }).focus();
  await page.keyboard.press('v');
  await expect(page.getByText('Guarda o cancela los cambios antes de validar.', { exact:true }).first()).toBeVisible();
  await expect(page.getByLabel('Contenido por presentación')).toHaveValue('6');
  await page.locator('#cancel-review-product').click();
  await expect(page.getByRole('button', { name:'Revalidar precio real', exact:true })).toBeEnabled();
  await page.getByRole('button', { name:'Vincular existente', exact:true }).click();
  await expect(page.getByRole('button', { name:'Revalidar precio real', exact:true })).toBeDisabled();
  await page.locator('#cancel-review-ingredient').focus();
  await page.keyboard.press('v');
  await expect(page.locator('#review-ingredient-select')).toBeVisible();
  await page.locator('#cancel-review-ingredient').click();
  await page.getByRole('button', { name:'Ingredientes', exact:true }).click();
  await expect(page.locator('.catalog-table')).toContainText('$33.33/kg');
  await page.reload();
  await expect(row).toContainText('Validado');
  await importFiles(page, [{ name:'historica.xml', content:purchaseXml({ uuid:'33333333-2222-3333-4444-555555555555', day:'2026-08-01', price:'600' }) }], '2026-08');
  await expect(page.getByText('Bloqueado por periodo',{exact:true})).toBeVisible();
  await expect(page.getByText(/XML de 2026-08 bloqueado/)).toBeVisible();
  await expect(page.locator('#import-policy')).toContainText('2026-09');
  for (const [name,width,height] of [['desktop',1440,1050],['tablet',1024,768],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    await page.screenshot({path:`.impeccable/review/import-policy-${name}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.getByRole('button', { name:'Ir a la cola de revisión' }).click();
  await expect(page.locator('[data-review-row]')).toHaveCount(3);
  await expect(row).not.toContainText('2 compras · un solo SKU');
  await expect(row).toContainText('Validado');
  await row.click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name:'Eliminar de la lista', exact:true }).click();
  await expect(page.locator('[data-review-row]')).toHaveCount(2);
  await page.getByRole('button', { name:'Administración', exact:true }).click();
  await page.getByRole('button', { name:'Restablecer', exact:false }).first().click();
  await page.getByRole('button', { name:/^Revisión/ }).click();
  await expect(row).toContainText('Validado');
  await page.locator('[data-review-row]').filter({ hasText:'SERVICIO DE MANTENIMIENTO' }).getByRole('checkbox').check();
  await page.locator('[data-review-row]').filter({ hasText:'DETERGENTE' }).getByRole('checkbox').check();
  await page.locator('#bulk-exclude').click();
  await expect(page.locator('[data-review-row]').filter({ hasText:'Excluido' })).toHaveCount(2);
  const names = ['ARROZ GRANO LARGO','FRIJOL PINTO','ACEITE VEGETAL','CEBOLLA BLANCA','PAPA BLANCA','ZANAHORIA','PECHUGA DE POLLO','CHILE SERRANO','LECHE ENTERA','HARINA DE TRIGO','SAL YODADA','PASTA ESPAGUETI'];
  const concepts = Array.from({ length:60 }, (_,index) => ({ description:`${names[index % names.length]} · PRUEBA ${index+1}`, sku:`PRUEBA-${index+1}`, quantity:'1', unit:'KGM', unitPrice:'10', amount:'10' }));
  await importFiles(page, [{ name:'densidad-sintetica.xml', content:purchaseXml({ uuid:'44444444-2222-3333-4444-555555555555', day:'2026-09-10', concepts }) }]);
  await page.getByRole('button', { name:'Ir a la cola de revisión' }).click();
  await expect(page.locator('[data-review-row]')).toHaveCount(63);
  await page.locator('.queue').evaluate(element => { element.scrollTop = 900; });
  await page.locator('[data-review-row]').nth(15).getByRole('checkbox').check();
  expect(await page.locator('.queue').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('#bulk-clear').click();
  await page.locator('.queue').evaluate(element => { element.scrollTop = 0; });
  await row.click();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout:6000 });
  await page.emulateMedia({ reducedMotion:'reduce' });
  for (const [name,width,height] of [['desktop',1440,1050],['user-1952',1952,1269],['tablet',1024,768],['mobile',390,844]]) {
    await page.setViewportSize({ width,height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path:`.impeccable/review/${name}.png`, fullPage:true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
