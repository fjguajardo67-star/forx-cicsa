import { normalize } from './catalog.js';

// Same normalization as product identity. Literal phrases only: no regex,
// fuzzy SKU matches, inferred prices, conversions or automatic decisions.
export function validateRule(input, categories) {
  const value = String(input.value || '').trim();
  const supplierId = String(input.supplierId || '').trim();
  if (!['description', 'sku'].includes(input.field)) throw new Error('Selecciona descripción o SKU.');
  if (!['equals', 'phrase'].includes(input.operator) || (input.field === 'sku' && input.operator !== 'equals')) throw new Error('Un SKU requiere coincidencia exacta.');
  if (!normalize(value) || value.length > 180) throw new Error('Escribe una condición de 1 a 180 caracteres.');
  if (supplierId.length > 80 || (input.field === 'sku' && !normalize(supplierId))) throw new Error('Una regla de SKU requiere el RFC del proveedor.');
  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 999) throw new Error('La prioridad debe ser un entero entre 0 y 999.');
  const category = categories.find(c => c.id === input.categoryId && c.active && ['culinary', 'non_culinary'].includes(c.type));
  if (!category) throw new Error('Selecciona una categoría aprobada.');
  return { kind: 'classification_rule', field: input.field, operator: input.operator, value, supplierId,
    categoryId: category.id, classification: category.type, priority, active: input.active !== false };
}

export function matchesRule(rule, event) {
  if (!rule.active || (rule.supplierId && normalize(rule.supplierId) !== normalize(event.supplierId))) return false;
  const text = normalize(rule.field === 'sku' ? event.original?.no_identificacion : event.original?.descripcion_original);
  const value = normalize(rule.value);
  return Boolean(value && text && (rule.operator === 'equals' ? text === value : ` ${text} `.includes(` ${value} `)));
}

export function suggestCategory(event, rules, categories, products = []) {
  const available = id => categories.some(c => c.id === id && c.active && c.type !== 'pending');
  const product = products.find(p => p.id === event.productId && normalize(p.supplierId) === normalize(event.supplierId)
    && normalize(p.supplierSku) === normalize(event.original?.no_identificacion) && available(p.categoryId));
  if (product) return { status: 'suggested', source: 'product', categoryId: product.categoryId, matches: [] };
  const matches = rules.filter(r => available(r.categoryId) && matchesRule(r, event)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (!matches.length) return { status: 'none', matches: [] };
  // Priority orders evidence, never hides incompatible recommendations.
  const conflict = new Set(matches.map(r => r.categoryId)).size > 1;
  return { status: conflict ? 'conflict' : 'suggested', source: 'rules', categoryId: conflict ? null : matches[0].categoryId,
    matches: matches.map(r => ({ id: r.id, revision: r._revision, field: r.field, operator: r.operator, value: r.value, categoryId: r.categoryId, priority: r.priority })) };
}
