import { DOMParser } from '@xmldom/xmldom';
import { SaxesParser } from 'saxes';
import { COMPANY_RFC } from '../data/initial-state.js';

export const PARSER_VERSION = 'pantry-cfdi/1.0.0';
export const CFDI_NAMESPACES = new Set([
  'http://www.sat.gob.mx/cfd/3',
  'http://www.sat.gob.mx/cfd/4'
]);
export const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxNodes: 50_000
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function bytesFrom(input) {
  if (typeof input === 'string') return textEncoder.encode(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('El XML debe recibirse como texto, ArrayBuffer o Uint8Array.');
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function localName(node) {
  return node?.localName || String(node?.nodeName || '').split(':').at(-1);
}

function attr(element, name) {
  if (!element?.attributes) return null;
  for (let index = 0; index < element.attributes.length; index += 1) {
    const candidate = element.attributes.item(index);
    if (localName(candidate).toLowerCase() === name.toLowerCase()) return candidate.value;
  }
  return null;
}

function children(element, wantedLocalName, namespace = null) {
  const output = [];
  for (let node = element?.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    if (localName(node) !== wantedLocalName) continue;
    if (namespace && node.namespaceURI !== namespace) continue;
    output.push(node);
  }
  return output;
}

function descendants(element, wantedLocalName, namespace = null) {
  const output = [];
  const visit = node => {
    for (let child = node?.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      if (localName(child) === wantedLocalName && (!namespace || child.namespaceURI === namespace)) output.push(child);
      visit(child);
    }
  };
  visit(element);
  return output;
}

function firstDescendant(element, wantedLocalName, namespace = null) {
  return descendants(element, wantedLocalName, namespace)[0] || null;
}

function countNodes(document, limit) {
  let count = 0;
  const stack = [document];
  while (stack.length) {
    const current = stack.pop();
    count += 1;
    if (count > limit) return count;
    for (let child = current?.lastChild; child; child = child.previousSibling) stack.push(child);
  }
  return count;
}

function taxLine(element) {
  return {
    base: attr(element, 'Base'),
    impuesto: attr(element, 'Impuesto'),
    tipo_factor: attr(element, 'TipoFactor'),
    tasa_o_cuota: attr(element, 'TasaOCuota'),
    importe: attr(element, 'Importe')
  };
}

function taxes(element) {
  const taxRoot = children(element, 'Impuestos')[0] || null;
  if (!taxRoot) return { trasladados: [], retenidos: [] };
  const transferRoot = children(taxRoot, 'Traslados')[0] || null;
  const withholdingRoot = children(taxRoot, 'Retenciones')[0] || null;
  return {
    trasladados: transferRoot ? children(transferRoot, 'Traslado').map(taxLine) : [],
    retenidos: withholdingRoot ? children(withholdingRoot, 'Retencion').map(taxLine) : []
  };
}

function party(element, receptor = false) {
  if (!element) return null;
  const result = {
    rfc: attr(element, 'Rfc'),
    nombre: attr(element, 'Nombre'),
    regimen_fiscal: attr(element, receptor ? 'RegimenFiscalReceptor' : 'RegimenFiscal')
  };
  if (receptor) {
    result.uso_cfdi = attr(element, 'UsoCFDI');
    result.domicilio_fiscal = attr(element, 'DomicilioFiscalReceptor');
  }
  return result;
}

function relatedCfdis(root) {
  return children(root, 'CfdiRelacionados').map(group => ({
    tipo_relacion: attr(group, 'TipoRelacion'),
    uuids: children(group, 'CfdiRelacionado').map(item => attr(item, 'UUID')).filter(Boolean)
  }));
}

function parts(concept) {
  return children(concept, 'Parte').map(part => ({
    clave_prod_serv: attr(part, 'ClaveProdServ'),
    no_identificacion: attr(part, 'NoIdentificacion'),
    cantidad: attr(part, 'Cantidad'),
    unidad: attr(part, 'Unidad'),
    descripcion: attr(part, 'Descripcion'),
    valor_unitario: attr(part, 'ValorUnitario'),
    importe: attr(part, 'Importe')
  }));
}

function conceptRecord(element, index) {
  const description = attr(element, 'Descripcion');
  return {
    index,
    clave_prod_serv: attr(element, 'ClaveProdServ'),
    no_identificacion: attr(element, 'NoIdentificacion'),
    cantidad: attr(element, 'Cantidad'),
    clave_unidad: attr(element, 'ClaveUnidad'),
    unidad: attr(element, 'Unidad'),
    descripcion_original: description,
    valor_unitario: attr(element, 'ValorUnitario'),
    importe: attr(element, 'Importe'),
    descuento: attr(element, 'Descuento'),
    objeto_imp: attr(element, 'ObjetoImp'),
    cuenta_predial: children(element, 'CuentaPredial').map(item => attr(item, 'Numero')).filter(Boolean),
    partes: parts(element),
    impuestos: taxes(element),
    normalizado: {
      descripcion_busqueda: description ? description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim() : null,
      clave_unidad: attr(element, 'ClaveUnidad')?.toUpperCase() || null
    }
  };
}

function complements(root) {
  const container = children(root, 'Complemento')[0] || null;
  if (!container) return [];
  const values = [];
  for (let node = container.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    values.push({
      tipo: localName(node),
      namespace: node.namespaceURI || null
    });
  }
  return values;
}

function eligibility(document, ignored) {
  const type = document.tipo_comprobante;
  const issuer = document.emisor?.rfc?.toUpperCase() || null;
  const receiver = document.receptor?.rfc?.toUpperCase() || null;
  const company = COMPANY_RFC;
  const reasons = [];
  if (type !== 'I') reasons.push(`El tipo ${type || 'sin tipo'} se conserva, pero no genera precios de compra.`);
  if (!company) reasons.push('Configura el RFC de la empresa para evaluar compras automáticamente.');
  if (company && receiver !== company) reasons.push('El receptor no coincide con el RFC configurado.');
  if (company && issuer === company) reasons.push('El emisor coincide con la empresa; parece un comprobante emitido, no una compra.');
  if (ignored) reasons.push('El comprobante está cancelado o marcado para ignorarse.');
  return {
    candidate: Boolean(type === 'I' && company && receiver === company && issuer !== company && !ignored),
    reasons
  };
}

function failure(hash, code, message, warnings = []) {
  return {
    ok: false,
    parserVersion: PARSER_VERSION,
    document: null,
    warnings,
    errors: [{ code, message }],
    hash
  };
}

export async function parseCfdi(input, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const bytes = bytesFrom(input);
  const hash = await sha256(bytes);
  if (bytes.byteLength === 0) return failure(hash, 'XML_EMPTY', 'El archivo está vacío.');
  if (bytes.byteLength > limits.maxBytes) {
    return failure(hash, 'XML_TOO_LARGE', `El XML excede el límite de ${Math.round(limits.maxBytes / 1024 / 1024)} MB.`);
  }

  const xmlText = textDecoder.decode(bytes);
  const securityProbe = xmlText.toUpperCase();
  if (securityProbe.includes('<!DOCTYPE') || securityProbe.includes('<!ENTITY')) {
    return failure(hash, 'XML_UNSAFE_DECLARATION', 'El archivo contiene DTD o entidades y fue rechazado por seguridad.');
  }

  // saxes valida estrictamente la buena formación; xmldom se usa después para
  // navegación namespace-aware porque algunos DOM toleran etiquetas mal cerradas.
  try {
    const validator = new SaxesParser({ xmlns: true });
    validator.onerror = error => { throw error; };
    validator.write(xmlText).close();
  } catch (error) {
    return failure(hash, 'XML_MALFORMED', `El XML está malformado: ${error.message}`);
  }

  const parserMessages = [];
  let xmlDocument;
  try {
    xmlDocument = new DOMParser({
      locator: {},
      errorHandler: {
        warning: message => parserMessages.push({ level: 'warning', message }),
        error: message => parserMessages.push({ level: 'error', message }),
        fatalError: message => parserMessages.push({ level: 'fatal', message })
      }
    }).parseFromString(xmlText, 'application/xml');
  } catch (error) {
    return failure(hash, 'XML_MALFORMED', `No se pudo interpretar el XML: ${error.message}`);
  }

  if (parserMessages.some(item => item.level !== 'warning') || !xmlDocument?.documentElement) {
    return failure(hash, 'XML_MALFORMED', 'El XML está malformado y no puede procesarse.', parserMessages.filter(item => item.level === 'warning'));
  }
  const nodeCount = countNodes(xmlDocument, limits.maxNodes);
  if (nodeCount > limits.maxNodes) {
    return failure(hash, 'XML_NODE_LIMIT', `El XML excede el límite de ${limits.maxNodes.toLocaleString('es-MX')} nodos.`);
  }

  const root = xmlDocument.documentElement;
  if (localName(root) !== 'Comprobante' || !CFDI_NAMESPACES.has(root.namespaceURI)) {
    return failure(hash, 'NOT_CFDI', 'El documento no es un CFDI 3.3 o 4.0 reconocido.');
  }

  const version = attr(root, 'Version');
  if (!['3.3', '4.0'].includes(version)) {
    return failure(hash, 'CFDI_VERSION_UNSUPPORTED', `La versión ${version || 'no indicada'} no está soportada.`);
  }

  const issuerElement = children(root, 'Emisor')[0] || null;
  const receiverElement = children(root, 'Receptor')[0] || null;
  const conceptContainer = children(root, 'Conceptos')[0] || null;
  const conceptElements = conceptContainer ? children(conceptContainer, 'Concepto') : [];
  const stamp = firstDescendant(root, 'TimbreFiscalDigital', TFD_NAMESPACE);
  const uuid = attr(stamp, 'UUID')?.toUpperCase() || null;
  const warnings = parserMessages.filter(item => item.level === 'warning').map(item => ({ code: 'XML_WARNING', message: item.message }));
  if (!uuid) warnings.push({ code: 'UUID_MISSING', message: 'No se encontró UUID; el comprobante irá a cuarentena.' });
  if (!conceptContainer) warnings.push({ code: 'CONCEPTS_MISSING', message: 'El comprobante no contiene una sección de conceptos.' });

  const series = attr(root, 'Serie');
  const folio = attr(root, 'Folio');
  const document = {
    uuid,
    version,
    serie: series,
    folio,
    folio_representacion: series && folio ? `${series}-${folio}` : (series || folio),
    fecha: attr(root, 'Fecha'),
    tipo_comprobante: attr(root, 'TipoDeComprobante')?.toUpperCase() || null,
    moneda: attr(root, 'Moneda'),
    tipo_cambio: attr(root, 'TipoCambio'),
    subtotal: attr(root, 'SubTotal'),
    descuento: attr(root, 'Descuento'),
    total: attr(root, 'Total'),
    lugar_expedicion: attr(root, 'LugarExpedicion'),
    metodo_pago: attr(root, 'MetodoPago'),
    forma_pago: attr(root, 'FormaPago'),
    emisor: party(issuerElement),
    receptor: party(receiverElement, true),
    relacionados: relatedCfdis(root),
    timbre: stamp ? {
      uuid,
      fecha_timbrado: attr(stamp, 'FechaTimbrado'),
      rfc_prov_certif: attr(stamp, 'RfcProvCertif'),
      no_certificado_sat: attr(stamp, 'NoCertificadoSAT'),
      version: attr(stamp, 'Version'),
      sello_cfdi_presente: Boolean(attr(stamp, 'SelloCFD')),
      sello_sat_presente: Boolean(attr(stamp, 'SelloSAT'))
    } : null,
    impuestos: taxes(root),
    complementos: complements(root),
    conceptos: conceptElements.map(conceptRecord),
    node_count: nodeCount
  };
  document.elegibilidad = eligibility(document, options.ignored === true);

  return {
    ok: true,
    parserVersion: options.parserVersion || PARSER_VERSION,
    document,
    warnings,
    errors: [],
    hash,
    bytes: bytes.byteLength
  };
}

export const parserInternals = { attr, children, descendants, countNodes, taxes, eligibility };
