import { describe, expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbEntityRepository, put } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { file, purchaseXml, ingredientInput, productInput } from './fixtures/monthly.js';

describe('persistencia por entidad', () => {
  test('recargar recupera el flujo; no consulta ni migra almacenamiento legado', async () => {
    const factory = new IDBFactory();
    let repository = await IndexedDbEntityRepository.open('test-forx', factory);
    const service = new PantryService(repository);
    await service.initialize();
    await service.importFiles([file('a.xml', purchaseXml())], { period: '2026-09' });
    const ingredient = await service.createIngredient(ingredientInput);
    const event = (await service.snapshot()).purchase_events[0];
    await service.saveProduct(event.id, { ...productInput, ingredientId: ingredient.id });
    await service.validatePrice(event.id);
    const before = await service.snapshot();
    repository.close();
    repository = await IndexedDbEntityRepository.open('test-forx', factory);
    const reopened = new PantryService(repository);
    expect(await reopened.snapshot()).toEqual(before);
    expect((await repository.list('originals'))[0].bytes).toBeInstanceOf(Uint8Array);
    repository.close();
  });
  test('dos pestañas sobre la misma entidad detectan revisión obsoleta y revierten el conjunto entero', async () => {
    const factory = new IDBFactory();
    const one = await IndexedDbEntityRepository.open('concurrent', factory);
    const two = await IndexedDbEntityRepository.open('concurrent', factory);
    await one.commit([put('products', { id: 'p1', contentQuantity: '12' })]);
    const stale = await two.get('products', 'p1');
    await one.commit([put('products', { ...stale, contentQuantity: '6' }, stale)]);
    await expect(two.commit([put('audit', { id: 'wrong', reason: 'No debe persistir' }), put('products', { ...stale, contentQuantity: '9' }, stale)])).rejects.toThrow(/otra sesión/);
    expect(await one.get('audit', 'wrong')).toBeNull();
    expect((await two.get('products', 'p1')).contentQuantity).toBe('6');
    one.close(); two.close();
  });
  test('ediciones independientes no se bloquean con una revisión global', async () => {
    const repository = await IndexedDbEntityRepository.open('independent', new IDBFactory());
    await Promise.all([repository.commit([put('products', { id: 'p1' })]), repository.commit([put('products', { id: 'p2' })])]);
    expect(await repository.list('products')).toHaveLength(2);
    repository.close();
  });
});
