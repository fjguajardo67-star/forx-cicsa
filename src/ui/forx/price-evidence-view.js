import { escapeHtml as e } from '../../domain/kitchen-exports.js';

const value = input => input == null || input === '' ? 'No informado' : input;
const money = input => input == null ? 'No informado' : `$${input} MXN`;
const fields = rows => `<dl>${rows.map(([label,content])=>`<dt>${e(label)}</dt><dd>${e(value(content))}</dd>`).join('')}</dl>`;

export function priceEvidenceMarkup(proof) {
  const {ingredient,source,purchase:p,calculation:c,validation:v}=proof;
  return `<div class="price-evidence-head"><div><h3 tabindex="-1" id="price-origin-title">Origen del precio · ${e(ingredient.name)}</h3><p>${e(money(c.normalizedPrice))}/${e(c.baseUnit)} aprovechable</p></div><button class="btn bsec bsm" data-action="closePriceOrigin">Cerrar origen</button></div>
    <div class="price-evidence-grid"><section><h4>Compra de origen</h4>${fields([
      ['Descripción en XML',p.description],['Producto en MiDespensa (nombre actual)',source.productName],
      ['Proveedor',p.supplierName],['RFC del proveedor',p.supplierRfc],['SKU del proveedor',p.supplierSku || 'Sin SKU en XML'],
      ['Fecha del CFDI',p.observedAt],['UUID del CFDI',p.cfdiUuid],['Cantidad / unidad XML',`${p.quantity} ${p.unit || ''}`],
      ['Precio unitario XML',money(p.unitPrice)],['Importe del concepto',money(p.amount)],['Descuento',money(p.discount)]
    ])}</section><section><h4>Cálculo validado</h4>${fields([
      ['Importe neto sin impuestos',money(c.netAmount)],['Presentaciones compradas',c.packageCount],
      ['Contenido confirmado por presentación',`${c.contentQuantity} ${c.contentUnit}`],
      ['Cantidad total convertida a unidad base',`${c.baseQuantity} ${c.baseUnit}`],['Merma aplicada',`${c.wastePct}%`],
      ['Merma confirmada el',c.wasteEffectiveFrom],['Cantidad aprovechable',`${c.usableQuantity} ${c.baseUnit}`]
    ])}<p class="price-equation">${e(money(c.netAmount))} ÷ ${e(c.usableQuantity)} ${e(c.baseUnit)} = <strong>${e(money(c.normalizedPrice))}/${e(c.baseUnit)}</strong></p><p class="status-line">Importe neto del concepto, sin impuestos. La merma se aplica una sola vez. Se muestran los valores guardados al validar.</p></section></div>
    <section class="price-validation"><h4>Validación</h4>${fields([['Observación',v.observationId],['Validado por (ID de usuario)',v.reviewedBy],['Fecha de validación',v.reviewedAt]])}</section>
    <p class="status-line">Esta evidencia derivada permanece aunque el XML original venza a los dos meses de su carga.</p>
    <button class="btn bsec" data-action="priceProduct" data-product="${e(source.productId)}" data-observation="${e(v.observationId)}">Abrir producto y compra en MiDespensa</button>`;
}
