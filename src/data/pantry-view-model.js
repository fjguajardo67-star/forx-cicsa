import { normalize } from '../domain/catalog.js';
import { COMPANY_RFC } from './initial-state.js';

// Projection for the incumbent MiDespensa UI, never a persistence format.
// One row represents a supplier SKU; every purchase remains independently stored.
export function pantryViewModel(snapshot, actor) {
  const { purchase_events: events, price_observations: observations, catalog } = snapshot;
  const reviews = new Map(snapshot.reviews.map(review => [review.eventId, review]));
  const products = new Map(snapshot.products.map(product => [product.id, { ...product }]));
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.productId)) groups.set(event.productId, []);
    groups.get(event.productId).push(event);
  }
  const validIds = new Set(catalog.flatMap(ingredient => ingredient.validObservationIds));
  const reviewItems = [...groups].map(([productId, purchases]) => {
    purchases.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id));
    const active = purchases.filter(event => reviews.get(event.id)?.status !== 'archived');
    const event = active[0] || purchases[0];
    const review = reviews.get(event.id);
    let product = products.get(productId);
    if (!product) {
      product = { id: productId, supplierId: event.supplierId, supplierName: event.supplierName,
        supplierSku: event.original.no_identificacion, preferredDescription: event.original.descripcion_original,
        categoryId: 'cat_sin', classification: 'pending', aliases: [], _revision: null };
      products.set(productId, product);
    }
    const ingredient = snapshot.ingredients.find(item => item.id === product.ingredientId);
    const validated = review?.status === 'validated' && validIds.has(review.observationId);
    const conflicting = active.some(purchase =>
      normalize(purchase.original.descripcion_original) !== normalize(event.original.descripcion_original)
      || normalize(purchase.original.clave_unidad || purchase.original.unidad) !== normalize(event.original.clave_unidad || event.original.unidad));
    // A later upload of an older invoice must not reopen an approved current row.
    const recommendation = snapshot.suggestions?.[event.id];
    const status = !active.length ? 'archived' : validated ? 'validated' : review?.status === 'excluded' ? 'excluded' : conflicting || recommendation?.status === 'conflict' ? 'conflict' : review?.status === 'validated' ? 'new' : recommendation?.status === 'suggested' ? 'suggested' : 'new';
    product.status = ({ new: 'pending', archived: 'pending' })[status] || status;
    return { id: productId, productId, activeEventId: event.id, sourceEventIds: purchases.map(item => item.id),
      occurrenceCount: purchases.length, description: event.original.descripcion_original,
      supplierId: event.supplierId, supplierName: event.supplierName, sku: event.original.no_identificacion,
      xmlUnit: event.original.clave_unidad || event.original.unidad, quantity: event.original.cantidad,
      unitPrice: event.original.valor_unitario, amount: event.original.importe, observedAt: event.observedAt,
      status, classification: review?.classification || 'pending', evidence: 'xml',
      suggestion: recommendation?.status === 'conflict' ? 'Reglas incompatibles' : snapshot.categories.find(c => c.id === recommendation?.categoryId)?.name || ingredient?.canonicalName || 'Requiere revisión', confidence: null, recommendation,
      conflictReason: conflicting ? 'El mismo proveedor y SKU tiene descripciones o unidades distintas. Confirma la presentación.' : recommendation?.status === 'conflict' ? 'Varias reglas proponen categorías distintas. Decide manualmente; la prioridad no resuelve el conflicto.' : null,
      event, _reviewRevision: review?._revision };
  }).sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.description.localeCompare(b.description));
  return {
    ...snapshot, products: [...products.values()], reviewItems,
    categories: [...snapshot.categories].sort((a,b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name)),
    ingredients: snapshot.ingredients.map(item => ({ ...item, origin: item.origin || 'manual', wasteScope: 'ingredient' })),
    catalog: catalog.map(item => ({ ...item, currentPrice: item.currentPrice ? { ...item.currentPrice, sourceLabel: item.currentPrice.sourceLabel || 'Compra XML validada' } : null })),
    observations: observations.map(item => ({ ...item, sourceType: item.sourceType || 'xml', valid: validIds.has(item.id),
      provisional: item.status !== 'validated', sourceLabel: item.sourceLabel || 'Compra XML validada' })),
    imports: snapshot.batches.map(batch => ({ ...batch, batchName: `Lote ${batch.period}`, createdAt: batch.uploadedAt, actor: batch.updatedBy })),
    audit: [...snapshot.audit].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).map(item => ({ ...item,
      actor: item.actorName, entityLabel: item.entityId, detail: item.reason,
      reversible: Boolean(item.undo) && !snapshot.audit.some(other => other.reverses === item.id) })),
    rules: snapshot.rules || [], settings: { companyRfc: COMPANY_RFC, parserVersion: 'pantry-cfdi/1.0.0',
      maxFiles: 500, maxXmlMb: 10, actor, importPolicy:snapshot.importPolicy }, meta: { mode: 'local' }
  };
}
