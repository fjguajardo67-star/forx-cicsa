import { test, expect } from 'vitest';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { ingredientInput, productInput, purchaseXml, file } from './fixtures/monthly.js';

const auth = role => ({ uid:'verified-user', token:{ forxRole:role, forxActive:true, name:'Cuenta verificada' } });
test('el servidor exige identidad FORX y rechaza suplantación desde el payload', async () => {
  const repository = new MemoryEntityRepository();
  const request = { command:'createIngredient', input:{ ...ingredientInput, actor:auth('admin') }, auth:auth('admin') };
  await expect(executePantryCommand(repository, null, request)).rejects.toMatchObject({ code:'permission-denied' });
  await expect(executePantryCommand(repository, { uid:'someone', token:{ admin:true } }, request)).rejects.toMatchObject({ code:'permission-denied' });
  await expect(executePantryCommand(repository, auth('viewer'), request)).rejects.toMatchObject({ code:'permission-denied' });
  await expect(executePantryCommand(repository, auth('admin'), { command:'expireLocalOriginals' })).rejects.toMatchObject({ code:'invalid-argument' });
  await expect(executePantryCommand(repository, auth('admin'), { command:'constructor' })).rejects.toMatchObject({ code:'invalid-argument' });
});
test('el precio y el actor son calculados por servidor; viewer no recibe evidencia fiscal', async () => {
  const repository = new MemoryEntityRepository();
  const service = new PantryService(repository);
  await service.initialize();
  await service.importFiles([file('compra.xml', purchaseXml())], { period:'2026-09' });
  const event = (await service.snapshot()).purchase_events[0];
  const command = (name,input) => executePantryCommand(repository, auth('editor'), { command:name, input });
  const ingredient = await command('createIngredient', { ...ingredientInput, updatedBy:'forged' });
  expect(ingredient.updatedBy).toBe('verified-user');
  await command('saveProduct', { eventId:event.id, product:{ ...productInput, ingredientId:ingredient.id } });
  const price = await command('validatePrice', { eventId:event.id, normalizedPrice:'0.01', reviewedBy:'forged' });
  expect(price.normalizedPrice).toBe('35.5556');
  expect(price.reviewedBy).toBe('verified-user');
  const response = await executePantryCommand(repository, auth('viewer'), { command:'catalog' });
  expect(response.ingredients[0].price.amount).toBe('35.5556');
  expect(JSON.stringify(response)).not.toMatch(/cfdiUuid|supplierId|original|xml|importId/);
  await expect(executePantryCommand(repository, auth('viewer'), { command:'snapshot' })).rejects.toThrow(/consultar/);
});
