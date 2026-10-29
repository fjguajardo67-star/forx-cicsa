import { boundedDecimal } from './bounded-decimal.js';
import { ingestBatch } from './ingestion.js';
import { normalize, productIdentity } from './catalog.js';
import { CATEGORIES } from '../data/initial-state.js';
import { put, check, ConcurrentEditError } from '../data/entity-repository.js';
import { priceForPurchase, productPriceKey, ingredientPriceKey, ingredientPriceKeyMatches, catalogPrices } from './prices.js';
import { originalExpiresAt, expiredOriginals } from './retention.js';
import { atomicWork } from '../data/unit-of-work.js';
import { validateRule, suggestCategory } from './classification-rules.js';
import { exportBackup } from './backup.js';
import { IMPORT_POLICY_ID, invoicePeriod, latestAcceptedPeriod } from './import-policy.js';

const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const required = (value, label, max = 180) => {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw new Error(`${label}: escribe entre 1 y ${max} caracteres.`);
  return text;
};
const decimal = (value, label, { zero = false, ceiling = null } = {}) => {
  let n;
  n = boundedDecimal(value, label);
  if (!n.isFinite() || (zero ? n.lt(0) : n.lte(0)) || (ceiling != null && n.gte(ceiling))) throw new Error(`${label}: valor fuera de rango.`);
  return n.toFixed();
};
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const uniqueKey = name => encodeURIComponent(normalize(name));
const snapshotCollections = ['batches', 'imports', 'purchase_events', 'products', 'ingredients', 'categories', 'reviews', 'price_observations', 'audit', 'settings'];

export class PantryService {
  constructor(repository, { actor = { uid: 'local-operator', name: 'Operador local', role: 'editor' }, clock = () => new Date().toISOString() } = {}) {
    this.repository = repository;
    this.actor = actor;
    this.clock = clock;
  }
  authorize() {
    if (!this.actor?.uid || !['editor', 'admin'].includes(this.actor.role)) throw new Error('Se requiere una cuenta con permiso de edición.');
  }
  stamp(record) { return { ...record, updatedBy: this.actor.uid, updatedAt: this.clock() }; }
  audit(action, entityId, reason, before = null) {
    return { id: id('audit'), action, entityId, reason, before, actorUid: this.actor.uid, actorName: this.actor.name, occurredAt: this.clock() };
  }
  async initialize() {
    this.authorize();
    if (await this.repository.get('settings', 'catalog')) return;
    try {
      await this.repository.commit([
        ...CATEGORIES.map(category => put('categories', this.stamp(category))),
        put('settings', this.stamp({ id: 'catalog', pricePolicy: 'latest_validated_invoice_date', originalRetentionMonths: 2, moneyPolicy: 'net_line_excluding_taxes' }))
      ]);
    } catch (error) { if (!(error instanceof ConcurrentEditError)) throw error; }
  }
  async snapshot() {
    const values = await Promise.all(snapshotCollections.map(name => this.repository.list(name)));
    const result = Object.fromEntries(snapshotCollections.map((name, index) => [name, values[index]]));
    result.rules = result.settings.filter(record => record.kind === 'classification_rule');
    result.suggestions = Object.fromEntries(result.purchase_events.map(event => [event.id, suggestCategory(event, result.rules, result.categories, result.products)]));
    result.catalog = catalogPrices(result);
    result.importPolicy = { mode:'block_older_months', latestAcceptedPeriod:latestAcceptedPeriod(result.imports,result.settings.find(s=>s.id===IMPORT_POLICY_ID)) };
    return result;
  }
  async automaticPriceOperations(event) {
    // A new invoice may inherit a decision, never create the first one.
    // No SKU means the supplier/product identity is only descriptive.
    if (!String(event.original.no_identificacion || '').trim()) return null;
    const product = await this.repository.get('products', event.productId);
    if (!product || product.classification !== 'culinary' || !product.ingredientId
      || normalize(product.supplierSku) !== normalize(event.original.no_identificacion)
      || product.supplierId !== event.supplierId) return null;
    const ingredient = await this.repository.get('ingredients', product.ingredientId);
    if (!ingredient) return null;
    const observations = await this.repository.list('price_observations');
    const sameEvidence = purchase => purchase.supplierId === event.supplierId
      && normalize(purchase.original?.no_identificacion) === normalize(event.original.no_identificacion)
      && normalize(purchase.original?.descripcion_original) === normalize(event.original.descripcion_original)
      && normalize(purchase.original?.clave_unidad || purchase.original?.unidad) === normalize(event.original.clave_unidad || event.original.unidad);
    const candidates = observations.filter(observation => observation.productId === product.id
      && observation.status === 'validated'
      && observation.productPriceKey === productPriceKey(product)
      && ingredientPriceKeyMatches(observation.ingredientPriceKey, ingredient))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.reviewedAt.localeCompare(a.reviewedAt));
    if (!candidates.length) return null;
    const purchases = await this.repository.list('purchase_events');
    for (const prior of candidates) {
      const [review, purchase] = await Promise.all([
        this.repository.get('reviews', prior.eventId), this.repository.get('purchase_events', prior.eventId)
      ]);
      if (review?.status !== 'validated' || review.observationId !== prior.id || !purchase) continue;
      if (!sameEvidence(purchase) || event.observedAt <= purchase.observedAt) return null;
      // Divergent active evidence for this SKU needs a human decision first.
      for (const other of purchases.filter(item => item.productId === product.id)) {
        const otherReview = await this.repository.get('reviews', other.id);
        if (otherReview?.status === 'excluded' || (otherReview?.status !== 'archived' && !sameEvidence(other))) return null;
      }
      let price;
      try { price = priceForPurchase(event, product, ingredient); }
      catch { return null; } // Keep the purchase pending; never invent a conversion.
      const observation = {
        id: id('price'), eventId: event.id, importId: event.importId, productId: product.id, ingredientId: ingredient.id,
        ...price, observedAt: event.observedAt, reviewedAt: this.clock(), reviewedBy: this.actor.uid,
        productPriceKey: productPriceKey(product), ingredientPriceKey: ingredientPriceKey(ingredient),
        status: 'validated', currency: 'MXN', validationMode: 'automatic',
        sourceLabel: 'Compra XML · actualización automática'
      };
      return { observation, checks: [check('products', product), check('ingredients', ingredient), check('reviews', review)] };
    }
    return null;
  }
  async importFiles(files, { period, signal, onProgress = () => {} } = {}) {
    this.authorize();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) throw new Error('Selecciona el periodo mensual del lote.');
    if (!files.length || files.length > 500) throw new Error('Selecciona entre 1 y 500 XML por lote.');
    const batchId = id('batch');
    let batch = this.stamp({ id: batchId, period, status: 'processing', uploadedAt: this.clock(), total: files.length, processed: 0,
      counts: { accepted: 0, duplicate: 0, ineligible: 0, conflict: 0, quarantine: 0, failed: 0, blocked: 0 } });
    await this.repository.commit([put('batches', batch), put('audit', this.audit('import.started', batchId, `Carga mensual ${period}; ${files.length} archivos.`))]);
    try {
      for (const file of files) {
        if (signal?.aborted) break;
        let bytes;
        let readError = null;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('El XML excede 10 MB.');
          bytes = typeof file.arrayBuffer === 'function' ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(file.content || '');
          if (bytes.length > 10 * 1024 * 1024) throw new Error('El XML excede 10 MB.');
        } catch (error) { readError = error.message; bytes = null; }
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const existing = new Map((await this.repository.list('import_keys')).map(record => [record.uuid, record]));
            const result = readError ? { results: [{ state: 'failed', parsed: { errors: [{ message: readError }] } }], imports: [], events: [] }
              : await ingestBatch([{ name: file.name, arrayBuffer: async () => bytes }], { existingImports: new Map(existing), actor: this.actor.uid, now: this.clock() });
            const entry = result.results[0];
            const parsed = entry.parsed;
            if (entry.state === 'ineligible') {
              // Keep only the batch counter and a generic decision. No XML,
              // UUID, supplier, concept or reusable import key is persisted.
              batch = await this.repository.get('batches', batchId);
              await this.repository.commit([
                put('batches', this.stamp({ ...batch, processed: batch.processed + 1,
                  counts: { ...batch.counts, ineligible: batch.counts.ineligible + 1 } }), batch),
                put('audit', this.audit('import.rejected', batchId,
                  'Se rechazó un comprobante: solo se guardan compras tipo I recibidas por CICSA y emitidas por terceros.'))
              ]);
              onProgress({ processed: batch.processed + 1, total: files.length, state: 'ineligible' });
              break;
            }
            const policy=await this.repository.get('settings',IMPORT_POLICY_ID);
            const cutoff=policy?.latestAcceptedPeriod || latestAcceptedPeriod(await this.repository.list('imports'));
            const actualPeriod=invoicePeriod(parsed.document?.fecha);
            if (entry.state==='accepted' && !actualPeriod) {
              entry.state='failed';result.events=[];
              parsed.errors=[...(parsed.errors || []),{code:'INVALID_INVOICE_DATE',message:'Fecha del comprobante inválida. Corrige el XML con el despacho.'}];
            } else if (entry.state==='accepted' && cutoff && actualPeriod<cutoff) {
              entry.state='blocked';result.events=[];
              parsed.errors=[...(parsed.errors || []),{code:'OLDER_XML_PERIOD',message:`XML de ${actualPeriod} bloqueado: el último periodo aceptado es ${cutoff}. No se crearon compras ni se conservó otro original.`}];
            }
            if (entry.state==='accepted' && actualPeriod!==period) parsed.warnings=[...(parsed.warnings || []),{code:'BATCH_PERIOD_LABEL',message:`El XML corresponde a ${actualPeriod}; la etiqueta del lote es ${period}. El corte usa ${actualPeriod}.`}];
            const uploadedAt = this.clock();
            const importId = id('import');
            const uuid = parsed.document?.uuid || null;
            const hash = parsed.hash || null;
            const prior = uuid ? existing.get(uuid) : null;
            const originalId = hash && entry.state!=='blocked' ? `xml_${hash}` : null;
            const original = originalId ? await this.repository.get('originals', originalId) : null;
            const record = {
              id: importId, batchId, period, filename: String(file.name || 'archivo.xml'), status: entry.state,
              uuid, hash, uploadedAt, originalId: originalId || prior?.originalId || null,
              expiresAt: original?.expiresAt || (originalId ? originalExpiresAt(uploadedAt) : null),
              canonicalImportId: prior?.importId || null, invoiceDate: parsed.document?.fecha || null,
              conceptCount: parsed.document?.conceptos.length || 0,
              eligibilityReasons: parsed.document?.elegibilidad.reasons || [],
              warnings: parsed.warnings || [], errors: parsed.errors || [], actorUid: this.actor.uid,
              invoicePeriod:actualPeriod, cutoffPeriod:cutoff
            };
            const operations = [put('imports', record)];
            if (entry.state==='accepted') operations.push(put('settings',this.stamp({id:IMPORT_POLICY_ID,mode:'block_older_months',latestAcceptedPeriod:actualPeriod}),policy));
            if (originalId && !original && bytes) operations.push(put('originals', {
              id: originalId, hash, uploadedAt, expiresAt: record.expiresAt, status: 'retained', bytes,
              path: `originals/${originalId}.xml`, actorUid: this.actor.uid
            }));
            else if (original) operations.push(check('originals', original));
            if (uuid && !prior && ['accepted', 'ineligible'].includes(entry.state)) {
              operations.push(put('import_keys', { id: uuid, uuid, xml_sha256: hash, processing_status: entry.state, importId, originalId }));
            } else if (prior) operations.push(check('import_keys', prior));
            // Every parsed concept survives, including ineligible documents,
            // quarantine and competing XML content. It never becomes a price automatically.
            if (!['duplicate','blocked'].includes(entry.state)) for (const concept of parsed.document?.conceptos || []) {
              operations.push(put('import_concepts', { id: `${importId}_${concept.index}`, importId, original: concept, status: entry.state }));
            }
            for (const event of result.events) {
              const purchase = { ...event, importId, currency: parsed.document.moneda, createdBy: this.actor.uid };
              const automatic = await this.automaticPriceOperations(purchase);
              operations.push(put('purchase_events', purchase));
              operations.push(put('reviews', this.stamp({ id: event.id, eventId: event.id,
                status: automatic ? 'validated' : 'pending', classification: automatic ? 'culinary' : 'pending',
                observationId: automatic?.observation.id || null })));
              if (automatic) {
                operations.push(...automatic.checks, put('price_observations', automatic.observation));
                operations.push(put('audit', this.audit('price.auto_validated', event.id,
                  `${automatic.observation.normalizedPrice}/${automatic.observation.baseUnit} desde XML del mismo proveedor y SKU; vínculo y conversión aprobados sin cambios.`)));
              }
            }
            batch = await this.repository.get('batches', batchId);
            operations.push(put('batches', this.stamp({ ...batch, processed: batch.processed + 1, counts: { ...batch.counts, [entry.state]: batch.counts[entry.state] + 1 } }), batch));
            operations.push(put('audit', this.audit(`import.${entry.state}`, importId, `${record.filename}: ${entry.state}.`)));
            await this.repository.commit(operations);
            onProgress({ processed: batch.processed + 1, total: files.length, state: entry.state });
            break;
          } catch (error) {
            if (error.fileRejected === true) {
              // A deterministic input rejection is isolated to this file. Network,
              // permissions, quota and uncertain commits still interrupt safely.
              batch = await this.repository.get('batches', batchId);
              const importId=id('import');
              await this.repository.commit([
                put('imports',{id:importId,batchId,period,filename:String(file.name || 'archivo.xml').slice(0,260),status:'failed',
                  uuid:null,hash:null,originalId:null,uploadedAt:this.clock(),expiresAt:null,conceptCount:0,
                  errors:[{code:'PERSISTENCE_INPUT_LIMIT',message:error.message}],warnings:[],actorUid:this.actor.uid}),
                put('batches',this.stamp({...batch,processed:batch.processed+1,counts:{...batch.counts,failed:batch.counts.failed+1}}),batch),
                put('audit',this.audit('import.failed',importId,error.message))
              ]);
              onProgress({processed:batch.processed+1,total:files.length,state:'failed'});
              break;
            }
            if (!(error instanceof ConcurrentEditError) || attempt === 2) throw error;
          }
        }
      }
      batch = await this.repository.get('batches', batchId);
      const status = batch.processed === batch.total ? 'complete' : 'cancelled';
      await this.repository.commit([put('batches', this.stamp({ ...batch, status }), batch), put('audit', this.audit(`import.${status}`, batchId, `${batch.processed} de ${batch.total} archivos procesados.`))]);
      return await this.repository.get('batches', batchId);
    } catch (error) {
      batch = await this.repository.get('batches', batchId);
      try { await this.repository.commit([put('batches', this.stamp({ ...batch, status: 'interrupted' }), batch)]); } catch { /* Preserve committed files if the browser is out of quota. */ }
      throw new Error(`La carga se interrumpió. Los archivos ya procesados permanecen guardados. ${error.message}`);
    }
  }
  async createCategory(input) {
    this.authorize();
    const name = required(input.name, 'Nombre de categoría');
    if (!['culinary', 'non_culinary'].includes(input.type)) throw new Error('Selecciona el tipo de categoría.');
    const order = Math.max(-1, ...(await this.repository.list('categories')).map(item => item.order ?? 0)) + 1;
    const category = this.stamp({ id: `category_${uniqueKey(name)}`, name, type: input.type, order, active: true });
    if ((await this.repository.list('categories')).some(item => normalize(item.name) === normalize(name))) throw new Error('Esta categoría ya existe.');
    await this.repository.commit([put('categories', category), put('audit', this.audit('category.created', category.id, name))]);
    return category;
  }
  async saveRule(input) {
    this.authorize();
    const before = input.id ? await this.repository.get('settings', input.id) : null;
    if ((input.id && (!input.id.startsWith('rule_') || before?.kind !== 'classification_rule')) || (before?._revision ?? null) !== (input.expectedRevision ?? null)) throw new ConcurrentEditError();
    const categories = await this.repository.list('categories');
    const value = validateRule(input, categories);
    const rule = this.stamp({ id: before?.id || id('rule'), ...value });
    await this.repository.commit([put('settings', rule, before), check('categories', categories.find(c => c.id === value.categoryId)),
      put('audit', this.audit(before ? 'rule.updated' : 'rule.created', rule.id, `${rule.active ? 'Activa' : 'Pausada'}: ${rule.field} ${rule.operator} «${rule.value}» → ${rule.categoryId}. Solo sugerencias.`, before))]);
    return this.repository.get('settings', rule.id);
  }
  async exportBackup() {
    this.authorize();
    return exportBackup(this.repository, { now: this.clock() });
  }
  async createIngredient(input) {
    this.authorize();
    const canonicalName = required(input.canonicalName, 'Nombre del ingrediente');
    const aliases = [...new Set((input.aliases || []).map(value => required(value, 'Alias')))];
    const category = await this.repository.get('categories', input.categoryId);
    if (!category?.active || category.type !== 'culinary') throw new Error('Selecciona una categoría culinaria.');
    if (!['kg', 'l', 'pz'].includes(input.baseUnit)) throw new Error('La unidad base debe ser kg, litro o pieza.');
    const wastePct = decimal(input.wastePct, 'Merma', { zero: true, ceiling: 100 });
    if (!validDay(input.wasteEffectiveFrom || '')) throw new Error('Indica una fecha válida de confirmación de la merma.');
    const ingredient = this.stamp({ id: id('ingredient'), canonicalName, aliases, categoryId: category.id, baseUnit: input.baseUnit,
      wastePct, wasteEffectiveFrom: input.wasteEffectiveFrom, status: 'active' });
    const names = [...new Set([canonicalName, ...aliases].map(uniqueKey))];
    const operations = [put('ingredients', ingredient), check('categories', category)];
    for (const name of names) {
      if (!name) throw new Error('El nombre debe contener letras o números.');
      if (await this.repository.get('ingredient_keys', name)) throw new Error('El nombre o uno de sus alias ya identifica un ingrediente. Vincula el existente.');
      operations.push(put('ingredient_keys', this.stamp({ id: name, ingredientId: ingredient.id })));
    }
    operations.push(put('audit', this.audit('ingredient.created', ingredient.id, `${canonicalName}; merma ${wastePct}% confirmada el ${ingredient.wasteEffectiveFrom}.`)));
    await this.repository.commit(operations);
    return ingredient;
  }
  async saveProduct(eventId, input) {
    this.authorize();
    const event = await this.repository.get('purchase_events', eventId);
    if (!event) throw new Error('No se encontró el concepto.');
    const productId = productIdentity({ supplierId: event.supplierId, supplierSku: event.original.no_identificacion, description: event.original.descripcion_original, purchaseUnit: event.original.clave_unidad || event.original.unidad });
    const prior = await this.repository.get('products', productId);
    if (input.expectedRevision !== undefined && input.expectedRevision !== (prior?._revision ?? null)) throw new ConcurrentEditError();
    const category = await this.repository.get('categories', input.categoryId);
    if (!category?.active || !['culinary', 'non_culinary'].includes(category.type)) throw new Error('Selecciona una categoría aprobada.');
    const identityBasis = JSON.stringify([normalize(event.supplierId), normalize(event.original.no_identificacion), ...(event.original.no_identificacion ? [] : [normalize(event.original.descripcion_original), normalize(event.original.clave_unidad || event.original.unidad)])]);
    if (prior && prior.identityBasis !== identityBasis) throw new Error('Conflicto de identidad de producto. No se sobrescribió el registro.');
    const culinary = category.type === 'culinary';
    const contentQuantity = culinary ? decimal(input.contentQuantity, 'Contenido') : null;
    const contentUnit = culinary ? input.contentUnit : null;
    if (culinary && !['kg', 'g', 'l', 'ml', 'pz'].includes(contentUnit)) throw new Error('Selecciona la unidad real del contenido.');
    const ingredientId = culinary ? input.ingredientId || null : null;
    const ingredient = ingredientId ? await this.repository.get('ingredients', ingredientId) : null;
    if (ingredientId && !ingredient) throw new Error('Selecciona un ingrediente disponible.');
    const product = this.stamp({ id: productId, identityBasis, supplierId: event.supplierId, supplierName: event.supplierName,
      supplierSku: event.original.no_identificacion || null, preferredDescription: required(input.preferredDescription, 'Nombre del producto'),
      presentation: required(input.presentation, 'Presentación'), brand: String(input.brand || '').trim().slice(0,80), categoryId: category.id, classification: category.type,
      contentQuantity, contentUnit, ingredientId, createdAt: prior?.createdAt || this.clock() });
    const operations = [put('products', product, prior), check('categories', category), put('audit', this.audit(prior ? 'product.updated' : 'product.created', productId, product.preferredDescription, prior))];
    if (ingredient) operations.push(check('ingredients', ingredient));
    await this.repository.commit(operations);
    return product;
  }
  async linkIngredient(eventId, input) {
    this.authorize();
    return atomicWork(this.repository, async repository => {
      const service = new PantryService(repository, { actor: this.actor, clock: this.clock });
      const event = await repository.get('purchase_events', eventId);
      const product = event && await repository.get('products', event.productId);
      if (!product || product.classification !== 'culinary') throw new Error('Guarda primero un producto culinario.');
      if (input.expectedProductRevision !== product._revision) throw new ConcurrentEditError();
      let category = null;
      if (input.create && input.categoryId === '__new__') category = await service.createCategory({ name: input.newCategoryName, type: 'culinary' });
      const ingredient = input.create ? await service.createIngredient({ ...input, categoryId: category?.id || input.categoryId })
        : await repository.get('ingredients', input.ingredientId);
      if (!ingredient || ingredient.status !== 'active') throw new Error('Selecciona un ingrediente disponible.');
      await service.saveProduct(eventId, { ...product, ingredientId: ingredient.id, expectedRevision: product._revision });
      return { ingredient, category, created: Boolean(input.create), invalidated: product.ingredientId !== ingredient.id ? 1 : 0 };
    });
  }
  async setReviewStatus(targets, status) {
    this.authorize();
    if (!['excluded','archived'].includes(status) || !targets.length) throw new Error('Selecciona conceptos y una decisión válida.');
    const before = [];
    const operations = [];
    for (const target of targets) {
      const prior = await this.repository.get('reviews', target.id);
      if (!prior || prior._revision !== target.revision) throw new ConcurrentEditError();
      before.push(prior);
      operations.push(put('reviews', this.stamp({ ...prior, status, classification: status === 'excluded' ? 'non_culinary' : prior.classification }), prior));
    }
    const audit = this.audit(status === 'archived' ? 'concept.archived' : 'concept.excluded', targets[0].id,
      `${targets.length} compras ${status === 'archived' ? 'retiradas de la cola' : 'clasificadas como no culinarias'}. La evidencia permanece.`);
    audit.undo = { reviews: before };
    await this.repository.commit([...operations, put('audit', audit)]);
    return { count: targets.length };
  }
  async undoReviewAction(auditId) {
    this.authorize();
    const audit = await this.repository.get('audit', auditId);
    if (!audit?.undo?.reviews) throw new Error('Esta acción no permite reversión automática.');
    const reversalId = `undo_${auditId}`;
    if (await this.repository.get('audit', reversalId)) throw new Error('Esta acción ya fue revertida.');
    const operations = [];
    for (const before of audit.undo.reviews) {
      const current = await this.repository.get('reviews', before.id);
      if (current?._revision !== before._revision + 1) throw new Error('Hay decisiones posteriores. Revisa el concepto antes de restaurarlo.');
      operations.push(put('reviews', this.stamp(before), current));
    }
    operations.push(put('audit', { ...this.audit('review.restored', audit.entityId, 'Decisión revertida sin borrar su historial.'), id: reversalId, reverses: auditId }));
    await this.repository.commit(operations);
  }
  async updateIngredientWaste(ingredientId, value, { effectiveFrom, scope, expectedRevision } = {}) {
    this.authorize();
    if (scope !== 'ingredient') throw new Error('La merma corresponde al ingrediente maestro.');
    if (!validDay(effectiveFrom)) throw new Error('Indica una fecha válida de confirmación.');
    const before = await this.repository.get('ingredients', ingredientId);
    if (!before || before._revision !== expectedRevision) throw new ConcurrentEditError();
    const ingredient = this.stamp({ ...before, wastePct: decimal(value, 'Merma', { zero:true, ceiling:100 }), wasteEffectiveFrom: effectiveFrom });
    await this.repository.commit([put('ingredients', ingredient, before), put('audit', this.audit('ingredient.waste_updated', ingredientId,
      `Merma ${before.wastePct}% → ${ingredient.wastePct}%; confirmada el ${effectiveFrom}. Las observaciones anteriores permanecen${before.wastePct !== ingredient.wastePct ? '; los precios afectados requieren revalidación.' : '; el precio no cambió.'}`, before))]);
    return { ingredient, recalculated: 0, pricingChanged: before.wastePct !== ingredient.wastePct };
  }
  async addManualPrice(input) {
    this.authorize();
    const ingredient = await this.repository.get('ingredients', input.ingredientId);
    if (!ingredient || input.baseUnit !== ingredient.baseUnit) throw new Error('Selecciona un ingrediente y su unidad base.');
    if (!validDay(String(input.observedAt).slice(0,10))) throw new Error('Indica una fecha válida.');
    const observation = { id: id('price'), ingredientId: ingredient.id, productId: null,
      normalizedPrice: decimal(input.normalizedPrice, 'Precio'), baseUnit: ingredient.baseUnit,
      observedAt: input.observedAt, reviewedAt: this.clock(), reviewedBy: this.actor.uid,
      status: 'provisional', sourceType: 'manual', sourceLabel: required(input.sourceLabel, 'Fuente', 500),
      ingredientPriceKey: ingredientPriceKey(ingredient) };
    await this.repository.commit([check('ingredients', ingredient), put('price_observations', observation),
      put('audit', this.audit('price.manual_added', ingredient.id, `Precio manual provisional: ${observation.normalizedPrice}/${ingredient.baseUnit}. ${observation.sourceLabel}`))]);
    return observation;
  }
  async validatePrice(eventId, { expectedProductRevision, expectedReviewRevision, expectedIngredientRevision } = {}) {
    this.authorize();
    const event = await this.repository.get('purchase_events', eventId);
    if (!event) throw new Error('No se encontró la compra.');
    const product = await this.repository.get('products', event.productId);
    const ingredient = product?.ingredientId ? await this.repository.get('ingredients', product.ingredientId) : null;
    const review = await this.repository.get('reviews', eventId);
    for (const [record, expected] of [[product, expectedProductRevision], [ingredient, expectedIngredientRevision], [review, expectedReviewRevision]]) {
      if (expected !== undefined && (record?._revision ?? null) !== expected) throw new ConcurrentEditError();
    }
    const price = priceForPurchase(event, product, ingredient);
    const observation = {
      id: id('price'), eventId, importId: event.importId, productId: product.id, ingredientId: ingredient.id,
      ...price, observedAt: event.observedAt, reviewedAt: this.clock(), reviewedBy: this.actor.uid,
      productPriceKey: productPriceKey(product), ingredientPriceKey: ingredientPriceKey(ingredient),
      status: 'validated', currency: 'MXN'
    };
    await this.repository.commit([
      check('products', product), check('ingredients', ingredient),
      put('price_observations', observation),
      put('reviews', this.stamp({ ...review, status: 'validated', classification: 'culinary', observationId: observation.id }), review),
      put('audit', this.audit('price.validated', eventId, `${ingredient.canonicalName}: ${observation.normalizedPrice}/${observation.baseUnit}. ${observation.formula}`, review))
    ]);
    return observation;
  }
  async classifyNonCulinary(eventId, reason, expectedRevision) {
    this.authorize();
    const review = await this.repository.get('reviews', eventId);
    if (!review) throw new Error('No se encontró el concepto.');
    if (expectedRevision !== undefined && expectedRevision !== review._revision) throw new ConcurrentEditError();
    const note = required(reason, 'Motivo', 500);
    await this.repository.commit([
      put('reviews', this.stamp({ ...review, status: 'excluded', classification: 'non_culinary', reason: note, observationId: null }), review),
      put('audit', this.audit('concept.excluded', eventId, note, review))
    ]);
  }
  async reopenReview(eventId, reason, expectedRevision) {
    this.authorize();
    const review = await this.repository.get('reviews', eventId);
    if (!review) throw new Error('No se encontró el concepto.');
    if (expectedRevision !== undefined && expectedRevision !== review._revision) throw new ConcurrentEditError();
    const note = required(reason, 'Motivo', 500);
    await this.repository.commit([
      put('reviews', this.stamp({ ...review, status: 'pending', classification: 'pending', observationId: null, reason: note }), review),
      put('audit', this.audit('review.reopened', eventId, note, review))
    ]);
  }
  async retentionPreview(now = this.clock()) { return expiredOriginals(await this.repository.list('originals'), now); }
  // Called only for the v2 local database on opening the application. No cloud
  // scheduler is registered. Derived collections are deliberately not touched.
  async expireLocalOriginals(now = this.clock()) {
    this.authorize();
    const candidates = await this.retentionPreview(now);
    let removed = 0;
    for (const candidate of candidates) {
      const original = await this.repository.get('originals', candidate.id);
      if (!original || !expiredOriginals([original], now).length) continue;
      await this.repository.commit([
        put('originals', { ...original, bytes: null, path: null, status: 'expired', expiredAt: now }, original),
        put('audit', this.audit('original.expired', original.id, `Original vencido el ${original.expiresAt}; solo se retiraron sus bytes y ruta privada.`))
      ]);
      removed++;
    }
    return removed;
  }
}
