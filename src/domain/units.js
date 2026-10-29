import Decimal from 'decimal.js';
import { boundedDecimal } from './bounded-decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const UNIT_DEFINITIONS = Object.freeze({
  KGM: { unit: 'kg', dimension: 'mass', factor: '1' },
  KG: { unit: 'kg', dimension: 'mass', factor: '1' },
  GRM: { unit: 'kg', dimension: 'mass', factor: '0.001' },
  G: { unit: 'kg', dimension: 'mass', factor: '0.001' },
  LTR: { unit: 'l', dimension: 'volume', factor: '1' },
  L: { unit: 'l', dimension: 'volume', factor: '1' },
  LT: { unit: 'l', dimension: 'volume', factor: '1' },
  MLT: { unit: 'l', dimension: 'volume', factor: '0.001' },
  ML: { unit: 'l', dimension: 'volume', factor: '0.001' },
  H87: { unit: 'pz', dimension: 'count', factor: '1' },
  PZ: { unit: 'pz', dimension: 'count', factor: '1' },
  EA: { unit: 'pz', dimension: 'count', factor: '1' },
  C62: { unit: 'pz', dimension: 'count', factor: '1' },
  XBX: { unit: 'caja', dimension: 'package', factor: '1' },
  XPK: { unit: 'paquete', dimension: 'package', factor: '1' },
  XPP: { unit: 'paquete', dimension: 'package', factor: '1' }
});

function decimal(value, field) {
  try {
    const parsed = boundedDecimal(value, field);
    if (!parsed.isFinite()) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${field} no es un número decimal válido.`);
  }
}

function definition(code) {
  return UNIT_DEFINITIONS[String(code || '').trim().toUpperCase()] || null;
}

function display(value, decimals = 6) {
  return new Decimal(value).toDecimalPlaces(decimals).toFixed().replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function normalizePrice(input) {
  try {
    if (input.moneyDecimals!=null && (!Number.isInteger(input.moneyDecimals) || input.moneyDecimals<0 || input.moneyDecimals>12)) throw new Error('La precisión monetaria debe estar entre 0 y 12 decimales.');
    const purchasePrice = decimal(input.purchasePrice, 'El precio de compra');
    const packages = decimal(input.packageCount ?? 1, 'La cantidad de presentaciones');
    const content = decimal(input.contentQuantity, 'El contenido de la presentación');
    const waste = decimal(input.wastePct ?? 0, 'La merma');
    if (!purchasePrice.greaterThan(0) || !packages.greaterThan(0) || !content.greaterThan(0)) {
      return { ok: false, reason: 'Precio, cantidad y contenido deben ser mayores que cero.' };
    }
    if (waste.lessThan(0) || waste.greaterThanOrEqualTo(100)) {
      return { ok: false, reason: 'La merma debe estar entre 0 y menos de 100%.' };
    }

    const source = definition(input.contentUnit);
    const target = definition(input.baseUnit);
    if (!source) return { ok: false, reason: 'La unidad del contenido no está reconocida.' };
    if (!target || target.dimension === 'package') return { ok: false, reason: 'La unidad base debe ser kg, g, l, ml o pz.' };

    let totalBase;
    let conversionNote = '';
    if (source.dimension === target.dimension) {
      totalBase = packages.times(content).times(source.factor).dividedBy(target.factor);
    } else if (new Set([source.dimension, target.dimension]).size === 2 && [source.dimension, target.dimension].every(value => ['mass', 'volume'].includes(value))) {
      if (!input.densityKgPerL) return { ok: false, reason: 'Masa y volumen solo pueden convertirse con una densidad explícita.' };
      const density = decimal(input.densityKgPerL, 'La densidad');
      if (!density.greaterThan(0)) return { ok: false, reason: 'La densidad debe ser mayor que cero.' };
      const amount = packages.times(content).times(source.factor);
      totalBase = source.dimension === 'volume' ? amount.times(density) : amount.dividedBy(density);
      conversionNote = ` usando densidad ${display(density)} kg/L`;
    } else {
      return { ok: false, reason: 'No existe una conversión válida entre esas dimensiones.' };
    }

    const usableQuantity = totalBase.times(new Decimal(1).minus(waste.dividedBy(100)));
    if (!usableQuantity.greaterThan(0)) return { ok: false, reason: 'La cantidad aprovechable debe ser mayor que cero.' };
    const price = purchasePrice.dividedBy(usableQuantity);
    const sourceLabel = String(input.contentUnit || '').toUpperCase();
    const baseLabel = ({ G: 'g', GRM: 'g', ML: 'ml', MLT: 'ml' })[String(input.baseUnit || '').trim().toUpperCase()] || target.unit;
    const packageText = packages.equals(1) ? '' : `${display(packages)} × `;
    const wasteText = waste.equals(0) ? '' : ` × ${(new Decimal(1).minus(waste.dividedBy(100))).toFixed(4)} rendimiento`;
    return {
      ok: true,
      normalizedPrice: price.toDecimalPlaces(input.moneyDecimals ?? 4).toFixed(input.moneyDecimals ?? 4),
      calculationPrice: price.toString(),
      baseQuantity: totalBase.toDecimalPlaces(8).toFixed(),
      usableQuantity: usableQuantity.toDecimalPlaces(8).toFixed(),
      baseUnit: baseLabel,
      formula: `$${display(purchasePrice, 4)} ÷ (${packageText}${display(content)} ${sourceLabel}${wasteText}) = $${display(price, 4)}/${baseLabel}${conversionNote}`,
      provisional: input.validated !== true
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function unitSuggestion(code) {
  const value = definition(code);
  return value ? { baseUnit: value.unit, factor: value.factor, dimension: value.dimension, provisional: true } : null;
}

export const unitInternals = { decimal, definition, display };
