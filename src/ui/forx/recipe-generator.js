import { TYPES } from '../../domain/recipes.js';
import { escapeHtml as e } from '../../domain/kitchen-exports.js';
import { SIMULATION_NOTICE } from '../../domain/recipe-proposal.js';

export function mountRecipeGenerator(root,service,getState,openEditor) {
  let pending=false,disposed=false,dirty=false,requestId=null,result=null;
  const $=selector=>root.querySelector(selector);
  root.innerHTML=`<h1 class="ch">Generar receta</h1>
    <p id="generator-mode" class="notice"></p>
    <form id="generator-form">
      <fieldset class="generator-fields"><legend class="legacy-sr-only">Solicitud de propuesta</legend>
        <label class="fg"><span class="fl2">Idea o nombre del platillo</span><input class="fi" name="idea" maxlength="180" required placeholder="Ej. pollo con verduras"></label>
        <div class="form-grid"><label class="fg"><span class="fl2">Tipo de propuesta</span><select class="fs" name="type">${TYPES.map(t=>`<option value="${t.id}">${e(t.label)}</option>`).join('')}</select></label>
          <label class="fg"><span class="fl2">Porciones base de la propuesta</span><input class="fi" name="baseServings" type="number" min="1" max="1000" step="1" value="10" required></label>
          <label class="fg"><span class="fl2">Proteína preferida (opcional)</span><input class="fi" name="protein" maxlength="100"></label></div>
        <label class="fg"><span class="fl2">Restricciones culinarias (opcional)</span><textarea class="ft generator-restrictions" name="restrictions" maxlength="1200" placeholder="Indica restricciones que la persona deberá revisar."></textarea></label>
        <details class="generator-preferences"><summary>Ingredientes preferidos de MiDespensa (opcional)</summary>
          <p class="status-line">Selecciona hasta 20. Son preferencias, no existencias ni vínculos aprobados. Usa Ctrl/Cmd para seleccionar varios.</p>
          <label class="fg"><span class="fl2">Ingredientes preferidos</span><select class="fs" name="preferredIngredientIds" multiple size="4"></select></label></details>
        <p class="status-line" id="generator-privacy"></p>
        <button class="btn bgold" type="submit" id="generate-proposal">Generar propuesta simulada</button>
      </fieldset>
    </form>
    <div class="row-actions"><button class="btn bsec" type="button" id="proposal-status" hidden>Consultar estado sin generar otra</button><button class="btn bsec" type="button" id="new-proposal" hidden>Nueva solicitud</button></div>
    <p id="generator-progress" role="status" aria-live="polite"></p><p id="generator-error" class="error-message" role="alert"></p>
    <section id="proposal-result" class="proposal-result" aria-labelledby="proposal-title" hidden></section>`;
  function refresh() {
    const {catalog,generation}=getState();
    const mode=generation?.mode;
    $('#generator-mode').textContent=mode==='openai' ? `Generación con OpenAI. La propuesta requiere revisión humana y se guardará primero como borrador. Límites: ${generation.limits.userDaily} solicitudes por usuario/día y ${generation.limits.projectMonthly} por mes del entorno.`
      : mode==='simulated' ? `Simulado, sin consumo. ${SIMULATION_NOTICE} Límite de prueba: ${generation.limits.userDaily} solicitudes por usuario/día y ${generation.limits.projectMonthly} por mes del entorno.`
        : 'Generación desactivada en esta instancia. No se enviarán solicitudes ni habrá consumo de OpenAI.';
    $('#generator-privacy').textContent=mode==='openai'
      ? 'La idea, restricciones y nombres/unidades de hasta 20 ingredientes preferidos se enviarán a OpenAI. FORX retira el texto intermedio a los 30 días y no lo incluye en respaldos nuevos; las recetas guardadas permanecen. No incluyas datos personales, claves ni facturas. FORX no envía precios, SKU ni el catálogo completo.'
      : 'En el simulador nada se envía a OpenAI. FORX retira el texto intermedio a los 30 días; las recetas guardadas permanecen. No incluyas datos personales, claves ni facturas.';
    $('#generate-proposal').textContent=mode==='openai'?'Generar propuesta con OpenAI':'Generar propuesta simulada';
    const selected=[...$('[name="preferredIngredientIds"]').selectedOptions].map(o=>o.value);
    $('[name="preferredIngredientIds"]').innerHTML=catalog.filter(i=>i.status==='active').map(i=>`<option value="${e(i.id)}" ${selected.includes(i.id)?'selected':''}>${e(i.canonicalName)} · ${e(i.baseUnit)}${i.currentPrice?'':' · sin precio'}</option>`).join('');
    setBusy(pending);
  }
  function setBusy(value) {
    pending=value;root.setAttribute('aria-busy',String(value));
    $('.generator-fields').disabled=value || !!requestId || !getState().generation?.enabled;
    $('#generate-proposal').disabled=value || !!requestId;
    $('#proposal-status').disabled=value;$('#new-proposal').disabled=value;
  }
  function showResult(reply) {
    result=reply;$('#proposal-status').hidden=false;$('#new-proposal').hidden=false;
    $('#generator-error').textContent=reply.error || '';
    $('#generator-progress').textContent=reply.status==='pending'?'Solicitud en curso. Puedes consultar su estado sin repetirla.':reply.status==='completed'?'Propuesta disponible. No se guardó ninguna receta automáticamente.':'';
    const panel=$('#proposal-result');panel.hidden=reply.status!=='completed';
    if(panel.hidden)return;
    const {recipe,adaptations,warnings}=reply.proposal;
    panel.innerHTML=`<h2 id="proposal-title" tabindex="-1">${e(recipe.name)}</h2><p>${e(TYPES.find(t=>t.id===recipe.type)?.label)} · ${e(recipe.baseServings)} porciones base · ${e(recipe.minutes)} min orientativos</p>
      <p class="notice">${reply.mode==='openai'?'Propuesta generada con OpenAI':'Propuesta simulada'} · costo del platillo no verificable. Revisa cantidades, procedimiento y restricciones antes de guardarla como borrador.</p>
      <ul class="proposal-warnings">${[...adaptations,...warnings].map(w=>`<li>${e(w)}</li>`).join('')}</ul>
      <div class="rec-ing-scroll"><table class="tabla proposal-table"><thead><tr><th>Ingrediente propuesto</th><th>Cantidad</th><th>Referencia MiDespensa — sin vínculo automático</th></tr></thead><tbody>${recipe.lines.map(line=>{
        const matches=reply.suggestions?.find(s=>s.lineId===line.id)?.candidates || [];
        return `<tr><td>${e(line.name)}</td><td>${e(line.quantity)} ${e(line.unit)}</td><td>${matches.length?matches.map(i=>`Coincidencia sugerida: ${e(i.name)} (${e(i.unit)}) · ${i.priced?'precio disponible, pendiente de vínculo':'sin precio validado'}`).join('<br>'):'Sin coincidencia exacta · pendiente de vincular'}</td></tr>`;
      }).join('')}</tbody></table></div>
      <h3>Procedimiento propuesto</h3><p class="proposal-steps">${e(recipe.instructions)}</p>
      ${reply.recipeId?'<p role="status">Esta propuesta ya fue guardada. Puedes editarla desde el catálogo.</p>':'<button class="btn bgold" type="button" id="review-proposal">Revisar en editor</button>'}`;
    $('#review-proposal')?.addEventListener('click',()=>openEditor({...recipe,generationRequestId:reply.generationRequestId}));
    $('#proposal-title').focus();
  }
  $('#generator-form').addEventListener('submit',async event=>{
    event.preventDefault();if(pending||requestId||!getState().generation?.enabled)return;
    const data=new FormData(event.currentTarget);
    requestId=crypto.randomUUID();dirty=true;
    const input={requestId,idea:data.get('idea'),type:data.get('type'),baseServings:data.get('baseServings'),protein:data.get('protein'),restrictions:data.get('restrictions'),preferredIngredientIds:data.getAll('preferredIngredientIds')};
    $('#generator-error').textContent='';$('#generator-progress').textContent=getState().generation?.mode==='openai'?'Preparando propuesta con OpenAI…':'Preparando propuesta simulada…';
    $('#proposal-status').hidden=false;$('#new-proposal').hidden=false;setBusy(true);
    try{const reply=await service.generateRecipeProposal(input);if(!disposed)showResult(reply);}
    catch(error){if(!disposed){$('#generator-progress').textContent='';$('#generator-error').textContent=`${error.message} Los campos se conservaron. Consulta el estado antes de iniciar otra solicitud.`;}}
    finally{if(!disposed)setBusy(false);}
  });
  $('#proposal-status').addEventListener('click',async()=>{
    if(pending||!requestId)return;setBusy(true);$('#generator-error').textContent='';
    try{const reply=await service.recipeProposalStatus({requestId});if(!disposed)showResult(reply);}
    catch(error){if(!disposed)$('#generator-error').textContent=error.message;}
    finally{if(!disposed)setBusy(false);}
  });
  $('#new-proposal').addEventListener('click',()=>{
    if(pending)return;
    if(dirty && result?.status==='completed'&&!confirm('¿Dejar esta propuesta sin guardar e iniciar otra solicitud?'))return;
    requestId=null;result=null;$('#proposal-result').hidden=true;$('#proposal-result').replaceChildren();
    $('#generator-error').textContent='';$('#generator-progress').textContent='Puedes ajustar los campos antes de solicitar otro ejemplo.';
    $('#proposal-status').hidden=true;$('#new-proposal').hidden=true;setBusy(false);$('[name="idea"]').focus();
  });
  $('#generator-form').addEventListener('input',()=>{dirty=true;});
  refresh();
  return {refresh,isDirty:()=>dirty||pending,canLeave:()=>!(dirty||pending)||confirm('¿Salir del generador? La captura sin guardar se perderá al cerrar el módulo. Salir no cancela una solicitud ya iniciada.'),
    saved(id){if(result?.generationRequestId===id){dirty=false;result.recipeId='saved';showResult(result);}},dispose(){disposed=true;}};
}
