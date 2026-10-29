import { describe, expect, test } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { file, ingredientInput, productInput, purchaseXml } from './fixtures/monthly.js';

const uuid = n => `99999999-2222-3333-4444-${String(n).padStart(12, '0')}`;
const later = (n, options = {}) => file(`compra-${n}.xml`, purchaseXml({ uuid: uuid(n), day: `2026-09-${String(20 + n).padStart(2, '0')}`, ...options }));

async function approved() {
  const repository = new MemoryEntityRepository();
  const service = new PantryService(repository);
  await service.initialize();
  await service.importFiles([file('primera.xml', purchaseXml())], { period: '2026-09' });
  const first = (await repository.list('purchase_events'))[0];
  const ingredient = await service.createIngredient(ingredientInput);
  const product = await service.saveProduct(first.id, { ...productInput, ingredientId: ingredient.id });
  expect(await repository.list('price_observations')).toHaveLength(0);
  await service.validatePrice(first.id);
  return { repository, service, first, ingredient, product };
}

describe('actualización de precios XML con aprobación previa', () => {
  test('nuevo XML compatible crea observación y bitácora atómicas; duplicado no vuelve a crear precio', async () => {
    const { repository, service, ingredient } = await approved();
    const next = later(1, { price: '480' });
    await service.importFiles([next], { period: '2026-09' });
    const events = await repository.list('purchase_events');
    const newest = events.find(item => item.cfdiUuid === uuid(1));
    const review = await repository.get('reviews', newest.id);
    const observations = await repository.list('price_observations');
    expect(review.status).toBe('validated');
    expect(observations).toHaveLength(2);
    const automatic = observations.find(item => item.eventId === newest.id);
    expect(automatic).toMatchObject({ id: review.observationId, validationMode: 'automatic', normalizedPrice: '44.4444', ingredientId: ingredient.id });
    expect((await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice.id).toBe(automatic.id);
    expect((await repository.list('audit')).filter(item => item.action === 'price.auto_validated')).toHaveLength(1);
    await service.importFiles([next], { period: '2026-09' });
    expect(await repository.list('price_observations')).toHaveLength(2);
  });

  test('cambios de descripción o unidad XML quedan pendientes sin desplazar el precio aprobado', async () => {
    const { repository, service, ingredient } = await approved();
    const approvedPrice = (await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice.id;
    const changedDescription = later(1, { concepts: [{ description: 'JITOMATE CAJA 6 KG', sku: 'JT-12', quantity: '1', unit: 'XBX', unitPrice: '240', amount: '240' }] });
    const changedUnit = later(2, { concepts: [{ description: 'JITOMATE CAJA 12 KG', sku: 'JT-12', quantity: '1', unit: 'KGM', unitPrice: '480', amount: '480' }] });
    await service.importFiles([changedDescription, changedUnit], { period: '2026-09' });
    expect((await repository.list('reviews')).filter(item => item.status === 'pending')).toHaveLength(2);
    expect(await repository.list('price_observations')).toHaveLength(1);
    expect((await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice.id).toBe(approvedPrice);
  });

  test('una merma modificada exige revalidar; no se hereda una equivalencia anterior', async () => {
    const { repository, service, ingredient } = await approved();
    const current = await repository.get('ingredients', ingredient.id);
    await service.updateIngredientWaste(ingredient.id, '15', { scope: 'ingredient', effectiveFrom: '2026-01-01', expectedRevision: current._revision });
    await service.importFiles([later(1)], { period: '2026-09' });
    expect((await repository.list('reviews')).filter(item => item.status === 'pending')).toHaveLength(1);
    expect(await repository.list('price_observations')).toHaveLength(1);
  });

  test('cambiar solo la fecha de confirmación conserva el precio y permite el siguiente XML', async () => {
    const { repository, service, ingredient } = await approved();
    const current = await repository.get('ingredients', ingredient.id);
    const change = await service.updateIngredientWaste(ingredient.id, current.wastePct, {
      scope:'ingredient', effectiveFrom:'2026-10-07', expectedRevision:current._revision
    });
    expect(change.pricingChanged).toBe(false);
    expect((await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice).not.toBeNull();
    await service.importFiles([later(1)], { period:'2026-09' });
    expect((await repository.list('price_observations')).filter(item => item.validationMode === 'automatic')).toHaveLength(1);
  });

  test('un XML anterior en el mismo periodo no se aprueba automáticamente ni desbanca el vigente', async () => {
    const { repository, service, ingredient } = await approved();
    const original = (await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice.id;
    await service.importFiles([file('anterior.xml', purchaseXml({ uuid: uuid(3), day: '2026-09-01', price: '600' }))], { period: '2026-09' });
    expect(await repository.list('price_observations')).toHaveLength(1);
    expect((await service.snapshot()).catalog.find(item => item.id === ingredient.id).currentPrice.id).toBe(original);
  });

  test('una exclusión humana del mismo SKU detiene automatizaciones futuras', async () => {
    const { repository, service } = await approved();
    await service.importFiles([file('anterior.xml', purchaseXml({ uuid: uuid(3), day: '2026-09-01' }))], { period: '2026-09' });
    const older = (await repository.list('purchase_events')).find(item => item.cfdiUuid === uuid(3));
    await service.classifyNonCulinary(older.id, 'El operador excluyó esta compra.');
    await service.importFiles([later(1)], { period: '2026-09' });
    const latest = (await repository.list('purchase_events')).find(item => item.cfdiUuid === uuid(1));
    expect((await repository.get('reviews', latest.id)).status).toBe('pending');
    expect(await repository.list('price_observations')).toHaveLength(1);
  });

  test('sin SKU no hereda automáticamente el precio aunque la descripción coincida', async () => {
    const repository = new MemoryEntityRepository(), service = new PantryService(repository);
    const concepts = [{ description:'JITOMATE CAJA 12 KG', sku:'', quantity:'1', unit:'XBX', unitPrice:'384', amount:'384' }];
    await service.initialize();
    await service.importFiles([later(1, { concepts })], { period:'2026-09' });
    const first = (await repository.list('purchase_events'))[0], ingredient = await service.createIngredient(ingredientInput);
    await service.saveProduct(first.id, { ...productInput, ingredientId:ingredient.id });
    await service.validatePrice(first.id);
    await service.importFiles([later(2, { concepts })], { period:'2026-09' });
    expect(await repository.list('price_observations')).toHaveLength(1);
    expect((await repository.list('reviews')).filter(item => item.status === 'pending')).toHaveLength(1);
  });
});
