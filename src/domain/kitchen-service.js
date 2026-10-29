import { PantryService } from './pantry-service.js';
import { put, check, ConcurrentEditError } from '../data/entity-repository.js';
import { atomicWork } from '../data/unit-of-work.js';
import { TYPES, validateRecipe, validateLine, required, number, nameKey, parseRecipeBatch } from './recipes.js';
import { costRecipe, costMenuDay, recipeCap } from './costing.js';
import { generateDays, validDay, restrictedDay, MAIN_SLOTS, EXTRA_SLOTS, menuEligible, evaluateMenuRules } from './menus.js';
import { currentPriceSources, currentPriceEvidence } from './price-evidence.js';
import { RecipeGenerationService } from './recipe-generation.js';
import { generationTextIsDue } from './generation-text-retention.js';

export function defaultKitchenSettings() {
  return { id:'kitchen', confirmed:false, marginTarget:'15', productionCost:'20', dishPortions:'2',
    contractLines:[{id:'comida-completa',name:'Comida completa',price:'77',active:true},{id:'canje',name:'Canje',price:'32',active:true}],
    defaultLineId:'comida-completa',
    complements:[
      {id:'tortilla',name:'Tortilla',quantity:'10',unit:'pz',ingredientId:null,yieldFactor:'1',gramsPerPiece:null,conversionNote:''},
      {id:'arroz',name:'Arroz servido',quantity:'85',unit:'g',ingredientId:null,yieldFactor:'2.5',conversionNote:'COSTEO.md §4.5: factor conservador acordado; confirmar en configuración.'},
      {id:'frijol',name:'Frijol servido',quantity:'110',unit:'g',ingredientId:null,yieldFactor:'2.5',conversionNote:'COSTEO.md §4.5: factor conservador acordado; confirmar en configuración.'},
      {id:'refresco',name:'Refresco',quantity:'1',unit:'pz',ingredientId:null,yieldFactor:'1',conversionNote:''},
      {id:'postre',name:'Postre',fixedCost:'3'}
    ], identity:{ product:'FORX', company:'CICSA', fileSlug:'forx' } };
}
export class KitchenService {
  constructor(repository,{actor={uid:'local-developer',name:'Desarrollo local',role:'admin'},clock=()=>new Date().toISOString(),generationProvider=null,generationLimits,generationBudgetPolicy=null}={}) {
    this.repository=repository; this.actor=actor; this.clock=clock;
    this.generator=new RecipeGenerationService(repository,{actor,clock,provider:generationProvider,budgetPolicy:generationBudgetPolicy,...(generationLimits?{limits:generationLimits}:{})});
  }
  generateRecipeProposal(input) { return this.generator.generate(input); }
  recipeProposalStatus(input) { return this.generator.lookup(input); }
  authorize(admin=false) {
    if (!this.actor?.uid || !(admin ? ['admin']:['admin','editor']).includes(this.actor.role)) throw new Error('No tienes permiso para esta operación.');
  }
  stamp(value) { return {...value,updatedAt:this.clock(),updatedBy:this.actor.uid}; }
  audit(action,entityId,before=null) { return {id:`audit_${crypto.randomUUID()}`,action,entityId,actorUid:this.actor.uid,actorName:this.actor.name || this.actor.uid,occurredAt:this.clock(),reason:action,before}; }
  async initialize() {
    if (await this.repository.get('settings','kitchen')) return;
    this.authorize();
    try { await this.repository.commit([put('settings',this.stamp(defaultKitchenSettings()))]); }
    catch(error) { if (!(error instanceof ConcurrentEditError)) throw error; }
  }
  async snapshot() {
    const [pantry,recipes,menus,settings]=await Promise.all([
      new PantryService(this.repository,{actor:this.actor,clock:this.clock}).snapshot(),this.repository.list('recipes'),this.repository.list('menus'),this.repository.get('settings','kitchen')
    ]);
    const cfg=settings || defaultKitchenSettings();
    const canInspectPrices=['admin','editor'].includes(this.actor.role);
    const evaluatedMenus=menus.map(menu=>({...menu,days:evaluateMenuRules(menu.days,recipes)}));
    return {catalog:pantry.catalog,categories:pantry.categories,recipes,menus:evaluatedMenus,settings:cfg,generation:this.generator.capabilities(),
      canInspectPrices,priceSources:canInspectPrices?currentPriceSources(pantry):{},
      recipeCosts:Object.fromEntries(recipes.map(r=>[r.id,costRecipe(r,pantry.catalog,cfg)])),
      menuCosts:Object.fromEntries(evaluatedMenus.map(m=>[m.id,m.days.map(d=>costMenuDay(d,recipes,pantry.catalog,cfg))])),
      cap:recipeCap(cfg,pantry.catalog,cfg.defaultLineId)};
  }
  async priceEvidence(input) {
    this.authorize();
    const pantry=await new PantryService(this.repository,{actor:this.actor,clock:this.clock}).snapshot();
    return currentPriceEvidence(pantry,input);
  }
  async saveRecipe(input) {
    this.authorize();
    const value=validateRecipe(input);
    const before=input.id ? await this.repository.get('recipes',input.id) : null;
    if ((before?._revision ?? null)!==(input.expectedRevision ?? null) || (input.id && !before)) throw new ConcurrentEditError();
    let generation=before?.generation || null, request=null;
    if (!before && input.generationRequestId) {
      if(input.proposalReviewed!==true)throw new Error('Confirma la revisión de cantidades, procedimiento y restricciones antes de guardar la propuesta.');
      request=await this.repository.get('generation_requests',required(input.generationRequestId,'Solicitud de origen',200));
      if (!request || request.actorUid!==this.actor.uid || request.status!=='completed' || !request.proposal
        || generationTextIsDue(request,this.clock())) throw new Error('La propuesta de origen no está disponible para esta cuenta.');
      if(request.recipeId)throw new Error('Esta propuesta ya fue guardada. Edita la receta existente en el catálogo.');
      value.status='draft';
      generation={requestId:request.id,provider:request.mode,model:request.model,promptVersion:request.promptVersion,reviewedBy:this.actor.uid,reviewedAt:this.clock()};
    }
    const id=before?.id || `recipe_${crypto.randomUUID()}`, key=nameKey(value.name);
    const reserved=await this.repository.get('recipe_names',key);
    if (reserved?.recipeId && reserved.recipeId!==id) throw new Error('Ya existe una receta con ese nombre. Edita la existente o usa otro nombre.');
    const operations=[];
    for (const ingredientId of new Set([...value.lines,...value.disposables].map(l=>l.ingredientId).filter(Boolean))) {
      const ingredient=await this.repository.get('ingredients',ingredientId);
      if (!ingredient || ingredient.status!=='active') throw new Error('El ingrediente vinculado no está disponible; vuelve a seleccionarlo.');
      operations.push(check('ingredients',ingredient));
    }
    let code=before?.code;
    if (!code) {
      const sequence=await this.repository.get('settings','recipe_sequences');
      const prefix=TYPES.find(t=>t.id===value.type).prefix, count=(sequence?.counts?.[prefix] || 0)+1;
      code=`${prefix}-${String(count).padStart(3,'0')}`;
      operations.push(put('settings',this.stamp({id:'recipe_sequences',counts:{...sequence?.counts,[prefix]:count}}),sequence));
    }
    const recipe=this.stamp({id,...value,code,source:before?.source || (request?`recipe-generator-${request.mode}`:input.source==='forx-base'?'forx-base':'manual'),...(generation?{generation}:{}),createdAt:before?.createdAt || this.clock()});
    if(request)operations.push(put('generation_requests',{...request,recipeId:id},request));
    if (before && nameKey(before.name)!==key) {
      const old=await this.repository.get('recipe_names',nameKey(before.name));
      if (old) operations.push(put('recipe_names',{...old,recipeId:null},old));
    }
    operations.push(put('recipe_names',{id:key,recipeId:id},reserved),put('recipes',recipe,before),
      put('recipe_versions',{id:`${id}_v${(before?._revision || 0)+1}`,recipe,version:(before?._revision || 0)+1,recordedAt:this.clock()}),
      put('audit',this.audit(before ? 'recipe.updated':'recipe.created',id,before)));
    await this.repository.commit(operations);
    return this.repository.get('recipes',id);
  }
  async importRecipes(text,{duplicates='omit',expectedRevisions={},source='manual'}={}) {
    this.authorize();
    if (!['omit','replace'].includes(duplicates)) throw new Error('Política de duplicados inválida.');
    const parsed=parseRecipeBatch(text), results=[];
    for (const item of parsed) {
      if (item.error) { results.push({...item,status:'invalid'}); continue; }
      try {
        const name=await this.repository.get('recipe_names',nameKey(item.recipe.name));
        const prior=name?.recipeId ? await this.repository.get('recipes',name.recipeId) : null;
        if (prior && duplicates==='omit') { results.push({index:item.index,name:item.recipe.name,status:'duplicate'}); continue; }
        if (prior && expectedRevisions[prior.id]!==prior._revision) throw new ConcurrentEditError();
        const recipe=await this.saveRecipe({...item.recipe,source,...(prior ? {id:prior.id,expectedRevision:prior._revision}:{})});
        results.push({index:item.index,name:recipe.name,id:recipe.id,status:prior ? 'updated':'created'});
      } catch(error) { results.push({index:item.index,name:item.recipe.name,status:'invalid',error:error.message}); }
    }
    return results;
  }
  async saveSettings(input) {
    this.authorize(true);
    const prior=await this.repository.get('settings','kitchen');
    if (prior?._revision!==input.expectedRevision) throw new ConcurrentEditError();
    if (!Array.isArray(input.contractLines) || input.contractLines.length>30 || !Array.isArray(input.complements) || input.complements.length>100) throw new Error('Configuración inválida.');
    const contractLines=input.contractLines.map(l=>({id:required(l.id,'ID de línea',100),name:required(l.name,'Nombre de línea'),price:number(l.price,'Precio de contrato'),active:l.active!==false}));
    if (new Set(contractLines.map(l=>l.id)).size!==contractLines.length || !contractLines.some(l=>l.id===input.defaultLineId && l.active)) throw new Error('Selecciona una línea activa con ID único.');
    const complements=input.complements.map((c,i)=>c.fixedCost!=null ? {id:c.id || crypto.randomUUID(),name:required(c.name,'Complemento'),fixedCost:number(c.fixedCost,'Costo fijo',{zero:true})} : validateLine(c,i));
    const settings=this.stamp({id:'kitchen',confirmed:input.confirmed===true,contractLines,complements,defaultLineId:input.defaultLineId,
      marginTarget:number(input.marginTarget,'Margen objetivo',{zero:true,max:99}),productionCost:number(input.productionCost,'Producción',{zero:true}),dishPortions:number(input.dishPortions,'Porciones por platillo',{max:100}),
      identity:{product:'FORX',company:required(input.identity?.company,'Empresa'),fileSlug:required(input.identity?.fileSlug || 'forx','Nombre de archivo',60).replace(/[^a-zA-Z0-9_-]/g,'-')}});
    const refs=[];
    for (const id of new Set(complements.map(l=>l.ingredientId).filter(Boolean))) { const ingredient=await this.repository.get('ingredients',id); if (!ingredient) throw new Error('Complemento vinculado a ingrediente inexistente.'); refs.push(check('ingredients',ingredient)); }
    await this.repository.commit([...refs,put('settings',settings,prior),put('audit',this.audit('kitchen.settings_updated','kitchen',prior))]);
    return this.repository.get('settings','kitchen');
  }
  async generateMenu(input) {
    this.authorize();
    const recipes=await this.repository.list('recipes'), settings=await this.repository.get('settings','kitchen');
    return this.saveMenu({name:input.name,startDate:input.startDate,diners:input.diners,
      days:generateDays(recipes,{...input,contractLineId:input.contractLineId || settings.defaultLineId})});
  }
  async saveMenu(input) {
    this.authorize();
    return atomicWork(this.repository,async repository=> {
      const prior=input.id ? await repository.get('menus',input.id):null;
      if ((prior?._revision ?? null)!==(input.expectedRevision ?? null) || (input.id && !prior)) throw new ConcurrentEditError();
      if (!validDay(input.startDate) || !Array.isArray(input.days) || !input.days.length || input.days.length>60) throw new Error('Menú inválido.');
      const days=[];
      // Only recipes used by this menu participate in its optimistic lock.
      // Unrelated catalog edits must neither block it nor inflate the transaction.
      const recipeIds=[...new Set(input.days.flatMap(day=>Array.isArray(day.slots)?day.slots.map(slot=>slot?.recipeId).filter(Boolean):[]))];
      const recipes=(await Promise.all(recipeIds.map(id=>repository.get('recipes',id)))).filter(Boolean);
      for (const [index,day] of input.days.entries()) {
        if (!validDay(day.date) || !Array.isArray(day.slots) || day.slots.length<3 || day.slots.length>7) throw new Error('Día incompleto.');
        const expectedDate=new Date(`${input.startDate}T12:00:00Z`); expectedDate.setUTCDate(expectedDate.getUTCDate()+index);
        if (day.date!==expectedDate.toISOString().slice(0,10)) throw new Error('Los días deben ser consecutivos y comenzar en la fecha inicial.');
        const ids=day.slots.map(s=>s.id);
        if (new Set(ids).size!==ids.length || MAIN_SLOTS.some(s=>!ids.includes(s.id))) throw new Error('Faltan los espacios principales del menú.');
        const slots=[];
        for (const value of day.slots) {
          const spec=[...MAIN_SLOTS,...EXTRA_SLOTS].find(s=>s.id===value.id);
          if (!spec) throw new Error('Espacio de menú desconocido.');
          const recipe=value.recipeId ? await repository.get('recipes',value.recipeId):null;
          if (value.recipeId && (!recipe || !menuEligible(recipe) || recipe.type!==spec.type)) throw new Error('Receta no disponible para ese espacio: debe estar activa y no omitida.');
          if (recipe && restrictedDay(recipe.name)!=null && restrictedDay(recipe.name)!==new Date(`${day.date}T12:00:00Z`).getUTCDay()) throw new Error(`${recipe.name} está restringido a otro día.`);
          slots.push({...spec,recipeId:recipe?.id || null,charged:MAIN_SLOTS.some(s=>s.id===spec.id),locked:value.locked===true});
        }
        days.push({date:day.date,contractLineId:String(day.contractLineId || ''),slots});
      }
      if (new Set(days.map(d=>d.date)).size!==days.length) throw new Error('Hay fechas repetidas.');
      const menu=this.stamp({id:prior?.id || `menu_${crypto.randomUUID()}`,name:required(input.name,'Nombre del menú'),startDate:input.startDate,days:evaluateMenuRules(days,recipes),
        diners:number(input.diners,'Comensales',{max:99999}),createdAt:prior?.createdAt || this.clock()});
      await repository.commit([put('menus',menu,prior),put('audit',this.audit(prior ? 'menu.updated':'menu.created',menu.id,prior))]);
      return {...menu,_revision:(prior?._revision || 0)+1};
    });
  }
}
