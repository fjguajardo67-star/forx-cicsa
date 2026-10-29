// Read-only projections of the purchase behind the CURRENT validated price.
// Never infer a SKU from a name or substitute another purchase of that product.
function sourceFor(snapshot, ingredient) {
  const price = ingredient.currentPrice;
  if (!price) return null;
  const event = snapshot.purchase_events.find(item => item.id === price.eventId);
  const product = snapshot.products.find(item => item.id === price.productId);
  if (!event || !product || event.productId !== product.id || event.importId !== price.importId) return null;
  return { observationId:price.id, productId:product.id, eventId:event.id,
    productName:product.preferredDescription, description:event.original.descripcion_original,
    supplierName:event.supplierName, supplierSku:event.original.no_identificacion || null,
    observedAt:event.observedAt };
}

export function currentPriceSources(snapshot) {
  return Object.fromEntries(snapshot.catalog.map(ingredient => [ingredient.id, sourceFor(snapshot, ingredient)]));
}

export function currentPriceEvidence(snapshot, { ingredientId, observationId } = {}) {
  const ingredient = snapshot.catalog.find(item => item.id === ingredientId);
  const price = ingredient?.currentPrice;
  if (!observationId || !price || price.id !== observationId) {
    throw new Error('El precio cambió o ya no está vigente. Pulsa Actualizar datos y vuelve a abrir su origen.');
  }
  const source = sourceFor(snapshot, ingredient);
  if (!source || !price.priceBasis) throw new Error('La evidencia de este precio está incompleta. Revísalo en MiDespensa.');
  const event = snapshot.purchase_events.find(item => item.id === source.eventId);
  const original = event.original;
  const basis = price.priceBasis;
  // Use the saved normalization basis, not mutable names, presentations or waste.
  // Explicit fields keep XML bytes, Storage paths and unrelated fiscal data private.
  return {
    ingredient:{id:ingredient.id,name:ingredient.canonicalName,baseUnit:ingredient.baseUnit},
    source,
    purchase:{id:event.id,cfdiUuid:event.cfdiUuid,supplierName:event.supplierName,
      supplierRfc:event.supplierId,supplierSku:source.supplierSku,description:original.descripcion_original,
      observedAt:event.observedAt,unit:original.clave_unidad || original.unidad || null,
      quantity:original.cantidad,unitPrice:original.valor_unitario,amount:original.importe,
      discount:original.descuento || '0',currency:event.currency},
    calculation:{netAmount:basis.purchasePrice,packageCount:basis.packageCount,
      contentQuantity:basis.contentQuantity,contentUnit:basis.contentUnit,
      baseQuantity:price.baseQuantity,usableQuantity:price.usableQuantity,
      wastePct:price.wastePct,wasteEffectiveFrom:price.wasteEffectiveFrom,
      normalizedPrice:price.normalizedPrice,baseUnit:price.baseUnit,policy:price.policy},
    validation:{observationId:price.id,reviewedAt:price.reviewedAt,reviewedBy:price.reviewedBy}
  };
}
