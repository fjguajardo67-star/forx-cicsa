import { previewLegacyBackup } from './legacy-recipe-preview.js';
import { norm, validateRecipe } from './recipes.js';
import { costRecipe, costMenuDay } from './costing.js';
import { generateDays, restrictedDay } from './menus.js';

const blockingIssues = new Set(['invalid_record','name','type','lines','disposables','line_name','quantity','unit','procedure_format','status']);
const clone = value => JSON.parse(JSON.stringify(value));
function culinaryKey(row) {
  const lines=values=>values.map(l=>({name:norm(l.name),quantity:l.quantity,unit:l.unit}));
  return JSON.stringify({name:norm(row.name),type:row.type,region:norm(row.region),protein:norm(row.protein),
    minutes:row.minutes,lines:lines(row.lines),disposables:lines(row.disposables),
    instructions:row.instructions.map(norm),notes:norm(row.notes),status:row.status,omitted:row.omitted,deleted:row.deleted});
}

/** Plan only. Uses the same validator as manual capture; never drops a bad line. */
export function planLegacyRecipeImport(json,{existingRecipes=[],source,sourceHash}={}) {
  if(!/^[a-f0-9]{64}$/.test(sourceHash||''))throw new Error('Falta la huella SHA-256 del respaldo original.');
  const preview=previewLegacyBackup(json,{existingRecipes});
  if(!source && preview.comparisons.some(c=>!c.equal))throw new Error('Las copias difieren: hay que elegir local o nube antes de importar.');
  source ||= preview.defaultSource;
  if(!Object.hasOwn(preview.sources,source))throw new Error('Copia del respaldo no disponible.');
  const rows=preview.sources[source].rows,existing=new Map(existingRecipes.map(r=>[norm(r.name),r]));
  const groups=new Map();
  for(const row of rows){const key=norm(row.name);groups.set(key,[...(groups.get(key)||[]),row]);}
  const entries=[];
  for(const row of rows){
    const entry={sourceKey:row.key,originalId:row.originalId,name:row.name,issues:clone(row.issues)};
    if(row.deleted){entries.push({...entry,status:'excluded',reason:'Marca de eliminación conservada; no se reactiva.'});continue;}
    if(existing.has(norm(row.name))){entries.push({...entry,status:'existing',recipeId:existing.get(norm(row.name)).id,reason:'Se conserva intacta la receta del catálogo actual.'});continue;}
    const group=groups.get(norm(row.name));
    if(group.length>1 && group.some(other=>culinaryKey(other)!==culinaryKey(row))){
      entries.push({...entry,status:'pending',reason:'Mismo nombre con contenido distinto; requiere decisión humana.'});continue;
    }
    if(group[0]!==row){entries.push({...entry,status:'duplicate',duplicateOf:group[0].key,reason:'Mismo contenido culinario; diferencias solo de identidad o escritura.'});continue;}
    if(row.issues.some(i=>blockingIssues.has(i.code))){entries.push({...entry,status:'pending',reason:'Cantidad, unidad o estructura pendiente; no se importan recetas con renglones descartados.'});continue;}
    const draft=row.status==='borrador'||row.issues.some(i=>['procedure','uniform_quantities'].includes(i.code));
    const history=[`Recuperación FORX — respaldo SHA-256 ${sourceHash}; copia ${source}.`,
      `Referencia anterior: ${row.originalId||'sin ID'}; fecha: ${row.date||'sin fecha'}; respaldo: ${preview.generatedAt||'sin fecha'}.`,
      `Cantidades conservadas por porción. Comensales originales: ${row.originalServings||'no indicados'}; destino anterior: ${row.destinationServings||'no indicado'}.`,
      'Sin precios heredados ni vínculos automáticos. Validar ingredientes y precios en MiDespensa.',
      row.type==='grill'?'Precio de venta no importado. Producción inicial 0: parámetro pendiente de confirmar, no tomado del respaldo.':'',
      ...group.slice(1).map(r=>`Duplicado equivalente conservado como referencia: ${r.name}; ID anterior ${r.originalId}.`),
      ...row.issues.filter(i=>!['duplicate_name','duplicate_id','existing','copy_difference'].includes(i.code)).map(i=>`Revisión: ${i.message}`),
      row.notes?`Notas originales: ${row.notes}`:''].filter(Boolean).join('\n');
    try {
      if(history.length>4000)throw new Error('Las notas y la procedencia exceden el límite; no se truncarán.');
      const mapLine=l=>({name:l.name,quantity:l.quantity,unit:l.unit,ingredientId:null,yieldFactor:'1',gramsPerPiece:null,conversionNote:''});
      const recipe=validateRecipe({name:row.name,type:row.type,baseServings:'1',region:row.region,protein:row.protein,
        minutes:row.minutes||'0',instructions:row.instructions.join('\n'),lines:row.lines.map(mapLine),
        disposables:row.disposables.map(mapLine),omitted:row.omitted,
        status:row.status==='archivado'?'archived':draft?'draft':'active',salePrice:null,productionCost:'0',notes:history});
      entries.push({...entry,status:'ready',recipe});
    }catch(error){entries.push({...entry,status:'pending',reason:error.message});}
  }
  return {format:'forx-legacy-import-plan',version:1,source,sourceHash,generatedAt:preview.generatedAt,
    entries,summary:{total:rows.length,ready:entries.filter(e=>e.status==='ready').length,
      pending:entries.filter(e=>e.status==='pending').length,duplicates:entries.filter(e=>e.status==='duplicate').length,
      existing:entries.filter(e=>e.status==='existing').length,excluded:entries.filter(e=>e.status==='excluded').length},
    policy:{prices:'excluded',links:'unlinked',quantities:'per_serving_unchanged',existingRecipes:'never_replace',settings:'never_import'}};
}

/** Scoped commands only. A failed/ambiguous save stops; reruns skip existing names. */
export async function applyLegacyRecipePlan(plan,{saveRecipe,onSaved=()=>{}}) {
  const results=[];
  for(const entry of plan.entries.filter(e=>e.status==='ready')){
    const payload=validateRecipe(entry.recipe);
    if(payload.salePrice!==null || payload.productionCost!=='0' || [...payload.lines,...payload.disposables].some(l=>l.ingredientId||l.gramsPerPiece||l.yieldFactor!=='1'))
      throw new Error('El plan intenta introducir precios, vínculos o equivalencias. Se detuvo la importación.');
    const saved=await saveRecipe(payload);
    const result={sourceKey:entry.sourceKey,originalId:entry.originalId,id:saved.id,code:saved.code,name:saved.name,status:saved.status,omitted:saved.omitted};
    results.push(result);await onSaved(result);
  }
  return results;
}

/** In-memory acceptance test: no menu is saved and no recipe is changed. */
export function checkRecoveredMenu(recipes,catalog,settings,{startDate='2026-10-05',count=14}={}) {
  const days=generateDays(recipes,{startDate,count,contractLineId:settings.defaultLineId},()=>0.314159);
  const violations=[];
  for(const day of days){
    const weekday=new Date(day.date).getUTCDay();
    for(const slot of day.slots){
      const recipe=recipes.find(r=>r.id===slot.recipeId);if(!recipe)continue;
      if(recipe.status!=='active'||recipe.omitted||recipe.type==='grill'||recipe.type!==slot.type)violations.push(`${day.date}: receta no elegible ${recipe.name}`);
      if(restrictedDay(recipe.name)!=null&&restrictedDay(recipe.name)!==weekday)violations.push(`${day.date}: día no permitido ${recipe.name}`);
    }
    const cost=costMenuDay(day,recipes,catalog,settings);
    if(cost.verified||cost.total!==null||cost.margin!==null)violations.push(`${day.date}: costo indebidamente verificado`);
  }
  const verifiedRecipes=recipes.filter(r=>costRecipe(r,catalog,settings).verified);
  if(verifiedRecipes.length)violations.push(`${verifiedRecipes.length} recetas recuperadas muestran costo verificado.`);
  return {startDate,days:days.length,slots:days.reduce((n,d)=>n+d.slots.length,0),violations,
    warnings:days.flatMap(d=>d.warnings.map(message=>({date:d.date,message}))),
    menu:days,verifiedRecipes:verifiedRecipes.length,stored:false};
}
