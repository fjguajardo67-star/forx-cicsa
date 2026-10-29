import legacyCSS from './legacy.css?raw';
import integrationCSS from './integration.css?raw';
import { shell, pages } from './legacy-templates.js';
import { TYPES, UNIT, norm, validateRecipe, parseRecipeBatch } from '../../domain/recipes.js';
import { costRecipe, costLine, money, recipeCap } from '../../domain/costing.js';
import { restrictedDay } from '../../domain/menus.js';
import { baseRecipes } from '../../domain/base-recipes.js';
import { priceEvidenceMarkup } from './price-evidence-view.js';
import { mountLegacyPreview } from './legacy-preview.js';
import { mountRecipeGenerator } from './recipe-generator.js';
import { currentTheme, syncThemeControl, toggleTheme } from '../theme.js';
import { escapeHtml as e, csv, menuRows, shoppingList, printMenu, printRecipes, printGrillMenu, recipesText, xlsx } from '../../domain/kitchen-exports.js';

const typeLabel=id=>TYPES.find(t=>t.id===id)?.label || id;
const button=(action,label,extra='')=>`<button type="button" class="btn bsec bsm" data-action="${action}" ${extra}>${label}</button>`;
const options=(items,value)=>items.map(([id,label])=>`<option value="${e(id)}" ${String(id)===String(value)?'selected':''}>${e(label)}</option>`).join('');
const field=(label,name,value,type='text',extra='')=>`<label class="fg"><span class="fl2">${e(label)}</span><input class="fi" name="${name}" value="${e(value)}" type="${type}" ${extra}></label>`;
const download=(content,name,type)=> { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };

export async function mountForx(container,service) {
  const readOnly=service.actor?.role==='viewer';
  const editActions=new Set(['new','nuevoPl','nuevoAlacarta','addLine','addDisposable','removeLine','omit','archive','agregarReceta','cargarLote','baseRecipes','genMenu','replace','applyReplacement','setDias','setDiasC','addContract','removeContract','addComplement','addFixed','removeFixed']);
  const editRoutes=new Set(['agregar','generar','recuperar']);
  let state=await service.snapshot(),busy=false,disposed=false,timer,priceOriginId=null;
  const ui={route:location.hash.split('/')[2] || 'menu',count:30,menuId:state.menus.at(-1)?.id,filter:'todos',type:'todos',protein:'todas',query:'',grillFilter:'todos',order:false,draft:null,settingsDraft:null,settingsDirty:false};
  const host=document.createElement('div');host.id='forx-module';container.replaceChildren(host);
  const root=host.attachShadow({mode:'open'}),$=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
  host.dataset.theme=currentTheme();
  root.innerHTML=`<style>${legacyCSS}\n${integrationCSS}</style>${shell}${Object.values(pages).join('')}
    <section id="generar" class="page"><div class="card" id="recipe-generator"></div></section>
    <section id="exportar" class="page"><div class="card"><h1 class="ch">Costeo — configuración de negocio</h1><div id="business-config"></div></div><div class="card"><h2 class="ch">Exportar</h2><div class="row-actions">${button('excel','Menú a Excel')}${button('printMenu','Imprimir menú')}${button('book','Libro de recetas')}${button('backup','Respaldo de recetas y menús')}</div><p>Se incluyen advertencias y el origen de los precios. Documentos con costeo actual.</p></div></section>
    <section id="recuperar" class="page"><div class="row-actions">${button('go','Volver al catálogo','data-param="cat"')}</div><div id="legacy-preview-host"></div></section>
    </div></div></div><dialog class="modal" aria-labelledby="dialog-title"><div class="mc"><div class="mh"><h2 id="dialog-title"></h2>${button('close','Cerrar','aria-label="Cerrar ventana"')}</div><div class="mb" id="dialog-body"></div></div></dialog><div class="toast" role="status"></div>`;
  const legacyPreview=mountLegacyPreview($('#legacy-preview-host'),()=>state.recipes);
  const generator=mountRecipeGenerator($('#recipe-generator'),service,()=>state,openEditor);
  const themeControl=$('[data-click="alternarTema"]');
  themeControl.setAttribute('data-theme-toggle','');
  $('#btn-tema-txt').setAttribute('data-theme-label','');
  syncThemeControl(themeControl);
  $('#cat').insertAdjacentHTML('afterbegin',`<div class="row-actions">${button('go','Revisar respaldo anterior','data-param="recuperar"')}</div>`);
  $('#exportar').insertAdjacentHTML('afterbegin',`<div class="row-actions">${button('go','Revisar respaldo anterior','data-param="recuperar"')}</div>`);
  $$('.ch').forEach(el=>{el.setAttribute('role','heading');el.setAttribute('aria-level','1');});
  $$('.page .fg').forEach((group,i)=> { const label=group.querySelector('label'),input=group.querySelector('input,select,textarea');if(label&&input){input.id ||= `legacy-field-${i}`;label.htmlFor=input.id;} });
  $('.side-foot .legal').textContent=state.settings.identity.company;
  $('.side-foot').insertAdjacentHTML('afterbegin',`<p class="local-mode">${e(service.mode || 'Datos de este navegador. Sin nube.')}</p>${button('refresh','Actualizar datos')}`);
  if(service.session){
    $('.side-foot .infobox').textContent={admin:'Cuenta con administración',editor:'Cuenta con edición',viewer:'Cuenta de consulta'}[service.actor.role];
    $('.side-foot').insertAdjacentHTML('afterbegin',`<div class="session-account"><strong>${e(service.actor.email || service.actor.name)}</strong>${button('logout','Cerrar sesión')}</div>`);
  }
  $('#catbuscar').setAttribute('aria-label','Buscar receta');
  $('#acbuscar').setAttribute('aria-label','Buscar Grill Express');
  $('[name="q-precios"]').setAttribute('aria-label','Buscar ingrediente, proveedor o SKU');
  $('[name="q-precios"]').placeholder='Ingrediente, proveedor o SKU';
  const priceSearch=$('[name="q-precios"]').parentElement;priceSearch.removeAttribute('style');priceSearch.classList.add('prices-search');
  const priceTable=$('#tpre').closest('table');priceTable.classList.add('price-table');
  priceTable.querySelector('thead').innerHTML='<tr><th>Ingrediente / producto</th><th class="num">Precio vigente</th><th>Proveedor</th><th>SKU de origen</th><th>Fecha de compra</th><th>Verificación</th></tr>';
  $('#precios .card').insertAdjacentHTML('beforeend','<section class="price-evidence" id="price-origin" aria-live="polite" aria-label="Origen del precio" hidden></section>');
  if(readOnly){
    $('#precios .infobox').textContent='Consulta del catálogo MiDespensa. Puedes consultar ingredientes y precios vigentes. La validación y la evidencia de compras requieren una cuenta con edición o administración.';
    $('[name="q-precios"]').setAttribute('aria-label','Buscar ingrediente');
    $('[name="q-precios"]').placeholder='Buscar ingrediente';
    priceTable.querySelector('thead').innerHTML='<tr><th>Ingrediente</th><th class="num">Precio vigente</th><th>Proveedor</th><th>SKU de origen</th><th>Fecha de compra</th><th>Verificación</th></tr>';
  }
  $('#rtxt').placeholder='NOMBRE: Mi receta\nTIPO: guisado\nPORCIONES_BASE: 4\nINGREDIENTES:\n* Jitomate: 400 g\nPROCEDIMIENTO:\n1. Cocinar y servir.';
  $('#agregar .card').insertAdjacentHTML('afterbegin',`<div class="row-actions">${button('new','Capturar receta manualmente')}${button('baseRecipes',`Agregar las ${baseRecipes.length} recetas base de FORX`)}</div>`);
  $('[data-click="repararCatalogo"]')?.remove();
  $('[data-click="limpiezaGuiada"]').textContent='Revisar pendientes';
  $('[data-click="clasificarProteina"]').textContent='Revisar proteínas';
  $('#menu .fbar').insertAdjacentHTML('beforebegin',`<div class="menu-toolbar">${field('Nombre del menú','menuName','Menú de prueba')}${field('Fecha inicial','startDate',new Date().toISOString().slice(0,10),'date')}<label class="fg"><span class="fl2">Menús guardados</span><select class="fs" id="saved-menus"></select></label></div>`);
  $('#comensalesDia').setAttribute('aria-label','Comensales');$('#comensalesDia').min='1';$('#comensalesDia').max='99999';
  const duration=$('#menu .infobox>div');duration.removeAttribute('style');duration.classList.add('duration-layout');
  for(const id of ['rtipo','rregion','rpax'])$('#'+id).addEventListener('change',event=>event.target.dataset.edited='true');
  $('#rbatch-dest').closest('.fg')?.remove();
  const captureActions=$('#rdest').closest('.fg').parentElement;
  $('#rdest').closest('.fg').remove();
  captureActions.removeAttribute('style');captureActions.classList.add('row-actions');
  $('#agregar .infobox').innerHTML='<h3>Formato de captura</h3><ol><li>Usa Capturar receta manualmente o pega el formato NOMBRE, TIPO, PORCIONES_BASE e INGREDIENTES.</li><li>Escribe cada ingrediente como Nombre: cantidad unidad (g, kg, ml, l o pz).</li><li>Pulsa Revisar y guardar para abrir el editor; confirma los vínculos a MiDespensa.</li><li>Se conservan las porciones base. Las compras y documentos se escalan a los comensales del menú.</li></ol><p>Puedes guardar con ingredientes pendientes; el costo seguirá no verificable.</p>';
  $('#rbatch').closest('.card').querySelector('.infobox p').innerHTML='Pega recetas separadas por --- o por NOMBRE:. Se conservan las porciones base; el escalado se hace al generar compras y documentos. No se copian precios ni se deducen vínculos.';
  $('[data-click="agregarReceta"]').textContent='Revisar y guardar';
  $('#dcustom').setAttribute('aria-label','Duración personalizada');
  let returnFocus=null;
  function notify(text,error=false) { if(disposed)return;const el=$('.toast');el.textContent=text;el.classList.add('on');el.setAttribute('role',error?'alert':'status');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('on'),5000); }
  function modal(title,body) { returnFocus=root.activeElement;$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body; if(!$('dialog').open)$('dialog').showModal();$('dialog').querySelector('input,select,button')?.focus(); }
  function close(force=false) { if(!readOnly&&ui.draft&&!force&&!confirm('¿Descartar los cambios sin guardar de esta receta?'))return false;ui.draft=null;$('dialog').close();returnFocus?.focus();return true; }
  async function refresh() {state=await service.snapshot();if(!disposed){closePriceOrigin();legacyPreview.refresh();generator.refresh();render();}}
  async function run(action) {if(busy)return;busy=true;host.setAttribute('aria-busy','true');try{await action();}catch(error){const el=$('#form-error');if(el&&ui.draft&&$('dialog').open)el.textContent=error.message;else notify(error.message,true);}finally{busy=false;host.removeAttribute('aria-busy');applyReadOnly();}}
  function navigate(route) {if(ui.draft&&!close())return;if(ui.route==='generar'&&route!=='generar'&&!generator.canLeave())return;if(ui.settingsDirty&&!confirm('¿Salir sin guardar la configuración?'))return;ui.settingsDraft=null;ui.settingsDirty=false;ui.route=route;history.replaceState(null,'',`#/forx/${route}`);render();$('.main').scrollIntoView({block:'start'});}
  function pantry() {if(readOnly){navigate('precios');return;}if(ui.draft&&!close())return;if(!generator.canLeave())return;if(ui.settingsDirty&&!confirm('¿Salir sin guardar la configuración?'))return;location.hash='/despensa';}
  function applyReadOnly() {
    if(!readOnly)return;
    $$('[data-action],[data-click]').forEach(node=>{
      const action=node.dataset.action || node.dataset.click;
      if(editActions.has(action) || (action==='go'&&editRoutes.has(node.dataset.param)))node.hidden=true;
      if(action==='edit')node.textContent='Ver receta';
    });
    $$('#config-form input,#config-form select,#config-form textarea,#menu .menu-toolbar input,#lineaMenu,#comensalesDia,#dcustom').forEach(node=>node.disabled=true);
    $$('#config-form [type="submit"],#recipe-form [type="submit"]').forEach(node=>node.hidden=true);
  }
  function currentMenu(){return state.menus.find(m=>m.id===ui.menuId);}
  function badge(cost){return `<span class="pill pill-${['sinprecio','sinlinea'].includes(cost.band)?'sinlinea':cost.band}">${cost.verified?`${cost.margin==null?'Sin precio de venta':Number(cost.margin).toFixed(1)+'% · '+cost.band}`:'Costo no verificable'}</span>`;}
  function warnings(cost){return cost.missing.length?`<div class="missing-list">${cost.missing.map(m=>`${e(m.name)}: ${e(m.reason)}`).join('<br>')}</div>`:'';}
  function render() {
    if(readOnly&&editRoutes.has(ui.route)){ui.route='precios';history.replaceState(null,'','#/forx/precios');}
    if(!['menu','agregar','cat','alacarta','precios','generar','exportar','recuperar'].includes(ui.route))ui.route='menu';
    $$('.page').forEach(p=>p.classList.toggle('on',p.id===ui.route));
    $$('.nav-list .tab').forEach(b=>{const active=b.dataset.param===(ui.route==='recuperar'?'cat':ui.route);b.classList.toggle('on',active);b.setAttribute('aria-current',active?'page':'false');});
    $('#stat-plat').textContent=state.recipes.filter(r=>r.status!=='archived').length;
    $('#lineaMenu').innerHTML=options(state.settings.contractLines.filter(l=>l.active).map(l=>[l.id,l.name]),currentMenu()?.days[0]?.contractLineId || state.settings.defaultLineId);
    if(ui.route==='menu')renderMenu();if(ui.route==='cat')renderCatalog();if(ui.route==='alacarta')renderGrill();if(ui.route==='precios')renderPrices();if(ui.route==='exportar')renderConfig();
    $$('[data-recipe]').forEach(node=>{const r=state.recipes.find(r=>r.id===node.dataset.recipe);if(r?.generation?.provider==='simulated'&&!node.querySelector('.generation-origin'))node.querySelector('.recipe-body')?.insertAdjacentHTML('afterbegin','<p class="status-line generation-origin">Origen: ejemplo simulado, no generado por OpenAI.</p>');});
    applyReadOnly();
  }
  function renderMenu(){
    $('#saved-menus').innerHTML='<option value="">Seleccionar menú</option>'+options(state.menus.map(m=>[m.id,m.name+' · '+m.startDate]),ui.menuId);
    const menu=currentMenu();
    if(!menu){$('#grid').innerHTML=(readOnly?'<div class="notice"><h2>Todavía no hay un menú guardado</h2><p>Una cuenta con edición puede generar el primer menú. Aquí podrás consultarlo cuando se guarde.</p>': '<div class="notice"><h2>Todavía no hay un menú guardado</h2><p>Agrega tus recetas al catálogo y pulsa Regenerar para crear el primer menú. Las recetas con ingredientes pendientes también pueden utilizarse.</p>'+button('new','Crear receta'))+'</div>';return;}
    const costs=state.menuCosts[menu.id];ui.count=menu.days.length;$('#dcustom').value=ui.count;$$('[data-dias]').forEach(b=>b.classList.toggle('on',Number(b.dataset.param)===ui.count));
    $('[name="menuName"]').value=menu.name;$('[name="startDate"]').value=menu.startDate;$('#comensalesDia').value=menu.diners;
    let days=menu.days.map((d,i)=>({day:d,cost:costs[i],index:i}));
    if(ui.filter!=='todos')days=days.filter(d=>d.cost.band===ui.filter);
    if(ui.order)days.sort((a,b)=>Number(a.cost.margin ?? -999)-Number(b.cost.margin ?? -999));
    $('#grid').innerHTML=days.map(({day,cost,index})=>`<article class="day" data-day="${index}"><div class="dh"><div><div class="dn">Día ${String(index+1).padStart(2,'0')}</div><div class="dw">${e(day.label)} · ${e(day.date)}</div></div><div><div class="dc">${cost.verified?money(cost.total)+'/comida':'No verificable'}</div><div class="sem-badge">${badge(cost)}</div></div></div>${cost.slots.map(s=>`<div class="pl"><div class="plt">${e(s.slot.label)}</div><div class="pln">${e(s.recipe?.name || 'Sin receta')}</div><div class="plm"><span>${e(s.recipe?.region || '')}</span><span class="slot-cost">${s.slot.charged?money(s.cost?.total)+'/pax':'Incluido en canasta'}</span></div>${button('replace','Cambiar',`data-day="${index}" data-slot="${s.slot.id}"`)}</div>`).join('')}${warnings(cost)}${day.warnings.length?`<p class="status-line">${day.warnings.map(e).join('<br>')}</p>`:''}</article>`).join('') || '<p class="notice">No hay días con este filtro.</p>';
  }
  function recipeCard(r){const cost=state.recipeCosts[r.id];return `<article class="recipe-item" data-recipe="${e(r.id)}"><header class="recipe-heading"><div><h3><span class="codigo">${e(r.code)}</span> ${e(r.name)}</h3><div><span class="pill pill-sinlinea">${e(typeLabel(r.type))}</span> ${e(r.protein)} ${r.omitted?'<span class="pill pill-sinlinea">Fuera del menú</span>':''}</div></div><div class="row-actions">${button('omit',r.omitted?'Reponer':'Omitir',`data-id="${r.id}"`)}${button('edit','Editar',`data-id="${r.id}"`)}${button('archive','Archivar',`data-id="${r.id}"`)}</div></header><div class="recipe-body">${r.lines.slice(0,3).map(l=>e(l.name)).join(' · ') || 'Solo el nombre; sin ingredientes todavía'}<p>Costo por porción: <strong>${money(cost.total)}</strong>${r.type==='grill'?' · '+badge(cost):''}</p></div>${warnings(cost)}</article>`;}
  function renderCatalog(){
    let recipes=state.recipes.filter(r=>r.type!=='grill' && r.status!=='archived');
    if(ui.type==='precargados')recipes=recipes.filter(r=>r.source==='forx-base');if(ui.type==='misrecetas')recipes=recipes.filter(r=>r.source!=='forx-base');
    if(TYPES.some(t=>t.id===ui.type))recipes=recipes.filter(r=>r.type===ui.type);
    if(ui.protein!=='todas'){const aliases={puerco:'cerdo',sinprot:'verdura',nc:''};recipes=recipes.filter(r=>TYPES.find(t=>t.id===r.type)?.main && (ui.protein==='nc'?!r.protein.trim():norm(r.protein).includes(aliases[ui.protein] ?? ui.protein)));}
    const query=norm($('#catbuscar').value);if(query)recipes=recipes.filter(r=>norm(r.name+' '+r.code).includes(query));
    $('#catcon').innerHTML=`<p class="status-line">${recipes.length} recetas · Costeo actual del catálogo MiDespensa</p>`+TYPES.filter(t=>t.id!=='grill').map(t=>{const rs=recipes.filter(r=>r.type===t.id);return rs.length?`<h2 class="ch">${e(t.plural)}</h2><div class="recipe-list">${rs.map(recipeCard).join('')}</div>`:'';}).join('')+(recipes.length?'':`<div class="notice">Sin recetas para esta selección. ${button('new','Crear receta')}</div>`);
  }
  function grillCard(r) {
    const cost=state.recipeCosts[r.id];
    const rows=(lines,costs)=>lines.map((l,i)=>`<div class="grill-line"><span>${e(l.name)} <small>${e(l.quantity)} ${e(l.unit)}</small></span><span>${money(costs[i].amount)}</span></div>`).join('');
    const subtotal=lines=>lines.some(l=>l.amount==null)?null:lines.reduce((n,l)=>n+Number(l.amount),0)/Number(r.baseServings);
    return `<article class="recipe-item" data-recipe="${e(r.id)}"><header class="recipe-heading"><div><h3><span class="codigo">${e(r.code)}</span> ${e(r.name)}</h3><span class="pill pill-sinlinea">${r.status==='active'?'Activo':'En pruebas'}</span></div><div><strong>${money(cost.total)}</strong><div>${badge(cost)}</div></div></header><div class="recipe-body"><h4>Materia prima · receta base de ${e(r.baseServings)} porciones</h4>${rows(r.lines,cost.lines)}${r.disposables.length?'<h4>Desechables</h4>'+rows(r.disposables,cost.disposables):''}<div class="recipe-breakdown"><span>Materia prima / porción: ${money(subtotal(cost.lines))}</span><span>Desechables / porción: ${money(subtotal(cost.disposables))}</span><span>Producción / porción: ${money(r.productionCost)}</span><span>Venta: ${r.salePrice?money(r.salePrice):'Por definir'}</span></div><div class="row-actions">${button('edit','Editar',`data-id="${r.id}"`)}${button('archive','Archivar',`data-id="${r.id}"`)}</div></div>${warnings(cost)}</article>`;
  }
  function renderGrill(){const query=norm($('#acbuscar').value);const recipes=state.recipes.filter(r=>r.type==='grill'&&r.status!=='archived'&&(ui.grillFilter==='todos'||r.status===({activo:'active',borrador:'draft'}[ui.grillFilter]||ui.grillFilter))&&norm(r.name).includes(query));$('#alacartacon').innerHTML=recipes.length?`<div class="recipe-list">${recipes.map(grillCard).join('')}</div>`:'<div class="notice">Todavía no hay platillos a la carta. Captura ingredientes, desechables y producción por platillo.</div>';}
  function renderPrices(){
    const query=norm($('[name="q-precios"]').value);
    $('#pst').textContent=state.catalog.filter(i=>i.currentPrice).length;
    $('#psh').textContent=state.catalog.filter(i=>i.currentPrice?.observedAt?.slice(0,10)===new Date().toISOString().slice(0,10)).length;
    const matches=state.catalog.filter(i=>{const s=state.priceSources?.[i.id];return norm([i.canonicalName,...(i.aliases || []),s?.productName,s?.description,s?.supplierName,s?.supplierSku].filter(Boolean).join(' ')).includes(query);});
    $('#tpre').innerHTML=matches.map(i=>{
      const s=state.priceSources?.[i.id];
      return `<tr data-price-ingredient="${e(i.id)}"><td data-label="Ingrediente / producto"><strong>${e(i.canonicalName)}</strong>${s?`<small>${e(s.productName)}</small>`:''}</td><td data-label="Precio vigente" class="num">${i.currentPrice?money(i.currentPrice.normalizedPrice)+'/'+e(i.baseUnit):'Sin precio validado'}</td><td data-label="Proveedor">${e(s?.supplierName || '—')}</td><td data-label="SKU de origen">${s?e(s.supplierSku || 'Sin SKU en XML'):'—'}</td><td data-label="Fecha de compra">${e(i.currentPrice?.observedAt?.slice(0,10) || '—')}</td><td data-label="Verificación">${s?button('priceOrigin','Ver origen',`data-id="${e(i.id)}" aria-expanded="${priceOriginId===i.id}" aria-controls="price-origin"`):`<span class="status-line">${!i.currentPrice?'Sin precio validado':state.canInspectPrices===false?'Requiere editor o administrador':'Origen no disponible; actualiza el servidor local'}</span>`}</td></tr>`;
    }).join('') || `<tr><td colspan="6">${state.catalog.length?'Sin resultados para esta búsqueda.':readOnly?'No hay ingredientes en el catálogo. Una cuenta con edición puede agregarlos en MiDespensa.':'Crea ingredientes y valida precios en MiDespensa.'}</td></tr>`;
  }
  function closePriceOrigin(){priceOriginId=null;const panel=$('#price-origin');panel.hidden=true;panel.replaceChildren();$$('[data-action="priceOrigin"]').forEach(b=>b.setAttribute('aria-expanded','false'));}
  function linkOptions(id){return '<option value="">Pendiente de vincular</option>'+options(state.catalog.filter(i=>i.status==='active').map(i=>[i.id,`${i.canonicalName} · ${i.baseUnit}${i.currentPrice?'':' · sin precio'}`]),id);}
  function lineMarkup(l,index,group='lines'){
    const id=l.id || crypto.randomUUID();return `<div class="ing-row" data-line="${index}" data-group="${group}" data-line-id="${e(id)}"><label><span class="fl2">Ingrediente ${index+1}</span><input class="fi" data-field="name" value="${e(l.name)}" aria-label="Nombre ingrediente ${index+1}"><select class="fs line-link" data-field="ingredientId" aria-label="Vincular ingrediente ${index+1}">${linkOptions(l.ingredientId)}</select><span class="line-state"></span></label><label><span class="fl2">Cantidad</span><input class="fi" data-field="quantity" type="number" step="any" min="0.000001" value="${e(l.quantity)}" aria-label="Cantidad ingrediente ${index+1}"></label><label><span class="fl2">Unidad</span><select class="fs" data-field="unit" aria-label="Unidad ingrediente ${index+1}">${options(Object.keys(UNIT).map(u=>[u,u]),l.unit||'g')}</select></label><div><span class="fl2">Costo en receta</span><div class="line-price">—</div></div>${button('removeLine','×','aria-label="Retirar renglón"')}<details class="line-detail"><summary>Rendimiento y equivalencia confirmados</summary><div class="form-grid"><label>Rendimiento servido/seco<input class="fi" data-field="yieldFactor" type="number" step="any" value="${e(l.yieldFactor || 1)}"></label><label>Gramos por pieza (opcional)<input class="fi" data-field="gramsPerPiece" type="number" step="any" value="${e(l.gramsPerPiece || '')}"></label><label>Fuente de la equivalencia<input class="fi" data-field="conversionNote" value="${e(l.conversionNote || '')}"></label></div></details></div>`;
  }
  function readLines(parent,group){return [...parent.querySelectorAll(`[data-line][data-group="${group}"]`)].map(row=>Object.fromEntries([['id',row.dataset.lineId],...[...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]) ]));}
  function readDraft(){const form=$('#recipe-form');const data=Object.fromEntries(new FormData(form));return {...ui.draft,...data,proposalReviewed:data.proposalReviewed==='on',lines:readLines(form,'lines'),disposables:readLines(form,'disposables'),expectedRevision:ui.draft._revision};}
  function preview(){try{const r=validateRecipe(readDraft()),c=costRecipe(r,state.catalog,state.settings);$('#editor-summary').innerHTML=`<strong>Costo por porción: ${money(c.total)}</strong><p>${c.verified?'Verificado con precios vigentes.':`Subtotal conocido: ${money(c.knownSubtotal)}. No es el costo total.`}</p>${warnings(c)}${r.type!=='grill'&&TYPES.find(t=>t.id===r.type)?.main&&c.verified&&state.cap!=null?`<p>Tope por platillo: ${money(state.cap)} · ${Number(c.total)<=Number(state.cap)?'Dentro':'Excede'}</p>`:''}`;$$('#recipe-form [data-line]').forEach(row=>{const lines=row.dataset.group==='disposables'?c.disposables:c.lines;const cost=lines[Number(row.dataset.line)];if(cost){row.querySelector('.line-price').textContent=money(cost.amount);row.querySelector('.line-state').textContent=cost.reason || `${money(cost.price)}/${cost.baseUnit} · ${cost.observationId}`;}});}catch(error){$('#editor-summary').textContent=error.message;}}
  function openEditor(recipe){
    ui.draft=structuredClone(recipe || {name:'',type:'guisado',baseServings:'1',minutes:'60',region:'',protein:'',instructions:'',lines:[],disposables:[],status:'active',productionCost:'0',salePrice:''});
    const r=ui.draft;
    modal(r.id?`Editar: ${r.name}`:'Nueva receta',`<form id="recipe-form">${field('Nombre','name',r.name)}<div class="form-grid">${field('Región','region',r.region)}<label class="fg"><span class="fl2">Tipo</span><select class="fs" name="type" aria-label="Tipo">${options(TYPES.map(t=>[t.id,t.label]),r.type)}</select></label>${field('Porciones base','baseServings',r.baseServings,'number','min="0.000001" step="any"')}${field('Proteína','protein',r.protein)}${field('Tiempo (min)','minutes',r.minutes,'number','min="0"')}<label class="fg"><span class="fl2">Estado</span><select class="fs" name="status" aria-label="Estado">${options([['active','Activo'],['draft','En pruebas']],r.status)}</select></label></div><h3>Ingredientes</h3><p class="status-line">Conserva el nombre capturado y confirma el vínculo a MiDespensa. Puedes guardar con vínculos o precios pendientes.</p><div class="rec-ing-scroll" id="editor-lines">${r.lines.map((l,i)=>lineMarkup(l,i)).join('')}</div>${button('addLine','Agregar ingrediente')}<div id="grill-fields" ${r.type==='grill'?'':'hidden'}><h3>Desechables</h3><div class="rec-ing-scroll" id="editor-disposables">${(r.disposables||[]).map((l,i)=>lineMarkup(l,i,'disposables')).join('')}</div>${button('addDisposable','Agregar desechable')}<div class="form-grid">${field('Producción por platillo','productionCost',r.productionCost || '0','number','min="0" step="any"')}${field('Precio de venta','salePrice',r.salePrice ?? '','number','min="0" step="any"')}</div></div><div class="csum editor-summary" id="editor-summary" aria-live="polite"></div><label class="fg"><span class="fl2">Procedimiento</span><textarea class="ft" name="instructions">${e(r.instructions)}</textarea></label><p class="error-message" id="form-error" role="alert"></p><footer>${button('printRecipe','Imprimir receta guardada',r.id?'':'disabled')}${button('close','Cancelar')}<button class="btn bgold" type="submit">Guardar receta</button></footer></form>`);
    if(r.generationRequestId){$('#recipe-form [name="status"]').disabled=true;$('#recipe-form').insertAdjacentHTML('afterbegin','<p class="notice">Propuesta simulada. Primero se guarda como borrador «En pruebas». No activa recetas ni valida precios automáticamente.</p>');$('#recipe-form footer').insertAdjacentHTML('beforebegin','<label class="proposal-ack"><input type="checkbox" name="proposalReviewed" required> Revisé cantidades, procedimiento y restricciones. Entiendo que el ejemplo es simulado y su costo depende de MiDespensa.</label>');}
    else if(r.generation?.provider==='simulated')$('#recipe-form').insertAdjacentHTML('afterbegin','<p class="notice">Origen: ejemplo simulado, no generado por OpenAI. Su activación y validación culinaria requieren decisión humana.</p>');
    $('#recipe-form').addEventListener('input',preview);$('#recipe-form').addEventListener('change',()=>{$('#grill-fields').hidden=$('#recipe-form [name="type"]').value!=='grill';preview();});
    $('#recipe-form').addEventListener('submit',event=>{event.preventDefault();if(readOnly)return;run(async()=>{const draft=readDraft(),saved=await service.saveRecipe(draft);if(draft.generationRequestId)generator.saved(draft.generationRequestId);ui.draft=null;close(true);await refresh();navigate(saved.type==='grill'?'alacarta':'cat');notify('Receta guardada. Su costo se verifica por separado.');});});preview();
    if(readOnly){$('#dialog-title').textContent=`Consultar: ${r.name}`;$('#recipe-form').insertAdjacentHTML('afterbegin','<p class="notice">Solo consulta. Los cambios de recetas y vínculos requieren una cuenta con edición.</p>');$$('#recipe-form input,#recipe-form select,#recipe-form textarea').forEach(node=>node.disabled=true);applyReadOnly();}
  }
  function renderConfig(){
    const c=ui.settingsDraft ||= structuredClone(state.settings);
    $('#business-config').innerHTML=`<form id="config-form"><p class="notice">Parámetros heredados del código FORX. Revisa y confirma antes de considerar verificado el costo del menú. Los complementos se cobran una sola vez; el rendimiento se confirma por renglón.</p><h3>Líneas de contrato</h3><div id="config-lines">${c.contractLines.map(l=>`<div class="config-row" data-contract="${e(l.id)}"><input class="fi" data-name value="${e(l.name)}" aria-label="Nombre de línea"><input class="fi" data-price type="number" step="any" min="0.01" value="${e(l.price)}" aria-label="Precio de línea">${button('removeContract','Retirar')}</div>`).join('')}</div>${button('addContract','Agregar línea')}<div class="form-grid">${field('Producción por comida','productionCost',c.productionCost,'number','step="any" min="0"')}${field('Porciones por platillo','dishPortions',c.dishPortions,'number','step="any" min="0.01"')}${field('Margen objetivo (%)','marginTarget',c.marginTarget,'number','step="any" min="0" max="99"')}</div><h3>Canasta de complementos</h3><div id="config-complements" class="rec-ing-scroll">${c.complements.map((l,i)=>l.fixedCost!=null?`<div class="config-row" data-fixed="${e(l.id)}"><input class="fi" data-name value="${e(l.name)}" aria-label="Nombre costo fijo"><input class="fi" data-cost type="number" step="any" value="${e(l.fixedCost)}" aria-label="Importe costo fijo">${button('removeFixed','Retirar')}</div>`:lineMarkup(l,i,'complements')).join('')}</div><div class="row-actions">${button('addComplement','Agregar ingrediente a canasta')}${button('addFixed','Agregar costo fijo')}</div><div class="form-grid">${field('Empresa en documentos','company',c.identity.company)}${field('Nombre de archivos','fileSlug',c.identity.fileSlug)}<label class="fg"><span class="fl2">Línea por omisión</span><select class="fs" name="defaultLineId">${options(c.contractLines.map(l=>[l.id,l.name]),c.defaultLineId)}</select></label></div><label><input type="checkbox" name="confirmed" ${c.confirmed?'checked':''}> Confirmé estos parámetros y la composición de la canasta.</label><p class="error-message" id="config-error" role="alert"></p><div class="row-actions"><button class="btn bgold" type="submit">Guardar configuración</button></div></form>`;
    $('#config-form').addEventListener('submit',event=>{event.preventDefault();if(readOnly)return;run(async()=>{try{await service.saveSettings(readConfig());ui.settingsDraft=null;ui.settingsDirty=false;await refresh();notify('Configuración guardada.');}catch(error){$('#config-error').textContent=error.message;}});});
  }
  function readConfig(){const form=$('#config-form'),data=Object.fromEntries(new FormData(form));return {...ui.settingsDraft,...data,confirmed:form.elements.confirmed.checked,expectedRevision:ui.settingsDraft._revision,identity:{company:data.company,fileSlug:data.fileSlug},contractLines:$$('[data-contract]').map(row=>({id:row.dataset.contract,name:row.querySelector('[data-name]').value,price:row.querySelector('[data-price]').value,active:true})),complements:[...readLines(form,'complements'),...$$('[data-fixed]').map(row=>({id:row.dataset.fixed,name:row.querySelector('[data-name]').value,fixedCost:row.querySelector('[data-cost]').value}))]};}
  function missingReport(){modal('Pendientes de recetas',`<div class="recipe-list">${state.recipes.filter(r=>r.status!=='archived').map(r=>`<section><h3>${e(r.code)} ${e(r.name)}</h3>${warnings(state.recipeCosts[r.id]) || '<p>Costo verificable.</p>'}${button('edit','Editar',`data-id="${r.id}"`)}</section>`).join('') || '<p>No hay recetas.</p>'}</div>`);}
  function exportMenu(kind){const m=currentMenu();if(!m)throw new Error('Selecciona o genera un menú.');const slug=state.settings.identity.fileSlug;if(kind==='excel')download(xlsx(menuRows(m,state.menuCosts[m.id])),`${slug}-menu.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');else download(printMenu(m,state),`${slug}-menu.html`,'text/html');}
  const actions={
    priceOrigin:async node=>{
      if(priceOriginId===node.dataset.id){closePriceOrigin();return;}
      priceOriginId=node.dataset.id;const panel=$('#price-origin');panel.hidden=false;
      panel.innerHTML='<p role="status">Consultando la compra y la validación…</p>';renderPrices();
      try {
        const proof=await service.priceEvidence({ingredientId:priceOriginId,observationId:state.catalog.find(i=>i.id===priceOriginId)?.currentPrice?.id});
        if(disposed)return;
        panel.innerHTML=priceEvidenceMarkup(proof);$('#price-origin-title').focus({preventScroll:true});
      } catch(error) {panel.innerHTML=`<p class="error-message" role="alert">${e(error.message)}</p>${button('refresh','Actualizar datos')}`;}
      panel.scrollIntoView({block:'nearest'});
    },
    closePriceOrigin:()=>{const id=priceOriginId;closePriceOrigin();$$('[data-action="priceOrigin"]').find(b=>b.dataset.id===id)?.focus();},
    priceProduct:node=>{location.hash=`/despensa/producto/${encodeURIComponent(node.dataset.product)}?observacion=${encodeURIComponent(node.dataset.observation)}`;},
    go:node=>navigate(node.dataset.param), pantry, refresh:async()=>{await refresh();notify('Datos actualizados.');}, close:()=>close(),
    new:()=>openEditor(), nuevoPl:()=>openEditor({name:'',type:'guarnicion',baseServings:'1',minutes:'0',lines:[],instructions:''}), nuevoAlacarta:()=>openEditor({name:'',type:'grill',baseServings:'1',minutes:'0',lines:[],disposables:[],instructions:''}),
    edit:node=>openEditor(state.recipes.find(r=>r.id===node.dataset.id)),
    addLine:()=>{$('#editor-lines').insertAdjacentHTML('beforeend',lineMarkup({name:'',quantity:'',unit:'g'},$$('#editor-lines [data-line]').length));preview();},
    addDisposable:()=>{$('#editor-disposables').insertAdjacentHTML('beforeend',lineMarkup({name:'',quantity:'',unit:'pz'},$$('#editor-disposables [data-line]').length,'disposables'));preview();},
    removeLine:node=>{const row=node.closest('[data-line]'),parent=row.parentElement;row.remove();[...parent.querySelectorAll('[data-line]')].forEach((r,i)=>r.dataset.line=i);if(ui.draft)preview();},
    omit:async node=>{const r=state.recipes.find(r=>r.id===node.dataset.id);await service.saveRecipe({...r,omitted:!r.omitted,expectedRevision:r._revision});await refresh();},
    archive:async node=>{const r=state.recipes.find(r=>r.id===node.dataset.id);if(!confirm(`¿Archivar ${r.name}? Se conserva el historial; los menús que la usen mostrarán el pendiente.`))return;await service.saveRecipe({...r,status:'archived',expectedRevision:r._revision});await refresh();},
    agregarReceta:()=>{const text=$('#rtxt').value.trim();if(!text){openEditor();return;}const parsed=parseRecipeBatch(text);if(parsed.length!==1||parsed[0].error)throw new Error(parsed[0]?.error || 'Usa el formato NOMBRE, TIPO, PORCIONES_BASE e INGREDIENTES; para varias recetas usa Carga por Lotes.');const r=parsed[0].recipe;
      if($('#rnombre').value.trim())r.name=$('#rnombre').value.trim();
      if($('#rtipo').dataset.edited)r.type=$('#rtipo').value;
      if($('#rregion').dataset.edited&&$('#rregion').value!=='auto')r.region=$('#rregion').value;
      if($('#rpax').dataset.edited)r.baseServings=$('#rpax').value;
      openEditor(r);$('#recipe-form').insertAdjacentHTML('afterbegin','<p class="notice">Se conservan las cantidades y porciones base. Las compras y documentos se escalan a los comensales del menú.</p>');},
    cargarLote:async()=>{const replacing=$('#rbatch-dup').value==='reemplazar';if(replacing&&!confirm('¿Reemplazar las recetas con el mismo nombre? Se conserva una versión anterior; los vínculos deberán revisarse.'))return;const result=await service.importRecipes($('#rbatch').value,{duplicates:replacing?'replace':'omit',expectedRevisions:Object.fromEntries(state.recipes.map(r=>[r.id,r._revision]))});await refresh();$('#batch-res').style.display='block';$('#batch-res').innerHTML=`<h3>Resultado del lote</h3>${result.map(r=>`<p>${e(r.name || `Receta ${r.index+1}`)}: ${e(r.status)} ${e(r.error || '')}</p>`).join('')}`;},
    baseRecipes:async()=>{if(!confirm('¿Agregar las 40 recetas del código FORX? No se copian precios ni vínculos. Las ya existentes se omiten.'))return;const result=await service.importRecipes(recipesText(baseRecipes),{source:'forx-base'});await refresh();navigate('cat');notify(`${result.filter(r=>r.status==='created').length} recetas agregadas sin precios inventados.`);},
    genMenu:async()=>{const m=await service.generateMenu({name:$('[name="menuName"]').value,startDate:$('[name="startDate"]').value,count:ui.count,diners:$('#comensalesDia').value,contractLineId:$('#lineaMenu').value});ui.menuId=m.id;await refresh();notify('Menú guardado.');},
    setDias:node=>{ui.count=Number(node.dataset.param);$$('[data-dias]').forEach(b=>b.classList.toggle('on',b===node));},setDiasC:()=>{const n=Number($('#dcustom').value);if(!Number.isInteger(n)||n<1||n>60)throw new Error('Usa entre 1 y 60 días.');ui.count=n;notify(`Duración: ${n} días.`);},
    filtSemaforo:node=>{ui.filter=node.dataset.param;$$('[data-fc]').forEach(b=>b.classList.toggle('on',b===node));renderMenu();},toggleOrdenMenu:()=>{ui.order=!ui.order;renderMenu();},
    setFiltCat:node=>{ui.type=node.dataset.param;$$('[data-fcat]').forEach(b=>b.classList.toggle('on',b===node));renderCatalog();},
    setFiltProt:node=>{ui.protein=node.dataset.param;$$('[data-fprot]').forEach(b=>b.classList.toggle('on',b===node));renderCatalog();},setFiltAC:node=>{ui.grillFilter=node.dataset.param;renderGrill();},
    replace:node=>{const m=currentMenu(),index=Number(node.dataset.day),slot=m.days[index].slots.find(s=>s.id===node.dataset.slot);const allowed=state.recipes.filter(r=>r.type===slot.type&&r.status==='active'&&!r.omitted&&(restrictedDay(r.name)==null||restrictedDay(r.name)===new Date(m.days[index].date).getUTCDay()));modal(`Cambiar ${slot.label}`,`<label>Receta<select id="replacement" class="fs">${options(allowed.map(r=>[r.id,r.name]),slot.recipeId)}</select></label><p>Una receta con ingredientes pendientes sigue disponible.</p>${button('applyReplacement','Aplicar',`data-day="${index}" data-slot="${slot.id}"`)}`);},
    applyReplacement:async node=>{const m=structuredClone(currentMenu());m.days[Number(node.dataset.day)].slots.find(s=>s.id===node.dataset.slot).recipeId=$('#replacement').value;await service.saveMenu({...m,expectedRevision:m._revision});close(true);await refresh();},
    listaCompras:()=>{const m=currentMenu();if(!m)throw new Error('Genera un menú.');const rows=shoppingList(m,state);modal('Lista de compras',`${warnings({missing:state.menuCosts[m.id].flatMap(c=>c.missing)})}<p>${e(m.diners)} comensales · ${m.days.length} días. Cantidad a comprar incluye merma cuando está confirmada.</p><div class="rec-ing-scroll"><table class="tabla"><thead><tr><th>Ingrediente</th><th>Aprovechable</th><th>A comprar</th><th>Costo</th><th>Pendiente</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${e(r.name)}</td><td>${e(r.quantity)} ${e(r.unit)}</td><td>${r.buyQuantity==null?'Pendiente':e(r.buyQuantity)+' '+e(r.unit)}</td><td>${money(r.amount)}</td><td>${r.missing.map(e).join('; ')}</td></tr>`).join('')}</tbody></table></div>${button('shoppingCSV','Descargar lista CSV')}`);},
    shoppingCSV:()=>{const rows=shoppingList(currentMenu(),state);download(csv([['Advertencias del menú',state.menuCosts[currentMenu().id].flatMap(c=>c.missing).map(m=>m.name+': '+m.reason).join('; ')],['Ingrediente','Unidad','Aprovechable','A comprar','Costo','Pendiente'],...rows.map(r=>[r.name,r.unit,r.quantity,r.buyQuantity ?? 'Pendiente',r.amount ?? 'No verificable',r.missing.join('; ')])]),'forx-compras.csv','text/csv');},
    printMenu:()=>exportMenu('print'),imprimirMenu:()=>exportMenu('print'),excel:()=>exportMenu('excel'),exportExcel:()=>exportMenu('excel'),
    book:()=>download(printRecipes(state.recipes.filter(r=>r.status!=='archived'),state,currentMenu()?.diners || 1),'forx-recetas.html','text/html'),
    printRecipe:()=>{const r=state.recipes.find(r=>r.id===ui.draft?.id);if(r)download(printRecipes([r],state,currentMenu()?.diners || 1),'forx-receta.html','text/html');},
    exportarTxt:()=>download(recipesText(state.recipes.filter(r=>r.status!=='archived')),'forx-recetas.txt','text/plain'),
    backup:()=>download(JSON.stringify({schema:2,exportedAt:new Date().toISOString(),recipes:state.recipes,menus:state.menus,settings:state.settings},null,2),'forx-respaldo-recetas.json','application/json'),
    descargarRespaldo:()=>actions.backup(),reporteFaltantes:missingReport,limpiezaGuiada:missingReport,clasificarProteina:()=>modal('Revisar proteínas',state.recipes.filter(r=>TYPES.find(t=>t.id===r.type)?.main).map(r=>`<p>${e(r.name)} · ${e(r.protein || 'Sin clasificar')} ${button('edit','Editar',`data-id="${r.id}"`)}</p>`).join('') || '<p>No hay platos fuertes.</p>'),
    recalcularCostos:async()=>{await refresh();notify('Costos recalculados con el catálogo vigente.');},
    exportarPrecios:()=>download(csv([['Ingrediente','Unidad','Precio vigente','Proveedor','SKU de origen','Producto','Fecha de compra','Observación'],...state.catalog.map(i=>{const s=state.priceSources?.[i.id];return [i.canonicalName,i.baseUnit,i.currentPrice?.normalizedPrice ?? 'Sin precio validado',s?.supplierName || '',s?s.supplierSku || 'Sin SKU en XML':'',s?.productName || '',i.currentPrice?.observedAt || '',i.currentPrice?.id || ''];})]),'forx-precios.csv','text/csv'),
    alternarTema:toggleTheme,
    logout:()=>{if(confirm('¿Cerrar sesión de FORX? Se descartarán las ediciones que no hayas guardado.'))return service.session.signOut();},
    addContract:()=>{ui.settingsDraft=readConfig();ui.settingsDraft.contractLines.push({id:crypto.randomUUID(),name:'',price:'',active:true});renderConfig();},removeContract:node=>node.closest('[data-contract]').remove(),
    addComplement:()=>$('#config-complements').insertAdjacentHTML('beforeend',lineMarkup({name:'',quantity:'',unit:'g'},$$('#config-complements [data-line]').length,'complements')),
    addFixed:()=>{$('#config-complements').insertAdjacentHTML('beforeend',`<div class="config-row" data-fixed="${crypto.randomUUID()}"><input class="fi" data-name aria-label="Nombre costo fijo"><input class="fi" data-cost type="number" step="any" aria-label="Importe costo fijo">${button('removeFixed','Retirar')}</div>`);},removeFixed:node=>node.closest('[data-fixed]').remove(),
    verMenuAlacarta:()=>download(printGrillMenu(state.recipes.filter(r=>r.type==='grill'&&r.status==='active'),state),'forx-grill.html','text/html')
  };
  root.addEventListener('click',event=>{if(!readOnly&&event.target.closest('#config-form'))ui.settingsDirty=true;const node=event.target.closest('[data-action],[data-click]');if(!node||node.disabled)return;event.preventDefault();const key=node.dataset.action || node.dataset.click;if(readOnly&&editActions.has(key))return;if(actions[key])run(()=>actions[key](node));});
  root.addEventListener('input',event=>{if(!readOnly&&event.target.closest('#config-form'))ui.settingsDirty=true;if(event.target.id==='catbuscar')renderCatalog();if(event.target.id==='acbuscar')renderGrill();if(event.target.name==='q-precios')renderPrices();applyReadOnly();});
  $('#saved-menus').addEventListener('change',event=>{ui.menuId=event.target.value;renderMenu();applyReadOnly();});
  $('#lineaMenu').addEventListener('change',()=>{if(readOnly)return;run(async()=>{const m=currentMenu();if(m){await service.saveMenu({...m,days:m.days.map(d=>({...d,contractLineId:$('#lineaMenu').value})),expectedRevision:m._revision});await refresh();}});});
  $('#comensalesDia').addEventListener('change',()=>{if(readOnly)return;run(async()=>{const m=currentMenu();if(m){await service.saveMenu({...m,diners:$('#comensalesDia').value,expectedRevision:m._revision});await refresh();}});});
  $('dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
  const beforeUnload=event=>{if(!readOnly&&(ui.draft||ui.settingsDirty||generator.isDirty())){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  render();return()=>{disposed=true;legacyPreview.dispose();generator.dispose();clearTimeout(timer);window.removeEventListener('beforeunload',beforeUnload);};
}
