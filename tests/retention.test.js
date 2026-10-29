import { test, expect } from 'vitest';
import { originalExpiresAt, expiredOriginals } from '../src/domain/retention.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { file, purchaseXml, ingredientInput, productInput } from './fixtures/monthly.js';

test.each([
  ['2026-10-02T12:34:56.000Z', '2026-12-02T12:34:56.000Z'],
  ['2026-12-31T12:00:00.000Z', '2027-02-28T12:00:00.000Z'],
  ['2027-12-31T12:00:00.000Z', '2028-02-29T12:00:00.000Z'],
  ['2026-07-31T12:00:00.000Z', '2026-09-30T12:00:00.000Z']
])('dos meses naturales desde %s', (start, expected) => expect(originalExpiresAt(start)).toBe(expected));

test('selección exacta: límite inclusivo, sin fechas futuras ni ya eliminados', () => {
  const make = (id, uploadedAt, status = 'retained') => ({ id, uploadedAt, status, expiresAt: originalExpiresAt(uploadedAt) });
  const originals = [make('before','2026-08-01T00:00:00Z'), make('exact','2026-08-02T12:00:00Z'), make('future','2026-08-02T12:00:00.001Z'), make('expired','2026-08-01T00:00:00Z','expired')];
  expect(expiredOriginals(originals, '2026-10-02T12:00:00Z').map(row=>row.id)).toEqual(['before','exact']);
});

test('limpieza retira solo bytes/ruta; conserva conceptos, catálogo, observaciones y bitácora', async () => {
  const repository = new MemoryEntityRepository();
  let now = '2026-10-02T12:00:00Z';
  const service = new PantryService(repository, { clock: () => now });
  await service.initialize();
  const xml = file('compra.xml', purchaseXml());
  await service.importFiles([xml], { period: '2026-09' });
  const ingredient = await service.createIngredient(ingredientInput);
  const event = (await service.snapshot()).purchase_events[0];
  await service.saveProduct(event.id, { ...productInput, ingredientId: ingredient.id });
  await service.validatePrice(event.id);
  now = '2026-11-30T10:00:00Z';
  await service.importFiles([xml], { period: '2026-11' });
  const before = await service.snapshot();
  expect(await service.retentionPreview()).toEqual([]);
  now = '2026-12-02T12:00:00Z';
  expect(await service.retentionPreview()).toHaveLength(1);
  expect(await service.expireLocalOriginals()).toBe(1);
  const after = await service.snapshot();
  for (const collection of ['imports','purchase_events','products','ingredients','price_observations','reviews']) expect(after[collection]).toEqual(before[collection]);
  expect(after.audit.length).toBe(before.audit.length + 1);
  const original = (await repository.list('originals'))[0];
  expect(original.bytes).toBeNull(); expect(original.path).toBeNull(); expect(original.status).toBe('expired');
  expect(await service.expireLocalOriginals()).toBe(0);
  await service.importFiles([xml], { period: '2026-12' });
  expect((await repository.list('originals'))[0].bytes).toBeNull();
  expect((await service.snapshot()).purchase_events).toHaveLength(1);
});
