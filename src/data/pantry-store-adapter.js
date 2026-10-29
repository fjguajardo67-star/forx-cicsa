import { pantryViewModel } from './pantry-view-model.js';

// Preserves the existing UI's vocabulary while the service owns all writes.
export class PantryStoreAdapter {
  constructor(service) { this.service = service; this.listeners = new Set(); }
  async initialize() { await this.refresh(); return this; }
  snapshot() { return structuredClone(this.state); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async refresh() {
    this.raw = await this.service.snapshot();
    this.state = pantryViewModel(this.raw, this.service.actor);
    for (const listener of this.listeners) listener(this.snapshot());
  }
  async run(action) {
    if (this.busy) throw new Error('Espera a que termine la operación en curso.');
    this.busy = true;
    this.onBusyChange?.(true);
    try { const result = await action(); await this.refresh(); return result; }
    finally { this.busy = false; this.onBusyChange?.(false); }
  }
  row(id) {
    const row = this.state.reviewItems.find(item => item.id === id);
    if (!row) throw new Error('No se encontró el producto de la revisión.');
    return row;
  }
  createIngredient(input) { return this.run(() => this.service.createIngredient(input)); }
  createCategory(input) { return this.run(() => this.service.createCategory(input)); }
  saveRule(input) { return this.run(() => this.service.saveRule(input)); }
  saveReviewProduct(id, input) {
    const row = this.row(id);
    const prior = this.raw.products.find(item => item.id === row.productId);
    return this.run(async () => ({ product: await this.service.saveProduct(row.activeEventId, {
      ...input, expectedRevision: prior?._revision ?? null
    }), created: !prior, invalidated: this.raw.price_observations.filter(item => item.productId === row.productId).length }));
  }
  linkReviewIngredient(id, input) {
    const row = this.row(id);
    const product = this.raw.products.find(item => item.id === row.productId);
    if (!product) throw new Error('Primero guarda el producto comercial.');
    return this.run(() => this.service.linkIngredient(row.activeEventId, { ...input, expectedProductRevision: product._revision }));
  }
  review(id, decision) {
    const row = this.row(id);
    if (decision.classification === 'non_culinary') return this.excludeReviewItems([id]);
    const product = this.raw.products.find(item => item.id === row.productId);
    const ingredient = this.raw.ingredients.find(item => item.id === product?.ingredientId);
    return this.run(() => this.service.validatePrice(row.activeEventId, {
      expectedProductRevision: product?._revision ?? null,
      expectedIngredientRevision: ingredient?._revision ?? null,
      expectedReviewRevision: row._reviewRevision
    })); // Never accept a browser-computed price as authoritative.
  }
  groupRevisions(ids) {
    return ids.flatMap(id => this.row(id).sourceEventIds).map(id => this.raw.reviews.find(review => review.eventId === id))
      .filter(Boolean).map(review => ({ id: review.id, revision: review._revision }));
  }
  excludeReviewItems(ids) { return this.run(() => this.service.setReviewStatus(this.groupRevisions(ids), 'excluded')); }
  archiveReviewItems(ids) { return this.run(async () => {
    await this.service.setReviewStatus(this.groupRevisions(ids), 'archived');
    return { count: ids.length };
  }); }
  undo(id) { return this.run(() => this.service.undoReviewAction(id)); }
  updateIngredientWaste(id, value, options) {
    const ingredient = this.raw.ingredients.find(item => item.id === id);
    return this.run(() => this.service.updateIngredientWaste(id, value, { ...options, expectedRevision: ingredient?._revision }));
  }
  addManualPrice(input) { return this.run(() => this.service.addManualPrice(input)); }
  async importFiles(files, options) {
    const before = this.raw.purchase_events.length;
    const beforeGroups = this.state.reviewItems.length;
    const batch = await this.run(() => this.service.importFiles(files, options));
    const imports = this.raw.imports.filter(item => item.batchId === batch.id);
    return { summary: batch.counts, cancelled: batch.status !== 'complete',
      catalog: { consolidated: this.raw.purchase_events.length - before - (this.state.reviewItems.length - beforeGroups) },
      results: imports.map(item => ({ filename: item.filename, state: item.status, parsed: {
        hash: item.hash, errors: item.errors, warnings: item.warnings,
        document: { conceptos: Array(item.conceptCount).fill(null), elegibilidad: { reasons: item.eligibilityReasons } }
      } })) };
  }
}
