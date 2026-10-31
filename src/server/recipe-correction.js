import { backupDigest } from '../domain/backup.js';
import { KitchenService } from '../domain/kitchen-service.js';
import { nameKey, validateRecipe } from '../domain/recipes.js';

export const RECIPE_CORRECTION_FORMAT='forx-recipe-correction-plan';
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max=500)=>typeof value==='string'&&value.trim()&&value.length<=max;
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);

export async function recipeCorrectionDigest(plan) {
  const {digest:_digest,...payload}=plan;
  return backupDigest(payload);
}

export async function inspectRecipeCorrectionPlan(plan,{config,jobName}={}) {
  if(!plan||plan.format!==RECIPE_CORRECTION_FORMAT||plan.version!==1||!hex(plan.digest)
    ||await recipeCorrectionDigest(plan)!==plan.digest)throw new Error('Plan de corrección inválido o alterado.');
  if(!plan.target||plan.target.projectId!==config?.projectId||plan.target.databaseId!==config?.databaseId)
    throw new Error('El plan pertenece a otro destino.');
  if(!text(plan.jobName,100)||plan.jobName!==jobName)throw new Error('El trabajo no coincide con el plan aprobado.');
  if(!text(plan.approvedBy,200)||!text(plan.reason,1000)||!Number.isSafeInteger(plan.expectedVisibleRecipes)
    ||plan.expectedVisibleRecipes<0||!hex(plan.beforeBackupChecksum))throw new Error('Falta la aprobación o el estado esperado.');
  if(!Array.isArray(plan.archive)||!Array.isArray(plan.create)||plan.archive.length>20||plan.create.length>20
    ||!plan.archive.length&&!plan.create.length)throw new Error('Alcance de corrección inválido.');
  const ids=new Set(),names=new Set();
  for(const item of plan.archive){
    if(!text(item.id,200)||item.id.includes('/')||!text(item.expectedName,180)||!text(item.expectedCode,30)
      ||!Number.isSafeInteger(item.expectedRevision)||item.expectedRevision<1||item.expectedStatus!=='active'||ids.has(item.id))
      throw new Error('Objetivo de archivo inválido.');
    ids.add(item.id);
  }
  const recipes=[];
  for(const input of plan.create){
    if(!Array.isArray(input?.lines)||!Array.isArray(input?.disposables)
      ||[...input.lines,...input.disposables].some(line=>!text(line?.id,200)||line.id.includes('/')))
      throw new Error('Cada renglón recuperado necesita una identidad estable.');
    const recipe=validateRecipe(input);
    if(recipe.status!=='draft'||recipe.salePrice!==null||recipe.productionCost!=='0'
      ||[...recipe.lines,...recipe.disposables].some(line=>line.ingredientId||line.gramsPerPiece||line.yieldFactor!=='1'))
      throw new Error('Una receta recuperada introduce un vínculo, precio o equivalencia no confirmada.');
    const key=nameKey(recipe.name);if(names.has(key))throw new Error('Nombre repetido en el plan.');names.add(key);recipes.push(recipe);
  }
  return {...plan,create:recipes};
}

export async function applyRecipeCorrection(runtime,plan,{confirmDigest,jobName=process.env.CLOUD_RUN_JOB}={}) {
  const checked=await inspectRecipeCorrectionPlan(plan,{config:runtime.config,jobName});
  if(confirmDigest!==checked.digest)throw new Error('Falta confirmar la huella exacta del plan.');
  await runtime.assertReady();
  const actor={uid:`recipe-correction:${checked.digest.slice(0,16)}`,name:checked.approvedBy,role:'admin'};
  const kitchen=new KitchenService(runtime.repository,{actor});
  const initial=await runtime.repository.list('recipes'),byId=new Map(initial.map(recipe=>[recipe.id,recipe]));
  const byName=new Map(initial.map(recipe=>[nameKey(recipe.name),recipe]));
  const archivePending=[],createPending=[],receipts=[];
  for(const target of checked.archive){
    const current=byId.get(target.id);
    if(!current||current.name!==target.expectedName||current.code!==target.expectedCode)throw new Error('Cambió la identidad de una receta que se iba a archivar.');
    if(current.status==='archived'&&current._revision===target.expectedRevision+1){receipts.push({action:'already-archived',id:current.id,code:current.code,name:current.name});continue;}
    if(current.status!==target.expectedStatus||current._revision!==target.expectedRevision)throw new Error('Una receta que se iba a archivar cambió; no se aplicó el plan.');
    archivePending.push(current);
  }
  for(const recipe of checked.create){
    const current=byName.get(nameKey(recipe.name));
    if(current){
      if(canonical(validateRecipe(current))!==canonical(recipe))throw new Error('Ya existe una receta diferente con el nombre que se iba a recuperar.');
      receipts.push({action:'already-created',id:current.id,code:current.code,name:current.name});continue;
    }
    createPending.push(recipe);
  }
  const initialVisible=initial.filter(recipe=>recipe.status!=='archived').length;
  const expectedInitial=checked.expectedVisibleRecipes-createPending.length+archivePending.length;
  if(initialVisible!==expectedInitial)throw new Error('Cambió la cantidad visible de recetas; se requiere un plan nuevo.');
  // Create first so an interrupted run never lowers the visible catalog count.
  for(const recipe of createPending){
    const saved=await kitchen.saveRecipe({...recipe,source:'manual'});
    receipts.push({action:'created',id:saved.id,code:saved.code,name:saved.name});
  }
  for(const recipe of archivePending){
    const saved=await kitchen.saveRecipe({...recipe,status:'archived',expectedRevision:recipe._revision});
    receipts.push({action:'archived',id:saved.id,code:saved.code,name:saved.name});
  }
  const final=await runtime.repository.list('recipes'),finalByName=new Map(final.map(recipe=>[nameKey(recipe.name),recipe]));
  for(const recipe of checked.create){
    const saved=finalByName.get(nameKey(recipe.name));
    if(!saved||canonical(validateRecipe(saved))!==canonical(recipe))throw new Error('La receta recuperada no coincide con el plan.');
  }
  for(const target of checked.archive)if(byId.has(target.id)&&!final.find(recipe=>recipe.id===target.id&&recipe.status==='archived'))
    throw new Error('Una receta de prueba sigue visible.');
  const visible=final.filter(recipe=>recipe.status!=='archived').length;
  if(visible!==checked.expectedVisibleRecipes)throw new Error('La cantidad final visible no coincide con el plan.');
  return {digest:checked.digest,beforeBackupChecksum:checked.beforeBackupChecksum,visibleRecipes:visible,
    totalRecipeRecords:final.length,created:receipts.filter(r=>r.action==='created').length,
    archived:receipts.filter(r=>r.action==='archived').length,receipts};
}
