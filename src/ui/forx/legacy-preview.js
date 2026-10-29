import { previewLegacyBackup, LEGACY_BACKUP_MAX_BYTES } from '../../domain/legacy-recipe-preview.js';
import { norm } from '../../domain/recipes.js';
import { escapeHtml as e } from '../../domain/kitchen-exports.js';

const PAGE_SIZE=30;
const sourceLabel=key=>key==='local'?'Copia local':'Copia de nube';
const typeLabel={guisado:'Guisado',garnacha:'Garnacha',guarnicion:'Guarnición',postre:'Postre',agua:'Agua',grill:'Grill Express'};
const configLabel={lineas:'Líneas de negocio',linea_menu:'Línea del menú',costo_produccion:'Producción',complementos:'Complementos',porciones_platillo:'Porciones',rendimientos:'Rendimientos',margen_objetivo:'Margen objetivo'};

export function mountLegacyPreview(container,getExistingRecipes) {
  let report=null,json='',source='',filename='',query='',filter='all',page=0,selected=null,readVersion=0,disposed=false;
  const listeners=new AbortController();
  container.innerHTML=`<div class="card legacy-preview">
    <h1 class="ch">Revisar respaldo anterior</h1>
    <p class="legacy-intro">Consulta las recetas y Grill Express antes de recuperarlos. Esta vista no importa, reemplaza ni elimina datos.</p>
    <div class="legacy-file"><label class="fg"><span class="fl2">Respaldo anterior de FORX (JSON)</span><input class="fi" type="file" accept=".json,application/json" id="legacy-backup-file" aria-describedby="legacy-file-help"></label><button class="btn bsec" type="button" data-preview="clear">Limpiar vista previa</button></div>
    <p class="status-line" id="legacy-file-help">Hasta 10 MB. El archivo se lee en este navegador; no se envía al servidor ni queda guardado al recargar.</p>
    <p id="legacy-read-status" role="status"></p><p id="legacy-read-error" class="error-message" role="alert"></p>
    <div id="legacy-report" hidden></div>
  </div>`;
  const $=s=>container.querySelector(s);
  const fileInput=$('#legacy-backup-file');
  function renderReport() {
    const target=$('#legacy-report');target.hidden=!report;if(!report){target.replaceChildren();return;}
    const s=report.sources[source];
    target.innerHTML=`<div class="legacy-summary">
      <h2>Contenido del respaldo</h2><p class="status-line">${e(filename)}${report.generatedAt?' · Fecha del respaldo: '+e(report.generatedAt):''}</p>
      <p><strong>${s.summary.menu} ${s.summary.menu===1?'receta':'recetas'} y ${s.summary.grill} ${s.summary.grill===1?'platillo':'platillos'} de Grill Express.</strong> Registros con advertencias: ${s.summary.review}. Omitidos del menú: ${s.summary.omitted}.</p>
      <label class="fg legacy-source"><span class="fl2">Copia que estás revisando</span><select class="fs" id="legacy-source">${Object.keys(report.sources).map(k=>`<option value="${k}" ${source===k?'selected':''}>${sourceLabel(k)}</option>`).join('')}</select></label>
      <p>${report.comparisons.length?report.comparisons.map(c=>`${e(c.label)}: <strong>${c.equal?'coinciden entre copias':'hay diferencias entre copias'}</strong>`).join(' · '):'El archivo contiene una sola copia.'}</p>
      <p class="status-line">La comparación cubre el contenido culinario y las marcas de omisión y eliminación, no los precios heredados. Las copias se revisan por separado: no se suman ni se fusionan.</p>
      <details class="legacy-preservation"><summary>Configuración y marcas históricas</summary>
        <p>${Object.keys(report.sources).map(k=>`${sourceLabel(k)}: ${report.sources[k].hasConfig?'incluye configuración':'sin configuración'}`).join(' · ')}. No se aplicarán parámetros al negocio actual.</p>
        ${s.configFields.length?`<p>Campos de esta copia: ${s.configFields.map(k=>e(configLabel[k])).join(', ')}.</p>`:''}
        <p>${s.deleted.length} marcas de eliminación y ${s.omitted.length} de omisión. Una marca no contiene la receta borrada. Las omisiones no se quitan automáticamente.</p>
        <details><summary>Ver nombres omitidos (${s.omitted.length})</summary><p>${s.omitted.map(e).join(' · ') || 'Sin marcas.'}</p></details>
        <details><summary>Ver nombres eliminados (${s.deleted.length})</summary><p>${s.deleted.map(e).join(' · ') || 'Sin marcas.'}</p></details>
      </details>
    </div>
    <p class="notice">Solo lectura. No se copian precios, no se vinculan ingredientes y ningún costo se considera verificado. Las cantidades se muestran tal como están guardadas, por porción; no se vuelven a dividir entre los comensales originales.</p>
    <div class="legacy-filters"><label class="fg"><span class="fl2">Buscar en el respaldo</span><input class="fi" id="legacy-query" type="search" placeholder="Receta o ingrediente" value="${e(query)}"></label>
      <label class="fg"><span class="fl2">Mostrar registros</span><select class="fs" id="legacy-filter">${[['all','Todos'],['review','Requieren revisión'],['duplicate','Duplicados o ID compartido'],['copies','Diferencias entre copias'],['existing','Coinciden con el catálogo'],['omitted','Omitidos del menú'],['grill','Grill Express']].map(([k,label])=>`<option value="${k}" ${filter===k?'selected':''}>${label}</option>`).join('')}</select></label></div>
    <div class="legacy-workspace"><section class="legacy-results" aria-label="Recetas del respaldo"><p id="legacy-count" class="status-line" role="status"></p><div id="legacy-results"></div><div id="legacy-pagination" class="row-actions"></div></section>
    <section id="legacy-detail" class="legacy-detail" aria-label="Detalle de receta del respaldo"><p>Selecciona <strong>Ver detalle</strong> en una receta para consultar sus cantidades, procedimiento y advertencias.</p></section></div>`;
    renderResults();renderDetail();
  }
  function filteredRows() {
    if(!report)return [];
    return report.sources[source].rows.filter(r=>{
      if(filter==='review'&&!r.issues.length)return false;
      if(filter==='duplicate'&&!r.issues.some(i=>['duplicate_name','duplicate_id'].includes(i.code)))return false;
      if(filter==='existing'&&!r.issues.some(i=>i.code==='existing'))return false;
      if(filter==='copies'&&!r.issues.some(i=>i.code==='copy_difference'))return false;
      if(filter==='omitted'&&!r.omitted)return false;
      if(filter==='grill'&&r.collection!=='grill')return false;
      return !query || norm([r.name,...r.lines.map(l=>l.name)].join(' ')).includes(norm(query));
    });
  }
  function renderResults() {
    const rows=filteredRows();page=Math.min(page,Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1));
    const visible=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    $('#legacy-count').textContent=`${rows.length} registros encontrados${rows.length?` · ${page*PAGE_SIZE+1}–${page*PAGE_SIZE+visible.length}`:''}`;
    $('#legacy-results').innerHTML=rows.length?`<table class="tabla legacy-table"><thead><tr><th>Receta / tipo</th><th>Revisión</th><th><span class="legacy-sr-only">Detalle</span></th></tr></thead><tbody>${visible.map(r=>`<tr data-preview-row="${r.key}" ${r.key===selected?'class="selected"':''}><td><strong>${e(r.name||'Sin nombre')}</strong><small>${e(typeLabel[r.type]||r.type||'Sin tipo')}${r.omitted?' · Omitida del menú':''}${r.status==='borrador'?' · Borrador':''}${r.status==='archivado'?' · Archivada':''}${r.deleted?' · Marca de eliminación':''}</small></td><td><span class="legacy-state ${r.issues.length?'needs-review':''}">${r.issues.length?`${r.issues.length} ${r.issues.length===1?'advertencia':'advertencias'}`:'Sin alertas de formato'}</span></td><td><button type="button" class="btn bsec bsm" data-preview="detail" data-key="${r.key}" aria-label="Ver detalle de ${e(r.name||'Sin nombre')}" aria-pressed="${r.key===selected}">Ver detalle</button></td></tr>`).join('')}</tbody></table>`:'<p class="notice">No hay recetas para estos filtros. Cambia la búsqueda o selecciona Todos.</p>';
    $('#legacy-pagination').innerHTML=rows.length>PAGE_SIZE?`<button type="button" class="btn bsec bsm" data-preview="previous" ${page===0?'disabled':''}>Anteriores</button><span>Página ${page+1} de ${Math.ceil(rows.length/PAGE_SIZE)}</span><button type="button" class="btn bsec bsm" data-preview="next" ${(page+1)*PAGE_SIZE>=rows.length?'disabled':''}>Siguientes</button>`:'';
  }
  function renderDetail(focus=false) {
    const row=report?.sources[source].rows.find(r=>r.key===selected);const target=$('#legacy-detail');if(!target)return;
    if(!row){target.innerHTML='<p>Selecciona <strong>Ver detalle</strong> en una receta para consultar sus cantidades, procedimiento y advertencias.</p>';return;}
    const linesTable=(lines,label)=>`<h3>${label}</h3><table class="tabla legacy-ingredients"><thead><tr><th>Nombre original</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>${lines.map(l=>`<tr><td>${e(l.name||'Sin nombre')}</td><td>${e(l.quantity||'Sin cantidad')}</td><td>${e(l.unit||'Sin unidad')}</td></tr>`).join('')}</tbody></table>`;
    target.innerHTML=`<div class="legacy-detail-head"><h2 id="legacy-detail-title" tabindex="-1">${e(row.name||'Sin nombre')}</h2><button type="button" class="btn bsec bsm" data-preview="back">Volver a resultados</button></div>
      <p class="status-line">${e(typeLabel[row.type]||row.type)} · ${e(row.region||row.category||'Sin región o categoría')} · ID anterior: ${e(row.originalId||'Sin ID')}</p>
      ${row.issues.length?`<div class="notice"><h3>Requiere revisión</h3><ul>${row.issues.map(i=>`<li>${e(i.message)}</li>`).join('')}</ul></div>`:'<p class="status-line">Sin alertas de formato. Esto no valida las cantidades ni el costo.</p>'}
      <p>${row.omitted?'Omitida del menú. ':''}${row.deleted?'Marcada como eliminada. ':''}${row.status==='borrador'?'Borrador de Grill Express. ':''}Vínculos a MiDespensa pendientes; costo no verificable.</p>
      <dl class="legacy-metadata"><dt>Base de cantidades</dt><dd>1 porción, sin volver a dividir</dd>${row.originalServings?`<dt>Comensales originales</dt><dd>${e(row.originalServings)} (referencia histórica)</dd>`:''}${row.destinationServings?`<dt>Comensales de destino</dt><dd>${e(row.destinationServings)} (referencia histórica)</dd>`:''}${row.minutes?`<dt>Tiempo capturado</dt><dd>${e(row.minutes)} min</dd>`:''}</dl>
      ${linesTable(row.lines,'Ingredientes')}${row.disposables.length?linesTable(row.disposables,'Desechables'):''}
      <h3>Procedimiento original</h3>${row.instructions.some(s=>s.trim())?`<ol class="legacy-steps">${row.instructions.map(s=>`<li>${e(s)}</li>`).join('')}</ol>`:'<p>No hay procedimiento capturado.</p>'}
      <p class="status-line">El procedimiento se conserva literal. Las cantidades que menciona dentro del texto pueden corresponder a la preparación original; no se escalan automáticamente.</p>
      ${row.notes?`<h3>Notas originales</h3><p class="legacy-notes">${e(row.notes)}</p>`:''}`;
    if(focus)$('#legacy-detail-title').focus();
  }
  function clear(resetFile=true) {readVersion++;report=null;json='';filename='';selected=null;query='';filter='all';page=0;if(resetFile)fileInput.value='';fileInput.disabled=false;$('#legacy-read-status').textContent='';$('#legacy-read-error').textContent='';renderReport();}
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    clear(false);const version=readVersion;fileInput.disabled=true;$('#legacy-read-status').textContent='Revisando el archivo, sin guardar datos…';
    try {
      if(file.size>LEGACY_BACKUP_MAX_BYTES)throw new Error('El archivo supera 10 MB. Selecciona un respaldo más pequeño.');
      const content=await file.text();if(disposed||version!==readVersion)return;
      report=previewLegacyBackup(content,{existingRecipes:getExistingRecipes()});json=content;filename=file.name;source=report.defaultSource;renderReport();
      $('#legacy-read-status').textContent='Vista previa lista. No se guardaron datos en el catálogo.';
    } catch(error){if(!disposed&&version===readVersion){$('#legacy-read-status').textContent='';$('#legacy-read-error').textContent=error.message;}}
    finally{if(!disposed&&version===readVersion)fileInput.disabled=false;}
  },{signal:listeners.signal});
  container.addEventListener('input',event=>{if(event.target.id==='legacy-query'){query=event.target.value;page=0;selected=null;renderResults();renderDetail();}},{signal:listeners.signal});
  container.addEventListener('change',event=>{
    if(event.target.id==='legacy-source'){source=event.target.value;query='';filter='all';page=0;selected=null;renderReport();$('#legacy-source').focus();}
    if(event.target.id==='legacy-filter'){filter=event.target.value;page=0;selected=null;renderResults();renderDetail();}
  },{signal:listeners.signal});
  container.addEventListener('click',event=>{
    const node=event.target.closest('[data-preview]');if(!node||node.disabled)return;
    switch(node.dataset.preview){
      case 'clear':clear();fileInput.focus();break;
      case 'detail':selected=node.dataset.key;renderResults();renderDetail(true);break;
      case 'back':container.querySelector(`[data-key="${selected}"]`)?.focus();break;
      case 'previous':case 'next':page+=node.dataset.preview==='next'?1:-1;selected=null;renderResults();renderDetail();$('#legacy-results button')?.focus();break;
    }
  },{signal:listeners.signal});
  return { refresh(){if(report){report=previewLegacyBackup(json,{existingRecipes:getExistingRecipes()});renderReport();}}, dispose(){disposed=true;readVersion++;listeners.abort();json='';report=null;} };
}
