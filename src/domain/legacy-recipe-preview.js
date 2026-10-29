import { norm, UNIT } from './recipes.js';

export const LEGACY_BACKUP_MAX_BYTES = 10 * 1024 * 1024;
const MAX_RECIPES = 5000;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const list = v => Array.isArray(v) ? v : [];
const comparable = v => text(v).trim();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const add = (row,code,message) => row.issues.push({code,message});

function linePreview(input) {
  const i = object(input) ? input : {};
  // Whitelist only culinary evidence. No prices, IDs or inferred links enter here.
  return { name:text(i.nombre), quantity:text(i.cantidad), unit:text(i.unidad) };
}

function recipePreview(input,index,collection,source,deleted,omitted,existing) {
  const r = object(input) ? input : {};
  const row = { key:`${source}-${collection}-${index}`, collection, source,
    originalId:text(r.id), name:text(r.nombre), type:collection==='grill' ? 'grill' : text(r.tipo),
    region:text(r.region), protein:text(r.carnico), minutes:text(r.tiempo), date:text(r.fecha),
    originalServings:text(r.paxO), destinationServings:text(r.paxD),
    status:collection==='grill' ? text(r.estado) : 'activo', category:text(r.categoria),
    notes:text(r.notas), instructions:list(r.procedimiento).map(text),
    lines:list(r.ingredientes).map(linePreview), disposables:list(r.desechables).map(linePreview),
    omitted:omitted.has(norm(text(r.nombre))), deleted:deleted.has(norm(text(r.nombre))), issues:[] };
  if (!object(input)) add(row,'invalid_record','Registro de receta inválido; conservar el original para aclararlo.');
  if (!row.name.trim() || row.name.length>180) add(row,'name','Nombre ausente o demasiado largo.');
  if (!['guisado','garnacha','guarnicion','postre','agua','grill'].includes(row.type)) add(row,'type','Tipo de receta sin correspondencia confirmada.');
  if (!row.lines.length || row.lines.length>200) add(row,'lines','Revisar la lista de ingredientes: vacía o mayor a 200 renglones.');
  if (r.desechables != null && !Array.isArray(r.desechables)) add(row,'disposables','Lista de desechables inválida.');
  if (row.disposables.length>50) add(row,'disposables','Más de 50 desechables; revisar antes de recuperar.');
  for (const [kind,lines] of [['Ingrediente',row.lines],['Desechable',row.disposables]]) lines.forEach((line,i)=>{
    if (!line.name.trim() || line.name.length>180) add(row,'line_name',`${kind} ${i+1}: nombre ausente o demasiado largo.`);
    if (!line.quantity.trim() || !Number.isFinite(Number(line.quantity)) || Number(line.quantity)<=0 || Number(line.quantity)>1e9)
      add(row,'quantity',`${kind} ${i+1}: cantidad no válida; no se corregirá automáticamente.`);
    if (!Object.hasOwn(UNIT,line.unit)) add(row,'unit',`${kind} ${i+1} (${line.name || 'sin nombre'}): «${line.unit || 'sin unidad'}» necesita una equivalencia confirmada. No se inventarán gramos.`);
  });
  if (collection==='menu' && !row.instructions.some(s=>s.trim())) add(row,'procedure','Sin procedimiento capturado.');
  if (r.procedimiento != null && (!Array.isArray(r.procedimiento) || r.procedimiento.some(s=>typeof s!=='string')))
    add(row,'procedure_format','Procedimiento con formato irregular; revisar el original.');
  if (row.lines.length>=6 && new Set(row.lines.map(l=>`${l.quantity}|${l.unit}`)).size===1)
    add(row,'uniform_quantities','Todos los ingredientes tienen la misma cantidad y unidad. Puede ser un error de captura; revisar la receta original.');
  if (collection==='grill' && !['activo','borrador','archivado'].includes(row.status)) add(row,'status','Estado de Grill Express sin correspondencia confirmada.');
  if (row.deleted) add(row,'deleted','Tiene una marca de eliminación. No debe reactivarse automáticamente.');
  const matches = existing.get(norm(row.name)) || [];
  if (matches.length) add(row,'existing',`Ya existe en el catálogo actual: ${matches.join(', ')}. No se reemplazará.`);
  return row;
}

function sourcePreview(value,source,existing) {
  if (!object(value) || !Array.isArray(value.recetas) || !Array.isArray(value.alacarta))
    throw new Error(`La copia ${source==='local'?'local':'de nube'} debe contener las listas recetas y alacarta.`);
  if (value.recetas.length+value.alacarta.length>MAX_RECIPES) throw new Error('El respaldo supera 5,000 recetas por copia. Divídelo antes de revisarlo.');
  for (const field of ['borradas','omitidas']) if (value[field]!=null && (!Array.isArray(value[field]) || value[field].some(s=>typeof s!=='string')))
    throw new Error(`La lista ${field} de la copia ${source} no es válida.`);
  if (value.config!=null && !object(value.config)) throw new Error(`La configuración de la copia ${source} no es válida.`);
  const deleted=list(value.borradas), omitted=list(value.omitidas);
  const deletedNames=new Set(deleted.map(norm)),omittedNames=new Set(omitted.map(norm));
  const rows=[...value.recetas.map((r,i)=>recipePreview(r,i,'menu',source,deletedNames,omittedNames,existing)),
    ...value.alacarta.map((r,i)=>recipePreview(r,i,'grill',source,deletedNames,omittedNames,existing))];
  for (const [field,code,label] of [['name','duplicate_name','Nombre repetido'],['originalId','duplicate_id','Identificador antiguo compartido']]) {
    const groups=new Map();
    for (const row of rows) {const key=field==='name'?norm(row[field]):comparable(row[field]);if(key)groups.set(key,[...(groups.get(key)||[]),row]);}
    for (const group of groups.values()) if (group.length>1) for(const row of group)
      add(row,code,`${label}: ${group.map(r=>r.name || 'Sin nombre').join(' / ')}. Se conservarán ambos registros en esta revisión.`);
  }
  const configFields=object(value.config)?Object.keys(value.config).filter(k=>['lineas','linea_menu','costo_produccion','complementos','porciones_platillo','rendimientos','margen_objetivo'].includes(k)):[];
  return { rows, deleted, omitted, hasConfig:object(value.config), configFields,
    summary:{ menu:value.recetas.length, grill:value.alacarta.length, total:rows.length,
      review:rows.filter(r=>r.issues.length).length, omitted:rows.filter(r=>r.omitted).length,
      deleted:rows.filter(r=>r.deleted).length, procedures:rows.filter(r=>r.instructions.some(s=>s.trim())).length } };
}

/** Pure, read-only adapter. Returned data is a preview, never a saveRecipe payload. */
export function previewLegacyBackup(json,{existingRecipes=[]}={}) {
  if (typeof json!=='string' || new TextEncoder().encode(json).length>LEGACY_BACKUP_MAX_BYTES)
    throw new Error('Selecciona un respaldo JSON de hasta 10 MB.');
  let input;
  try { input=JSON.parse(json.replace(/^\uFEFF/,'')); } catch { throw new Error('El archivo no es JSON válido. Selecciona el respaldo original de FORX.'); }
  if (!object(input) || (!object(input.local) && !object(input.nube)))
    throw new Error('Este no es un respaldo anterior de FORX con copia local o de nube. No uses aquí el respaldo completo de MiDespensa v2.');
  const existing=new Map();
  for (const recipe of existingRecipes) {const key=norm(recipe.name);if(key)existing.set(key,[...(existing.get(key)||[]),`${recipe.code || recipe.name}${recipe.status==='archived'?' (archivada)':''}`]);}
  const sources={};
  for (const key of ['local','nube']) if (input[key]!=null) sources[key]=sourcePreview(input[key],key,existing);
  const comparisons=[];
  if (sources.local && sources.nube) {
    // Compare projected culinary content, not embedded historic prices or sessions.
    const cleanRow = ({key,source,issues,...row})=>row;
    const clean = (s,collection) => s.rows.filter(r=>r.collection===collection).map(cleanRow);
    for (const [label,a,b] of [
      ['Recetas',clean(sources.local,'menu'),clean(sources.nube,'menu')],
      ['Grill Express',clean(sources.local,'grill'),clean(sources.nube,'grill')],
      ['Omisiones',sources.local.omitted,sources.nube.omitted],['Eliminaciones',sources.local.deleted,sources.nube.deleted]
    ]) comparisons.push({label,equal:same(a,b)});
    for(const [key,otherKey] of [['local','nube'],['nube','local']]) {
      const otherRows=new Map();
      for(const row of sources[otherKey].rows) {const name=`${row.collection}:${norm(row.name)}`;otherRows.set(name,[...(otherRows.get(name)||[]),row]);}
      for(const row of sources[key].rows) {
        const candidates=otherRows.get(`${row.collection}:${norm(row.name)}`)||[];
        if(!candidates.some(other=>same(cleanRow(row),cleanRow(other))))
          add(row,'copy_difference',candidates.length?'El contenido difiere entre la copia local y la de nube. Consulta ambas; no se elige una automáticamente.':'Este nombre solo aparece en esta copia del respaldo. No se fusionará automáticamente.');
      }
      sources[key].summary.review=sources[key].rows.filter(r=>r.issues.length).length;
    }
  }
  return { generatedAt:text(input._generado), sources, comparisons, defaultSource:sources.local?'local':'nube' };
}
