import { test, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryEntityRepository, IndexedDbEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { inspectBackup, backupDigest } from '../src/domain/backup.js';
import { restoreLocalCopy } from '../src/data/local-recovery.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { file, purchaseXml, productInput, ingredientInput } from './fixtures/monthly.js';

const now = '2026-10-02T12:00:00.000Z';
async function fixture(repository = new MemoryEntityRepository()) {
  const pantry = new PantryService(repository, { clock: () => now }), kitchen = new KitchenService(repository, { clock: () => now });
  await pantry.initialize(); await kitchen.initialize(); await pantry.importFiles([file('compra.xml', purchaseXml())], { period: '2026-09' });
  const ingredient = await pantry.createIngredient(ingredientInput), event = (await pantry.snapshot()).purchase_events[0];
  await pantry.saveProduct(event.id, { ...productInput, ingredientId: ingredient.id }); await pantry.validatePrice(event.id);
  await pantry.saveRule({ field: 'description', operator: 'phrase', value: 'Jitomate', categoryId: 'cat_frutas', priority: 10 });
  let recipe = await kitchen.saveRecipe({ name: 'Prueba', type: 'guisado', baseServings: '1', lines: [{ name: 'Jitomate', quantity: '100', unit: 'g', ingredientId: ingredient.id }] });
  recipe = await kitchen.saveRecipe({ ...recipe, expectedRevision: recipe._revision, instructions: 'Cocinar.' });
  await kitchen.saveRecipe({ name: 'Con faltante', type: 'garnacha', baseServings: '1', lines: [{ name: 'No existe aún', quantity: '1', unit: 'pz' }] });
  await kitchen.generateMenu({ name: 'Semana prueba', startDate: '2026-10-05', count: 1, diners: 100 });
  return { repository, pantry, kitchen, recipe };
}
async function altered(backup, mutate) { const copy = structuredClone(backup); mutate(copy); const { checksum, ...payload } = copy; copy.checksum = await backupDigest(payload); return JSON.stringify(copy); }

test('respaldo consistente sin bytes XML y sin alterar el origen', async () => {
  const { repository, pantry } = await fixture(); const before = await repository.exportSnapshot();
  const backup = await pantry.exportBackup(), inspected = await inspectBackup(JSON.stringify(backup));
  expect(inspected.counts.recipes).toBe(2); expect(inspected.counts.recipe_versions).toBe(3); expect(inspected.counts.menus).toBe(1);
  expect(backup.collections.originals[0]).toMatchObject({ bytes: null, path: null, status: 'not_included' });
  expect(JSON.stringify(backup)).not.toMatch(/<cfdi:|bytesBase64/);
  expect(await repository.exportSnapshot()).toEqual(before);
});
test('restaura copia nueva con IDs, revisiones, costos, faltantes, menú, reglas e historial; continúa editando', async () => {
  const factory = new IDBFactory(), source = await IndexedDbEntityRepository.open('forx-v2-local', factory);
  const { pantry, kitchen, recipe } = await fixture(source); const before = await source.exportSnapshot();
  const backup = await pantry.exportBackup(); const restored = await restoreLocalCopy(JSON.stringify(backup), { factory, now });
  expect(restored.name).not.toBe('forx-v2-local');
  const target = await IndexedDbEntityRepository.open(restored.name, factory), restoredKitchen = new KitchenService(target);
  const oldState = await kitchen.snapshot(), newState = await restoredKitchen.snapshot();
  for (const key of ['recipes', 'menus', 'recipeCosts', 'menuCosts', 'catalog']) expect(newState[key]).toEqual(oldState[key]);
  expect((await new PantryService(target).snapshot()).rules).toHaveLength(1);
  expect(await target.list('recipe_versions')).toEqual(before.recipe_versions);
  expect((await target.list('audit')).at(-1)).toBeDefined();
  await restoredKitchen.saveRecipe({ ...recipe, expectedRevision: recipe._revision, instructions: 'Edición en copia.' });
  expect(await target.list('recipe_versions')).toHaveLength(4); expect(await source.exportSnapshot()).toEqual(before);
  await expect(target.seedEmpty(backup.collections)).rejects.toThrow(/vacía/);
  await new PantryService(target).importFiles([file('otra-vez.xml', purchaseXml())], { period: '2026-09' });
  expect(await target.list('purchase_events')).toHaveLength(1);
  source.close(); target.close();
});
test('copias repetidas quedan aisladas y no prolongan retención ni recuperan XML vencidos', async () => {
  const { pantry } = await fixture(); const backup = await pantry.exportBackup(); const factory = new IDBFactory();
  const one = await restoreLocalCopy(JSON.stringify(backup), { factory, now: '2027-01-01T00:00:00.000Z' });
  const two = await restoreLocalCopy(JSON.stringify(backup), { factory, now }); expect(one.name).not.toBe(two.name);
  const repository = await IndexedDbEntityRepository.open(one.name, factory);
  const original = (await repository.list('originals'))[0]; expect(original.bytes).toBeNull(); expect(original.expiresAt).toBe('2026-12-02T12:00:00.000Z');
  expect(await new PantryService(repository).expireLocalOriginals('2027-01-01T00:00:00.000Z')).toBe(0);
  await expect(new PantryService(repository).exportBackup()).resolves.toHaveProperty('checksum'); repository.close();
});
test('rechaza formato legado, checksum dañado, referencias rotas, duplicados, reglas inválidas y XML embebidos antes de crear una base', async () => {
  const { pantry } = await fixture(); const backup = await pantry.exportBackup(), factory = new IDBFactory();
  const invalid = [JSON.stringify({ schema: 2, recipes: [] }), JSON.stringify({ ...backup, checksum: '0'.repeat(64) }),
    await altered(backup, b => b.collections.products[0].ingredientId = 'no-existe'),
    await altered(backup, b => b.collections.recipes.push(b.collections.recipes[0])),
    await altered(backup, b => b.collections.originals[0].bytes = [1, 2, 3]),
    await altered(backup, b => b.collections.settings.find(s => s.kind === 'classification_rule').operator = 'regex'),
    await altered(backup, b => b.collections.purchase_events[0].productId = '\"><img src=x onerror=alert(1)>'),
    await altered(backup, b => b.collections.recipes[0].id = '\" onclick=alert(1)')];
  for (const source of invalid) await expect(restoreLocalCopy(source, { factory, now })).rejects.toThrow();
  expect(await factory.databases()).toEqual([]);
});
test('servidor: solo admin descarga; editor puede gestionar reglas; viewer y falsificación quedan fuera', async () => {
  const { repository } = await fixture(); const auth = role => ({ uid: 'verified', token: { forxRole: role, forxActive: true } });
  for (const role of ['viewer', 'editor']) await expect(executePantryCommand(repository, auth(role), { command: 'exportBackup', input: { role: 'admin' } })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(executePantryCommand(repository, auth('admin'), { command: 'exportBackup' })).resolves.toHaveProperty('checksum');
  await expect(executePantryCommand(repository, auth('viewer'), { command: 'saveRule', input: {} })).rejects.toThrow();
  await expect(executePantryCommand(repository, auth('admin'), { command: 'restoreBackup', input: {} })).rejects.toMatchObject({ code: 'invalid-argument' });
});
