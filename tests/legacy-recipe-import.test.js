import {test,expect} from 'vitest';
import {MemoryEntityRepository} from '../src/data/entity-repository.js';
import {KitchenService,defaultKitchenSettings} from '../src/domain/kitchen-service.js';
import {PantryService} from '../src/domain/pantry-service.js';
import {costRecipe} from '../src/domain/costing.js';
import {planLegacyRecipeImport,applyLegacyRecipePlan,checkRecoveredMenu} from '../src/domain/legacy-recipe-import.js';
import {legacyBackup,legacyRecipe} from './fixtures/legacy-recipes.js';
import {ingredientInput,productInput,purchaseXml,file} from './fixtures/monthly.js';

const sourceHash='a'.repeat(64),plan=(data,options={})=>planLegacyRecipeImport(JSON.stringify(data),{sourceHash,...options});
async function setup(){const repository=new MemoryEntityRepository(),kitchen=new KitchenService(repository),pantry=new PantryService(repository);await pantry.initialize();await kitchen.initialize();return{repository,kitchen,pantry};}

test('importación segura: cantidades por porción, duplicado equivalente, borradores, omisiones y unidades pendientes',()=>{
  const data=legacyBackup(),before=structuredClone(data),p=plan(data);
  expect(p.summary).toMatchObject({total:10,ready:7,duplicates:1,excluded:1,pending:1});
  const rows=p.entries.filter(e=>e.status==='ready').map(e=>e.recipe);
  expect(rows.find(r=>r.name==='Guisado de prueba')).toMatchObject({baseServings:'1',lines:[{quantity:'150',unit:'g',ingredientId:null}]});
  expect(rows.find(r=>r.name==='Sopes de prueba').status).toBe('draft');
  expect(rows.find(r=>r.name==='Receta omitida de prueba').omitted).toBe(true);
  expect(p.entries.find(e=>e.name==='Ensalada de prueba').status).toBe('pending');
  expect(rows.every(r=>r.salePrice===null&&r.productionCost==='0')).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/precio_kg|98765|private-synthetic/);
  expect(data).toEqual(before);
});
test('no mezcla copias distintas ni recetas distintas con el mismo nombre',()=>{
  const data=legacyBackup();data.nube.recetas[0].ingredientes[0].cantidad=999;
  expect(()=>plan(data)).toThrow(/copias difieren/);
  expect(plan(data,{source:'local'}).summary.ready).toBe(7);
  data.local.recetas[2].ingredientes[0].cantidad=999;
  expect(plan(data,{source:'local'}).entries.filter(e=>e.status==='pending')).toHaveLength(3);
});
test('la repetición es idempotente por nombre y no reemplaza contenido existente',async()=>{
  const {repository,kitchen}=await setup();
  const p=plan(legacyBackup());const created=await applyLegacyRecipePlan(p,{saveRecipe:r=>kitchen.saveRecipe(r)});
  const before=await repository.exportSnapshot();
  const repeat=plan(legacyBackup(),{existingRecipes:await repository.list('recipes')});
  expect(repeat.summary.ready).toBe(0);
  expect(await applyLegacyRecipePlan(repeat,{saveRecipe:r=>kitchen.saveRecipe(r)})).toEqual([]);
  expect(await repository.exportSnapshot()).toEqual(before);
  expect(new Set(created.map(r=>r.id)).size).toBe(created.length);
  expect(await repository.list('recipe_versions')).toHaveLength(created.length);
});
test('rechaza vínculos o equivalencias inyectados y se detiene sin reintentar si falla el guardado',async()=>{
  let calls=0;const p=plan(legacyBackup());p.entries[0].recipe.lines[0].ingredientId='fake';
  await expect(applyLegacyRecipePlan(p,{saveRecipe:()=>{calls++;}})).rejects.toThrow(/vínculos/);expect(calls).toBe(0);
  await expect(applyLegacyRecipePlan(plan(legacyBackup()),{saveRecipe:()=>{calls++;throw new Error('offline');}})).rejects.toThrow('offline');expect(calls).toBe(1);
});
test('ni nombre coincidente ni precio manual verifica: se requiere vínculo y observación validada de MiDespensa',async()=>{
  const {kitchen,pantry}=await setup();const ingredient=await pantry.createIngredient(ingredientInput);
  const data={local:{recetas:[legacyRecipe({nombre:'Receta recuperada',ingredientes:[{nombre:ingredient.canonicalName,cantidad:100,unidad:'g',precio_kg:98765}]})],alacarta:[]}};
  const [{id}]=await applyLegacyRecipePlan(plan(data),{saveRecipe:r=>kitchen.saveRecipe(r)});
  await pantry.addManualPrice({ingredientId:ingredient.id,baseUnit:'kg',observedAt:'2026-10-03',sourceLabel:'Provisional de prueba',normalizedPrice:'999'});
  let state=await kitchen.snapshot(),recipe=state.recipes.find(r=>r.id===id);
  expect(state.recipeCosts[id]).toMatchObject({verified:false,total:null,missing:[{status:'unlinked'}]});
  recipe=await kitchen.saveRecipe({...recipe,expectedRevision:recipe._revision,lines:recipe.lines.map(l=>({...l,ingredientId:ingredient.id}))});
  expect((await kitchen.snapshot()).recipeCosts[id]).toMatchObject({verified:false,total:null,missing:[{status:'unpriced'}]});
  await pantry.importFiles([file('synthetic.xml',purchaseXml({price:'360'}))],{period:'2026-09'});
  const event=(await pantry.snapshot()).purchase_events[0];await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});await pantry.validatePrice(event.id);
  state=await kitchen.snapshot();expect(state.recipes.find(r=>r.id===id).id).toBe(id);
  expect(state.recipeCosts[id].verified).toBe(true);
  expect(Number(state.recipeCosts[id].total)).toBeCloseTo(10/3,12);
});
test('menú recuperado usa 2 guisados y 1 garnacha, especiales, sin omitidos/borradores/Grill ni costos verificados',()=>{
  const records=[['Pozole rojo','guisado'],['Barbacoa','guisado'],['Menudo','guisado'],['Pollo','guisado'],['Res','guisado'],['Tacos dorados de papa','garnacha'],['Omitida','guisado'],['Borrador','guisado']];
  const data={local:{recetas:records.map(([nombre,tipo],i)=>legacyRecipe({id:i,nombre,tipo,carnico:nombre==='Res'?'Res':'Pollo',...(nombre==='Borrador'?{procedimiento:[]}: {})})),alacarta:[],omitidas:['Omitida']}};
  const rows=plan(data).entries.filter(e=>e.status==='ready').map((e,i)=>({...e.recipe,id:String(i)}));
  const cfg=defaultKitchenSettings(),result=checkRecoveredMenu(rows,[],cfg);
  expect(result.violations).toEqual([]);expect(result.stored).toBe(false);
  for(const day of result.menu)expect(day.slots.map(s=>s.type)).toEqual(['guisado','guisado','garnacha']);
  const name=slot=>rows.find(r=>r.id===slot.recipeId)?.name;
  expect(name(result.menu[3].slots[0])).toBe('Pozole rojo');expect(name(result.menu[3].slots[2])).toBe('Tacos dorados de papa');
  expect(name(result.menu[6].slots[0])).toBe('Barbacoa');expect(name(result.menu[13].slots[0])).toBe('Menudo');
  expect(rows.every(r=>!costRecipe(r,[],cfg).verified)).toBe(true);
});
