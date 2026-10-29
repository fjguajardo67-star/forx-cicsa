import Decimal from 'decimal.js';

// Check representation AND scale before arithmetic/toFixed. A tiny exponent
// string must never expand into an unbounded allocation. No rounding on input.
// 32 decimal places preserve legacy fractional portions without permitting
// exponent expansion. This is an input safety bound, not monetary rounding.
export function boundedDecimal(value, label='Número', {max='1000000000000',scale=32}={}) {
  if (!['string','number'].includes(typeof value)) throw new Error(`${label}: número inválido.`);
  const text=String(value).trim();
  if (!text || text.length>64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(text)) throw new Error(`${label}: número inválido o demasiado largo.`);
  const number=new Decimal(text);
  if (!number.isFinite() || number.abs().gt(max) || number.decimalPlaces()>scale) throw new Error(`${label}: fuera de rango; máximo ${max} y ${scale} decimales.`);
  return number;
}
