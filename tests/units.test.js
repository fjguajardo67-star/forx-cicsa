import { describe, expect, test } from 'vitest';
import { normalizePrice, unitSuggestion } from '../src/domain/units.js';

describe('unidades y precios', () => {
  test.each([
    ['KGM', 'kg', '25', '620', '24.8000'],
    ['GRM', 'kg', '1000', '90', '90.0000'],
    ['LTR', 'l', '20', '780', '39.0000'],
    ['MLT', 'l', '1000', '30', '30.0000'],
    ['H87', 'pz', '12', '120', '10.0000']
  ])('normaliza %s a %s', (source, target, quantity, price, expected) => {
    const result = normalizePrice({ purchasePrice: price, contentQuantity: quantity, contentUnit: source, baseUnit: target, validated: true });
    expect(result.ok).toBe(true);
    expect(result.normalizedPrice).toBe(expected);
  });

  test('caja con múltiples unidades muestra fórmula', () => {
    const result = normalizePrice({ purchasePrice: '384', packageCount: '1', contentQuantity: '12', contentUnit: 'KGM', baseUnit: 'kg' });
    expect(result.formula).toContain('$384');
    expect(result.formula).toContain('12 KGM');
    expect(result.formula).toContain('$32/kg');
    expect(result.provisional).toBe(true);
  });

  test('aplica merma como rendimiento sin float binario', () => {
    const result = normalizePrice({ purchasePrice: '100', contentQuantity: '10', contentUnit: 'KGM', baseUnit: 'kg', wastePct: '20', validated: true });
    expect(result.normalizedPrice).toBe('12.5000');
    expect(result.usableQuantity).toBe('8');
  });

  test('prohíbe masa a volumen sin densidad', () => {
    const result = normalizePrice({ purchasePrice: '100', contentQuantity: '10', contentUnit: 'KGM', baseUnit: 'l' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/densidad/i);
  });

  test('permite masa a volumen con densidad explícita', () => {
    const result = normalizePrice({ purchasePrice: '90', contentQuantity: '9', contentUnit: 'KGM', baseUnit: 'l', densityKgPerL: '0.9', validated: true });
    expect(result.ok).toBe(true);
    expect(result.normalizedPrice).toBe('9.0000');
  });

  test('sugerencias SAT son provisionales', () => {
    expect(unitSuggestion('GRM')).toEqual({ baseUnit: 'kg', factor: '0.001', dimension: 'mass', provisional: true });
    expect(unitSuggestion('XBX').dimension).toBe('package');
  });

  test.each([
    ['g', '1000', '0.1000'],
    ['ml', '1000', '0.1000']
  ])('conserva el precio por %s cuando un ingrediente existente usa unidad pequeña', (baseUnit, quantity, expected) => {
    const contentUnit = baseUnit === 'g' ? 'g' : 'ml';
    const result = normalizePrice({ purchasePrice: '100', contentQuantity: quantity, contentUnit, baseUnit, validated: true });
    expect(result.ok).toBe(true);
    expect(result.baseUnit).toBe(baseUnit);
    expect(result.normalizedPrice).toBe(expected);
    expect(result.usableQuantity).toBe('1000');
  });
});
