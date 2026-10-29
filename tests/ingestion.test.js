import { describe, expect, test } from 'vitest';
import { ingestBatch } from '../src/domain/ingestion.js';
import { parseCfdi } from '../src/domain/cfdi-parser.js';
import { COMPANY_RFC } from '../src/data/initial-state.js';
import { cfdiFixture } from './fixtures/cfdi.js';

const file = (name, content) => ({ name, content });

describe('ingestión idempotente', () => {
  test('procesa fallas individuales sin perder el lote', async () => {
    const result = await ingestBatch([file('bien.xml', cfdiFixture()), file('mal.xml', '<mal>'), file('nota.txt', 'no')]);
    expect(result.summary.accepted).toBe(1);
    expect(result.summary.failed).toBe(2);
    expect(result.events).toHaveLength(1);
  });

  test('mismo UUID y mismo hash es duplicado exacto', async () => {
    const first = await ingestBatch([file('uno.xml', cfdiFixture())]);
    const prior = new Map([[first.imports[0].uuid, first.imports[0]]]);
    const second = await ingestBatch([file('uno.xml', cfdiFixture())], { existingImports: prior });
    expect(second.summary.duplicate).toBe(1);
    expect(second.events).toHaveLength(0);
  });

  test('mismo UUID y hash distinto bloquea sobrescritura', async () => {
    const first = await ingestBatch([file('uno.xml', cfdiFixture())]);
    const prior = new Map([[first.imports[0].uuid, first.imports[0]]]);
    const changed = cfdiFixture().replace('384.123456', '385.123456');
    const second = await ingestBatch([file('cambio.xml', changed)], { existingImports: prior });
    expect(second.summary.conflict).toBe(1);
    expect(second.imports).toHaveLength(0);
  });

  test('sin UUID va a cuarentena', async () => {
    const result = await ingestBatch([file('sin-uuid.xml', cfdiFixture({ uuid: false }))]);
    expect(result.summary.quarantine).toBe(1);
    expect(result.imports[0].id).toMatch(/^quarantine_/);
  });

  test('tipo no elegible se rechaza sin registros ni eventos de precio', async () => {
    const result = await ingestBatch([file('pago.xml', cfdiFixture({ type: 'P' }))]);
    expect(result.summary.ineligible).toBe(1);
    expect(result.imports).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  test.each([
    ['otro receptor', { receiver: 'OTR010101AAA' }],
    ['emitida por CICSA', { receiver: COMPANY_RFC, issuer: COMPANY_RFC }]
  ])('una factura %s nunca genera conceptos de compra', async (_case, fixtureOptions) => {
    const result = await ingestBatch([file('no-corresponde.xml', cfdiFixture(fixtureOptions))]);

    expect(result.summary.ineligible).toBe(1);
    expect(result.summary.accepted).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  test('reprocesa una compra antes inelegible y no permite sustituir el RFC fijo', async () => {
    const content = cfdiFixture({ receiver: COMPANY_RFC });
    const parsedWithoutRfc = await parseCfdi(content, { companyRfc: '' });
    const priorRecord = {
      uuid: parsedWithoutRfc.document.uuid,
      xml_sha256: parsedWithoutRfc.hash,
      processing_status: 'ineligible'
    };
    const prior = new Map([[priorRecord.uuid, priorRecord]]);
    const second = await ingestBatch([file('compra.xml', content)], { existingImports: prior });

    expect(parsedWithoutRfc.document.elegibilidad.candidate).toBe(true);
    expect(second.summary.accepted).toBe(1);
    expect(second.summary.duplicate).toBe(0);
    expect(second.events).toHaveLength(1);
  });
});
