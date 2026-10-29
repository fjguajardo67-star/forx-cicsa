import { icon } from './icons.js';
import { PantryStoreAdapter } from '../data/pantry-store-adapter.js';
import { COMPANY_RFC } from '../data/initial-state.js';
import { priceForPurchase } from '../domain/prices.js';
import { normalizePrice, unitSuggestion } from '../domain/units.js';
import { captureReviewViewport, restoreReviewViewport } from './review-viewport.js';
import { rulesPanel, backupPanel, bindRulesAndBackup } from './rules-and-backup.js';
import { syncThemeControl, toggleTheme } from './theme.js';
import { createAccessPanel } from './access-panel.js';

export async function mountMiDespensa(app, service) {
const store = await new PantryStoreAdapter(service).initialize();
let state = store.snapshot();
let disposed = false;
const accessPanel=createAccessPanel({access:service.access,actor:service.actor,signOut:()=>service.session.signOut()});
const ui = {
  route: 'review',
  query: '',
  reviewFilter: 'all',
  productFilter: 'all',
  reviewSort: 'recent',
  period: new Date().toISOString().slice(0,7),
  selectedReviewId: null,
  editingReviewProductId: null,
  reviewIngredientEditor: null,
  evidenceClosed: false,
  selectedProductId: state.products[0]?.id,
  priceReference: null,
  priceReferenceError: null,
  selectedIngredientId: state.ingredients[0]?.id,
  showIngredientForm: false,
  showCategoryForm: false,
  importResult: null,
  importProgress: null,
  importController: null,
  bulk: new Set(),
  categorySimulation: '',
  page: { products: 1, ingredients: 1 },
  pageSize: 10,
  toasts: []
};

// A price link selects the exact immutable observation, never the latest row
// grouped by SKU. This is read-only and does not change the review selection.
const referenceUrl = new URL(location.hash.slice(1), 'http://forx.invalid');
if (referenceUrl.pathname.startsWith('/despensa/producto/')) {
  ui.route = 'products';
  try {
    ui.selectedProductId = decodeURIComponent(referenceUrl.pathname.slice('/despensa/producto/'.length));
    const observation = state.observations.find(item => item.id === referenceUrl.searchParams.get('observacion') && item.productId === ui.selectedProductId);
    const event = state.purchase_events.find(item => item.id === observation?.eventId && item.productId === ui.selectedProductId);
    if (!state.products.some(item => item.id === ui.selectedProductId) || !observation || !event) throw new Error();
    ui.priceReference = { observation, event };
  } catch { ui.priceReferenceError = 'No se encontró el producto y la compra de ese enlace. Vuelve a Precios y actualiza los datos.'; }
}

const nav = [
  ['home', 'Inicio', 'home'],
  ['import', 'Importar XML', 'file'],
  ['review', 'Revisión', 'review'],
  ['products', 'Productos', 'box'],
  ['ingredients', 'Ingredientes', 'tag'],
  ['categories', 'Categorías y reglas', 'grid'],
  ['imports', 'Importaciones', 'history'],
  ['admin', 'Administración', 'settings']
];

const liveRegion = document.querySelector('#live-region');
const busyControls=new WeakMap();
function setBusy(busy) {
  app.setAttribute('aria-busy',String(busy));
  app.querySelectorAll('button,input,select,textarea').forEach(control=>{
    if(control.id==='cancel-import')return;
    if(busy){if(!busyControls.has(control))busyControls.set(control,control.disabled);control.disabled=true;}
    else if(busyControls.has(control)){control.disabled=busyControls.get(control);busyControls.delete(control);}
  });
}
store.onBusyChange=setBusy;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatMoney(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(number) : '—';
}

function priceBreakdown(item, product, ingredient) {
  try { return priceForPurchase(item.event, product, ingredient); } catch { return null; }
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.valueOf())) return escapeHtml(value);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(parsed);
}

function categoryName(id) {
  return state.categories.find(item => item.id === id)?.name || 'Sin clasificar';
}

function productStatusDetails(product) {
  const review = state.reviewItems.find(item => item.productId === product.id && item.status !== 'archived');
  const archived = state.reviewItems.some(item => item.productId === product.id && item.status === 'archived');
  const labels = { pending: 'Pendiente', validated: 'Validado', excluded: 'Excluido', conflict: 'Conflicto' };
  const status = product.status || 'pending';
  let reason;
  if (status === 'validated') reason = 'Precio real validado en Revisión.';
  else if (status === 'excluded') reason = 'Excluido de FORX desde Revisión.';
  else if (status === 'conflict') reason = review?.conflictReason || product.conflictReason || 'Revisa la presentación de este SKU.';
  else if (!review && archived) reason = 'El concepto se retiró de Revisión; puedes restablecerlo en la Bitácora.';
  else if (!review) reason = 'Aún no hay un concepto validado para este producto.';
  else if (!product.presentation || !product.contentQuantity || !product.contentUnit) reason = 'Falta completar la presentación y el contenido en Revisión.';
  else if (!product.ingredientId) reason = 'Falta vincular un ingrediente maestro en Revisión.';
  else reason = 'El XML aporta el importe; confirma una vez la conversión en Revisión. Los XML posteriores compatibles actualizarán el precio.';
  return { label: labels[status] || 'Pendiente', reason, tone: status === 'validated' ? 'good' : status === 'conflict' ? 'bad' : 'warn' };
}

function announce(message) {
  if(disposed)return;
  liveRegion.textContent = '';
  requestAnimationFrame(() => { if(!disposed)liveRegion.textContent = message; });
}

function toast(message, type = 'success') {
  if(disposed)return;
  const id = Date.now() + Math.random();
  ui.toasts.push({ id, message, type });
  renderToasts();
  window.setTimeout(() => {
    ui.toasts = ui.toasts.filter(item => item.id !== id);
    renderToasts();
  }, 4200);
  announce(message);
}

function renderToasts() {
  if(disposed)return;
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  region.innerHTML = ui.toasts.map(item => `<div class="toast ${item.type === 'error' ? 'error' : ''}">${escapeHtml(item.message)}</div>`).join('');
}

function pendingCount() {
  return state.reviewItems.filter(item => !['validated', 'excluded', 'archived'].includes(item.status)).length;
}

function shell() {
  const active = nav.find(item => item[0] === ui.route) || nav[0];
  const initials = state.settings.actor.name.split(/\s+/).map(value => value[0]).join('').slice(0, 2).toUpperCase();
  return `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Navegación principal">
        <div class="brand"><span class="brand-logo-frame"><img class="brand-logo" src="/midespensa-logo.svg" alt="MiDespensa de FORX"></span></div>
        <ul class="nav-list">${nav.map(([route, label, iconName]) => `
          <li><button class="nav-button" data-route="${route}" ${route === ui.route ? 'aria-current="page"' : ''} title="${escapeHtml(label)}">${icon(iconName)}<span>${escapeHtml(label)}${route === 'review' ? ` <span class="sr-only">${pendingCount()} pendientes</span>` : ''}</span></button></li>`).join('')}<li><button class="nav-button" id="return-forx" aria-label="Menú y recetas FORX" title="Menú y recetas FORX">${icon('grid')}<span>Menú y recetas FORX</span></button></li></ul>
        <div class="nav-spacer"></div>
        ${service.session?`<div class="session-account"><strong>${escapeHtml(service.actor.email || service.actor.name)}</strong><span>${escapeHtml({admin:'Administración',editor:'Edición',viewer:'Consulta'}[service.actor.role] || '')}</span><button class="button" type="button" data-signout>Cerrar sesión</button></div>`:''}
        <p class="helper session-context" style="padding:12px">${escapeHtml(service.mode || 'Datos de este navegador. Sin nube.')}</p>
      </aside>
      <div class="app-main">
        <header class="topbar">
          <label class="searchbox">${icon('search')}<span class="sr-only">Buscar en MiDespensa</span><input id="global-search" type="search" value="${escapeHtml(ui.query)}" placeholder="${ui.route === 'review' ? 'Buscar en la cola (descripción, proveedor, SKU)' : `Buscar en ${escapeHtml(active[1].toLowerCase())}…`}" autocomplete="off"></label>
          <button class="button primary top-action" data-route="ingredients" aria-label="Consultar catálogo">${icon('tag')}<span>Consultar catálogo</span></button>
          <button class="button theme-toggle" type="button" data-theme-toggle>${icon('theme')}<span data-theme-label></span></button>
          <button class="account" type="button" data-route="admin" aria-label="Abrir perfil y administración; ${escapeHtml(state.settings.actor.name)}"><span class="avatar">${escapeHtml(initials)}</span>${icon('down')}</button>
        </header>
        <main class="workspace" id="workspace" tabindex="-1">${renderPage()}</main>
      </div>
    </div>`;
}

function pageHeader(title, description, actions = '') {
  return `<header class="page-header"><div class="page-heading"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="page-actions">${actions}</div></header>`;
}

function renderPage() {
  switch (ui.route) {
    case 'home': return renderHome();
    case 'import': return renderImport();
    case 'review': return renderReview();
    case 'products': return renderProducts();
    case 'ingredients': return renderIngredients();
    case 'categories': return renderCategories();
    case 'imports': return renderImports();
    case 'admin': return renderAdmin();
    default: return renderHome();
  }
}

function renderHome() {
  const valid = state.catalog.filter(item => item.currentPrice).length;
  return `<div class="page">${pageHeader('Panorama de MiDespensa', 'El catálogo de ingredientes y precios pertenece a FORX. No requiere publicación entre aplicaciones.', `<button class="button" data-route="import">${icon('upload')} Importar XML</button>`)}
    <div class="content"><section class="section"><div class="ledger-metrics">
      <div class="metric"><strong>${state.ingredients.length}</strong><span>Ingredientes maestros</span></div>
      <div class="metric"><strong>${state.products.length}</strong><span>Productos comerciales</span></div>
      <div class="metric"><strong>${pendingCount()}</strong><span>Productos por resolver</span></div>
      <div class="metric"><strong>${valid}</strong><span>Ingredientes con precio verificado</span></div>
    </div></section><div class="dashboard-grid"><section class="section"><div class="section-head"><div><h2>Importaciones recientes</h2><p>Los conceptos y las decisiones permanecen después de vencer los originales.</p></div></div>${importTable(state.imports.slice(0,4))}</section>
    <aside><section class="section"><h2>Catálogo interno</h2><p>Productos comerciales e ingredientes tienen identidades distintas. Las recetas utilizarán los ingredientes y sus precios validados.</p><button class="button primary" data-route="ingredients">Consultar ingredientes</button></section></aside></div></div></div>`;
}

function renderReview() {
  const visibleReviewItems = state.reviewItems.filter(item => item.status !== 'archived');
  const counts = Object.fromEntries(['all', 'new', 'suggested', 'conflict', 'validated'].map(key => [key, key === 'all' ? visibleReviewItems.length : visibleReviewItems.filter(item => item.status === key).length]));
  const query = ui.query.trim().toLocaleLowerCase('es-MX');
  const items = visibleReviewItems.filter(item => (ui.reviewFilter === 'all' || item.status === ui.reviewFilter) && (!query || [item.description, item.supplierName, item.sku, item.suggestion].some(value => String(value || '').toLocaleLowerCase('es-MX').includes(query))));
  items.sort((a,b) => ui.reviewSort === 'supplier' ? a.supplierName.localeCompare(b.supplierName) : ui.reviewSort === 'description' ? a.description.localeCompare(b.description) : b.observedAt.localeCompare(a.observedAt));
  if (!ui.evidenceClosed && !items.some(item => item.id === ui.selectedReviewId)) ui.selectedReviewId = items[0]?.id || null;
  const selected = items.find(item => item.id === ui.selectedReviewId) || visibleReviewItems.find(item => item.id === ui.selectedReviewId) || null;
  if (ui.editingReviewProductId && ui.editingReviewProductId !== selected?.id) ui.editingReviewProductId = null;
  if (ui.reviewIngredientEditor && ui.reviewIngredientEditor.itemId !== selected?.id) ui.reviewIngredientEditor = null;
  const labels = { all: 'Todos', new: 'Por revisar', suggested: 'Con sugerencia', conflict: 'En conflicto', validated: 'Validados' };
  return `<div class="review-page">
    <header class="review-titlebar"><div><h1>Cola de revisión</h1><div class="review-tabs" role="tablist" aria-label="Filtrar cola">${Object.entries(labels).map(([key, label]) => `<button class="review-tab" role="tab" data-review-filter="${key}" aria-selected="${ui.reviewFilter === key}">${label}<span class="count">${counts[key]}</span></button>`).join('')}</div></div><select class="select review-sort" aria-label="Ordenar revisión"><option value="recent" ${ui.reviewSort === 'recent' ? 'selected' : ''}>Más recientes primero</option><option value="supplier" ${ui.reviewSort === 'supplier' ? 'selected' : ''}>Por proveedor</option><option value="description" ${ui.reviewSort === 'description' ? 'selected' : ''}>Por descripción</option></select></header>
    <div class="review-workspace">
      <section class="queue" aria-label="Conceptos por revisar">${items.length ? `<table class="data-table"><thead><tr><th><span class="sr-only">Seleccionar</span></th><th>Estado</th><th>Descripción original</th><th>Proveedor</th><th>SKU</th><th>Unidad</th><th>Precio</th><th>Sugerencia</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${items.map(item => reviewRow(item)).join('')}</tbody></table>` : `<div class="empty-state"><strong>No hay conceptos con este filtro</strong>Prueba otro estado o limpia la búsqueda.</div>`}</section>
      ${selected ? renderEvidence(selected) : `<aside class="evidence-panel"><div class="empty-state"><strong>Selecciona un concepto</strong>Su evidencia y la interpretación de MiDespensa aparecerán aquí.</div></aside>`}
    </div></div>`;
}

function reviewRow(item) {
  const selected = item.id === ui.selectedReviewId;
  const statusLabels = { new: 'Por revisar', suggested: 'Con sugerencia', conflict: 'En conflicto', validated: 'Validado', excluded: 'Excluido' };
  const occurrenceNote = item.occurrenceCount > 1 ? `<span class="occurrence-note">${item.occurrenceCount} compras · un solo SKU</span>` : '';
  const suggestion = ['validated', 'excluded'].includes(item.status) ? '—' : !item.suggestion || item.suggestion === 'Requiere revisión' ? 'Sin sugerencia' : item.suggestion;
  return `<tr class="${selected ? 'selected' : ''}" data-review-row="${item.id}" tabindex="0" aria-selected="${selected}">
    <td><input class="row-select" type="checkbox" data-bulk="${item.id}" aria-label="Seleccionar ${escapeHtml(item.description)}" ${ui.bulk.has(item.id) ? 'checked' : ''}></td>
    <td><span class="status ${item.status}">${escapeHtml(statusLabels[item.status] || item.status)}</span></td>
    <td class="description">${escapeHtml(item.description)}${occurrenceNote}</td><td class="supplier">${escapeHtml(item.supplierName)}</td><td class="mono">${escapeHtml(item.sku || '—')}</td><td>${escapeHtml(item.xmlUnit || '—')}</td><td class="money">${formatMoney(item.unitPrice)}</td><td>${escapeHtml(suggestion)}</td><td><button class="row-menu" type="button" data-remove-review="${item.id}" aria-label="Eliminar ${escapeHtml(item.description)} de la lista" title="Eliminar de la lista">${icon('trash')}</button></td></tr>`;
}

function renderEvidence(item) {
  const editing = ui.editingReviewProductId === item.id || ui.reviewIngredientEditor?.itemId === item.id;
  const product = state.products.find(value => value.id === item.productId);
  const ingredient = state.ingredients.find(value => value.id === product?.ingredientId);
  const effective = priceBreakdown(item, product, ingredient);
  let priceError = null;
  if (product && ingredient && !effective) { try { priceForPurchase(item.event, product, ingredient); } catch (error) { priceError = error.message; } }
  const confidence = item.recommendation?.status === 'conflict' ? 'Requiere decisión' : item.recommendation?.status === 'suggested' ? 'Sugerencia explicable' : 'Sin sugerencia';
  const evidenceSource = item.occurrenceCount > 1 ? `Última de ${item.occurrenceCount} compras con este SKU` : 'Del comprobante de compra';
  return `<aside class="evidence-panel" aria-label="Ficha de evidencia"><div class="evidence-head"><div><h2>Ficha de evidencia</h2><p>${escapeHtml(item.description)}</p></div><div class="evidence-head-actions"><span class="confidence">${escapeHtml(confidence)}</span><button class="evidence-close" id="close-evidence" type="button" aria-label="Cerrar ficha de evidencia">${icon('close')}</button></div></div>
    ${ui.bulk.size ? `<div class="notice warning bulk-review-actions">${icon('info')}<div><strong>${ui.bulk.size} seleccionados.</strong> Las acciones masivas conservan evidencia y se registran en la bitácora.<div class="bulk-review-buttons"><button class="button compact" id="bulk-exclude">Excluir de FORX</button><button class="button compact danger" id="bulk-remove">Eliminar de la lista</button><button class="button compact quiet" id="bulk-clear">Limpiar</button></div></div></div>` : ''}
    <div class="evidence-chain">
      ${evidenceStep(1, 'Dato original', evidenceSource, [['Descripción', item.description], ['Proveedor', item.supplierName], ['SKU', item.sku || 'No informado'], ['Unidad', item.xmlUnit || 'No informada'], ['Cantidad', item.quantity || '—'], ['Precio', formatMoney(item.unitPrice)]])}
      ${renderReviewProductStep(item, product)}
      ${renderReviewIngredientStep(item, product, ingredient)}
      <section class="evidence-step"><span class="step-index">4</span><div class="step-heading"><h3>Precio real con merma</h3><span>${effective ? item.status === 'validated' ? 'Precio validado' : 'Listo para validar' : 'Pendiente'}</span></div>${effective ? `<div class="price-strip with-waste"><div><span>Precio del producto</span><strong>${formatMoney(item.unitPrice)}</strong></div><div><span>Contenido bruto</span><strong>${escapeHtml(`${product.contentQuantity} ${product.contentUnit}`)}</strong></div><div><span>Merma</span><strong>${escapeHtml(`${ingredient.wastePct || 0}%`)}</strong></div><div><span>Precio real</span><strong>${formatMoney(effective.normalizedPrice)}/${escapeHtml(effective.baseUnit)}</strong></div></div><div class="yield-note">Cantidad aprovechable: <strong>${escapeHtml(effective.usableQuantity)} ${escapeHtml(effective.baseUnit)}</strong></div><div class="formula">${escapeHtml(effective.formula)}</div>` : `<div class="notice warning">${icon('alert')}<div>${escapeHtml(priceError || (!product ? 'Guarda el producto comercial del paso 2.' : !ingredient ? 'Crea o vincula un ingrediente maestro en el paso 3.' : 'Revisa la presentación, la conversión y la merma.'))}</div></div>`}</section>
    </div>
    ${editing ? '<p class="helper" role="status">Guarda o cancela los cambios antes de validar.</p>' : ''}
    <div class="evidence-actions"><div class="evidence-secondary-actions"><button class="button" id="exclude-review">Excluir de FORX</button><button class="button danger" id="remove-review">${icon('trash')} Eliminar de la lista</button></div><button class="button primary" id="validate-review" ${!effective || editing || product?.classification === 'non_culinary' ? 'disabled' : ''}>${item.status === 'validated' ? 'Revalidar precio real' : 'Validar precio real'}</button></div>
  </aside>`;
}

function renderReviewIngredientStep(item, product, ingredient) {
  const editor = ui.reviewIngredientEditor?.itemId === item.id ? ui.reviewIngredientEditor.mode : null;
  const fields = ingredient
    ? [['Nombre', ingredient.canonicalName], ['Categoría', categoryName(ingredient.categoryId)], ['Unidad base', ingredient.baseUnit], ['Merma estándar', `${ingredient.wastePct || 0}%`], ['Rendimiento', `${100 - Number(ingredient.wastePct || 0)}%`], ['Merma confirmada el', ingredient.wasteEffectiveFrom ? formatDate(ingredient.wasteEffectiveFrom) : 'Sin fecha']]
    : [['Ingrediente maestro', 'Sin vincular']];
  const available = state.ingredients.filter(entry => entry.status !== 'merged');
  return `<section class="evidence-step" id="review-ingredient-step" tabindex="-1"><span class="step-index">3</span><div class="step-heading"><h3>Ingrediente maestro</h3><span>${ingredient ? 'Vinculado' : 'Requiere decisión'}</span></div>
    <dl class="field-grid">${fields.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>
    ${!product ? '<p class="helper review-step-help">Guarda primero el producto comercial para continuar.</p>' : product.classification === 'non_culinary' ? '<p class="helper review-step-help">Este producto es no culinario. Cámbiale la categoría o exclúyelo de FORX.</p>' : `
      ${ingredient ? `<button class="button compact quiet evidence-edit" type="button" data-open-waste="${escapeHtml(ingredient.id)}">${icon('edit')} Ajustar merma</button>` : ''}
      ${editor === 'select' ? `<form id="review-ingredient-select" class="review-product-form" data-review-id="${escapeHtml(item.id)}"><label class="field">Ingrediente existente<select class="input" name="ingredientId" required><option value="">Selecciona ingrediente</option>${available.map(entry => `<option value="${escapeHtml(entry.id)}" ${entry.id === (ingredient?.id || item.suggestedIngredientId) ? 'selected' : ''}>${escapeHtml(entry.canonicalName)} · ${escapeHtml(entry.baseUnit)}</option>`).join('')}</select></label><div class="form-actions"><button class="button compact" type="button" id="cancel-review-ingredient">Cancelar</button><button class="button compact primary" type="submit">Vincular ingrediente</button></div></form>` : ''}
      ${editor === 'create' ? reviewIngredientCreateForm(item, product) : ''}
      ${!editor ? `<div class="review-ingredient-actions">${available.length ? `<button class="button compact" type="button" data-review-ingredient-mode="select">${icon('link')} Vincular existente</button>` : ''}<button class="button compact ${available.length ? 'quiet' : ''}" type="button" data-review-ingredient-mode="create">${icon('plus')} Crear ingrediente</button></div>` : ''}
    `}
  </section>`;
}

function reviewIngredientCreateForm(item, product) {
  const categories = state.categories.filter(entry => entry.active && entry.type !== 'non_culinary');
  const categoryId = categories.some(entry => entry.id === product.categoryId) ? product.categoryId : 'cat_sin';
  const baseUnit = ({ g: 'kg', ml: 'l' })[product.contentUnit] || product.contentUnit || 'kg';
  return `<form id="review-ingredient-create" class="review-product-form" data-review-id="${escapeHtml(item.id)}">
    <p class="helper">Un ingrediente puede agrupar productos de varios proveedores. Confirma su nombre, unidad y merma.</p>
    <div class="form-grid"><label class="field span-2">Nombre del ingrediente<input class="input" name="canonicalName" required maxlength="160" value="${escapeHtml(product.preferredDescription)}"></label>
      <label class="field span-2">Categoría<select class="input" name="categoryId">${categories.map(entry => `<option value="${escapeHtml(entry.id)}" ${entry.id === categoryId ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}<option value="__new__">+ Crear nueva categoría…</option></select></label>
      <label class="field span-2 review-new-category" id="review-new-category" hidden>Nombre de la nueva categoría<input class="input" name="newCategoryName" maxlength="80" placeholder="Ej. Verduras congeladas" autocomplete="off"></label>
      <label class="field">Unidad base<select class="input" name="baseUnit"><option value="kg" ${baseUnit === 'kg' ? 'selected' : ''}>kg</option><option value="l" ${baseUnit === 'l' ? 'selected' : ''}>l</option><option value="pz" ${baseUnit === 'pz' ? 'selected' : ''}>pieza</option></select></label>
      <label class="field">Merma (%)<input class="input" name="wastePct" type="number" min="0" max="99.99" step="0.01" required value="0"></label>
      <label class="field span-2">Merma confirmada el<input class="input" name="wasteEffectiveFrom" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label></div><p class="helper">Esta fecha documenta la confirmación; la merma se aplica al calcular una compra XML aunque su CFDI sea anterior.</p>
    <div class="form-actions"><button class="button compact" type="button" id="cancel-review-ingredient">Cancelar</button><button class="button compact primary" type="submit">Crear y vincular</button></div>
  </form>`;
}

function renderReviewProductStep(item, product) {
  const editing = ui.editingReviewProductId === item.id;
  const fields = product
    ? [['Nombre', product.preferredDescription], ['Presentación', [product.presentation, product.contentQuantity, product.contentUnit].filter(Boolean).join(' ') || 'Sin definir'], ['Marca', product.brand || '—'], ['SKU comercial', product.supplierSku || '—'], ['Categoría', categoryName(product.categoryId)]]
    : [['Producto comercial', 'Pendiente de crear'], ['Proveedor', item.supplierName], ['SKU comercial', item.sku || 'No informado']];
  return `<section class="evidence-step"><span class="step-index">2</span><div class="step-heading"><h3>Producto comercial</h3><span>${product ? 'Ficha comercial' : 'Requiere decisión'}</span></div>
    ${item.recommendation?.status !== 'none' && item.recommendation ? `<div class="notice ${item.recommendation.status === 'conflict' ? 'warning' : ''}"><div><strong>${item.recommendation.status === 'conflict' ? 'Reglas incompatibles: decide la categoría' : `Sugerencia: ${escapeHtml(categoryName(item.recommendation.categoryId))}`}</strong><p>${item.recommendation.source === 'product' ? 'Este producto ya fue clasificado para el mismo proveedor y SKU. Comprueba que su presentación siga siendo la misma.' : item.recommendation.matches.map(r => `${escapeHtml(r.field === 'sku' ? 'SKU exacto' : 'Descripción')} «${escapeHtml(r.value)}» → ${escapeHtml(categoryName(r.categoryId))}`).join('<br>')}</p><p>Confirma la categoría al guardar el producto. Esto no valida su precio.</p></div></div>` : ''}
    ${editing ? reviewProductForm(item, product) : `<dl class="field-grid">${fields.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl><button class="button compact quiet evidence-edit" type="button" data-edit-review-product="${escapeHtml(item.id)}">${icon(product ? 'edit' : 'plus')} ${product ? 'Editar producto' : 'Crear producto'}</button>`}
  </section>`;
}

function reviewProductForm(item, product) {
  const categoryId = product?.categoryId && product.categoryId !== 'cat_sin' ? product.categoryId : item.recommendation?.categoryId || 'cat_sin';
  const suggestedUnit = unitSuggestion(item.xmlUnit)?.baseUnit;
  const currentUnit = product?.contentUnit || (['kg', 'g', 'l', 'ml', 'pz'].includes(suggestedUnit) ? suggestedUnit : '');
  const options = [['', 'Selecciona unidad'], ['kg', 'kg'], ['g', 'g'], ['l', 'l'], ['ml', 'ml'], ['pz', 'pieza']];
  const presentation = product?.presentation || ({ XBX: 'Caja', XPK: 'Paquete', XPP: 'Paquete' })[String(item.xmlUnit || '').toUpperCase()] || '';
  return `<form id="review-product-form" class="review-product-form" data-review-id="${escapeHtml(item.id)}">
    <p class="helper">Proveedor: ${escapeHtml(item.supplierName)} · SKU: ${escapeHtml(item.sku || 'sin SKU')} · unidad XML: ${escapeHtml(item.xmlUnit || 'sin unidad')}. La referencia original del XML permanece asociada al concepto.</p>
    <div class="form-grid">
      <label class="field span-2">Nombre comercial<input class="input" name="preferredDescription" required maxlength="160" value="${escapeHtml(product?.preferredDescription || item.description)}"></label>
      <label class="field">Presentación<input class="input" name="presentation" required maxlength="80" placeholder="Ej. caja o bolsa" value="${escapeHtml(presentation)}"></label>
      <label class="field">Contenido por presentación<input class="input" name="contentQuantity" type="number" min="0.000001" step="any" required placeholder="Ej. 12" value="${escapeHtml(product?.contentQuantity || '')}"></label>
      <label class="field">Unidad de contenido<select class="input" name="contentUnit" required>${options.map(([value, label]) => `<option value="${value}" ${currentUnit === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field">Marca<input class="input" name="brand" maxlength="80" value="${escapeHtml(product?.brand || '')}"></label>
      <label class="field span-2">Categoría<select class="input" name="categoryId">${state.categories.filter(category => category.active).map(category => `<option value="${escapeHtml(category.id)}" ${category.id === categoryId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label>
      <label class="field span-2">Ingrediente maestro<select class="input" name="ingredientId"><option value="">Sin vincular</option>${state.ingredients.filter(ingredient => ingredient.status !== 'merged').map(ingredient => `<option value="${escapeHtml(ingredient.id)}" ${ingredient.id === product?.ingredientId ? 'selected' : ''}>${escapeHtml(ingredient.canonicalName)}</option>`).join('')}</select></label>
    </div>
    <p class="helper">El contenido y la unidad permiten calcular el precio real. Si el ingrediente aún no existe, guarda el producto y créalo en el paso 3. Si cambias el contenido después de validar, el precio requiere una nueva validación.</p>
    <div class="form-actions"><button class="button compact" type="button" id="cancel-review-product">Cancelar</button><button class="button compact primary" type="submit">Guardar producto</button></div>
  </form>`;
}

function evidenceStep(index, title, source, values, editAttribute = '') {
  return `<section class="evidence-step"><span class="step-index">${index}</span><div class="step-heading"><h3>${escapeHtml(title)}</h3><span>${escapeHtml(source)}</span></div><dl class="field-grid">${values.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>${editAttribute ? `<button class="button compact quiet evidence-edit" type="button" ${editAttribute}>${icon('edit')} Editar</button>` : ''}</section>`;
}

function renderImport() {
  const result = ui.importResult;
  const consolidatedNotice = result?.catalog?.consolidated ? `<div class="notice" style="margin-top:16px">${icon('check')}<div><strong>${result.catalog.consolidated} compra${result.catalog.consolidated === 1 ? '' : 's'} consolidada${result.catalog.consolidated === 1 ? '' : 's'} por proveedor + SKU.</strong> La cola muestra una sola fila y conserva todos los eventos de compra.</div></div>` : '';
  const historicalNotice = result?.catalog?.historical ? `<div class="notice" style="margin-top:12px">${icon('info')}<div><strong>${result.catalog.historical} compra${result.catalog.historical === 1 ? '' : 's'} anterior${result.catalog.historical === 1 ? '' : 'es'} conservada${result.catalog.historical === 1 ? '' : 's'}.</strong> No reemplazaron la compra activa ni reabrieron una revisión ya validada.</div></div>` : '';
  return `<div class="page import-page">${pageHeader('Importar XML', 'Arrastra CFDI 3.3 o 4.0. Cada archivo se valida por separado y el resto del lote continúa aunque uno falle.')}
    <div class="content">
      <section class="section"><label class="field">Periodo del lote<input id="import-period" class="input" type="month" value="${ui.period}" required aria-describedby="import-policy"></label><p id="import-policy" class="helper">${state.settings.importPolicy ? state.settings.importPolicy.latestAcceptedPeriod ? `Último periodo aceptado: ${escapeHtml(state.settings.importPolicy.latestAcceptedPeriod)}. Se bloquean XML de meses anteriores; el mismo mes admite compras adicionales.` : 'La primera compra aceptada establece el periodo mínimo.' : 'Actualiza el servidor local para comprobar el bloqueo de meses anteriores.'} El corte usa la fecha dentro del XML, no la etiqueta del lote. Carga los meses en orden, del más antiguo al más reciente.</p></section>
      <section class="section"><div id="drop-zone" class="drop-zone" tabindex="0" role="button" aria-describedby="drop-help">${icon('upload')}<h2>Suelta aquí los XML de compras</h2><p id="drop-help">Hasta ${state.settings.maxFiles} archivos, ${state.settings.maxXmlMb} MB por XML. Solo ingresan facturas tipo I recibidas por CICSA (${COMPANY_RFC}) y emitidas por un RFC distinto. Entorno local aislado. Los originales vencen dos meses después de la carga; las compras, precios y bitácora permanecen.</p><label class="button primary" for="xml-files">Seleccionar XML</label><input class="file-input" id="xml-files" type="file" accept=".xml,application/xml,text/xml" multiple></div></section>
      ${ui.importProgress ? `<section class="section"><div class="section-head"><div><h2>Procesando lote</h2><p>${ui.importProgress.done} de ${ui.importProgress.total} archivos</p></div><button class="button" id="cancel-import">Cancelar</button></div><div class="progress" aria-label="Progreso del lote"><span style="transform:scaleX(${ui.importProgress.done / Math.max(1, ui.importProgress.total)})"></span></div></section>` : ''}
      ${result ? `<section class="section"><div class="section-head"><div><h2>Resumen del lote</h2><p>${result.cancelled ? 'El lote se canceló; los archivos ya procesados se conservaron.' : 'El lote terminó. Revisa las excepciones antes de continuar.'}</p></div><button class="button" data-route="review">Ir a la cola de revisión</button></div>${batchSummary(result.summary)}${consolidatedNotice}${historicalNotice}<div class="catalog-table" style="margin-top:16px"><table class="simple-table"><thead><tr><th>Archivo</th><th>Resultado</th><th>Detalle</th><th>SHA-256</th></tr></thead><tbody>${result.results.map(entry => `<tr><td>${escapeHtml(entry.filename)}</td><td><span class="chip ${entry.state === 'accepted' ? 'good' : ['conflict','failed'].includes(entry.state) ? 'bad' : 'warn'}">${escapeHtml(importStateLabel(entry.state))}</span></td><td>${escapeHtml(importResultDetail(entry))}</td><td class="mono">${escapeHtml(entry.parsed.hash?.slice(0, 14) || '—')}…</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    </div></div>`;
}

function importStateLabel(value) {
  return ({ accepted: 'Aceptado', duplicate: 'Duplicado', ineligible: 'No elegible', conflict: 'Conflicto', quarantine: 'Cuarentena', failed: 'Fallido', blocked:'Bloqueado por periodo' })[value] || value;
}

function importResultDetail(entry) {
  if (entry.state === 'ineligible') return entry.parsed.document?.elegibilidad?.reasons?.[0] || 'No cumple las reglas de compra de CICSA.';
  return entry.parsed.errors?.[0]?.message || entry.parsed.warnings?.[0]?.message || `${entry.parsed.document?.conceptos?.length || 0} conceptos`;
}

function batchSummary(summary) {
  return `<div class="batch-summary">${[['accepted','Aceptados'],['duplicate','Duplicados'],['ineligible','No elegibles'],['conflict','Conflictos'],['quarantine','Cuarentena'],['failed','Fallidos'],['blocked','Bloqueados por periodo']].map(([key, label]) => `<div><strong>${summary[key] || 0}</strong><span>${label}</span></div>`).join('')}</div>`;
}

function renderPriceReference(product) {
  if (ui.priceReference?.observation.productId !== product.id) return '';
  const {observation,event}=ui.priceReference;
  const current=state.catalog.find(i=>i.id===observation.ingredientId)?.currentPrice?.id===observation.id;
  return `<div class="detail-group" data-price-reference><h3>Compra de origen · desde Precios</h3><p>${current?'Origen del precio vigente.':'Observación histórica; ya no es el precio vigente.'}</p><dl class="field-grid"><dt>SKU en XML</dt><dd>${escapeHtml(event.original.no_identificacion || 'Sin SKU en XML')}</dd><dt>Fecha del CFDI</dt><dd>${formatDate(event.observedAt)}</dd><dt>UUID del CFDI</dt><dd>${escapeHtml(event.cfdiUuid)}</dd><dt>Precio validado</dt><dd>${escapeHtml(observation.normalizedPrice)} MXN/${escapeHtml(observation.baseUnit)}</dd><dt>Observación exacta</dt><dd>${escapeHtml(observation.id)}</dd></dl><p class="helper">Referencia conservada de esta compra, aunque haya otras más recientes con el mismo SKU.</p></div>`;
}

function renderProducts() {
  const query = ui.query.toLocaleLowerCase('es-MX');
  const products = state.products.filter(item => {
    const matchesSearch = !query || [item.preferredDescription, item.supplierName, item.supplierSku, ...(item.aliases || [])]
      .some(value => String(value || '').toLocaleLowerCase('es-MX').includes(query));
    const status = item.status || 'pending';
    const matchesStatus = ui.productFilter === 'all' || status === ui.productFilter
      || (ui.productFilter === 'pending' && !['validated', 'excluded'].includes(status));
    return matchesSearch && matchesStatus;
  });
  const selected = ui.priceReferenceError ? null : products.find(item => item.id === ui.selectedProductId) || products[0];
  const ingredient = state.ingredients.find(item => item.id === selected?.ingredientId);
  const observations = state.observations.filter(item => item.productId === selected?.id);
  const rows = products.map(item => {
    const status = productStatusDetails(item);
    return `<tr><td><button class="link-button" data-product="${item.id}">${escapeHtml(item.preferredDescription)}</button></td><td>${escapeHtml(item.supplierName)}</td><td class="mono">${escapeHtml(item.supplierSku || '—')}</td><td>${escapeHtml(`${item.presentation || '—'} · ${item.contentQuantity || '—'} ${item.contentUnit || ''}`)}</td><td>${escapeHtml(state.ingredients.find(value => value.id === item.ingredientId)?.canonicalName || 'Sin vincular')}</td><td class="product-status-cell"><span class="chip ${status.tone}">${status.label}</span><span class="product-status-reason">${escapeHtml(status.reason)}</span></td></tr>`;
  }).join('');
  const selectedStatus = selected ? productStatusDetails(selected) : null;
  return `<div class="page">${pageHeader('Productos comerciales', 'Cada registro representa proveedor + SKU + presentación. El nombre visible nunca es la llave primaria.', ' ')}
    <div class="split-layout"><section class="split-main"><div class="toolbar"><span class="muted">${products.length} de ${state.products.length} productos</span><select class="select" id="product-filter" aria-label="Filtrar productos por estado"><option value="all" ${ui.productFilter === 'all' ? 'selected' : ''}>Todos los estados</option><option value="validated" ${ui.productFilter === 'validated' ? 'selected' : ''}>Validados</option><option value="pending" ${ui.productFilter === 'pending' ? 'selected' : ''}>Pendientes y conflictos</option><option value="excluded" ${ui.productFilter === 'excluded' ? 'selected' : ''}>Excluidos</option></select></div>
      <div class="catalog-table">${products.length ? `<table class="simple-table"><thead><tr><th>Producto</th><th>Proveedor</th><th>SKU</th><th>Presentación</th><th>Ingrediente</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty-state"><strong>Sin resultados en este filtro</strong>${query ? 'Prueba otra búsqueda o cambia el estado.' : 'Cambia el estado para ver otros productos.'}</div>`}</div>
    </section><aside class="detail-aside">${ui.priceReferenceError ? `<p class="notice warning" role="alert">${escapeHtml(ui.priceReferenceError)}</p>` : ''}${selected ? `<h2>${escapeHtml(selected.preferredDescription)}</h2><p>ID estable · <span class="mono">${escapeHtml(selected.id)}</span></p>
      ${renderPriceReference(selected)}
      <div class="detail-group"><h3>Estado de revisión</h3><span class="chip ${selectedStatus.tone}">${selectedStatus.label}</span><p class="muted product-status-detail">${escapeHtml(selectedStatus.reason)}</p></div>
      <div class="detail-group"><h3>Identidad comercial</h3><dl class="field-grid"><dt>Proveedor</dt><dd>${escapeHtml(selected.supplierName)}</dd><dt>SKU del proveedor</dt><dd>${escapeHtml(selected.supplierSku || 'No informado')}</dd><dt>Presentación</dt><dd>${escapeHtml(`${selected.contentQuantity} ${selected.contentUnit}`)}</dd><dt>Clasificación</dt><dd>${escapeHtml(selected.classification)}</dd></dl></div>
      <div class="detail-group"><h3>Ingrediente asociado</h3>${ingredient ? `<strong>${escapeHtml(ingredient.canonicalName)}</strong><p class="muted">${escapeHtml(categoryName(ingredient.categoryId))} · ${escapeHtml(ingredient.baseUnit)}</p>` : '<div class="notice warning">Sin ingrediente asociado.</div>'}</div>
      <div class="detail-group"><h3>Historial de precio</h3>${observations.length ? `<table class="simple-table"><tbody>${observations.map(item => `<tr><td>${formatDate(item.observedAt)}</td><td>${formatMoney(item.normalizedPrice)}/${escapeHtml(item.baseUnit)}</td><td><span class="chip ${item.sourceType === 'xml' ? 'good' : 'warn'}">${escapeHtml(item.validationMode === 'automatic' ? 'XML · automático' : item.sourceType === 'xml' ? 'XML · revisado' : item.sourceType)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aún no hay observaciones.</p>'}</div>` : '<div class="empty-state">Selecciona un producto.</div>'}</aside></div></div>`;
}

function renderIngredients() {
  const query = ui.query.toLocaleLowerCase('es-MX');
  const ingredients = state.ingredients.filter(item => !query || [item.canonicalName, ...(item.aliases || [])].some(value => value.toLocaleLowerCase('es-MX').includes(query)));
  const selected = ingredients.find(item => item.id === ui.selectedIngredientId) || ingredients[0];
  const products = state.products.filter(item => item.ingredientId === selected?.id);
  const observations = state.observations.filter(item => item.ingredientId === selected?.id && item.valid);
  const current = state.catalog.find(item => item.id === selected?.id)?.currentPrice;
  return `<div class="page">${pageHeader('Ingredientes maestros', 'El catálogo canónico existe por sí mismo: un ingrediente manual no necesita haber aparecido en un XML.', `<button class="button primary" id="toggle-ingredient-form">${icon('plus')} Nuevo ingrediente</button>`)}<div class="split-layout"><section class="split-main">
    ${ui.showIngredientForm ? ingredientForm() : ''}<div class="toolbar"><span class="muted">${ingredients.length} ingredientes</span><select class="select"><option>Todos</option><option>Con precio vigente</option><option>Provisionales</option><option>Sin precio</option></select></div><div class="catalog-table">${ingredients.length ? `<table class="simple-table"><thead><tr><th>Ingrediente</th><th>Categoría</th><th>Unidad base</th><th>Merma</th><th>Precio real vigente</th><th>Productos</th><th>Origen</th></tr></thead><tbody>${ingredients.map(item => { const obs = state.catalog.find(value => value.id === item.id)?.currentPrice; return `<tr><td><button class="link-button" data-ingredient="${item.id}">${escapeHtml(item.canonicalName)}</button></td><td>${escapeHtml(categoryName(item.categoryId))}</td><td>${escapeHtml(item.baseUnit)}</td><td>${escapeHtml(item.wastePct || 0)}%</td><td>${obs ? `${formatMoney(obs.normalizedPrice)}/${escapeHtml(obs.baseUnit)}` : '—'}</td><td>${state.products.filter(value => value.ingredientId === item.id).length}</td><td><span class="chip">${escapeHtml(item.origin)}</span></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty-state"><strong>Aún no hay ingredientes</strong>Crea el primer ingrediente maestro o importa XML de compras.</div>'}</div></section>
    <aside class="detail-aside">${selected ? `<h2>${escapeHtml(selected.canonicalName)}</h2><p>${escapeHtml(categoryName(selected.categoryId))} · base ${escapeHtml(selected.baseUnit)}</p><div class="detail-group"><h3>Precio real actual</h3><strong style="font-size:25px">${current ? `${formatMoney(current.normalizedPrice)}/${escapeHtml(current.baseUnit)}` : 'Sin precio'}</strong><p class="muted">${current ? `${escapeHtml(current.sourceLabel)} · ${formatDate(current.observedAt)}` : 'Agrega una observación manual o vincula una compra.'}</p>${current?.usableQuantity ? `<p class="helper">Rendimiento observado: ${escapeHtml(current.usableQuantity)} ${escapeHtml(current.baseUnit)} aprovechables.</p>` : ''}</div><div class="detail-group">${wasteForm(selected)}</div><div class="detail-group"><h3>Aliases para recetas</h3><div class="alias-list">${(selected.aliases || []).map(alias => `<span class="chip">${escapeHtml(alias)}</span>`).join('') || '<span class="muted">Sin aliases</span>'}</div></div><div class="detail-group"><h3>Productos vinculados · ${products.length}</h3>${products.map(item => `<p><button class="link-button" data-product-route="${item.id}">${escapeHtml(item.preferredDescription)}</button></p>`).join('') || '<p class="muted">Ingrediente manual sin productos vinculados.</p>'}</div><div class="detail-group">${manualPriceForm(selected)}</div><div class="detail-group"><h3>Historial de precios</h3><table class="simple-table"><tbody>${state.observations.filter(item => item.ingredientId === selected.id).toSorted((a,b) => b.observedAt.localeCompare(a.observedAt)).map(item => `<tr><td>${formatDate(item.observedAt)}</td><td>${formatMoney(item.normalizedPrice)}/${escapeHtml(item.baseUnit)}</td><td>${item.provisional ? 'Provisional' : item.valid ? 'Validada' : 'Histórica'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Selecciona un ingrediente.</div>'}</aside></div></div>`;
}

function ingredientForm() {
  return `<form class="inline-form" id="ingredient-form"><h2>Crear ingrediente maestro</h2><p>Puede existir sin compras ni productos comerciales asociados.</p><div class="form-grid"><label class="field">Nombre canónico<input class="input" name="canonicalName" required autocomplete="off"></label><label class="field">Categoría<select class="input" name="categoryId">${state.categories.filter(item => item.active).map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></label><label class="field">Unidad base<select class="input" name="baseUnit"><option value="kg">kg</option><option value="l">l</option><option value="pz">pz</option></select></label><label class="field">Merma inicial (%)<input class="input" name="wastePct" inputmode="decimal" value="0"></label><label class="field">Merma confirmada el<input class="input" name="wasteEffectiveFrom" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label class="field span-2">Aliases, separados por coma<input class="input" name="aliases" autocomplete="off"></label></div><p class="helper">La fecha documenta la confirmación de la merma; no limita compras XML anteriores.</p><div class="form-actions"><button class="button" type="button" id="cancel-ingredient">Cancelar</button><button class="button primary" type="submit">Crear ingrediente</button></div></form>`;
}

function wasteForm(ingredient) {
  const yieldPct = 100 - Number(ingredient.wastePct || 0);
  return `<form id="waste-form"><h3>Merma y rendimiento</h3><div class="form-grid"><label class="field">Merma estándar (%)<input class="input" name="wastePct" type="number" min="0" max="99.99" step="0.01" required value="${escapeHtml(ingredient.wastePct || 0)}"></label><div class="field"><span>Rendimiento esperado</span><strong style="font-size:20px">${escapeHtml(yieldPct)}%</strong></div><label class="field">Alcance<select class="input" name="wasteScope"><option value="ingredient">Ingrediente maestro · todos sus productos</option></select></label><label class="field">Merma confirmada el<input class="input" name="wasteEffectiveFrom" type="date" required value="${escapeHtml(ingredient.wasteEffectiveFrom || new Date().toISOString().slice(0,10))}"></label></div><p class="helper">La fecha documenta cuándo se confirmó la merma; no limita la fecha del CFDI. Cambiar el porcentaje conserva las observaciones XML, pero requiere revalidar sus precios. Los precios manuales no cambian.</p><button class="button" type="submit">Actualizar merma</button></form>`;
}

function manualPriceForm(ingredient) {
  return `<form id="manual-price-form"><h3>Agregar precio manual</h3><div class="form-grid"><label class="field">Precio por ${escapeHtml(ingredient.baseUnit)}<input class="input" name="price" type="number" min="0.0001" step="0.0001" required></label><label class="field">Fecha<input class="input" name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label class="field span-2">Fuente y nota<input class="input" name="source" required placeholder="Ej. cotización por correo del proveedor"></label></div><p class="helper">Este precio coexistirá con las compras XML y quedará marcado como provisional; nunca sobrescribe evidencia.</p><button class="button" type="submit">Registrar precio manual</button></form>`;
}

function renderCategories() {
  return `<div class="page">${pageHeader('Categorías y reglas', 'Organiza el catálogo y propone categorías sin validar automáticamente.', '<button class="button primary" id="toggle-category-form">Nueva categoría</button>')}<div class="content"><section class="section"><div class="section-head"><div><h2>Categorías</h2><p>Las categorías culinarias sirven para recetas y costeo; productos y servicios no culinarios quedan fuera.</p></div></div>${ui.showCategoryForm ? categoryForm() : ''}<table class="simple-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>${state.categories.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${c.type === 'culinary' ? 'Para recetas' : c.type === 'non_culinary' ? 'No culinaria' : 'Sin clasificar'}</td><td>${c.active ? 'Activa' : 'Inactiva'}</td></tr>`).join('')}</tbody></table></section>${rulesPanel(state, ui)}</div></div>`;
}

function categoryForm() {
  return `<form class="inline-form" id="category-form"><h2>Nueva categoría</h2><p>Podrás seleccionarla al clasificar productos e ingredientes.</p><div class="form-grid"><label class="field">Nombre<input class="input" name="name" required maxlength="80" placeholder="Ej. Verduras congeladas" autocomplete="off"></label><label class="field">Destino<select class="input" name="type"><option value="culinary">Para recetas y costeo</option><option value="non_culinary">No culinaria · fuera de FORX</option></select></label></div><div class="form-actions"><button class="button" type="button" id="cancel-category">Cancelar</button><button class="button primary" type="submit">Crear categoría</button></div></form>`;
}

function renderImports() {
  const conflicts = state.reviewItems.filter(item => item.status === 'conflict');
  return `<div class="page">${pageHeader('Importaciones y conflictos', 'Consulta lotes, duplicados, cuarentena y reprocesamientos. El XML original solo se descarga con un rol autorizado.', `<button class="button primary" data-route="import">${icon('upload')} Nuevo lote</button>`)}<div class="content"><section class="section"><div class="section-head"><div><h2>Historial de lotes</h2><p>La repetición con el mismo hash es un no-op; un hash distinto para el mismo UUID bloquea la sobrescritura.</p></div></div>${importTable(state.imports)}</section><section class="section"><div class="section-head"><div><h2>Conflictos abiertos</h2><p>Requieren una decisión explícita antes de validar.</p></div><span class="chip bad">${conflicts.length} abiertos</span></div>${conflicts.length ? `<table class="simple-table"><thead><tr><th>Concepto</th><th>Proveedor</th><th>Motivo</th><th>Acción</th></tr></thead><tbody>${conflicts.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.supplierName)}</td><td>${escapeHtml(item.conflictReason)}</td><td><button class="button compact" data-open-review="${item.id}">Revisar</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><strong>Sin conflictos</strong>Los nuevos casos aparecerán aquí sin ocultarse.</div>'}</section><section class="section"><div class="notice">${icon('lock')}<div><strong>Originales privados.</strong> La eliminación por vencimiento solo retira los originales, no las compras, precios ni decisiones. No hay conexión cloud en esta instancia.</div></div></section></div></div>`;
}

function importTable(imports) {
  if (!imports.length) return '<div class="empty-state"><strong>Aún no hay importaciones</strong>Importa el primer XML para iniciar el catálogo.</div>';
  return `<table class="simple-table"><thead><tr><th>Lote</th><th>Fecha</th><th>Persona</th><th>Aceptados</th><th>Excepciones</th><th>Estado</th></tr></thead><tbody>${imports.map(batch => { const exceptions = Object.entries(batch.counts || {}).filter(([key]) => key !== 'accepted').reduce((total, [, value]) => total + value, 0); return `<tr><td><strong>${escapeHtml(batch.batchName)}</strong></td><td>${formatDate(batch.createdAt, true)}</td><td>${escapeHtml(batch.actor)}</td><td>${batch.counts?.accepted || 0}</td><td>${exceptions}</td><td><span class="chip ${batch.status === 'complete' ? 'good' : 'warn'}">${batch.status === 'complete' ? 'Completo' : 'En revisión'}</span></td></tr>`; }).join('')}</tbody></table>`;
}

function renderAdmin() {
  return `<div class="page">${pageHeader('Administración', service.session?'Cuenta autorizada de FORX. La contraseña y su recuperación se administran en Google.':'Entorno local aislado. Sin acceso a datos ni servicios de otras aplicaciones.')}
  <div class="content">${service.session?`<div class="admin-session"><div><strong>${escapeHtml(service.actor.email || service.actor.name)}</strong><p>${escapeHtml({admin:'Administración',editor:'Edición',viewer:'Consulta'}[service.actor.role] || '')}</p></div><button class="button" type="button" data-signout>Cerrar sesión</button></div>`:''}<div data-access-panel></div><div class="dashboard-grid"><section class="section"><h2>Ajustes de MiDespensa</h2>
  <dl class="field-grid"><dt>RFC receptor</dt><dd>${COMPANY_RFC}</dd><dt>Precio vigente</dt><dd>Última fecha de comprobante validada</dd><dt>Límite de lote</dt><dd>500 XML · 10 MB por archivo</dd><dt>Originales XML</dt><dd>Dos meses desde la carga; historial derivado permanente</dd></dl></section>
  <aside><section class="section"><h2>Entorno</h2><p>${escapeHtml(service.mode || 'Datos guardados en este navegador. Sin conexión cloud.')}</p><p>${service.session?'El servidor comprueba tus permisos en cada operación. Cierra sesión al terminar en un equipo compartido.':'La conexión cloud permanece deshabilitada. La limpieza de XML del navegador ocurre al abrir; en el servidor emulado aún falta el proceso programado.'}</p></section></aside></div>
  ${backupPanel(service, ui)}
  <section class="section"><div class="section-head"><div><h2>Bitácora</h2><p>Retirar de la cola no elimina compras ni observaciones. Restablecer registra otra decisión.</p></div></div>
  ${state.audit.length ? `<ul class="audit-list">${state.audit.map(item => `<li class="audit-item"><span>${formatDate(item.occurredAt,true)}</span><span>${escapeHtml(item.actor)}</span><div><strong>${escapeHtml(item.action)}</strong><span class="muted">${escapeHtml(item.detail)}</span></div>${item.reversible ? `<button class="button compact" data-undo="${item.id}">${icon('undo')} Restablecer</button>` : '<span class="muted">—</span>'}</li>`).join('')}</ul>` : '<div class="empty-state"><strong>Sin actividad registrada</strong>Las decisiones aparecerán aquí.</div>'}
  </section></div></div>`;
}

function render(options = {}) {
  if(disposed)return;
  const searchFocused = document.activeElement?.id === 'global-search';
  const caret = searchFocused ? document.activeElement.selectionStart : null;
  const reviewViewport = options.preserveReviewViewport ? captureReviewViewport() : null;
  app.innerHTML = shell();
  bindEvents();
  accessPanel.attach(app.querySelector('[data-access-panel]'));
  setBusy(store.busy);
  restoreReviewViewport(reviewViewport);
  if (searchFocused) { const search = document.querySelector('#global-search'); search?.focus({ preventScroll:true }); search?.setSelectionRange(caret,caret); }
}

function navigate(route) {
  ui.route = route;
  ui.priceReferenceError = null;
  ui.query = '';
  ui.editingReviewProductId = null;
  ui.reviewIngredientEditor = null;
  render();
  document.querySelector('#workspace')?.focus({ preventScroll: true });
}

function bindEvents() {
  app.querySelectorAll('[data-signout]').forEach(button=>button.addEventListener('click',()=>{
    if(store.busy || ui.importProgress){toast('Espera a que termine la operación antes de cerrar sesión.','error');return;}
    if(confirm('¿Cerrar sesión de FORX? Se descartarán las ediciones que no hayas guardado.'))void service.session.signOut();
  }));
  const themeControl = app.querySelector('[data-theme-toggle]');
  syncThemeControl(themeControl);
  themeControl.addEventListener('click', toggleTheme);
  bindRulesAndBackup({ root:app, state, ui, store, service, render, toast });
  document.querySelector('#return-forx')?.addEventListener('click', () => {
    if (ui.importProgress) { toast('Espera a que termine la importación antes de salir.', 'error'); return; }
    if ((ui.editingReviewProductId || ui.reviewIngredientEditor) && !confirm('¿Salir sin guardar la edición actual?')) return;
    location.hash = '/forx/menu';
  });
  document.querySelector('.review-sort')?.addEventListener('change', event => { ui.reviewSort = event.target.value; render(); });
  document.querySelector('#product-filter')?.addEventListener('change', event => { ui.productFilter = event.target.value; render(); });
  document.querySelector('#import-period')?.addEventListener('change', event => { ui.period = event.target.value; });
  document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
  document.querySelector('#global-search')?.addEventListener('input', event => { ui.query = event.target.value; window.clearTimeout(bindEvents.searchTimer); bindEvents.searchTimer = window.setTimeout(render, 140); });
  document.querySelectorAll('[data-review-filter]').forEach(button => button.addEventListener('click', () => { ui.reviewFilter = button.dataset.reviewFilter; ui.evidenceClosed = false; render(); }));
  document.querySelectorAll('[data-review-row]').forEach(row => {
    row.addEventListener('click', event => { if (event.target.matches('input,button')) return; ui.selectedReviewId = row.dataset.reviewRow; ui.evidenceClosed = false; render({ preserveReviewViewport: true }); });
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ui.selectedReviewId = row.dataset.reviewRow; ui.evidenceClosed = false; render({ preserveReviewViewport: true }); } });
  });
  document.querySelectorAll('[data-bulk]').forEach(box => box.addEventListener('change', () => { box.checked ? ui.bulk.add(box.dataset.bulk) : ui.bulk.delete(box.dataset.bulk); render({ preserveReviewViewport: true }); }));
  document.querySelector('#bulk-clear')?.addEventListener('click', () => { ui.bulk.clear(); render({ preserveReviewViewport: true }); });
  document.querySelector('#bulk-exclude')?.addEventListener('click', async () => {
    try { const count = ui.bulk.size; await store.excludeReviewItems([...ui.bulk]); ui.bulk.clear(); render({ preserveReviewViewport:true }); toast(`${count} productos se conservaron como no culinarios.`); }
    catch (error) { toast(error.message, 'error'); }
  });
  document.querySelector('#bulk-remove')?.addEventListener('click', () => archiveReviewItems([...ui.bulk]));
  document.querySelectorAll('[data-edit-review-product]').forEach(button => button.addEventListener('click', () => {
    ui.editingReviewProductId = button.dataset.editReviewProduct;
    render({ preserveReviewViewport: true });
    document.querySelector('#review-product-form input[name="preferredDescription"]')?.focus({ preventScroll: true });
    document.querySelector('#review-product-form')?.scrollIntoView?.({ block: 'nearest' });
  }));
  document.querySelector('#cancel-review-product')?.addEventListener('click', () => { ui.editingReviewProductId = null; render({ preserveReviewViewport: true }); });
  document.querySelector('#review-product-form')?.addEventListener('submit', saveReviewProduct);
  document.querySelectorAll('[data-review-ingredient-mode]').forEach(button => button.addEventListener('click', () => {
    ui.reviewIngredientEditor = { itemId: ui.selectedReviewId, mode: button.dataset.reviewIngredientMode };
    render({ preserveReviewViewport: true });
    document.querySelector('#review-ingredient-create input[name="canonicalName"], #review-ingredient-select select[name="ingredientId"]')?.focus({ preventScroll: true });
    document.querySelector('#review-ingredient-step')?.scrollIntoView?.({ block: 'nearest' });
  }));
  document.querySelector('#cancel-review-ingredient')?.addEventListener('click', () => { ui.reviewIngredientEditor = null; render({ preserveReviewViewport: true }); });
  document.querySelector('#review-ingredient-create')?.addEventListener('submit', saveReviewIngredient);
  document.querySelector('#review-ingredient-create select[name="categoryId"]')?.addEventListener('change', event => {
    const field = document.querySelector('#review-new-category');
    const input = field?.querySelector('input');
    if (!field || !input) return;
    const creating = event.target.value === '__new__';
    field.hidden = !creating;
    input.required = creating;
    if (creating) input.focus({ preventScroll: true });
  });
  document.querySelector('#review-ingredient-select')?.addEventListener('submit', saveReviewIngredient);
  document.querySelector('#validate-review')?.addEventListener('click', () => reviewSelected('validate'));
  document.querySelector('#exclude-review')?.addEventListener('click', () => reviewSelected('exclude'));
  document.querySelector('#remove-review')?.addEventListener('click', () => archiveReviewItems([ui.selectedReviewId]));
  document.querySelectorAll('[data-remove-review]').forEach(button => button.addEventListener('click', () => archiveReviewItems([button.dataset.removeReview])));
  document.querySelector('#close-evidence')?.addEventListener('click', () => { ui.evidenceClosed = true; ui.selectedReviewId = null; render(); });
  document.querySelectorAll('[data-open-product]').forEach(button => button.addEventListener('click', () => { ui.selectedProductId = button.dataset.openProduct; navigate('products'); }));
  document.querySelectorAll('[data-open-waste]').forEach(button => button.addEventListener('click', () => {
    ui.selectedIngredientId = button.dataset.openWaste;
    navigate('ingredients');
    requestAnimationFrame(() => {
      document.querySelector('#waste-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('#waste-form input[name="wastePct"]')?.focus();
    });
  }));
  bindImportEvents();
  document.querySelectorAll('[data-product]').forEach(button => button.addEventListener('click', () => { ui.selectedProductId = button.dataset.product; ui.priceReferenceError = null; render(); }));
  document.querySelectorAll('[data-ingredient]').forEach(button => button.addEventListener('click', () => { ui.selectedIngredientId = button.dataset.ingredient; render(); }));
  document.querySelectorAll('[data-product-route]').forEach(button => button.addEventListener('click', () => { ui.selectedProductId = button.dataset.productRoute; navigate('products'); }));
  document.querySelector('#toggle-ingredient-form')?.addEventListener('click', () => { ui.showIngredientForm = !ui.showIngredientForm; render(); });
  document.querySelector('#cancel-ingredient')?.addEventListener('click', () => { ui.showIngredientForm = false; render(); });
  document.querySelector('#ingredient-form')?.addEventListener('submit', createIngredient);
  document.querySelector('#toggle-category-form')?.addEventListener('click', () => { ui.showCategoryForm = !ui.showCategoryForm; render(); document.querySelector('#category-form input[name="name"]')?.focus({ preventScroll: true }); });
  document.querySelector('#cancel-category')?.addEventListener('click', () => { ui.showCategoryForm = false; render(); });
  document.querySelector('#category-form')?.addEventListener('submit', createCategory);
  document.querySelector('#waste-form')?.addEventListener('submit', updateWaste);
  document.querySelector('#manual-price-form')?.addEventListener('submit', addManualPrice);
  document.querySelector('#rule-simulation')?.addEventListener('input', event => { ui.categorySimulation = event.target.value; window.clearTimeout(bindEvents.ruleTimer); bindEvents.ruleTimer = window.setTimeout(render, 180); });
  document.querySelectorAll('[data-open-review]').forEach(button => button.addEventListener('click', () => { ui.selectedReviewId = button.dataset.openReview; ui.reviewFilter = 'all'; ui.evidenceClosed = false; navigate('review'); }));
  document.querySelectorAll('[data-undo]').forEach(button => button.addEventListener('click', async () => { try { await store.undo(button.dataset.undo); toast('Acción revertida; la evidencia original permanece.'); } catch (error) { toast(error.message, 'error'); } }));

}

async function reviewSelected(action) {
  const item = state.reviewItems.find(value => value.id === ui.selectedReviewId);
  if (!item) return;
  if (action === 'validate' && (ui.editingReviewProductId === item.id || ui.reviewIngredientEditor?.itemId === item.id)) {
    toast('Guarda o cancela los cambios antes de validar.', 'error');
    return;
  }
  try {
    if (action === 'exclude') await store.review(item.id, { status: 'excluded', classification: 'non_culinary' });
    else {
      const product = state.products.find(value => value.id === item.productId);
      if (product?.classification === 'non_culinary') throw new Error('Este producto es no culinario; exclúyelo de FORX o cambia su categoría.');
      const ingredient = state.ingredients.find(value => value.id === product?.ingredientId);
      const effective = priceBreakdown(item, product, ingredient);
      if (!effective) throw new Error('Falta una presentación válida para calcular el precio real con merma.');
      await store.review(item.id, {
        status: 'validated',
        classification: 'culinary',
        ingredientId: ingredient.id,
        normalizedPrice: effective.normalizedPrice,
        baseQuantity: effective.baseQuantity,
        usableQuantity: effective.usableQuantity,
        baseUnit: effective.baseUnit,
        wastePct: ingredient.wastePct || '0',
        wasteScope: ingredient.wasteScope || 'ingredient',
        wasteEffectiveFrom: ingredient.wasteEffectiveFrom || null,
        formula: effective.formula,
        priceBasis: { purchasePrice: item.unitPrice, packageCount: '1', contentQuantity: product.contentQuantity, contentUnit: product.contentUnit, baseUnit: ingredient.baseUnit }
      });
    }
    const next = store.snapshot().reviewItems.find(value => !['validated', 'excluded', 'archived'].includes(value.status));
    ui.selectedReviewId = next?.id || item.id;
    render({ preserveReviewViewport:true });
    toast(action === 'exclude' ? 'Concepto conservado y excluido de FORX.' : 'Producto validado y vinculado.');
  } catch (error) { toast(error.message, 'error'); }
}

async function saveReviewProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const itemId = form.dataset.reviewId;
  try {
    ui.editingReviewProductId = null;
    const result = await store.saveReviewProduct(itemId, values);
    toast(result.created ? 'Producto comercial creado y vinculado al concepto.' : `Producto comercial actualizado.${result.invalidated ? ' Revisa de nuevo su precio real.' : ''}`);
    requestAnimationFrame(() => {
      document.querySelector('#review-ingredient-step')?.scrollIntoView?.({ block: 'nearest' });
      document.querySelector('#review-ingredient-step')?.focus({ preventScroll: true });
    });
  } catch (error) {
    ui.editingReviewProductId = itemId;
    toast(error.message, 'error');
  }
}

async function saveReviewIngredient(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const itemId = form.dataset.reviewId;
  const input = Object.fromEntries(new FormData(form));
  input.create = form.id === 'review-ingredient-create';
  try {
    const result = await store.linkReviewIngredient(itemId, input);
    ui.reviewIngredientEditor = null;
    render({ preserveReviewViewport: true });
    toast(`${result.category ? `Categoría “${result.category.name}” creada. ` : ''}${result.created ? 'Ingrediente maestro creado y vinculado' : 'Ingrediente maestro vinculado'}.${result.invalidated ? ' Revisa de nuevo el precio real.' : ''}`);
    requestAnimationFrame(() => document.querySelector('#validate-review')?.focus({ preventScroll: true }));
  } catch (error) { toast(error.message, 'error'); }
}

async function createCategory(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const category = await store.createCategory(input);
    ui.showCategoryForm = false;
    render();
    toast(`Categoría “${category.name}” creada. Ya puedes seleccionarla en la revisión.`);
  } catch (error) { toast(error.message, 'error'); }
}

async function archiveReviewItems(itemIds) {
  const ids = itemIds.filter(Boolean);
  if (!ids.length) return;
  const message = ids.length === 1
    ? '¿Eliminar este concepto de la lista? Podrás restablecerlo desde Administración → Bitácora.'
    : `¿Eliminar ${ids.length} conceptos de la lista? Podrás restablecerlos juntos desde Administración → Bitácora.`;
  if (!window.confirm(message)) return;
  try {
    const result = await store.archiveReviewItems(ids);
    for (const id of ids) ui.bulk.delete(id);
    const next = store.snapshot().reviewItems.find(item => item.status !== 'archived');
    ui.selectedReviewId = next?.id || null;
    render();
    toast(`${result.count} ${result.count === 1 ? 'concepto eliminado' : 'conceptos eliminados'} de la lista. Restablece desde Bitácora si fue un error.`);
  } catch (error) { toast(error.message, 'error'); }
}

async function updateWaste(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await store.updateIngredientWaste(ui.selectedIngredientId, form.get('wastePct'), { scope: form.get('wasteScope'), effectiveFrom: form.get('wasteEffectiveFrom') });
    toast(result.pricingChanged ? 'Merma actualizada. El historial permanece; revalida los precios afectados.' : 'Fecha de confirmación actualizada. Los precios conservan su validación.');
  } catch (error) { toast(error.message, 'error'); }
}

function bindImportEvents() {
  const zone = document.querySelector('#drop-zone');
  const input = document.querySelector('#xml-files');
  input?.addEventListener('change', () => processFiles(input.files));
  zone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input?.click(); } });
  for (const name of ['dragenter', 'dragover']) zone?.addEventListener(name, event => { event.preventDefault(); zone.classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) zone?.addEventListener(name, event => { event.preventDefault(); zone.classList.remove('dragging'); });
  zone?.addEventListener('drop', event => processFiles(event.dataTransfer.files));
  const cancelImport=document.querySelector('#cancel-import');
  if (cancelImport && service.remote) {cancelImport.disabled=true;cancelImport.textContent='En servidor';cancelImport.title='La carga enviada termina en el servidor; no cierres esta pantalla.';}
  else cancelImport?.addEventListener('click', () => ui.importController?.abort());
}

async function processFiles(fileList) {
  const files = [...fileList];
  if (!files.length || ui.importProgress) return;
  const period = document.querySelector('#import-period')?.value;
  ui.importController = new AbortController();
  ui.importProgress = { done:0, total:files.length };
  ui.importResult = null;
  render();
  try {
    ui.importResult = await store.importFiles(files, {
      period, signal:ui.importController.signal,
      onProgress: progress => {
        ui.importProgress = { done:progress.processed, total:progress.total };
        const bar = document.querySelector('.progress > span');
        if (bar) bar.style.transform = `scaleX(${progress.processed / progress.total})`;
      }
    });
    toast(`Lote terminado: ${ui.importResult.summary.accepted} aceptados, ${ui.importResult.summary.blocked || 0} bloqueados por periodo. Revisa el resumen.`);
  } catch (error) { toast(error.message, 'error'); }
  finally { ui.importProgress = null; render(); }
}

async function createIngredient(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const ingredient = await store.createIngredient({ canonicalName: form.get('canonicalName'), categoryId: form.get('categoryId'), baseUnit: form.get('baseUnit'), wastePct: form.get('wastePct'), wasteEffectiveFrom: form.get('wasteEffectiveFrom'), aliases: String(form.get('aliases') || '').split(',').map(value => value.trim()).filter(Boolean) });
    ui.selectedIngredientId = ingredient.id;
    ui.showIngredientForm = false;
    render();
    toast('Ingrediente maestro creado.');
  } catch (error) { toast(error.message, 'error'); }
}

async function addManualPrice(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const ingredient = state.ingredients.find(item => item.id === ui.selectedIngredientId);
  if (!ingredient) return;
  try {
    await store.addManualPrice({ ingredientId: ingredient.id, productId: null, normalizedPrice: String(form.get('price')), baseUnit: ingredient.baseUnit, observedAt: `${form.get('date')}T12:00:00`, sourceLabel: form.get('source') });
    toast('Precio manual provisional agregado sin alterar las observaciones XML.');
  } catch (error) { toast(error.message, 'error'); }
}

function onKeydown(event) {
  if(store.busy)return;
  if (ui.route !== 'review' || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
  const visible = [...document.querySelectorAll('[data-review-row]')].map(row => row.dataset.reviewRow);
  const index = visible.indexOf(ui.selectedReviewId);
  if (event.key.toLowerCase() === 'j' || event.key === 'ArrowDown') { event.preventDefault(); ui.selectedReviewId = visible[Math.min(visible.length - 1, index + 1)] || visible[0]; ui.evidenceClosed = false; render({ preserveReviewViewport: true }); }
  if (event.key.toLowerCase() === 'k' || event.key === 'ArrowUp') { event.preventDefault(); ui.selectedReviewId = visible[Math.max(0, index - 1)] || visible[0]; ui.evidenceClosed = false; render({ preserveReviewViewport: true }); }
  if (event.key.toLowerCase() === 'v') reviewSelected('validate');
  if (event.key.toLowerCase() === 'x') reviewSelected('exclude');
}
document.addEventListener('keydown', onKeydown);

const unsubscribe = store.subscribe(snapshot => { state = snapshot; render({ preserveReviewViewport: ui.route === 'review' }); });
render();
return () => { disposed=true; accessPanel.dispose(); ui.importController?.abort(); clearTimeout(bindEvents.ruleTimer); unsubscribe(); document.removeEventListener('keydown', onKeydown); document.querySelector('.toast-region')?.remove(); };
}
