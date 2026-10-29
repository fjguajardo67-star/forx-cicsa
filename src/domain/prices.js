import { boundedDecimal } from './bounded-decimal.js';
import { normalizePrice } from './units.js';

export const productPriceKey = product => JSON.stringify([product.ingredientId, product.classification, product.contentQuantity, product.contentUnit]);
// Only quantities used by the formula determine price compatibility. The
// confirmation date is provenance, not a cutoff against invoice dates.
export const ingredientPriceKey = ingredient => JSON.stringify([ingredient.baseUnit, ingredient.wastePct]);
export function ingredientPriceKeyMatches(savedKey, ingredient) {
  try {
    const values = JSON.parse(savedKey);
    return Array.isArray(values) && values[0] === ingredient.baseUnit && values[1] === ingredient.wastePct;
  } catch { return false; }
}

export function priceForPurchase(event, product, ingredient) {
  if (!product || !ingredient || product.ingredientId !== ingredient.id || product.classification !== 'culinary') throw new Error('Guarda un producto culinario y vincúlalo a un ingrediente.');
  if (event.currency !== 'MXN') throw new Error('La moneda no es MXN. Se conserva la compra; falta una conversión monetaria aprobada.');
  const invoiceDate = event.observedAt || '';
  const instant = new Date(`${invoiceDate}Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(invoiceDate) || !Number.isFinite(instant.valueOf())
    || instant.toISOString().slice(0, 19) !== invoiceDate) throw new Error('La fecha del comprobante no es válida.');
  const original = event.original;
  let quantity, amount, discount, unitPrice;
  try {
    quantity = boundedDecimal(original.cantidad);
    amount = boundedDecimal(original.importe);
    discount = boundedDecimal(original.descuento || 0);
    unitPrice = boundedDecimal(original.valor_unitario);
  } catch { throw new Error('El concepto contiene cantidades o importes inválidos.'); }
  if (![quantity, amount, discount, unitPrice].every(n => n.isFinite()) || !quantity.gt(0) || !amount.gt(0) || !unitPrice.gt(0) || discount.lt(0) || discount.gte(amount)) throw new Error('Revisa cantidad, importe y descuento: el neto debe ser positivo.');
  if (amount.minus(quantity.times(unitPrice)).abs().gt('0.02')) throw new Error('Cantidad × precio unitario no coincide con el importe del XML.');
  const priceBasis = {
    purchasePrice: amount.minus(discount).toFixed(), packageCount: quantity.toFixed(),
    contentQuantity: product.contentQuantity, contentUnit: product.contentUnit,
    baseUnit: ingredient.baseUnit, wastePct: ingredient.wastePct, validated: true
  };
  const result = normalizePrice(priceBasis);
  if (!result.ok) throw new Error(result.reason);
  return { ...result, priceBasis, policy: 'net_line_excluding_taxes', wastePct: ingredient.wastePct, wasteEffectiveFrom: ingredient.wasteEffectiveFrom };
}

export function catalogPrices({ ingredients, products, reviews, price_observations }) {
  return ingredients.map(ingredient => {
    const observations = price_observations.filter(obs => obs.ingredientId === ingredient.id);
    const valid = observations.filter(obs => {
      const review = reviews.find(row => row.eventId === obs.eventId);
      const product = products.find(row => row.id === obs.productId);
      return review?.status === 'validated' && review.observationId === obs.id && product
        && obs.productPriceKey === productPriceKey(product)
        && ingredientPriceKeyMatches(obs.ingredientPriceKey, ingredient);
    }).sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.reviewedAt.localeCompare(a.reviewedAt) || a.id.localeCompare(b.id));
    const selected=valid[0];
    // Reconstruct precision from the immutable evidence of legacy observations;
    // never rewrite their originally stored rounded value.
    const exact=selected?.priceBasis ? normalizePrice(selected.priceBasis):null;
    const currentPrice=selected ? {...selected,calculationPrice:exact?.ok ? exact.calculationPrice:selected.calculationPrice || selected.normalizedPrice}:null;
    return { ...ingredient, currentPrice, observations, validObservationIds: valid.map(item => item.id) };
  });
}
