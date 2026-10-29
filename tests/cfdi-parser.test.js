import { describe, expect, test } from 'vitest';
import { parseCfdi, PARSER_VERSION } from '../src/domain/cfdi-parser.js';
import { COMPANY_RFC } from '../src/data/initial-state.js';
import { cfdiFixture, manyConcepts } from './fixtures/cfdi.js';

describe('parser CFDI propio', () => {
  test.each(['3.3', '4.0'])('interpreta CFDI %s con precisión decimal', async version => {
    const result = await parseCfdi(cfdiFixture({ version }), { companyRfc: COMPANY_RFC });
    expect(result.ok).toBe(true);
    expect(result.parserVersion).toBe(PARSER_VERSION);
    expect(result.document.version).toBe(version);
    expect(result.document.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(result.document.conceptos[0].valor_unitario).toBe('384.123456');
    expect(result.document.conceptos[0].descripcion_original).toBe('JITOMATE SALADET CAJA 12 KG & CALIDAD');
    expect(result.document.conceptos[0].impuestos.trasladados[0].importe).toBe('61.459753');
    expect(result.document.elegibilidad.candidate).toBe(true);
  });

  test('navega por namespaceURI/localName con prefijo distinto', async () => {
    const result = await parseCfdi(cfdiFixture({ prefix: 'x' }), { companyRfc: COMPANY_RFC });
    expect(result.ok).toBe(true);
    expect(result.document.emisor.rfc).toBe('PRO010101AAA');
  });

  test('acepta namespace CFDI predeterminado', async () => {
    const result = await parseCfdi(cfdiFixture({ prefix: '' }), { companyRfc: COMPANY_RFC });
    expect(result.ok).toBe(true);
    expect(result.document.conceptos).toHaveLength(1);
  });

  test.each(['E', 'P', 'N', 'T'])('conserva tipo %s como no elegible', async type => {
    const result = await parseCfdi(cfdiFixture({ type }), { companyRfc: COMPANY_RFC });
    expect(result.ok).toBe(true);
    expect(result.document.tipo_comprobante).toBe(type);
    expect(result.document.elegibilidad.candidate).toBe(false);
  });

  test('solo acepta facturas recibidas por CICSA y emitidas por un tercero', async () => {
    const valid = await parseCfdi(cfdiFixture({ receiver: COMPANY_RFC }), { companyRfc: COMPANY_RFC });
    const wrongReceiver = await parseCfdi(cfdiFixture({ receiver: 'OTR010101AAA' }), { companyRfc: COMPANY_RFC });
    const issuedByCicsa = await parseCfdi(cfdiFixture({ receiver: COMPANY_RFC, issuer: COMPANY_RFC }), { companyRfc: COMPANY_RFC });

    expect(valid.document.elegibilidad.candidate).toBe(true);
    expect(wrongReceiver.document.elegibilidad).toEqual(expect.objectContaining({
      candidate: false,
      reasons: expect.arrayContaining(['El receptor no coincide con el RFC configurado.'])
    }));
    expect(issuedByCicsa.document.elegibilidad).toEqual(expect.objectContaining({
      candidate: false,
      reasons: expect.arrayContaining(['El emisor coincide con la empresa; parece un comprobante emitido, no una compra.'])
    }));
  });

  test('rechaza XML malformado', async () => {
    const result = await parseCfdi('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"><cfdi:Emisor></cfdi:Comprobante>');
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('XML_MALFORMED');
  });

  test('rechaza DTD y entidades antes del parser', async () => {
    const xml = '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><foo>&xxe;</foo>';
    const result = await parseCfdi(xml);
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('XML_UNSAFE_DECLARATION');
  });

  test('sin UUID se conserva con advertencia y cuarentena posible', async () => {
    const result = await parseCfdi(cfdiFixture({ uuid: false }), { companyRfc: COMPANY_RFC });
    expect(result.ok).toBe(true);
    expect(result.document.uuid).toBeNull();
    expect(result.warnings.some(item => item.code === 'UUID_MISSING')).toBe(true);
  });

  test('moneda extranjera y tipo de cambio no se inventan ni convierten', async () => {
    const result = await parseCfdi(cfdiFixture({ currency: 'USD', exchangeRate: '17.123456' }));
    expect(result.document.moneda).toBe('USD');
    expect(result.document.tipo_cambio).toBe('17.123456');
  });

  test('NoIdentificacion ausente permanece nulo', async () => {
    const result = await parseCfdi(cfdiFixture({ concepts: [{ description: 'INSUMO SIN SKU', sku: '', unitPrice: '2.50', amount: '2.50' }] }));
    expect(result.document.conceptos[0].no_identificacion).toBeNull();
  });

  test('no trunca más de 300 conceptos y conserva índice y orden', async () => {
    const result = await parseCfdi(cfdiFixture({ concepts: manyConcepts(305) }));
    expect(result.ok).toBe(true);
    expect(result.document.conceptos).toHaveLength(305);
    expect(result.document.conceptos[304].index).toBe(304);
    expect(result.document.conceptos[304].no_identificacion).toBe('SKU-305');
  });

  test('SHA-256 corresponde a los bytes originales', async () => {
    const first = await parseCfdi(cfdiFixture());
    const second = await parseCfdi(`${cfdiFixture()}\n`);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toBe(second.hash);
  });

  test('respeta límites de bytes y nodos con error entendible', async () => {
    const tooLarge = await parseCfdi(cfdiFixture(), { limits: { maxBytes: 20 } });
    expect(tooLarge.errors[0].code).toBe('XML_TOO_LARGE');
    const tooManyNodes = await parseCfdi(cfdiFixture(), { limits: { maxNodes: 4 } });
    expect(tooManyNodes.errors[0].code).toBe('XML_NODE_LIMIT');
  });
});
