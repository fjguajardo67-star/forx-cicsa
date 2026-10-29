import { parseCfdi } from './cfdi-parser.js';
import { eventIdentity, productIdentity } from './catalog.js';
import { COMPANY_RFC } from '../data/initial-state.js';

export const DEFAULT_BATCH_LIMITS = Object.freeze({ maxFiles: 500, maxConcurrent: 4 });

async function readBytes(file) {
  if (file instanceof Uint8Array || file instanceof ArrayBuffer) return file;
  if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (typeof file?.text === 'function') return new TextEncoder().encode(await file.text());
  if (typeof file?.content === 'string') return new TextEncoder().encode(file.content);
  throw new Error('No se pudo leer el archivo.');
}

function filename(file, index) {
  return file?.name || `archivo-${index + 1}.xml`;
}

function resultBucket(state) {
  return ['accepted', 'duplicate', 'ineligible', 'conflict', 'quarantine', 'failed'].includes(state) ? state : 'failed';
}

export async function ingestBatch(files, options = {}) {
  const limits = { ...DEFAULT_BATCH_LIMITS, ...(options.limits || {}) };
  const input = [...files];
  if (input.length > limits.maxFiles) throw new Error(`Selecciona como máximo ${limits.maxFiles} XML por lote.`);
  const existing = options.existingImports instanceof Map ? options.existingImports : new Map(Object.entries(options.existingImports || {}));
  const summary = { accepted: 0, duplicate: 0, ineligible: 0, conflict: 0, quarantine: 0, failed: 0, total: input.length };
  const results = [];
  const imports = [];
  const events = [];
  let cancelled = false;

  for (let index = 0; index < input.length; index += 1) {
    if (options.signal?.aborted) { cancelled = true; break; }
    const file = input[index];
    const name = filename(file, index);
    let state = 'failed';
    let parsed;
    try {
      if (!name.toLowerCase().endsWith('.xml')) throw new Error('El archivo no tiene extensión .xml.');
      const bytes = await readBytes(file);
      parsed = await parseCfdi(bytes, { companyRfc: COMPANY_RFC, limits: options.parserLimits });
      if (!parsed.ok) {
        state = 'failed';
      } else if (!parsed.document.elegibilidad.candidate) {
        // Reject before UUID/quarantine/deduplication: another receiver or an
        // issued invoice must never enter the catalog through an alternate path.
        state = 'ineligible';
      } else if (!parsed.document.uuid || !/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(parsed.document.uuid)) {
        state = 'quarantine';
        if(parsed.document.uuid)parsed.warnings.push({code:'UUID_INVALID',message:'El UUID no tiene el formato válido; requiere revisión del despacho.'});
      } else {
        const prior = existing.get(parsed.document.uuid);
        if (prior?.xml_sha256 === parsed.hash) {
          state = prior.processing_status === 'ineligible' && parsed.document.elegibilidad.candidate ? 'accepted' : 'duplicate';
        }
        else if (prior && prior.xml_sha256 !== parsed.hash) state = 'conflict';
        else state = parsed.document.elegibilidad.candidate ? 'accepted' : 'ineligible';
      }

      if (parsed.ok && ['accepted', 'quarantine'].includes(state)) {
        const now = options.now || new Date().toISOString();
        const importId = parsed.document.uuid || `quarantine_${parsed.hash.slice(0, 20)}`;
        const record = {
          id: importId,
          uuid: parsed.document.uuid,
          version: parsed.document.version,
          serie: parsed.document.serie,
          folio: parsed.document.folio,
          fecha: parsed.document.fecha,
          tipo_comprobante: parsed.document.tipo_comprobante,
          moneda: parsed.document.moneda,
          subtotal: parsed.document.subtotal,
          total: parsed.document.total,
          emisor: parsed.document.emisor,
          receptor: parsed.document.receptor,
          elegibilidad: parsed.document.elegibilidad,
          xml_sha256: parsed.hash,
          xml_size: parsed.bytes,
          parser_version: parsed.parserVersion,
          concept_count: parsed.document.conceptos.length,
          processing_status: state,
          warnings: parsed.warnings,
          source: options.source || 'pantry_upload',
          created_at: now,
          created_by: options.actor || 'local-demo'
        };
        imports.push(record);
        if (state === 'accepted') {
          for (const concept of parsed.document.conceptos) {
            const productId = productIdentity({
              supplierId: parsed.document.emisor?.rfc || parsed.document.emisor?.nombre || 'sin-proveedor',
              supplierSku: concept.no_identificacion,
              description: concept.descripcion_original,
              purchaseUnit: concept.clave_unidad || concept.unidad
            });
            events.push({
              id: eventIdentity(parsed.document.uuid, concept.index),
              cfdiUuid: parsed.document.uuid,
              conceptIndex: concept.index,
              productId,
              ingredientId: null,
              supplierId: parsed.document.emisor?.rfc || null,
              supplierName: parsed.document.emisor?.nombre || null,
              observedAt: parsed.document.fecha,
              original: concept,
              classification: 'pending',
              reviewStatus: 'new',
              sourceType: 'xml',
              parserVersion: parsed.parserVersion,
              valid: true
            });
          }
        }
        if (parsed.document.uuid) existing.set(parsed.document.uuid, record);
      }
    } catch (error) {
      parsed = { ok: false, errors: [{ code: 'FILE_READ_ERROR', message: error.message }], warnings: [] };
      state = 'failed';
    }
    summary[resultBucket(state)] += 1;
    const result = { filename: name, state, parsed };
    results.push(result);
    options.onProgress?.({ index: index + 1, total: input.length, result, summary: { ...summary } });
  }

  return { summary, results, imports, events, cancelled };
}

export const ingestionInternals = { readBytes, resultBucket };
