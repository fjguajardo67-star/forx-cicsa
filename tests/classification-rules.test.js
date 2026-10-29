import { test, expect } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { PantryStoreAdapter } from '../src/data/pantry-store-adapter.js';
import { validateRule, suggestCategory } from '../src/domain/classification-rules.js';
import { CATEGORIES } from '../src/data/initial-state.js';
import { file, purchaseXml, productInput, ingredientInput } from './fixtures/monthly.js';

const input = { field: 'description', operator: 'phrase', value: 'JITOMATE', supplierId: '', categoryId: 'cat_frutas', priority: 100 };
const event = (description, sku = 'JT-12', supplierId = 'AAA010101AAA') => ({ supplierId, original: { descripcion_original: description, no_identificacion: sku } });
const rule = (overrides = {}) => ({ id: 'rule_test', ...validateRule({ ...input, ...overrides }, CATEGORIES), _revision: 1 });

test('normalización compartida, frases completas y SKU exacto acotado al proveedor', () => {
  const r = rule({ value: 'CAFÉ MOLIDO' });
  expect(suggestCategory(event('BOLSA CAFE MOLIDO 1 KG'), [r], CATEGORIES).status).toBe('suggested');
  expect(suggestCategory(event('CAFE MOLIDOR'), [r], CATEGORIES).status).toBe('none');
  const sku = rule({ field: 'sku', operator: 'equals', value: 'JT-12', supplierId: 'AAA010101AAA' });
  expect(suggestCategory(event('Otro texto'), [sku], CATEGORIES).status).toBe('suggested');
  expect(suggestCategory(event('Jitomate', 'JT-123'), [sku], CATEGORIES).status).toBe('none');
  expect(suggestCategory(event('Jitomate', 'JT-12', 'BBB010101BBB'), [sku], CATEGORIES).status).toBe('none');
});
test('rechaza SKU sin proveedor, regex, categorías pendientes y prioridad inválida', () => {
  for (const patch of [{ field: 'sku' }, { field: 'sku', operator: 'equals' }, { operator: 'regex' }, { value: '***' }, { categoryId: 'cat_sin' }, { priority: -1 }]) expect(() => rule(patch)).toThrow();
});
test('prioridad ordena evidencia pero no oculta categorías contradictorias; pausar retira sugerencia', () => {
  const first = rule(), second = { ...rule({ categoryId: 'cat_limpieza', priority: 1 }), id: 'rule_other' };
  const result = suggestCategory(event('JITOMATE'), [first, second], CATEGORIES);
  expect(result.status).toBe('conflict'); expect(result.categoryId).toBeNull(); expect(result.matches[0].id).toBe(second.id);
  expect(suggestCategory(event('JITOMATE'), [{ ...first, active: false }], CATEGORIES).status).toBe('none');
});
test('importar solo sugiere; no modifica decisiones ni genera ingredientes o precios', async () => {
  const repository = new MemoryEntityRepository(), pantry = new PantryService(repository);
  await pantry.initialize(); const saved = await pantry.saveRule(input);
  await pantry.importFiles([file('uno.xml', purchaseXml())], { period: '2026-09' });
  const store = await new PantryStoreAdapter(pantry).initialize();
  expect(store.snapshot().reviewItems[0].status).toBe('suggested');
  expect((await repository.list('reviews'))[0].status).toBe('pending');
  for (const name of ['products', 'ingredients', 'price_observations']) expect(await repository.list(name)).toEqual([]);
  await pantry.saveRule({ ...saved, active: false, expectedRevision: saved._revision });
  await store.refresh(); expect(store.snapshot().reviewItems[0].status).toBe('new');
  expect((await repository.list('audit')).filter(a => a.action.startsWith('rule.'))).toHaveLength(2);
  await expect(pantry.saveRule({ ...saved, expectedRevision: saved._revision })).rejects.toThrow(/otra sesión/);
  await expect(pantry.saveRule({ ...input, id: 'kitchen' })).rejects.toThrow();
});
test('producto revisado se reconoce; una regla posterior nunca reclasifica ni invalida precio por sí sola', async () => {
  const repository = new MemoryEntityRepository(), pantry = new PantryService(repository);
  await pantry.initialize(); await pantry.importFiles([file('uno.xml', purchaseXml())], { period: '2026-09' });
  const purchase = (await pantry.snapshot()).purchase_events[0]; const ingredient = await pantry.createIngredient(ingredientInput);
  await pantry.saveProduct(purchase.id, { ...productInput, ingredientId: ingredient.id }); await pantry.validatePrice(purchase.id);
  const before = await repository.list('price_observations');
  await pantry.saveRule({ ...input, categoryId: 'cat_servicios' });
  const store = await new PantryStoreAdapter(pantry).initialize();
  expect(store.snapshot().reviewItems[0].status).toBe('validated'); expect(await repository.list('price_observations')).toEqual(before);
  await pantry.importFiles([file('dos.xml', purchaseXml({ uuid: '99999999-2222-3333-4444-555555555555', day: '2026-09-30' }))], { period: '2026-09' });
  await store.refresh(); expect(store.snapshot().reviewItems).toHaveLength(1);
  expect(store.snapshot().reviewItems[0].recommendation.source).toBe('product'); expect(store.snapshot().reviewItems[0].status).toBe('validated');
  expect(await repository.list('products')).toHaveLength(1);
  const observations = await repository.list('price_observations');
  expect(observations).toHaveLength(before.length + 1);
  expect(observations.find(item => item.id !== before[0].id)?.validationMode).toBe('automatic');
});
