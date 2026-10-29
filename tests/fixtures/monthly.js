import { cfdiFixture } from './cfdi.js';
export const file = (name, content) => ({ name, content });
export const purchaseXml = ({ uuid = '11111111-2222-3333-4444-555555555555', day = '2026-09-20', price = '384', currency = 'MXN', concepts } = {}) => cfdiFixture({ uuid, currency, concepts: concepts || [{ description: 'JITOMATE CAJA 12 KG', sku: 'JT-12', quantity: '1', unit: 'XBX', unitPrice: price, amount: price }] }).replace('Fecha="2026-09-29T12:00:00"', `Fecha="${day}T12:00:00"`);
export function monthlyFiles() {
  const mixed = purchaseXml({ concepts: [
    { description: 'JITOMATE CAJA 12 KG', sku: 'JT-12', quantity: '2', unit: 'XBX', unitPrice: '384', amount: '768', discount: '48' },
    { description: 'SERVICIO DE MANTENIMIENTO', sku: 'SERV-1', quantity: '1', unit: 'E48', unitPrice: '500', amount: '500' },
    { description: 'DETERGENTE', sku: 'DET-1', quantity: '1', unit: 'H87', unitPrice: '100', amount: '100' }
  ] });
  return [file('mixto.xml', mixed), file('duplicado.xml', mixed), file('conflicto.xml', `${mixed}\n`),
    file('pago.xml', cfdiFixture({ uuid: '22222222-2222-3333-4444-555555555555', type: 'P' })),
    file('cuarentena.xml', cfdiFixture({ uuid: false })), file('malformado.xml', '<roto>')];
}
export const ingredientInput = { canonicalName: 'Jitomate', aliases: ['Tomate rojo'], categoryId: 'cat_frutas', baseUnit: 'kg', wastePct: '10', wasteEffectiveFrom: '2026-01-01' };
export const productInput = { preferredDescription: 'Jitomate caja 12 kg', presentation: 'Caja de 12 kg', categoryId: 'cat_frutas', contentQuantity: '12', contentUnit: 'kg' };
