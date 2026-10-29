function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableToken(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function productIdentity({ supplierId, supplierSku, description, purchaseUnit }) {
  const supplier = normalize(supplierId);
  if (!supplier) throw new Error('El proveedor es obligatorio para identificar un producto comercial.');
  const sku = normalize(supplierSku);
  const basis = sku ? `${supplier}|sku|${sku}` : `${supplier}|desc|${normalize(description)}|${normalize(purchaseUnit)}`;
  return `prd_${stableToken(basis)}`;
}

export function eventIdentity(uuid, conceptIndex) {
  if (!uuid && uuid !== '') throw new Error('El UUID es obligatorio para un evento fiscal.');
  if (!Number.isInteger(conceptIndex) || conceptIndex < 0) throw new Error('El índice de concepto no es válido.');
  return `evt_${normalize(uuid).replaceAll(' ', '_')}_${conceptIndex}`;
}

export function manualEventIdentity(productId, occurredAt, nonce = '') {
  return `evt_manual_${stableToken(`${productId}|${occurredAt}|${nonce}`)}`;
}

export function mergeIngredients(ingredients, sourceId, targetId, actor) {
  if (sourceId === targetId) throw new Error('Selecciona ingredientes distintos.');
  const source = ingredients.find(item => item.id === sourceId);
  const target = ingredients.find(item => item.id === targetId);
  if (!source || !target) throw new Error('No se encontró uno de los ingredientes.');
  const merged = {
    ...target,
    aliases: [...new Set([...(target.aliases || []), source.canonicalName, ...(source.aliases || [])])],
    updatedAt: new Date().toISOString(),
    updatedBy: actor
  };
  const archived = { ...source, status: 'merged', mergedInto: targetId, updatedBy: actor, updatedAt: merged.updatedAt };
  return {
    ingredients: ingredients.map(item => item.id === targetId ? merged : item.id === sourceId ? archived : item),
    undo: { type: 'ingredient.merge', sourceBefore: source, targetBefore: target }
  };
}

export function undoMerge(ingredients, undo) {
  if (undo?.type !== 'ingredient.merge') throw new Error('La operación no puede deshacerse como fusión.');
  return ingredients.map(item => item.id === undo.sourceBefore.id ? undo.sourceBefore : item.id === undo.targetBefore.id ? undo.targetBefore : item);
}

export { normalize, stableToken };
