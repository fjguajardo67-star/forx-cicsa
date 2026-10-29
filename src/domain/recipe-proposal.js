import { TYPES, UNIT, required, number, validateRecipe, norm } from './recipes.js';

export const RECIPE_PROMPT_VERSION = 'forx-recipe-1';
export const GENERATION_COLLECTIONS = ['generation_requests', 'generation_quotas'];
export const SIMULATION_NOTICE = 'Ejemplo fijo simulado, no generado por OpenAI. No interpreta tu idea ni tus restricciones. Requiere revisión culinaria; no tiene precios ni vínculos aprobados.';
export function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) throw new Error(`${label}: estructura no permitida.`);
}
function boundedText(value, label, max, empty=false) {
  if (empty && value==='') return '';
  return required(value,label,max);
}
export function validateGenerationInput(input) {
  exactKeys(input,['requestId','idea','type','protein','baseServings','restrictions','preferredIngredientIds'],'Solicitud');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId || '')) throw new Error('Identidad de solicitud inválida.');
  if (!TYPES.some(t=>t.id===input.type)) throw new Error('Selecciona el tipo de receta.');
  const ids=input.preferredIngredientIds ?? [];
  if (!Array.isArray(ids) || ids.length>20 || new Set(ids).size!==ids.length || ids.some(id=>typeof id!=='string'||!id||id.length>200||id.includes('/'))) throw new Error('Selecciona hasta 20 ingredientes distintos.');
  return {requestId:input.requestId,idea:required(input.idea,'Idea del platillo',180),type:input.type,
    protein:boundedText(input.protein ?? '','Proteína',100,true),baseServings:number(input.baseServings,'Porciones base',{max:1000}),
    restrictions:boundedText(input.restrictions ?? '','Restricciones',1200,true),preferredIngredientIds:[...ids].sort()};
}
const stringSchema={type:'string'};
export const RECIPE_PROPOSAL_SCHEMA = {
  type:'object',additionalProperties:false,
  properties:{name:stringSchema,type:{type:'string',enum:TYPES.map(t=>t.id)},region:stringSchema,protein:stringSchema,
    baseServings:{type:'number'},minutes:{type:'number'},
    lines:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:stringSchema,quantity:{type:'number'},unit:{type:'string',enum:Object.keys(UNIT)}},required:['name','quantity','unit']}},
    steps:{type:'array',items:stringSchema},adaptations:{type:'array',items:stringSchema},warnings:{type:'array',items:stringSchema}},
  required:['name','type','region','protein','baseServings','minutes','lines','steps','adaptations','warnings']
};
export function validateProposal(value, input) {
  if (JSON.stringify(value)?.length>64000) throw new Error('La propuesta supera el tamaño permitido.');
  exactKeys(value,RECIPE_PROPOSAL_SCHEMA.required,'Propuesta');
  if (RECIPE_PROPOSAL_SCHEMA.required.some(k=>!Object.hasOwn(value,k))) throw new Error('La propuesta está incompleta.');
  if (value.type!==input.type || typeof value.baseServings!=='number' || number(value.baseServings,'Porciones',{max:1000})!==input.baseServings) throw new Error('La propuesta cambió el tipo o las porciones solicitadas.');
  if (typeof value.minutes!=='number') throw new Error('Tiempo de la propuesta inválido.');
  boundedText(value.region,'Región',100,true);boundedText(value.protein,'Proteína',100,true);
  if (!Array.isArray(value.lines)||!value.lines.length||value.lines.length>60) throw new Error('La propuesta necesita entre 1 y 60 ingredientes.');
  for (const line of value.lines) {
    exactKeys(line,['name','quantity','unit'],'Ingrediente propuesto');
    if (typeof line.quantity!=='number' || !Object.hasOwn(UNIT,line.unit)) throw new Error('Cantidad o unidad propuesta inválida.');
  }
  for (const key of ['steps','adaptations','warnings']) {
    if (!Array.isArray(value[key]) || value[key].length>30 || (key==='steps'&&!value[key].length)) throw new Error('Procedimiento o advertencias incompletos.');
    value[key].forEach(text=>required(text,key,1200));
  }
  const recipe=validateRecipe({...value,status:'draft',lines:value.lines.map(l=>({...l,ingredientId:null,yieldFactor:'1',gramsPerPiece:null,conversionNote:''})),instructions:value.steps.map((s,i)=>`${i+1}. ${s.trim()}`).join('\n'),
    notes:[...value.adaptations,...value.warnings].join('\n'),disposables:[],salePrice:null,productionCost:'0'});
  return {recipe,adaptations:[...value.adaptations],warnings:[...value.warnings]};
}
export function ingredientSuggestions(recipe, catalog) {
  return recipe.lines.map(line=>({lineId:line.id,candidates:catalog.filter(i=>i.status==='active'&&[i.canonicalName,...(i.aliases || [])].some(name=>norm(name)===norm(line.name)))
    .slice(0,10).map(i=>({id:i.id,name:i.canonicalName,unit:i.baseUnit,priced:!!i.currentPrice}))}));
}
