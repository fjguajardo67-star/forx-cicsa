import { test, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createEmulatorRuntime } from '../../src/server/emulator-runtime.js';
import { executePantryCommand } from '../../src/server/pantry-commands.js';
import { restoreLocalCopy } from '../../src/data/local-recovery.js';
import { IndexedDbEntityRepository } from '../../src/data/entity-repository.js';
import { KitchenService } from '../../src/domain/kitchen-service.js';
import { purchaseXml, ingredientInput, productInput } from '../fixtures/monthly.js';
import { assertIsolatedVerification } from '../../scripts/emulator-launch.js';

test.skipIf(!process.env.FORX_ISOLATED_TESTS)('Firestore/Storage aislados: reglas, snapshot consistente y recuperación con costo idéntico', async () => {
  // Never run writes against the shared demo, even if CLI environment leaks.
  assertIsolatedVerification();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8188');
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9098');
  expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('127.0.0.1:9298');
  const runtime = await createEmulatorRuntime();
  const auth = { uid: 'isolated-verification', token: { forxRole: 'admin', forxActive: true } };
  const command = (name, input = {}) => executePantryCommand(runtime.repository, auth, { command: name, input });
  try {
    const rule = await command('saveRule', { field: 'description', operator: 'phrase', value: 'JITOMATE', priority: 5, categoryId: 'cat_frutas' });
    await command('importXML', { period: '2026-09', files: [{ name: 'synthetic.xml', content: purchaseXml() }] });
    const state = await command('snapshot'), event = state.purchase_events[0];
    expect(state.suggestions[event.id].matches[0].id).toBe(rule.id);
    const ingredient = await command('createIngredient', ingredientInput);
    await command('saveProduct', { eventId: event.id, product: { ...productInput, ingredientId: ingredient.id } });
    await command('validatePrice', { eventId: event.id });
    const recipe = await command('saveRecipe', { name: 'Recuperación servidor', type: 'guisado', baseServings: '1', lines: [{ name: 'Jitomate', ingredientId: ingredient.id, quantity: '100', unit: 'g' }] });
    const before = await runtime.repository.exportSnapshot(), backup = await command('exportBackup');
    expect(await runtime.repository.exportSnapshot()).toEqual(before);
    expect(backup.collections.originals[0].path).toBeNull();
    expect((await runtime.bucket.file(before.originals[0].path).download())[0].length).toBeGreaterThan(0);
    const factory = new IDBFactory(), copy = await restoreLocalCopy(JSON.stringify(backup), { factory });
    const local = await IndexedDbEntityRepository.open(copy.name, factory);
    expect((await new KitchenService(local).snapshot()).recipeCosts[recipe.id]).toEqual((await command('kitchenSnapshot')).recipeCosts[recipe.id]);
    local.close();
  } finally { await runtime.close(); }
}, 30000);
