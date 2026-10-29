import { suggestCategory } from '../domain/classification-rules.js';
import { inspectBackup, BACKUP_MAX_BYTES } from '../domain/backup.js';
import { restoreLocalCopy } from '../data/local-recovery.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const selected = (a, b) => a === b ? 'selected' : '';
const fieldName = key => key === 'sku' ? 'SKU' : 'Descripción';

export function rulesPanel(state, ui) {
  const categories = state.categories.filter(c => c.active && c.type !== 'pending');
  const rule = ui.ruleDraft;
  return `<section class="section rules-panel"><div class="section-head"><div><h2>Reglas de sugerencia</h2><p>Proponen categorías; no crean ingredientes, equivalencias ni precios. Una persona confirma cada producto.</p></div><button class="button primary" id="new-rule">Nueva regla</button></div>
  ${rule ? `<form class="inline-form" id="rule-form"><h3>${rule.id ? 'Editar regla' : 'Nueva regla'}</h3><div class="form-grid">
    <label class="field">Campo<select class="input" name="field"><option value="description" ${selected(rule.field, 'description')}>Descripción</option><option value="sku" ${selected(rule.field, 'sku')}>SKU</option></select></label>
    <label class="field">Coincidencia<select class="input" name="operator"><option value="phrase" ${selected(rule.operator, 'phrase')}>Frase completa</option><option value="equals" ${selected(rule.operator, 'equals')}>Exacta</option></select></label>
    <label class="field">Texto o SKU<input class="input" name="value" value="${e(rule.value)}" maxlength="180" required></label>
    <label class="field">RFC del proveedor<input class="input" name="supplierId" value="${e(rule.supplierId)}" maxlength="80" aria-describedby="rule-provider-help"><span class="helper" id="rule-provider-help">Obligatorio para SKU. Vacío: todos los proveedores, solo para descripción.</span></label>
    <label class="field">Categoría sugerida<select class="input" name="categoryId" required><option value="">Seleccionar categoría</option>${categories.map(c => `<option value="${e(c.id)}" ${selected(rule.categoryId, c.id)}>${e(c.name)}${c.type === 'non_culinary' ? ' · No culinaria' : ''}</option>`).join('')}</select></label>
    <label class="field">Orden de prioridad<input class="input" name="priority" type="number" min="0" max="999" step="1" value="${e(rule.priority ?? 100)}" required><span class="helper">Menor primero; no oculta conflictos.</span></label>
  </div><p class="error-message" id="rule-error" role="alert"></p><div class="form-actions"><button class="button" type="button" id="cancel-rule">Cancelar</button><button class="button primary" type="submit">Guardar regla</button></div></form>` : ''}
  <div class="rules-scroll">${state.rules.length ? `<table class="simple-table"><thead><tr><th>Prioridad</th><th>Condición</th><th>Proveedor</th><th>Categoría sugerida</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${[...state.rules].sort((a,b) => a.priority - b.priority).map(r => `<tr><td>${r.priority}</td><td>${fieldName(r.field)} · ${r.operator === 'equals' ? 'exacta' : 'frase'}<br><strong>${e(r.value)}</strong></td><td>${e(r.supplierId || 'Todos')}</td><td>${e(categories.find(c => c.id === r.categoryId)?.name || r.categoryId)}</td><td>${r.active ? 'Activa' : 'Pausada'}</td><td><div class="form-actions"><button class="button compact" data-edit-rule="${e(r.id)}">Editar</button><button class="button compact" data-toggle-rule="${e(r.id)}">${r.active ? 'Pausar' : 'Activar'}</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><strong>Aún no hay reglas</strong>Crea una condición específica y pruébala antes de revisar un lote.</div>'}</div>
  <form id="simulate-rules" class="inline-form"><h3>Probar reglas sin guardar compras</h3><div class="form-grid"><label class="field">Descripción de prueba<input class="input" name="description" value="${e(ui.ruleSimulation?.description)}"></label><label class="field">SKU de prueba<input class="input" name="sku" value="${e(ui.ruleSimulation?.sku)}"></label><label class="field">RFC de prueba<input class="input" name="supplierId" value="${e(ui.ruleSimulation?.supplierId)}"></label></div><button class="button" type="submit">Probar coincidencias</button><p id="rule-simulation-result" class="helper" role="status">${e(ui.ruleSimulationResult || '')}</p></form></section>`;
}

const summaries = [['products', 'Productos'], ['ingredients', 'Ingredientes'], ['price_observations', 'Observaciones de precio'], ['recipes', 'Recetas'], ['menus', 'Menús'], ['audit', 'Decisiones en bitácora'], ['imports', 'Archivos registrados']];
export function backupPanel(service, ui) {
  const canExport = !service.remote || service.actor.role === 'admin';
  return `<section class="section backup-panel" aria-labelledby="backup-heading"><div class="section-head"><div><h2 id="backup-heading">Respaldo y recuperación</h2><p>Catálogo, reglas, precios, recetas, menús, configuración y bitácora en un archivo local. No incluye los XML temporales.</p></div></div>
    <p class="helper">El archivo contiene datos de compras y proveedores: guárdalo en una ubicación privada. No está cifrado. La suma de integridad detecta daños, no acredita quién creó el archivo.</p>
    <button class="button primary" id="download-full-backup" ${canExport ? '' : 'disabled'}>Descargar respaldo completo</button>${!canExport ? '<p class="helper">La descarga completa requiere administración en el servidor.</p>' : ''}
    <form class="inline-form" id="backup-file-form"><h3>Recuperar una copia local</h3><p>Selecciona un respaldo creado aquí. Primero se comprueba el archivo. Al confirmar se abrirá una base independiente en este navegador; no se reemplazan datos de la sesión actual ni del servidor.</p><label class="field">Archivo de respaldo JSON · máximo 64 MB<input class="input" id="backup-file" type="file" accept=".json,application/json"></label></form>
    ${ui.backupError ? `<p class="error-message" role="alert">${e(ui.backupError)}</p>` : ''}
    ${ui.backupPreview ? `<div class="backup-preview"><h3>Contenido comprobado</h3><p>Archivo: ${e(ui.backupFilename)}<br>Creado: ${e(new Date(ui.backupPreview.backup.createdAt).toLocaleString('es-MX'))} · ${ui.backupPreview.total} registros</p><dl class="field-grid">${summaries.map(([key, label]) => `<dt>${label}</dt><dd>${ui.backupPreview.counts[key]}</dd>`).join('')}<dt>Reglas</dt><dd>${ui.backupPreview.backup.collections.settings.filter(s => s.kind === 'classification_rule').length}</dd></dl><p class="helper">Los originales XML no se restauran ni se amplía su plazo. El costo se vuelve a calcular con las observaciones conservadas.</p><div class="form-actions"><button class="button" id="cancel-recovery">Cancelar</button><button class="button primary" id="restore-local-copy">Crear y abrir copia recuperada</button></div></div>` : ''}
    ${ui.backupMessage ? `<p class="helper" role="status">${e(ui.backupMessage)}</p>` : ''}
  </section>`;
}

export function bindRulesAndBackup({ root, state, ui, store, service, render, toast }) {
  const on = (selector, type, fn) => root.querySelector(selector)?.addEventListener(type, fn);
  on('#new-rule', 'click', () => { ui.ruleDraft = { field: 'description', operator: 'phrase', value: '', supplierId: '', priority: 100, active: true }; render(); root.querySelector('#rule-form input[name="value"]')?.focus(); });
  on('#cancel-rule', 'click', () => { ui.ruleDraft = null; render(); });
  root.querySelectorAll('[data-edit-rule]').forEach(b => b.addEventListener('click', () => { ui.ruleDraft = { ...state.rules.find(r => r.id === b.dataset.editRule) }; render(); root.querySelector('#rule-form input[name="value"]')?.focus(); }));
  root.querySelectorAll('[data-toggle-rule]').forEach(b => b.addEventListener('click', async () => {
    const r = state.rules.find(r => r.id === b.dataset.toggleRule);
    try { await store.saveRule({ ...r, active: !r.active, expectedRevision: r._revision }); toast(r.active ? 'Regla pausada. Las decisiones previas no cambian.' : 'Regla activada solo como sugerencia.'); }
    catch (error) { toast(error.message, 'error'); }
  }));
  on('#rule-form [name="field"]', 'change', event => {
    const form = event.target.form, sku = event.target.value === 'sku';
    if (sku) form.elements.operator.value = 'equals';
    form.elements.operator.querySelector('[value="phrase"]').disabled = sku;
    form.elements.supplierId.required = sku;
  });
  on('#rule-form', 'submit', async event => {
    event.preventDefault();
    const draft = { ...ui.ruleDraft, ...Object.fromEntries(new FormData(event.currentTarget)) };
    ui.ruleDraft = draft;
    try { await store.saveRule({ ...draft, expectedRevision: draft._revision ?? null }); ui.ruleDraft = null; render(); toast('Regla guardada. Las coincidencias siguen pendientes de confirmación.'); }
    catch (error) { root.querySelector('#rule-error').textContent = error.message; }
  });
  on('#simulate-rules', 'submit', event => {
    event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); ui.ruleSimulation = input;
    const result = suggestCategory({ supplierId: input.supplierId, original: { descripcion_original: input.description, no_identificacion: input.sku } }, state.rules, state.categories);
    ui.ruleSimulationResult = result.status === 'none' ? 'Sin coincidencias. No se ha guardado ninguna compra.' : `${result.status === 'conflict' ? 'Conflicto: categorías incompatibles' : 'Sugerencia'}: ${[...new Set(result.matches.map(r => state.categories.find(c => c.id === r.categoryId)?.name))].join(', ')}. ${result.matches.length} reglas coincidentes; requiere confirmación.`;
    root.querySelector('#rule-simulation-result').textContent = ui.ruleSimulationResult;
  });
  on('#download-full-backup', 'click', async () => {
    try {
      await store.run(async () => {
        const backup = await service.exportBackup();
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `forx-respaldo-completo-${backup.createdAt.slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      ui.backupMessage = 'Respaldo descargado. Conserva este archivo fuera del navegador.'; render();
    } catch (error) { ui.backupError = error.message; render(); }
  });
  on('#backup-file', 'change', async event => {
    const file = event.target.files[0]; ui.backupPreview = null; ui.backupSource = null; ui.backupError = null; ui.backupFilename = file?.name || '';
    if (!file) { render(); return; }
    try { await store.run(async () => { if (file.size > BACKUP_MAX_BYTES) throw new Error('El archivo supera 64 MB.'); const source = await file.text(); ui.backupPreview = await inspectBackup(source); ui.backupSource = source; }); }
    catch (error) { ui.backupError = error.message; }
    render();
  });
  on('#cancel-recovery', 'click', () => { ui.backupSource = ui.backupPreview = null; render(); });
  on('#restore-local-copy', 'click', async () => {
    try {
      const result = await store.run(() => restoreLocalCopy(ui.backupSource));
      const url = new URL(location.href); url.search = ''; url.searchParams.set('recovery', result.name); url.hash = '/despensa';
      location.assign(url.href);
    } catch (error) { ui.backupError = error.message; render(); }
  });
}
