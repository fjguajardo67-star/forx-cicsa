import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { purchaseXml, ingredientInput, productInput } from '../fixtures/monthly.js';

test('reglas explicables y recuperación independiente desde Administración', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/#/despensa');
  await page.getByRole('button', { name: 'Categorías y reglas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva regla', exact: true }).click();
  const form = page.locator('#rule-form');
  await form.getByLabel('Texto o SKU').fill('JITOMATE');
  await form.getByLabel('Categoría sugerida').selectOption('cat_frutas');
  await form.getByRole('button', { name: 'Guardar regla' }).click();
  await expect(page.locator('.rules-panel')).toContainText('JITOMATE');
  await page.locator('#simulate-rules').getByLabel('Descripción de prueba').fill('Jitomate caja 12 KG');
  await page.getByRole('button', { name: 'Probar coincidencias' }).click();
  await expect(page.locator('#rule-simulation-result')).toContainText('Frutas y verduras');
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  await page.locator('#xml-files').setInputFiles({ name: 'sintetico.xml', mimeType: 'text/xml', buffer: Buffer.from(purchaseXml()) });
  await expect(page.locator('.toast').filter({ hasText: 'Lote terminado:' })).toBeVisible();
  await page.locator('.nav-button[data-route="review"]').click();
  await expect(page.locator('[data-review-row]')).toContainText('Con sugerencia');
  await expect(page.getByRole('complementary', { name: 'Ficha de evidencia' })).toContainText('Sugerencia: Frutas y verduras');
  await page.getByRole('button', { name: 'Editar producto', exact: true }).click();
  await expect(page.locator('#review-product-form [name="categoryId"]')).toHaveValue('cat_frutas');
  await page.getByRole('button', { name: 'Categorías y reglas', exact: true }).click();
  await page.locator('[data-edit-rule]').click();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });
  for (const [label, width, height] of [['desktop', 1440, 1050], ['user-1952', 1952, 1269], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.rules-panel').scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `.impeccable/review/rules-${label}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(async ({ ingredientInput, productInput }) => {
    const { IndexedDbEntityRepository } = await import('/src/data/entity-repository.js');
    const { PantryService } = await import('/src/domain/pantry-service.js');
    const { KitchenService } = await import('/src/domain/kitchen-service.js');
    const repo = await IndexedDbEntityRepository.open(), pantry = new PantryService(repo), kitchen = new KitchenService(repo);
    const ingredient = await pantry.createIngredient(ingredientInput), event = (await pantry.snapshot()).purchase_events[0];
    await pantry.saveProduct(event.id, { ...productInput, ingredientId: ingredient.id }); await pantry.validatePrice(event.id);
    await kitchen.saveRecipe({ name: 'Receta sintética de recuperación', type: 'guisado', baseServings: '1', lines: [{ name: 'Jitomate', ingredientId: ingredient.id, quantity: '100', unit: 'g' }] });
    await kitchen.generateMenu({ name: 'Menú sintético de recuperación', startDate: '2026-10-05', count: 1, diners: 100 }); repo.close();
  }, { ingredientInput, productInput });
  await page.reload();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar respaldo completo' }).click();
  const backupText = await readFile(await (await download).path(), 'utf8');
  const backup = JSON.parse(backupText);
  expect(backup.collections.purchase_events).toHaveLength(1); expect(backup.collections.originals[0].bytes).toBeNull();
  await page.locator('#backup-file').setInputFiles({ name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('Respaldo inválido');
  await expect(page.locator('#restore-local-copy')).toHaveCount(0);
  await page.locator('#backup-file').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
  await expect(page.getByText('Contenido comprobado')).toBeVisible();
  for (const [label, width, height] of [['desktop', 1440, 1050], ['user-1952', 1952, 1269], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.locator('.backup-panel').scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `.impeccable/review/backup-${label}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Crear y abrir copia recuperada' }).click();
  await expect(page).toHaveURL(/recovery=forx-v2-recovery-/);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await expect(page.getByText('Copia local recuperada', { exact: false })).toBeVisible();
  await expect(page.locator('[data-review-row]')).toContainText('Validado');
  await page.reload(); await expect(page.locator('[data-review-row]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Menú y recetas FORX', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Precios', exact: true })).toBeVisible();
  const source = await page.evaluate(async () => {
    const { IndexedDbEntityRepository } = await import('/src/data/entity-repository.js');
    const repo = await IndexedDbEntityRepository.open(); const data = await repo.exportSnapshot(); repo.close();
    return { events: data.purchase_events.length, originalBytes: data.originals[0].bytes.length, restoredAudits: data.audit.filter(a => a.action === 'backup.restored').length };
  });
  expect(source.events).toBe(1); expect(source.originalBytes).toBeGreaterThan(0); expect(source.restoredAudits).toBe(0); expect(errors).toEqual([]);
});
