import { COMPANY_RFC } from '../../src/data/initial-state.js';

export function cfdiFixture(options = {}) {
  const version = options.version || '4.0';
  const namespace = version === '3.3' ? 'http://www.sat.gob.mx/cfd/3' : 'http://www.sat.gob.mx/cfd/4';
  const prefix = options.prefix === undefined ? 'cfdi' : options.prefix;
  const tag = name => prefix ? `${prefix}:${name}` : name;
  const namespaceDeclaration = prefix ? `xmlns:${prefix}="${namespace}"` : `xmlns="${namespace}"`;
  const uuid = options.uuid === false ? '' : `<tfd:TimbreFiscalDigital Version="1.1" UUID="${options.uuid || '11111111-2222-3333-4444-555555555555'}" FechaTimbrado="2026-09-29T12:10:00" RfcProvCertif="AAA010101AAA" NoCertificadoSAT="00001000000000000000" SelloCFD="privado" SelloSAT="privado"/>`;
  const type = options.type || 'I';
  const concepts = options.concepts || [{
    description: 'JITOMATE SALADET CAJA 12 KG &amp; CALIDAD',
    sku: 'JT-12',
    quantity: '1.000000', unit: 'XBX', unitText: 'Caja', unitPrice: '384.123456', amount: '384.123456', discount: '4.123456'
  }];
  const conceptXml = concepts.map((concept, index) => `<${tag('Concepto')} ClaveProdServ="50171800"${concept.sku ? ` NoIdentificacion="${concept.sku}"` : ''} Cantidad="${concept.quantity || '1'}" ClaveUnidad="${concept.unit || 'H87'}" Unidad="${concept.unitText || 'Pieza'}" Descripcion="${concept.description || `CONCEPTO ${index + 1}`}" ValorUnitario="${concept.unitPrice || '1.00'}" Importe="${concept.amount || '1.00'}"${concept.discount ? ` Descuento="${concept.discount}"` : ''} ObjetoImp="02"><${tag('Impuestos')}><${tag('Traslados')}><${tag('Traslado')} Base="${concept.amount || '1.00'}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="61.459753"/></${tag('Traslados')}></${tag('Impuestos')}><${tag('CuentaPredial')} Numero="PREDIAL-FICTICIO"/><${tag('Parte')} ClaveProdServ="50171800" NoIdentificacion="PARTE-${index}" Cantidad="1" Unidad="pz" Descripcion="PARTE FICTICIA" ValorUnitario="1" Importe="1"/></${tag('Concepto')}>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<${tag('Comprobante')} ${namespaceDeclaration} xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="${version}" Serie="A" Folio="100" Fecha="2026-09-29T12:00:00" TipoDeComprobante="${type}" Moneda="${options.currency || 'MXN'}"${options.exchangeRate ? ` TipoCambio="${options.exchangeRate}"` : ''} SubTotal="${options.subtotal || '384.123456'}" Descuento="4.123456" Total="441.460000" LugarExpedicion="31000" MetodoPago="PUE" FormaPago="03">
  <${tag('CfdiRelacionados')} TipoRelacion="04"><${tag('CfdiRelacionado')} UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"/></${tag('CfdiRelacionados')}>
  <${tag('Emisor')} Rfc="${options.issuer || 'PRO010101AAA'}" Nombre="PROVEEDOR FICTICIO" RegimenFiscal="601"/>
  <${tag('Receptor')} Rfc="${options.receiver || COMPANY_RFC}" Nombre="CICSA COMEDORES" DomicilioFiscalReceptor="31000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <${tag('Conceptos')}>${conceptXml}</${tag('Conceptos')}>
  <${tag('Impuestos')} TotalImpuestosTrasladados="61.459753"><${tag('Traslados')}><${tag('Traslado')} Base="384.123456" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="61.459753"/></${tag('Traslados')}></${tag('Impuestos')}>
  <${tag('Complemento')}>${uuid}</${tag('Complemento')}>
</${tag('Comprobante')}>`;
}

export function manyConcepts(count = 301) {
  return Array.from({ length: count }, (_, index) => ({ description: `CONCEPTO FICTICIO ${index + 1}`, sku: `SKU-${index + 1}`, quantity: '1', unit: 'H87', unitText: 'Pieza', unitPrice: '1.000001', amount: '1.000001' }));
}
