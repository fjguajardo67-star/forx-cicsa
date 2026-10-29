import { test, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { KitchenService } from '../src/domain/kitchen-service.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { MemoryEntityRepository, IndexedDbEntityRepository } from '../src/data/entity-repository.js';
import { costRecipe, costMenuDay, recipeCap, marginBand } from '../src/domain/costing.js';
import { validateRecipe, parseRecipeBatch } from '../src/domain/recipes.js';
import { generateDays, restrictedDay } from '../src/domain/menus.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { ingredientInput, productInput, file, purchaseXml } from './fixtures/monthly.js';

const draft=(overrides={})=>({name:'Receta de prueba',type:'guisado',baseServings:'4',instructions:'Cocinar y servir.',lines:[{name:'Jitomate',quantity:'400',unit:'g',ingredientId:null}],...overrides});
async function setup() {
  const repository=new MemoryEntityRepository(), pantry=new PantryService(repository), kitchen=new KitchenService(repository);
  await pantry.initialize(); await kitchen.initialize();
  await pantry.importFiles([file('compra.xml',purchaseXml({price:'360'}))],{period:'2026-09'});
  const event=(await pantry.snapshot()).purchase_events[0];
  const ingredient=await pantry.createIngredient(ingredientInput);
  await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id});
  await pantry.validatePrice(event.id);
  let settings=(await kitchen.snapshot()).settings;
  await kitchen.saveSettings({...settings,confirmed:true,complements:[{name:'Complemento fijo de prueba',fixedCost:'3'}],expectedRevision:settings._revision});
  return {repository,pantry,kitchen,ingredient,event};
}
test('receta incompleta se guarda y genera menú; vincular recalcula la misma identidad sin doble merma',async()=> {
  const {repository,kitchen,ingredient}=await setup();
  let recipe=await kitchen.saveRecipe(draft());
  let state=await kitchen.snapshot();
  expect(state.recipeCosts[recipe.id].verified).toBe(false);
  expect(state.recipeCosts[recipe.id].total).toBeNull();
  const menu=await kitchen.generateMenu({name:'Menú prueba',startDate:'2026-10-05',count:1,diners:500});
  expect((await kitchen.snapshot()).menuCosts[menu.id][0].band).toBe('incompleto');
  recipe=await kitchen.saveRecipe({...recipe,expectedRevision:recipe._revision,lines:recipe.lines.map(l=>({...l,ingredientId:ingredient.id}))});
  state=await kitchen.snapshot();
  expect(state.recipes).toHaveLength(1);
  expect(Number(state.recipeCosts[recipe.id].total)).toBeCloseTo(10/3,12); // No intermediate rounding: 360 / 10.8 × .4 / 4
  expect(await repository.list('recipe_versions')).toHaveLength(2);
  const garnish=await kitchen.saveRecipe(draft({name:'Garnacha prueba',type:'garnacha',lines:recipe.lines}));
  await kitchen.saveMenu({...menu,expectedRevision:menu._revision,days:menu.days.map(d=>({...d,slots:d.slots.map(s=>s.id==='garnacha'?{...s,recipeId:garnish.id}:s)}))});
  const day=(await kitchen.snapshot()).menuCosts[menu.id][0];
  expect(day.verified).toBe(true);
  expect(Number(day.total)).toBeCloseTo(33,12); // three portions + basket once + production once
  expect(day.observationIds).toHaveLength(1);
});
test('nombres iguales no vinculan; incompatibilidad y precio manual nunca verifican',async()=> {
  const {kitchen,pantry,ingredient}=await setup();
  const recipe=await kitchen.saveRecipe(draft({lines:[{name:'Jitomate',quantity:'1',unit:'l',ingredientId:ingredient.id}]}));
  expect((await kitchen.snapshot()).recipeCosts[recipe.id].missing[0].status).toBe('incompatible');
  const other=await pantry.createIngredient({...ingredientInput,canonicalName:'Otro',aliases:[]});
  await pantry.addManualPrice({ingredientId:other.id,baseUnit:'kg',observedAt:'2026-10-02',sourceLabel:'Prueba',normalizedPrice:'50'});
  const r=await kitchen.saveRecipe(draft({name:'Otro platillo',lines:[{name:'Otro',quantity:1,unit:'kg',ingredientId:other.id}]}));
  expect((await kitchen.snapshot()).recipeCosts[r.id].missing[0].status).toBe('unpriced');
});
test('regresiones COSTEO: cap, bandas, rendimiento explícito y producción Grill independiente',()=> {
  const settings={confirmed:true,marginTarget:'15',productionCost:'20',dishPortions:'2',contractLines:[{id:'comida',price:'77',active:true}],complements:[{name:'Canasta',fixedCost:'21.16'}]};
  expect(recipeCap(settings,[],'comida')).toBe('12.145');
  expect(marginBand('15')).toBe('verde'); expect(marginBand('14.99')).toBe('amarillo'); expect(marginBand('10')).toBe('amarillo'); expect(marginBand('0')).toBe('naranja'); expect(marginBand('-0.01')).toBe('rojo');
  const catalog=[{id:'rice',status:'active',baseUnit:'kg',currentPrice:{id:'price',normalizedPrice:'20'}}];
  const recipe=validateRecipe(draft({type:'grill',baseServings:1,productionCost:5,salePrice:30,lines:[{name:'Arroz servido',quantity:85,unit:'g',ingredientId:'rice',yieldFactor:2.5,conversionNote:'Factor confirmado'}]}));
  const c=costRecipe(recipe,catalog,settings);
  expect(c.total).toBe('5.68'); expect(c.band).toBe('verde');
  const incompatible=costRecipe({...recipe,lines:[{...recipe.lines[0],unit:'pz',gramsPerPiece:null}]},catalog,settings);
  expect(incompatible.total).toBeNull(); expect(incompatible.band).toBe('incompleto');
  expect(()=>validateRecipe({...recipe,lines:[{...recipe.lines[0],conversionNote:''}]})).toThrow(/Documenta/);
});
test('validador único: formatos inválidos se reportan, no descartan ingredientes silenciosamente',async()=> {
  const {kitchen}=await setup();
  const source='NOMBRE: Primera\nTIPO: guisado\nPORCIONES_BASE: 4\nINGREDIENTES:\n* Jitomate: 400 g\nPROCEDIMIENTO:\n1. Cocinar.\n---\nNOMBRE: Inválida\nPORCIONES_BASE: 4\nINGREDIENTES:\n* Sal al gusto';
  const parsed=parseRecipeBatch(source);
  expect(parsed[0].recipe.lines[0].ingredientId).toBeNull(); expect(parsed[1].error).toMatch(/No se interpretó/);
  const results=await kitchen.importRecipes(source);
  expect(results.map(r=>r.status)).toEqual(['created','invalid']);
  expect((await kitchen.importRecipes(source))[0].status).toBe('duplicate');
  expect(()=>validateRecipe(draft({baseServings:0}))).toThrow();
  expect(()=>validateRecipe(draft({lines:[{name:'Sal',quantity:'',unit:'g'}]}))).toThrow();
  expect(validateRecipe(draft({type:'postre',lines:[]})).lines).toEqual([]);
});
test('ediciones obsoletas y duplicados no pisan recetas; cambio de nombre conserva código e ID',async()=> {
  const {kitchen,repository}=await setup();
  const recipe=await kitchen.saveRecipe(draft());
  const renamed=await kitchen.saveRecipe({...recipe,name:'Renombrada',expectedRevision:recipe._revision});
  expect(renamed.id).toBe(recipe.id); expect(renamed.code).toBe(recipe.code);
  await expect(kitchen.saveRecipe({...recipe,expectedRevision:recipe._revision})).rejects.toThrow(/otra sesión/);
  await expect(kitchen.saveRecipe(draft({name:'RENOMBRADA'}))).rejects.toThrow(/existe/);
  expect(await repository.list('recipes')).toHaveLength(1);
});
test('nuevo precio invalida/verifica costo vivo, y el historial de receta no se reescribe',async()=> {
  const {kitchen,pantry,repository,ingredient,event}=await setup();
  const r=await kitchen.saveRecipe(draft({lines:[{name:'Jitomate',quantity:100,unit:'g',ingredientId:ingredient.id}]}));
  const versions=await repository.list('recipe_versions');
  const product=await repository.get('products',event.productId);
  await pantry.saveProduct(event.id,{...productInput,ingredientId:ingredient.id,contentQuantity:'6',expectedRevision:product._revision});
  expect((await kitchen.snapshot()).recipeCosts[r.id].verified).toBe(false);
  await pantry.validatePrice(event.id);
  expect((await kitchen.snapshot()).recipeCosts[r.id].verified).toBe(true);
  expect(await repository.list('recipe_versions')).toEqual(versions);
});
test('generador conserva restricciones y no filtra recetas por falta de precios',()=> {
  const names=[['Pozole rojo','guisado'],['Barbacoa','guisado'],['Menudo','guisado'],['Pollo','guisado'],['Res','guisado'],['Tacos dorados de papa','garnacha']];
  const recipes=names.map(([name,type],i)=>({...draft(),id:String(i),name,type,status:'active',protein:name==='Res'?'Res':'Pollo'}));
  const days=generateDays(recipes,{startDate:'2026-10-05',count:14,contractLineId:'line'},()=>0);
  for (const day of days) for(const slot of day.slots) {
    const recipe=recipes.find(r=>r.id===slot.recipeId); if(!recipe)continue;
    const restricted=restrictedDay(recipe.name);
    if(restricted!=null) expect(new Date(day.date).getUTCDay()).toBe(restricted);
  }
  expect(days[3].slots[0].recipeId).toBe('0'); expect(days[3].slots[2].recipeId).toBe('5');
  expect(days[6].slots[0].recipeId).toBe('1'); expect(days[13].slots[0].recipeId).toBe('2');
});
test('comandos de cocina exigen rol y calculan estado en servidor; payload no acredita costos',async()=> {
  const {repository}=await setup();
  const auth=role=>({uid:'trusted',token:{forxActive:true,forxRole:role}});
  await expect(executePantryCommand(repository,auth('viewer'),{command:'saveRecipe',input:draft()})).rejects.toThrow();
  const r=await executePantryCommand(repository,auth('editor'),{command:'saveRecipe',input:{...draft(),total:1,verified:true,updatedBy:'fake'}});
  expect(r.updatedBy).toBe('trusted'); expect(r.verified).toBeUndefined();
  const s=await executePantryCommand(repository,auth('viewer'),{command:'kitchenSnapshot'});
  expect(s.recipeCosts[r.id].total).toBeNull(); expect(JSON.stringify(s)).not.toMatch(/cfdiUuid|supplierId|priceBasis/);
  await expect(executePantryCommand(repository,auth('editor'),{command:'saveKitchenSettings',input:{}})).rejects.toThrow(/permiso/);
});
test('ampliación local agrega almacenes sin alterar registros existentes',async()=> {
  const name=`old-${crypto.randomUUID()}`;
  await new Promise((resolve,reject)=>{ const r=indexedDB.open(name,1); r.onupgradeneeded=()=>r.result.createObjectStore('ingredients',{keyPath:'id'}); r.onsuccess=()=>{const db=r.result,tx=db.transaction('ingredients','readwrite');tx.objectStore('ingredients').put({id:'preserved',name:'No cambiar'});tx.oncomplete=()=>{db.close();resolve();};};r.onerror=reject;});
  const repo=await IndexedDbEntityRepository.open(name,indexedDB);
  expect(await repo.get('ingredients','preserved')).toEqual({id:'preserved',name:'No cambiar'});
  expect(await repo.list('recipes')).toEqual([]); repo.close();
});
