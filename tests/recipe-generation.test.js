import { test, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryEntityRepository, IndexedDbEntityRepository } from '../src/data/entity-repository.js';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { createSimulatedRecipeProvider } from '../src/domain/simulated-recipe-provider.js';
import { RecipeGenerationService, SIMULATION_LIMITS } from '../src/domain/recipe-generation.js';
import { validateProposal, validateGenerationInput } from '../src/domain/recipe-proposal.js';
import { buildOpenAIRecipeRequest, parseOpenAIRecipeResponse } from '../src/server/openai-recipe-contract.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { inspectBackup, backupDigest } from '../src/domain/backup.js';
import { restoreLocalCopy } from '../src/data/local-recovery.js';
import { file, purchaseXml, productInput, ingredientInput } from './fixtures/monthly.js';

const actor={uid:'chef',name:'Cocina de prueba',role:'editor'},clock=()=> '2026-10-04T12:00:00.000Z';
const input=(overrides={})=>({requestId:crypto.randomUUID(),idea:'Pollo para comedor',type:'guisado',protein:'',baseServings:'10',restrictions:'',preferredIngredientIds:[],...overrides});
async function setup(options={}) {
  const repository=options.repository || new MemoryEntityRepository(),provider=options.provider || createSimulatedRecipeProvider();
  const pantry=new PantryService(repository,{clock});await pantry.initialize();
  const kitchen=new KitchenService(repository,{actor,clock,generationProvider:provider,generationLimits:options.limits});await kitchen.initialize();
  return {repository,provider,pantry,kitchen,generator:kitchen.generator};
}
test('generación desactivada por defecto; permisos y modelo no provienen del cliente',async()=>{
  const {repository}=await setup();
  const auth=role=>({uid:'chef',token:{forxActive:true,forxRole:role}});
  await expect(executePantryCommand(repository,auth('editor'),{command:'generateRecipeProposal',input:input()})).rejects.toThrow(/desactivada/);
  await expect(executePantryCommand(repository,auth('viewer'),{command:'generateRecipeProposal',input:input()},{generationProvider:createSimulatedRecipeProvider()})).rejects.toMatchObject({code:'permission-denied'});
  for(const key of ['model','apiKey','provider','budget','role','price','systemPrompt'])await expect(executePantryCommand(repository,auth('editor'),{command:'generateRecipeProposal',input:input({[key]:'injected'})},{generationProvider:createSimulatedRecipeProvider()})).rejects.toThrow(/estructura/);
  expect(await repository.list('generation_requests')).toEqual([]);
  const bad=new RecipeGenerationService(repository,{actor,provider:{mode:'openai',generate:vi.fn()}});await expect(bad.generate(input())).rejects.toThrow(/desactivada/);expect(bad.provider.generate).not.toHaveBeenCalled();
});
test('seis familias simuladas, sin precios, vínculos, conversiones ni escritura de recetas',async()=>{
  const {kitchen,repository}=await setup();
  for(const type of ['guisado','garnacha','guarnicion','postre','agua','grill']) {
    const result=await kitchen.generateRecipeProposal(input({type,baseServings:'4'}));
    expect(result.status).toBe('completed');expect(result.mode).toBe('simulated');
    expect(result.proposal.recipe).toMatchObject({type,baseServings:'4',status:'draft',salePrice:null});
    expect(result.proposal.warnings.join(' ')).toContain('no generado por OpenAI');
    for(const line of result.proposal.recipe.lines)expect(line).toMatchObject({ingredientId:null,yieldFactor:'1',gramsPerPiece:null,conversionNote:''});
  }
  expect(await repository.list('recipes')).toEqual([]);expect(await repository.list('price_observations')).toEqual([]);
});
test('contexto mínimo y coincidencias separadas; no usa precios/XML/proveedores ni crea ingredientes',async()=>{
  const provider=createSimulatedRecipeProvider(),generate=vi.spyOn(provider,'generate');const {pantry,kitchen,repository}=await setup({provider});
  const ingredient=await pantry.createIngredient({...ingredientInput,canonicalName:'Pollo',aliases:[]});
  const reply=await kitchen.generateRecipeProposal(input({preferredIngredientIds:[ingredient.id]}));
  const context=generate.mock.calls[0][0];expect(context.preferredIngredients).toEqual([{name:'Pollo',unit:'kg'}]);
  expect(JSON.stringify(context)).not.toMatch(/ingredient_|currentPrice|wastePct|RFC|SKU|purchase_events/);
  expect(reply.suggestions[0].candidates).toEqual([{id:ingredient.id,name:'Pollo',unit:'kg',priced:false}]);
  expect(reply.proposal.recipe.lines[0].ingredientId).toBeNull();expect(await repository.list('ingredients')).toHaveLength(1);
});
test('mismo requestId no repite proveedor, admite consulta y rechaza payload distinto u otra cuenta',async()=>{
  const {provider,generator,repository}=await setup();const generate=vi.spyOn(provider,'generate'),request=input();
  const one=await generator.generate(request),two=await generator.generate(request);expect(two).toEqual(one);expect(generate).toHaveBeenCalledTimes(1);
  expect(await generator.lookup({requestId:request.requestId})).toEqual(one);
  await expect(generator.generate({...request,idea:'Distinto'})).rejects.toThrow(/otra solicitud/);
  const other=new RecipeGenerationService(repository,{actor:{...actor,uid:'otro'},provider});await expect(other.lookup({requestId:request.requestId})).rejects.toThrow(/no disponible/);
});
test('reserva concurrente: una llamada por identidad; cuota atómica entre dos instancias',async()=>{
  let release;const provider=createSimulatedRecipeProvider(),base=provider.generate;
  provider.generate=vi.fn(async request=>{await new Promise(resolve=>release=resolve);return base(request);});
  const limits={...SIMULATION_LIMITS,userDaily:1,concurrent:1};const {generator,repository}=await setup({provider,limits});
  const other=new RecipeGenerationService(repository,{actor,clock,provider,limits}),request=input(),first=generator.generate(request);
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  expect((await other.generate(request)).status).toBe('pending');
  await expect(other.generate(input())).rejects.toThrow(/límite diario/);
  const third=new RecipeGenerationService(repository,{actor:{...actor,uid:'segunda-persona'},clock,provider,limits});
  await expect(third.generate(input())).rejects.toThrow(/solicitudes reservadas/);
  release();await first;expect(provider.generate).toHaveBeenCalledTimes(1);
  expect((await repository.get('generation_quotas','concurrency')).count).toBe(0);
});
test('límites por usuario/día, proyecto/mes y concurrencia se aplican antes del proveedor',async()=>{
  const {generator,repository,provider}=await setup({limits:{...SIMULATION_LIMITS,projectMonthly:1}});await generator.generate(input());
  const another=new RecipeGenerationService(repository,{actor:{...actor,uid:'otra-cocina'},clock,provider,limits:{...SIMULATION_LIMITS,projectMonthly:1}});
  await expect(another.generate(input())).rejects.toThrow(/mensual/);
  const tomorrow=new RecipeGenerationService(repository,{actor,clock:()=> '2026-11-01T00:00:00.000Z',provider});await expect(tomorrow.generate(input())).resolves.toMatchObject({status:'completed'});
});
test('timeout conserva reserva, no reintenta, no filtra error del proveedor ni guarda receta',async()=>{
  const provider={mode:'simulated',model:'fixture-v1',generate:vi.fn(()=>new Promise(()=>{}))};
  const {generator,repository}=await setup({provider,limits:{...SIMULATION_LIMITS,timeoutMs:10,concurrent:1}});const request=input();
  const result=await generator.generate(request);expect(result.status).toBe('uncertain');expect(result.error).toContain('reserva se conserva');
  expect((await generator.generate(request)).status).toBe('uncertain');expect(provider.generate).toHaveBeenCalledTimes(1);
  await expect(generator.generate(input())).rejects.toThrow(/resultado incierto/);
  expect((await repository.get('generation_quotas','concurrency')).count).toBe(1);
  const failed=await setup({provider:{mode:'simulated',model:'fixture-v1',generate:()=>{throw Error('SECRET_API_KEY');}}});
  const failure=await failed.generator.generate(input());expect(failure.status).toBe('failed');expect(JSON.stringify(await failed.repository.exportSnapshot())).not.toContain('SECRET_API_KEY');
  expect(await repository.list('recipes')).toEqual([]);
});
test('rechaza tipos, cantidades, unidades, precios, IDs inyectados, campos extra y procedimientos vacíos',async()=>{
  const request=validateGenerationInput(input()),fixture=await createSimulatedRecipeProvider().generate(request);
  const mutations=[v=>v.price=1,v=>v.lines[0].ingredientId='inventado',v=>v.lines[0].quantity=0,v=>v.lines[0].quantity='150',v=>v.lines[0].unit='taza',v=>v.baseServings=9,v=>v.type='grill',v=>v.steps=[],v=>v.lines=[],v=>delete v.warnings,v=>v.region={},v=>v.lines[0].gramsPerPiece=100];
  for(const mutate of mutations){const value=structuredClone(fixture);mutate(value);expect(()=>validateProposal(value,request)).toThrow();}
  const {generator}=await setup({provider:{mode:'simulated',model:'fixture-v1',generate:async()=>({...fixture,price:999})}});
  expect((await generator.generate(request)).status).toBe('failed');
  expect(()=>validateGenerationInput(input({preferredIngredientIds:['same','same']}))).toThrow();
});
test('guardar exige revisión, fuerza borrador, conserva procedencia y no deja reutilizar la propuesta',async()=>{
  const {kitchen,repository}=await setup();const reply=await kitchen.generateRecipeProposal(input());
  const candidate={...reply.proposal.recipe,generationRequestId:reply.generationRequestId,status:'active'};
  await expect(kitchen.saveRecipe(candidate)).rejects.toThrow(/Confirma/);
  const other=new KitchenService(repository,{actor:{...actor,uid:'otra'}});await expect(other.saveRecipe({...candidate,proposalReviewed:true})).rejects.toThrow(/esta cuenta/);
  const recipe=await kitchen.saveRecipe({...candidate,proposalReviewed:true});expect(recipe.status).toBe('draft');expect(recipe.generation).toMatchObject({provider:'simulated',reviewedBy:'chef'});
  expect((await kitchen.snapshot()).recipeCosts[recipe.id].verified).toBe(false);
  await expect(kitchen.saveRecipe({...candidate,proposalReviewed:true,name:'Otra'})).rejects.toThrow(/ya fue guardada/);
  const edited=await kitchen.saveRecipe({...recipe,name:'Nombre revisado',status:'active',generation:{provider:'forged'},expectedRevision:recipe._revision});
  expect(edited.id).toBe(recipe.id);expect(edited.generation).toEqual(recipe.generation);
  expect((await repository.list('recipe_versions')).at(-1).recipe.generation).toEqual(recipe.generation);
});
test('propuesta → borrador → activa → menú sin costo → MiDespensa verificada → mismo ID con costo',async()=>{
  const provider={mode:'simulated',model:'fixture-v1',generate:async context=>({name:'Jitomate de prueba',type:context.type,region:'',protein:'',baseServings:Number(context.baseServings),minutes:10,lines:[{name:'Jitomate',quantity:100,unit:'g'}],steps:['Cocinar para la prueba.'],adaptations:[],warnings:['Simulado.']})};
  const {kitchen,pantry}=await setup({provider});const result=await kitchen.generateRecipeProposal(input({baseServings:'1'}));
  let recipe=await kitchen.saveRecipe({...result.proposal.recipe,generationRequestId:result.generationRequestId,proposalReviewed:true});
  recipe=await kitchen.saveRecipe({...recipe,status:'active',expectedRevision:recipe._revision});
  const menu=await kitchen.generateMenu({name:'Prueba generada',startDate:'2026-10-05',count:1,diners:10});
  expect(menu.days[0].slots.some(s=>s.recipeId===recipe.id)).toBe(true);expect((await kitchen.snapshot()).menuCosts[menu.id][0].verified).toBe(false);
  await pantry.importFiles([file('compra.xml',purchaseXml())],{period:'2026-09'});const ingredient=await pantry.createIngredient(ingredientInput),event=(await pantry.snapshot()).purchase_events[0];
  await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});await pantry.validatePrice(event.id);
  const linked=await kitchen.saveRecipe({...recipe,lines:recipe.lines.map(l=>({...l,ingredientId:ingredient.id})),expectedRevision:recipe._revision});
  expect(linked.id).toBe(recipe.id);expect((await kitchen.snapshot()).recipeCosts[recipe.id].verified).toBe(true);
});
test('contrato Responses cerrado sin tools/precios ni clave; maneja rechazo, truncamiento y JSON inválido',()=>{
  const context={...input(),preferredIngredients:[{name:'Pollo',unit:'kg',price:100,sku:'NO'}],apiKey:'SECRET'};
  const request=buildOpenAIRecipeRequest(context,{model:'modelo-a-aprobar',maxOutputTokens:2000});
  expect(request).toMatchObject({store:false,service_tier:'default',text:{format:{type:'json_schema',strict:true}}});expect(request).not.toHaveProperty('tools');
  expect(JSON.stringify(request)).not.toContain('SECRET');expect(request.input[0].content).not.toMatch(/price|sku|requestId/);
  const completed=text=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
  expect(parseOpenAIRecipeResponse(completed('{"name":"ejemplo"}'))).toEqual({name:'ejemplo'});
  expect(()=>parseOpenAIRecipeResponse(completed('{"name":'))).toThrow(/JSON/);
  expect(()=>parseOpenAIRecipeResponse({status:'incomplete',output:[]})).toThrow(/incompleta/);
  expect(()=>parseOpenAIRecipeResponse({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'denied'}]}]})).toThrow(/rechazó/);
});
test('respaldo de solicitudes/cuotas restaura copia aislada y sigue aceptando respaldos v1',async()=>{
  const {kitchen,pantry,repository}=await setup();const reply=await kitchen.generateRecipeProposal(input());
  await kitchen.saveRecipe({...reply.proposal.recipe,generationRequestId:reply.generationRequestId,proposalReviewed:true});
  const backup=await pantry.exportBackup();expect(backup.version).toBe(3);const inspected=await inspectBackup(JSON.stringify(backup));expect(inspected.counts.generation_requests).toBe(1);
  expect(backup.collections.generation_requests[0]).toMatchObject({context:null,proposal:null});
  const factory=new IDBFactory(),copy=await restoreLocalCopy(JSON.stringify(backup),{factory,now:clock()}),target=await IndexedDbEntityRepository.open(copy.name,factory);
  expect(await target.list('generation_requests')).toEqual(backup.collections.generation_requests);expect((await target.list('generation_quotas')).sort((a,b)=>a.id.localeCompare(b.id))).toEqual((await repository.list('generation_quotas')).sort((a,b)=>a.id.localeCompare(b.id)));target.close();
  const v2=structuredClone(backup);v2.version=2;delete v2.generationTextPolicy;v2.collections.generation_requests=await repository.list('generation_requests');
  const {checksum:oldChecksum,...oldPayload}=v2;v2.checksum=await backupDigest(oldPayload);
  expect((await inspectBackup(JSON.stringify(v2))).counts.generation_requests).toBe(1);
  const old=await setup(),v1=await old.pantry.exportBackup();v1.version=1;delete v1.generationTextPolicy;delete v1.collections.generation_requests;delete v1.collections.generation_quotas;
  const {checksum,...payload}=v1;v1.checksum=await backupDigest(payload);const source=JSON.stringify(v1);
  const checked=await inspectBackup(source);expect(checked.backup.checksum).toBe(v1.checksum);expect(checked.collections.generation_requests).toEqual([]);
  await expect(restoreLocalCopy(source,{factory,now:clock()})).resolves.toHaveProperty('name');
  backup.collections.generation_quotas[0].count++;const {checksum:unused,...changed}=backup;backup.checksum=await backupDigest(changed);
  await expect(inspectBackup(JSON.stringify(backup))).rejects.toThrow(/cuota/);
});
test('actualización IndexedDB añade entidades sin reescribir registros v2',async()=>{
  const factory=new IDBFactory(),name='v2-fixture';
  await new Promise((resolve,reject)=>{const request=factory.open(name,2);request.onupgradeneeded=()=>request.result.createObjectStore('recipes',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('recipes','readwrite');tx.objectStore('recipes').put({id:'existing',name:'Conservar',_revision:7});tx.oncomplete=()=>{db.close();resolve();};};});
  const upgraded=await IndexedDbEntityRepository.open(name,factory);expect(await upgraded.get('recipes','existing')).toEqual({id:'existing',name:'Conservar',_revision:7});expect(await upgraded.list('generation_requests')).toEqual([]);upgraded.close();
});
