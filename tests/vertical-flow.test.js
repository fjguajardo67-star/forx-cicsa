import { describe, test, expect } from 'vitest';
import { PantryService } from '../src/domain/pantry-service.js';
import { MemoryEntityRepository, put } from '../src/data/entity-repository.js';
import { cfdiFixture, manyConcepts } from './fixtures/cfdi.js';
import { file, monthlyFiles, purchaseXml, ingredientInput, productInput } from './fixtures/monthly.js';

async function setup() {
  const repository = new MemoryEntityRepository();
  let now = '2026-10-02T18:00:00Z';
  const service = new PantryService(repository, { clock: () => now });
  await service.initialize();
  return { service, repository, time: value => now = value };
}
async function linked(service, eventId, input = ingredientInput) {
  const ingredient = await service.createIngredient(input);
  await service.saveProduct(eventId, { ...productInput, ingredientId: ingredient.id });
  return ingredient;
}

describe('flujo vertical FORX v2', () => {
  test('lote mixto → revisión humana → producto → ingrediente → precio → catálogo', async () => {
    const { service, repository } = await setup();
    const batch = await service.importFiles(monthlyFiles(), { period: '2026-09' });
    expect(batch.counts).toEqual({ accepted: 1, duplicate: 1, conflict: 1, ineligible: 1, quarantine: 1, failed: 1, blocked: 0 });
    let state = await service.snapshot();
    expect(state.imports).toHaveLength(5);
    expect(state.purchase_events).toHaveLength(3);
    expect(await repository.list('import_concepts')).toHaveLength(7);
    expect(state.ingredients).toHaveLength(0);
    expect(state.price_observations).toHaveLength(0);
    const tomato = state.purchase_events.find(event => event.original.no_identificacion === 'JT-12');
    const serviceEvent = state.purchase_events.find(event => event.original.no_identificacion === 'SERV-1');
    const original = structuredClone(tomato);
    await service.saveProduct(serviceEvent.id, { preferredDescription: 'Mantenimiento', presentation: 'Servicio', categoryId: 'cat_servicios' });
    await service.classifyNonCulinary(serviceEvent.id, 'Servicio ajeno al catálogo culinario.');
    await expect(service.validatePrice(serviceEvent.id)).rejects.toThrow(/culinario/);
    const ingredient = await linked(service, tomato.id);
    const observation = await service.validatePrice(tomato.id);
    // (768 - 48) / (2 × 12 × .90), sin sumar el impuesto de la factura.
    expect(observation.normalizedPrice).toBe('33.3333');
    expect(observation.priceBasis.purchasePrice).toBe('720');
    expect(observation.usableQuantity).toBe('21.6');
    state = await service.snapshot();
    expect(state.catalog.find(item => item.id === ingredient.id).currentPrice.id).toBe(observation.id);
    expect(state.price_observations).toHaveLength(1);
    expect(await repository.get('purchase_events', tomato.id)).toEqual(original);
    expect(state.audit.some(entry => entry.action === 'concept.excluded')).toBe(true);
    expect(state.audit.some(entry => entry.action === 'price.validated')).toBe(true);
  });

  test('mismo SKU conserva producto y cada compra/observación; una antigua más cara no desplaza la vigente', async () => {
    const { service, time } = await setup();
    await service.importFiles([file('reciente.xml', purchaseXml({ price: '360' }))], { period: '2026-09' });
    const event = (await service.snapshot()).purchase_events[0];
    const ingredient = await linked(service, event.id);
    const current = await service.validatePrice(event.id);
    time('2026-11-01T10:00:00Z');
    await service.importFiles([file('vieja.xml', purchaseXml({ uuid: '22222222-2222-3333-4444-555555555555', day: '2026-09-01', price: '600' }))], { period: '2026-09' });
    const older = (await service.snapshot()).purchase_events.find(row => row.id !== event.id);
    await service.saveProduct(older.id, { ...productInput, ingredientId: ingredient.id });
    await service.validatePrice(older.id);
    const state = await service.snapshot();
    expect(state.products).toHaveLength(1);
    expect(state.purchase_events).toHaveLength(2);
    expect(state.price_observations).toHaveLength(2);
    expect(state.catalog[0].currentPrice.id).toBe(current.id);
  });

  test('revalidar añade historia; cambiar presentación invalida selección hasta nueva revisión', async () => {
    const { service } = await setup();
    await service.importFiles([file('a.xml', purchaseXml())], { period: '2026-09' });
    const event = (await service.snapshot()).purchase_events[0];
    const ingredient = await linked(service, event.id);
    const first = await service.validatePrice(event.id);
    await service.saveProduct(event.id, { ...productInput, contentQuantity: '6', ingredientId: ingredient.id });
    expect((await service.snapshot()).catalog[0].currentPrice).toBeNull();
    const second = await service.validatePrice(event.id);
    let state = await service.snapshot();
    expect(state.price_observations).toHaveLength(2);
    expect(state.price_observations.find(row => row.id === first.id)).toEqual({ ...first, _revision: 1 });
    expect(state.catalog[0].currentPrice.id).toBe(second.id);
    await service.reopenReview(event.id, 'La presentación necesita confirmación.');
    state = await service.snapshot();
    expect(state.catalog[0].currentPrice).toBeNull();
    expect(state.price_observations).toHaveLength(2);
  });

  test('ingrediente sin compra y categorías propias; alias no crean duplicados', async () => {
    const { service } = await setup();
    const category = await service.createCategory({ name: 'Vegetales regionales', type: 'culinary' });
    await service.createIngredient({ ...ingredientInput, categoryId: category.id });
    expect((await service.snapshot()).catalog[0].currentPrice).toBeNull();
    await expect(service.createIngredient({ ...ingredientInput, canonicalName: 'TOMATE RÓJO', aliases: [] })).rejects.toThrow(/alias/);
    await expect(service.createIngredient({ ...ingredientInput, canonicalName: 'Otro', aliases: ['Jitomate'] })).rejects.toThrow(/alias/);
    await expect(service.createIngredient({ ...ingredientInput, canonicalName: 'Detergente', categoryId: 'cat_limpieza' })).rejects.toThrow(/culinaria/);
    await expect(service.createIngredient({ ...ingredientInput, canonicalName: 'Otro', aliases: [], wastePct: '' })).rejects.toThrow(/inválido/);
  });

  test('conserva más de 300 conceptos, sin producir ingredientes por inferencia', async () => {
    const { service, repository } = await setup();
    await service.importFiles([file('grande.xml', cfdiFixture({ concepts: manyConcepts(305) }))], { period: '2026-09' });
    expect(await repository.list('purchase_events')).toHaveLength(305);
    expect(await repository.list('import_concepts')).toHaveLength(305);
    expect(await repository.list('ingredients')).toHaveLength(0);
  });

  test.each([
    ['moneda', purchaseXml({ currency: 'USD' }), productInput, ingredientInput, /moneda/],
    ['familias', purchaseXml(), { ...productInput, contentUnit: 'l' }, ingredientInput, /densidad/],
    ['importe', purchaseXml({ concepts: [{ sku: 'JT-12', quantity: '2', unitPrice: '10', amount: '30' }] }), productInput, ingredientInput, /coincide/]
  ])('bloquea precio no verificable por %s y conserva compra', async (_, xml, productData, ingredientData, message) => {
    const { service } = await setup();
    await service.importFiles([file('a.xml', xml)], { period: '2026-09' });
    const state = await service.snapshot();
    const ingredient = await service.createIngredient(ingredientData);
    await service.saveProduct(state.purchase_events[0].id, { ...productData, ingredientId: ingredient.id });
    await expect(service.validatePrice(state.purchase_events[0].id)).rejects.toThrow(message);
    expect((await service.snapshot()).purchase_events).toHaveLength(1);
    expect((await service.snapshot()).price_observations).toHaveLength(0);
  });

  test('cancelación registra lote parcial; reintentar solo añade compras pendientes', async () => {
    const { service } = await setup();
    const controller = new AbortController();
    const files = [file('a.xml', purchaseXml()), file('b.xml', purchaseXml({ uuid: '22222222-2222-3333-4444-555555555555' }))];
    const batch = await service.importFiles(files, { period: '2026-09', signal: controller.signal, onProgress: () => controller.abort() });
    expect(batch.status).toBe('cancelled'); expect(batch.processed).toBe(1);
    const repeated = await service.importFiles(files, { period: '2026-09' });
    expect(repeated.counts.duplicate).toBe(1); expect(repeated.counts.accepted).toBe(1);
    expect((await service.snapshot()).purchase_events).toHaveLength(2);
  });

  test('dos cargas simultáneas no duplican compras; detecta edición de ficha obsoleta', async () => {
    const { service, repository } = await setup();
    const second = new PantryService(repository);
    await Promise.all([service.importFiles([file('a.xml', purchaseXml())], { period: '2026-09' }), second.importFiles([file('a.xml', purchaseXml())], { period: '2026-09' })]);
    const state = await service.snapshot();
    expect(state.purchase_events).toHaveLength(1);
    expect(state.imports.map(item => item.status).sort()).toEqual(['accepted', 'duplicate']);
    await linked(service, state.purchase_events[0].id);
    const product = (await service.snapshot()).products[0];
    await service.saveProduct(state.purchase_events[0].id, { ...productInput, ingredientId: product.ingredientId, expectedRevision: product._revision });
    await expect(second.saveProduct(state.purchase_events[0].id, { ...productInput, expectedRevision: product._revision })).rejects.toThrow(/otra sesión/);
  });

  test('historia es inmutable incluso fuera de los comandos de UI', async () => {
    const { service, repository } = await setup();
    await service.importFiles([file('a.xml', purchaseXml())], { period: '2026-09' });
    const event = (await service.snapshot()).purchase_events[0];
    await expect(repository.commit([put('purchase_events', { ...event, original: {} }, event)])).rejects.toThrow(/inmutable/);
    const viewer = new PantryService(repository, { actor: { uid: 'viewer', role: 'viewer' } });
    await expect(viewer.createIngredient(ingredientInput)).rejects.toThrow(/permiso/);
  });
});
