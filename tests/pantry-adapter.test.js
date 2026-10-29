import { describe, test, expect } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { PantryStoreAdapter } from '../src/data/pantry-store-adapter.js';
import { purchaseXml, file, productInput, ingredientInput } from './fixtures/monthly.js';

async function setup() {
  const repository = new MemoryEntityRepository();
  const service = new PantryService(repository);
  await service.initialize();
  const store = await new PantryStoreAdapter(service).initialize();
  await store.importFiles([file('actual.xml', purchaseXml())], { period:'2026-09' });
  const row = store.snapshot().reviewItems[0];
  return { store, service, repository, row };
}
async function validate(store, row) {
  await store.saveReviewProduct(row.id, productInput);
  await store.linkReviewIngredient(row.id, { ...ingredientInput, create:true });
  await store.review(row.id, { classification:'culinary', normalizedPrice:'0.01' });
}
describe('paridad de MiDespensa con repositorio por entidad', () => {
  test('valida desde el flujo original y nunca confía en el precio calculado por el cliente', async () => {
    const { store, row } = await setup();
    await validate(store, row);
    const state = store.snapshot();
    expect(state.reviewItems[0].status).toBe('validated');
    expect(state.catalog[0].currentPrice.normalizedPrice).toBe('35.5556');
    expect(state.products).toHaveLength(1);
    expect(state.products[0].status).toBe('validated');
  });
  test('una compra histórica se agrega al SKU sin reabrir su precio actual', async () => {
    const { store, row } = await setup();
    await validate(store, row);
    const current = store.snapshot().catalog[0].currentPrice.id;
    await store.importFiles([file('anterior.xml', purchaseXml({ uuid:'22222222-2222-3333-4444-555555555555', day:'2026-09-01', price:'600' }))], { period:'2026-09' });
    const state = store.snapshot();
    expect(state.reviewItems).toHaveLength(1);
    expect(state.reviewItems[0].occurrenceCount).toBe(2);
    expect(state.reviewItems[0].status).toBe('validated');
    expect(state.catalog[0].currentPrice.id).toBe(current);
  });
  test('archivar y restablecer conserva observación inmutable y todas las compras', async () => {
    const { store, row, repository } = await setup();
    await validate(store, row);
    const observations = await repository.list('price_observations');
    await store.archiveReviewItems([row.id]);
    expect(store.snapshot().reviewItems[0].status).toBe('archived');
    expect(store.snapshot().catalog[0].currentPrice).toBeNull();
    const audit = store.snapshot().audit.find(item => item.action === 'concept.archived');
    await store.undo(audit.id);
    expect(store.snapshot().reviewItems[0].status).toBe('validated');
    expect(await repository.list('price_observations')).toEqual(observations);
    expect(await repository.list('purchase_events')).toHaveLength(1);
    await expect(store.undo(audit.id)).rejects.toThrow(/ya fue/);
  });
  test('una nueva decisión impide deshacer ciegamente una anterior', async () => {
    const { store, row } = await setup();
    await store.archiveReviewItems([row.id]);
    const audit = store.snapshot().audit.find(item => item.action === 'concept.archived');
    await store.excludeReviewItems([row.id]);
    await expect(store.undo(audit.id)).rejects.toThrow(/posteriores/);
  });
  test('crear categoría + ingrediente + vínculo es atómico cuando falla una validación', async () => {
    const { store, row, repository } = await setup();
    await store.saveReviewProduct(row.id, productInput);
    const categories = await repository.list('categories');
    await expect(store.linkReviewIngredient(row.id, { ...ingredientInput, categoryId:'__new__', newCategoryName:'Nueva', wastePct:'150', create:true })).rejects.toThrow(/rango/);
    expect(await repository.list('categories')).toEqual(categories);
    expect(await repository.list('ingredients')).toHaveLength(0);
  });
  test('categoría, ingrediente y vínculo se guardan juntos; merma no sobrescribe historia', async () => {
    const { store, row, repository } = await setup();
    await store.saveReviewProduct(row.id, productInput);
    const result = await store.linkReviewIngredient(row.id, { ...ingredientInput, categoryId:'__new__', newCategoryName:'Vegetales', create:true });
    expect(result.category.name).toBe('Vegetales');
    await store.review(row.id, { classification:'culinary' });
    const observations = await repository.list('price_observations');
    await store.updateIngredientWaste(result.ingredient.id, '15', { scope:'ingredient', effectiveFrom:'2026-01-01' });
    expect(await repository.list('price_observations')).toEqual(observations);
    expect(store.snapshot().catalog[0].currentPrice).toBeNull();
    expect(store.snapshot().reviewItems[0].status).toBe('new');
  });
  test('un precio manual provisional no convierte un costo en verificado', async () => {
    const { store } = await setup();
    const ingredient = await store.createIngredient(ingredientInput);
    await store.addManualPrice({ ingredientId:ingredient.id, baseUnit:'kg', normalizedPrice:'42', observedAt:'2026-09-20T12:00:00', sourceLabel:'Cotización de prueba' });
    expect(store.snapshot().catalog[0].currentPrice).toBeNull();
    expect(store.snapshot().observations[0].provisional).toBe(true);
  });
});
