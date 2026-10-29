import { icon } from './icons.js';
import { normalize } from '../domain/catalog.js';
import { priceForPurchase } from '../domain/prices.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 4 }).format(Number(value));
const date = value => value ? String(value).slice(0, 10) : '—';
const statusText = { pending: 'Por revisar', validated: 'Precio validado', excluded: 'No culinario', stale: 'Revalidar precio', accepted: 'Aceptado', duplicate: 'Duplicado', ineligible: 'No elegible', conflict: 'Conflicto', quarantine: 'Cuarentena', failed: 'No procesado', processing: 'En proceso', complete: 'Terminado', cancelled: 'Cancelado', interrupted: 'Interrumpido' };
const badge = status => `<span class="chip ${status === 'validated' || status === 'accepted' ? 'good' : ['conflict','failed'].includes(status) ? 'bad' : 'warn'}">${escape(statusText[status] || status)}</span>`;
const empty = (title, text) => `<div class="empty-state"><strong>${escape(title)}</strong>${escape(text)}</div>`;
const field = (label, name, value = '', attributes = '') => `<label class="field">${label}<input class="input" name="${name}" value="${escape(value)}" ${attributes}></label>`;
const select = (label, name, options, value = '', attributes = '') => `<label class="field">${label}<select class="select" aria-label="${escape(label)}" name="${name}" ${attributes}><option value="">Seleccionar…</option>${options.map(([key, text]) => `<option value="${escape(key)}" ${key === value ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
const nav = [['review','Revisión','review'], ['import','Importar XML','file'], ['products','Productos','box'], ['catalog','Ingredientes y precios','tag'], ['history','Importaciones','history'], ['audit','Bitácora','settings']];

export async function mountPantryApp(root, service) {
  let state = await service.snapshot();
  const ui = { route: 'review', query: '', filter: 'pending', selectedEventId: null, selectedIngredientId: null, notice: '', error: '', busy: false, showIngredient: false, batchResult: null, progress: null, controller: null, productDrafts: {} };
  let disposed = false;
  const categoryOptions = type => state.categories.filter(item => item.active && (!type || item.type === type)).map(item => [item.id, item.name]);
  const reviewFor = event => state.reviews.find(item => item.eventId === event.id);
  const statusFor = event => {
    const review = reviewFor(event);
    if (review?.status === 'validated' && !state.catalog.some(ingredient => ingredient.validObservationIds.includes(review.observationId))) return 'stale';
    return review?.status || 'pending';
  };
  const selected = () => state.purchase_events.find(item => item.id === ui.selectedEventId);
  const selectedProduct = () => state.products.find(item => item.id === selected()?.productId);
  const header = (title, subtitle, actions = '') => `<header class="page-header"><div class="page-heading"><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div><div class="page-actions">${actions}</div></header>`;
  const matches = (...values) => !ui.query || normalize(values.join(' ')).includes(normalize(ui.query));
  const newIngredientForm = (context = 'catalog') => `<form id="ingredient-form" class="v2-form" data-context="${context}"><h3>Nuevo ingrediente</h3><p class="helper">La merma es una decisión tuya; el XML no la proporciona.</p><div class="form-grid">
    ${field('Nombre culinario', 'canonicalName', '', 'required maxlength="180"')}
    ${select('Categoría', 'categoryId', categoryOptions('culinary'), '', 'required')}
    ${select('Unidad del catálogo', 'baseUnit', [['kg','Kilogramo'],['l','Litro'],['pz','Pieza']], '', 'required')}
    ${field('Merma confirmada (%)', 'wastePct', '', 'type="number" min="0" max="99.99" step="0.01" required placeholder="0 si no hay pérdida"')}
    ${field('Merma confirmada el', 'wasteEffectiveFrom', '', 'type="date" required')}
    ${field('Alias aprobados (separados por coma)', 'aliases', '', 'maxlength="500"')}
    </div><div class="form-actions"><button class="button primary" type="submit">Crear ingrediente</button><button class="button quiet" type="button" data-action="cancel-ingredient">Cancelar</button></div></form>`;

  function renderImport() {
    return `${header('Importar lote mensual', 'Los productos y servicios se revisan antes de convertirse en ingredientes o precios.')}<div class="content">
      <section class="section"><form id="import-form"><div class="v2-import-intro">${field('Periodo del lote', 'period', ui.period || new Date().toISOString().slice(0, 7), 'type="month" required')}
      <p class="helper">El periodo organiza el lote. El precio vigente se elige por la fecha del comprobante.</p></div>
      <div class="drop-zone" id="drop-zone">${icon('upload')}<h2>Selecciona los XML del despacho</h2><p>CFDI 3.3 y 4.0 · hasta 500 archivos · 10 MB por archivo. Cada resultado queda registrado, incluso servicios, duplicados y conflictos.</p>
      <label class="field v2-file-label">Archivos XML<input id="xml-files" name="files" type="file" accept=".xml,application/xml,text/xml" multiple required></label>
      <button class="button primary" type="submit">Procesar lote</button></div>
      <p class="helper v2-retention-note">Los originales se conservan durante dos meses naturales desde la carga. Después se eliminan sus bytes; el catálogo, los conceptos, precios y la bitácora permanecen. En esta versión local la limpieza se realiza al abrir FORX.</p></form>
      ${ui.progress ? `<p role="status">Procesados ${ui.progress.processed} de ${ui.progress.total} archivos.</p>` : ''}
      ${ui.busy ? '<button class="button" data-action="cancel-import">Detener al terminar este archivo</button>' : ''}</section>
      ${ui.batchResult ? `<section class="section"><h2>Resultado del lote</h2><p>${ui.batchResult.processed} de ${ui.batchResult.total} archivos. ${escape(statusText[ui.batchResult.status])}.</p><div class="v2-result-list">${Object.entries(ui.batchResult.counts).map(([key, count]) => `<div>${badge(key)}<strong>${count}</strong></div>`).join('')}</div><div class="form-actions"><button class="button primary" data-route="review">Revisar conceptos</button><button class="button" data-route="history">Ver cada archivo</button></div></section>` : ''}
    </div>`;
  }

  function renderReview() {
    const events = state.purchase_events.filter(event => (ui.filter === 'all' || statusFor(event) === ui.filter) && matches(event.original.descripcion_original, event.supplierName, event.original.no_identificacion))
      .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)) || a.id.localeCompare(b.id));
    if (!ui.selectedEventId && events.length) ui.selectedEventId = events[0].id;
    const event = selected();
    const product = selectedProduct();
    const formProduct = { ...product, ...(ui.productDrafts[event?.id] || {}) };
    const ingredient = state.ingredients.find(item => item.id === product?.ingredientId);
    const review = event ? reviewFor(event) : null;
    const priceCaption = event && statusFor(event) === 'validated'
      ? 'Observación validada. Registrar otra revisión es opcional.'
      : 'Vista previa · falta confirmar';
    let preview, previewError = '';
    if (event) { try { preview = priceForPurchase(event, product, ingredient); } catch (error) { previewError = error.message; } }
    return `${header('Revisión de compras', 'Cada renglón conserva su comprobante. Un mismo SKU mantiene una sola ficha comercial.', '<button class="button" data-route="import">Importar XML</button>')}
      <div class="v2-review-layout"><section class="v2-queue"><div class="toolbar"><label class="field">Mostrar<select class="select" id="review-filter" aria-label="Mostrar">${['pending','all','validated','stale','excluded'].map(value => `<option value="${value}" ${ui.filter === value ? 'selected' : ''}>${value === 'all' ? 'Todos los conceptos' : statusText[value]}</option>`).join('')}</select></label><span class="muted">${events.length} conceptos</span></div>
      <div class="v2-table-scroll">${events.length ? `<table class="simple-table v2-review-table"><thead><tr><th>Concepto / proveedor</th><th>Fecha / SKU</th><th>Estado</th></tr></thead><tbody>${events.map(item => `<tr ${item.id === event?.id ? 'class="selected"' : ''}><td><button class="link-button" data-event="${escape(item.id)}">${escape(item.original.descripcion_original)}</button><span class="occurrence-note">${escape(item.supplierName)}</span></td><td>${date(item.observedAt)}<span class="occurrence-note">${escape(item.original.no_identificacion || 'Sin SKU')}</span></td><td>${badge(statusFor(item))}</td></tr>`).join('')}</tbody></table>` : empty('No hay conceptos en esta vista', state.purchase_events.length ? 'Cambia el filtro para consultar los conceptos ya revisados.' : 'Importa el primer lote mensual para comenzar.')}</div></section>
      <aside class="v2-evidence" aria-label="Detalle del concepto">${event ? `<h2>${escape(event.original.descripcion_original)}</h2><div class="v2-chain">
        <section class="evidence-step"><span class="step-index">1</span><h3>Dato original</h3><dl class="field-grid"><dt>Proveedor</dt><dd>${escape(event.supplierName)}</dd><dt>Fecha CFDI</dt><dd>${date(event.observedAt)}</dd><dt>SKU / unidad XML</dt><dd>${escape(event.original.no_identificacion || 'Sin SKU')} · ${escape(event.original.clave_unidad)}</dd><dt>Cantidad</dt><dd>${escape(event.original.cantidad)}</dd><dt>Precio unitario</dt><dd>${escape(event.original.valor_unitario)} ${escape(event.currency)}</dd><dt>Importe / descuento</dt><dd>${escape(event.original.importe)} / ${escape(event.original.descuento || '0')}</dd></dl></section>
        <section class="evidence-step"><span class="step-index">2</span><h3>Producto comercial</h3><p class="helper">${product ? 'Ficha compartida por este proveedor y SKU. Cambiar presentación o vínculo requiere revalidar los precios afectados.' : 'Confirma qué se compra y cuánto contiene cada presentación.'}</p>
        <form id="product-form" class="v2-form"><div class="form-grid">
          ${field('Nombre comercial', 'preferredDescription', formProduct.preferredDescription || event.original.descripcion_original, 'required maxlength="180"')}
          ${field('Presentación o servicio', 'presentation', formProduct.presentation || '', 'required maxlength="180" placeholder="Ej. caja de 12 kg"')}
          ${select('Categoría aprobada', 'categoryId', categoryOptions().filter(([key]) => key !== 'cat_sin'), formProduct.categoryId || '', 'required')}
          ${field('Contenido por presentación', 'contentQuantity', formProduct.contentQuantity || '', 'type="number" min="0.000001" step="any" placeholder="Ej. 12"')}
          ${select('Unidad del contenido', 'contentUnit', [['kg','kg'],['g','g'],['l','litro'],['ml','ml'],['pz','pieza']], formProduct.contentUnit || '')}
          ${select('Ingrediente vinculado', 'ingredientId', state.ingredients.map(item => [item.id, `${item.canonicalName} (${item.baseUnit})`]), formProduct.ingredientId || '')}
        </div><input type="hidden" name="revision" value="${escape(formProduct.revision ?? product?._revision ?? '')}"><div class="form-actions"><button class="button" type="submit">Guardar producto y vínculo</button></div></form></section>
        <section class="evidence-step"><span class="step-index">3</span><h3>Ingrediente maestro</h3>${ingredient ? `<p><strong>${escape(ingredient.canonicalName)}</strong> · ${escape(ingredient.baseUnit)}</p><p class="helper">Merma ${escape(ingredient.wastePct)}%, confirmada el ${date(ingredient.wasteEffectiveFrom)}. Se aplica al validar esta compra.</p>` : '<p class="helper">Selecciona un ingrediente existente en el producto o crea uno y vincúlalo. Los servicios no necesitan ingrediente.</p>'}
        ${ui.showIngredient ? newIngredientForm('review') : '<button class="button compact" data-action="new-ingredient">Crear ingrediente</button>'}</section>
        <section class="evidence-step"><span class="step-index">4</span><h3>Observación de precio</h3>${preview ? `<div class="v2-price"><strong>${money(preview.normalizedPrice)}<small> / ${escape(preview.baseUnit)}</small></strong><span>${priceCaption}</span></div><p class="formula">${escape(preview.formula)}</p><p class="helper">Neto después de descuento, sin impuestos. La merma se aplica una sola vez.</p><button class="button primary" data-action="validate">${review?.status === 'validated' ? 'Registrar nueva validación' : 'Validar precio'}</button>` : `<p class="helper">${escape(previewError)}</p><button class="button primary" disabled>Validar precio</button>`}</section></div>
        <form id="classification-form" class="v2-form v2-secondary-decision"><h3>${review?.status === 'excluded' ? 'Reabrir revisión' : 'Clasificar como no culinario'}</h3><p class="helper">La evidencia queda guardada. Esta decisión no crea ingredientes ni precios.</p>${field('Motivo de la decisión', 'reason', '', 'required maxlength="500" placeholder="Ej. servicio de mantenimiento"')}<button class="button" type="submit">${review?.status === 'excluded' ? 'Reabrir concepto' : 'Confirmar no culinario'}</button></form>
        ${review?.status === 'validated' ? '<button class="button danger" data-action="reopen">Retirar validación y reabrir</button>' : ''}
        ` : empty('Selecciona un concepto', 'Aquí verás el original, la presentación, el ingrediente y la fórmula de precio.')}</aside></div>`;
  }

  function renderCatalog() {
    const rows = state.catalog.filter(item => matches(item.canonicalName, ...item.aliases));
    const chosen = state.catalog.find(item => item.id === ui.selectedIngredientId);
    return `${header('Ingredientes y precios', 'El catálogo puede contener ingredientes sin compras. El precio vigente usa la última fecha de comprobante validada.', '<button class="button primary" data-action="new-ingredient">Nuevo ingrediente</button>')}<div class="content">
      ${ui.showIngredient ? newIngredientForm() : ''}<section class="section"><div class="v2-table-scroll">${rows.length ? `<table class="simple-table v2-catalog"><thead><tr><th>Ingrediente / categoría</th><th>Unidad</th><th>Merma</th><th>Precio vigente</th><th>Fecha CFDI</th></tr></thead><tbody>${rows.map(item => `<tr><td><button class="link-button" data-ingredient="${escape(item.id)}">${escape(item.canonicalName)}</button><span class="occurrence-note">${escape(state.categories.find(cat => cat.id === item.categoryId)?.name)}</span></td><td>${escape(item.baseUnit)}</td><td>${escape(item.wastePct)}%</td><td>${item.currentPrice ? `<strong>${money(item.currentPrice.normalizedPrice)}/${escape(item.baseUnit)}</strong>` : '<span class="chip warn">Sin precio verificable</span>'}</td><td>${date(item.currentPrice?.observedAt)}</td></tr>`).join('')}</tbody></table>` : empty('Aún no hay ingredientes', 'Crea uno manualmente o continúa la revisión de un concepto culinario.')}</div></section>
      ${chosen ? `<section class="section"><h2>Historial · ${escape(chosen.canonicalName)}</h2><p class="helper">${chosen.observations.length} observaciones conservadas. Una revalidación no elimina las anteriores.</p><div class="v2-table-scroll">${chosen.observations.length ? `<table class="simple-table"><thead><tr><th>Fecha CFDI</th><th>Precio</th><th>Fórmula / decisión</th></tr></thead><tbody>${[...chosen.observations].sort((a,b) => b.reviewedAt.localeCompare(a.reviewedAt)).map(obs => `<tr><td>${date(obs.observedAt)}</td><td>${money(obs.normalizedPrice)}/${escape(obs.baseUnit)}</td><td>${escape(obs.formula)}<span class="occurrence-note">${obs.id === chosen.currentPrice?.id ? 'Precio vigente' : chosen.validObservationIds.includes(obs.id) ? 'Validada · compra anterior' : 'Histórica · sustituida o pendiente de revalidación'} · revisada ${date(obs.reviewedAt)}</span></td></tr>`).join('')}</tbody></table>` : empty('Sin observaciones', 'Vincula un producto y valida una compra para incorporar un precio.')}</div></section>` : ''}
      <section class="section"><details><summary>Crear categoría</summary><form id="category-form" class="v2-form"><div class="form-grid">${field('Nombre', 'name', '', 'required maxlength="180"')}${select('Tipo', 'type', [['culinary','Culinaria'],['non_culinary','No culinaria']], '', 'required')}</div><button class="button" type="submit">Guardar categoría</button></form></details></section></div>`;
  }
  function renderProducts() {
    const products = state.products.filter(item => matches(item.preferredDescription, item.supplierSku, item.supplierName));
    return `${header('Productos comerciales', 'La identidad comercial se conserva por proveedor y SKU. Cada producto puede vincularse a un ingrediente.')}<div class="content"><section class="section"><div class="v2-table-scroll">${products.length ? `<table class="simple-table v2-catalog"><thead><tr><th>Producto / proveedor</th><th>SKU</th><th>Presentación</th><th>Ingrediente</th><th>Compras</th></tr></thead><tbody>${products.map(product => {
      const events = state.purchase_events.filter(item => item.productId === product.id);
      return `<tr><td><button class="link-button" data-event="${escape(events[0]?.id)}">${escape(product.preferredDescription)}</button><span class="occurrence-note">${escape(product.supplierName)}</span></td><td>${escape(product.supplierSku || 'Sin SKU')}</td><td>${escape(product.presentation)}<span class="occurrence-note">${product.contentQuantity ? `${escape(product.contentQuantity)} ${escape(product.contentUnit)}` : 'No culinario'}</span></td><td>${escape(state.ingredients.find(item => item.id === product.ingredientId)?.canonicalName || 'Sin vínculo')}</td><td>${events.length}</td></tr>`;
    }).join('')}</tbody></table>` : empty('Aún no hay productos', 'Las fichas comerciales se crean al revisar los conceptos importados.')}</div></section></div>`;
  }
  function renderHistory() {
    return `${header('Importaciones', 'Los duplicados no vuelven a crear compras. Los conflictos mantienen la primera evidencia intacta.')}<div class="content"><section class="section">${state.batches.length ? [...state.batches].sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)).map(batch => `<details class="v2-batch" open><summary>Periodo ${escape(batch.period)} · ${batch.processed}/${batch.total} archivos · ${escape(statusText[batch.status])}</summary><div class="v2-table-scroll"><table class="simple-table"><thead><tr><th>Archivo</th><th>Resultado</th><th>Conceptos</th><th>Carga / vencimiento original</th><th>Detalle</th></tr></thead><tbody>${state.imports.filter(record => record.batchId === batch.id && matches(record.filename, record.status)).map(record => `<tr><td>${escape(record.filename)}</td><td>${badge(record.status)}</td><td>${record.conceptCount}</td><td>${date(record.uploadedAt)} / ${date(record.expiresAt)}</td><td>${escape(record.status === 'conflict' ? 'Mismo UUID con contenido distinto. No genera compras; requiere aclarar con el despacho.' : record.status === 'duplicate' ? 'Ya recibido. Se conserva la primera fecha de carga y vencimiento.' : [...record.eligibilityReasons, ...record.errors.map(error => error.message), ...record.warnings.map(warning => warning.message)].join(' '))}</td></tr>`).join('')}</tbody></table></div></details>`).join('') : empty('No hay lotes importados', 'Carga XML desde Importar XML.')}</section></div>`;
  }
  function renderAudit() {
    return `${header('Bitácora', 'La evidencia y las observaciones permanecen cuando cambias una decisión.')}<div class="content"><section class="section"><div class="v2-table-scroll">${state.audit.length ? `<table class="simple-table"><thead><tr><th>Fecha / persona</th><th>Acción</th><th>Motivo</th></tr></thead><tbody>${[...state.audit].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(entry=>`<tr><td>${date(entry.occurredAt)}<span class="occurrence-note">${escape(entry.actorName)}</span></td><td>${escape(({ 'price.validated':'Precio validado', 'review.reopened':'Revisión reabierta', 'concept.excluded':'Clasificado no culinario', 'ingredient.created':'Ingrediente creado', 'product.created':'Producto creado', 'product.updated':'Producto actualizado', 'category.created':'Categoría creada', 'original.expired':'Original eliminado por vencimiento' })[entry.action] || 'Importación')}</td><td>${escape(entry.reason)}</td></tr>`).join('')}</tbody></table>` : empty('Sin decisiones registradas', 'La bitácora se completa al importar y revisar.')}</div></section></div>`;
  }
  function render() {
    if (disposed) return;
    const content = ({ import: renderImport, review: renderReview, catalog: renderCatalog, products: renderProducts, history: renderHistory, audit: renderAudit })[ui.route]();
    root.innerHTML = `<div class="app-shell v2-shell"><aside class="sidebar"><div class="v2-brand"><strong>FORX <span>v2</span></strong><span>MiDespensa integrado</span></div><nav aria-label="Navegación principal"><ul class="nav-list">${nav.map(([route,label,glyph])=>`<li><button class="nav-button" data-route="${route}" ${ui.route === route ? 'aria-current="page"' : ''} title="${label}">${icon(glyph)}<span>${label}</span></button></li>`).join('')}</ul></nav><div class="nav-spacer"></div><div class="mode-note"><strong>Desarrollo local</strong>Datos de este navegador. Sin conexión a servicios cloud.</div></aside>
      <main class="app-main"><div class="topbar v2-topbar"><label class="searchbox">${icon('search')}<span class="sr-only">Buscar en la vista</span><input id="search" value="${escape(ui.query)}" placeholder="Buscar por nombre, proveedor o SKU"></label><span class="chip v2-environment">FORX · local</span><button class="button compact" data-action="refresh">Recargar datos</button></div>
      <div id="workspace" class="workspace" tabindex="-1" aria-busy="${ui.busy}">${ui.error ? `<div class="v2-notice error" role="alert">${escape(ui.error)}</div>` : ''}${ui.notice ? `<div class="v2-notice" role="status">${escape(ui.notice)}</div>` : ''}${content}</div></main></div>`;
    if (ui.busy) root.querySelectorAll('button, input, select').forEach(control => { if (control.dataset.action !== 'cancel-import') control.disabled = true; });
    root.querySelector('#product-form select[name="categoryId"]')?.addEventListener('change', updateCulinaryFields);
    updateCulinaryFields();
  }
  function updateCulinaryFields() {
    const form = root.querySelector('#product-form');
    if (!form) return;
    const category = state.categories.find(item => item.id === form.elements.categoryId.value);
    for (const name of ['contentQuantity', 'contentUnit', 'ingredientId']) {
      form.elements[name].disabled = ui.busy || category?.type === 'non_culinary';
      form.elements[name].required = name !== 'ingredientId' && category?.type === 'culinary';
    }
    updateSavedPriceState();
  }
  function productIsDirty() {
    const form = root.querySelector('#product-form');
    const product = selectedProduct();
    return form && (!product || ['preferredDescription', 'presentation', 'categoryId', 'contentQuantity', 'contentUnit', 'ingredientId']
      .some(name => !form.elements[name].disabled && form.elements[name].value !== String(product[name] ?? '')));
  }
  function updateSavedPriceState() {
    const button = root.querySelector('[data-action="validate"]');
    if (!button) return;
    const dirty = productIsDirty();
    button.disabled = ui.busy || dirty;
    let warning = root.querySelector('#unsaved-product');
    if (!warning) {
      warning = root.ownerDocument.createElement('p');
      warning.id = 'unsaved-product'; warning.className = 'helper'; warning.setAttribute('role', 'status');
      button.before(warning);
    }
    warning.hidden = !dirty;
    warning.textContent = 'Hay cambios sin guardar. La fórmula usa el producto guardado; guarda los cambios antes de validar.';
  }
  async function refresh() { state = await service.snapshot(); render(); }
  function rememberProduct() {
    const form = root.querySelector('#product-form');
    if (form && ui.selectedEventId) ui.productDrafts[ui.selectedEventId] = Object.fromEntries(new FormData(form));
  }
  async function act(action, message) {
    if (ui.busy) return;
    ui.busy = true; ui.error = ''; ui.notice = '';
    // Keep the actual form in place on failure, including typed input.
    const disabledBefore = new Map([...root.querySelectorAll('button')].map(button => [button, button.disabled]));
    disabledBefore.forEach((_disabled, button) => button.disabled = true);
    try { await action(); ui.notice = message; ui.busy = false; await refresh(); }
    catch (error) {
      ui.error = error.message; ui.busy = false;
      if (ui.route === 'import') { ui.progress = null; render(); return; }
      disabledBefore.forEach((disabled, button) => { if (button.isConnected) button.disabled = disabled; });
      root.querySelectorAll('[data-route]').forEach(button => button.disabled = false);
      const previous = root.querySelector('.v2-notice.error'); previous?.remove();
      const notice = root.ownerDocument.createElement('div'); notice.className = 'v2-notice error'; notice.setAttribute('role','alert'); notice.textContent = error.message;
      root.querySelector('#workspace').prepend(notice);
    }
  }
  async function onClick(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.route) { ui.route = target.dataset.route; ui.query = ''; ui.error = ''; ui.notice = ''; ui.showIngredient = false; render(); root.querySelector('#workspace')?.focus(); return; }
    if (target.dataset.event) { ui.selectedEventId = target.dataset.event; ui.route = 'review'; ui.showIngredient = false; render(); return; }
    if (target.dataset.ingredient) { ui.selectedIngredientId = target.dataset.ingredient; render(); return; }
    const action = target.dataset.action;
    if (action === 'refresh') { await act(async () => {}, 'Datos recargados.'); return; }
    if (action === 'cancel-import') { ui.controller?.abort(); return; }
    if (action === 'new-ingredient' || action === 'cancel-ingredient') { rememberProduct(); ui.showIngredient = action === 'new-ingredient'; render(); root.querySelector('#ingredient-form input')?.focus(); return; }
    if (action === 'validate') {
      if (productIsDirty()) return;
      const product = selectedProduct(), review = reviewFor(selected());
      const ingredient = state.ingredients.find(item => item.id === product?.ingredientId);
      await act(() => service.validatePrice(selected().id, { expectedProductRevision: product?._revision, expectedReviewRevision: review?._revision, expectedIngredientRevision: ingredient?._revision }), 'Precio validado. Ya puedes consultarlo en Ingredientes y precios.');
    }
    if (action === 'reopen') await act(() => service.reopenReview(selected().id, 'Retiro de validación desde la revisión; observación histórica conservada.', reviewFor(selected())._revision), 'Concepto reabierto. La observación anterior permanece en el historial.');
  }
  async function onSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const input = Object.fromEntries(new FormData(form));
    if (form.id === 'product-form') await act(async () => {
      await service.saveProduct(selected().id, { ...input, expectedRevision: input.revision ? Number(input.revision) : null });
      delete ui.productDrafts[selected().id];
    }, 'Producto y vínculo guardados. Confirma el precio cuando la fórmula sea correcta.');
    if (form.id === 'ingredient-form') await act(async () => {
      const ingredient = await service.createIngredient({ ...input, aliases: input.aliases.split(',').map(value=>value.trim()).filter(Boolean) });
      ui.selectedIngredientId = ingredient.id; ui.showIngredient = false;
      if (ui.route === 'review' && selected()) ui.productDrafts[selected().id] = { ...ui.productDrafts[selected().id], ingredientId: ingredient.id };
    }, 'Ingrediente creado. Selecciónalo en el producto y guarda el vínculo para validar el precio.');
    if (form.id === 'category-form') await act(() => service.createCategory(input), 'Categoría creada. Ya está disponible en los formularios.');
    if (form.id === 'classification-form') {
      const review = reviewFor(selected());
      await act(() => review.status === 'excluded' ? service.reopenReview(selected().id, input.reason, review._revision) : service.classifyNonCulinary(selected().id, input.reason, review._revision), 'Decisión registrada. La evidencia original permanece.');
    }
    if (form.id === 'import-form') {
      const files = [...form.elements.files.files];
      ui.period = input.period;
      ui.controller = new AbortController(); ui.progress = { processed: 0, total: files.length };
      await act(async () => {
        render();
        ui.batchResult = await service.importFiles(files, { period: input.period, signal: ui.controller.signal, onProgress: progress => { ui.progress = progress; render(); } });
        ui.progress = null;
      }, 'Lote registrado. Revisa el resultado de cada archivo.');
    }
  }
  const onInput = event => {
    if (event.target.closest('#product-form')) { updateSavedPriceState(); return; }
    if (event.target.id !== 'search') return;
    const position = event.target.selectionStart;
    rememberProduct(); ui.query = event.target.value; render();
    const search = root.querySelector('#search'); search.focus(); search.setSelectionRange(position, position);
  };
  const onChange = event => {
    if (event.target.closest('#product-form')) updateSavedPriceState();
    if (event.target.id === 'review-filter') { ui.filter = event.target.value; ui.selectedEventId = null; render(); }
  };
  root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit); root.addEventListener('input', onInput); root.addEventListener('change', onChange);
  render();
  return { refresh, dispose() { disposed = true; root.removeEventListener('click', onClick); root.removeEventListener('submit', onSubmit); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); } };
}
