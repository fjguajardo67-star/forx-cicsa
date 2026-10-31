import {test,expect} from 'vitest';
import {MemoryEntityRepository} from '../src/data/entity-repository.js';
import {KitchenService} from '../src/domain/kitchen-service.js';
import {PantryService} from '../src/domain/pantry-service.js';
import {RECIPE_CORRECTION_FORMAT,applyRecipeCorrection,recipeCorrectionDigest} from '../src/server/recipe-correction.js';

const config={projectId:'forx-v2-test',databaseId:'forx-production-test'};
const baseRecipe=name=>({name,type:'grill',baseServings:'1',region:'',protein:'',minutes:'0',instructions:'Sin procedimiento capturado.',
  lines:[{id:`line-${name}`,name:'Mezcla',quantity:'1',unit:'porcion'}],disposables:[],salePrice:null,productionCost:'0',status:'draft',omitted:false,notes:'Recuperada sin precio ni equivalencia.'});
async function setup(){
  const repository=new MemoryEntityRepository(),admin={uid:'setup',name:'Setup',role:'admin'};
  await new PantryService(repository,{actor:admin}).initialize();const kitchen=new KitchenService(repository,{actor:admin});await kitchen.initialize();
  const demo=await kitchen.saveRecipe({...baseRecipe('Grill de prueba'),status:'active'});
  const plan={format:RECIPE_CORRECTION_FORMAT,version:1,target:config,jobName:'forx-recipe-correction-test',approvedBy:'Francisco',
    reason:'Retirar demostración y recuperar respaldo comprobado.',beforeBackupChecksum:'a'.repeat(64),expectedVisibleRecipes:1,
    archive:[{id:demo.id,expectedName:demo.name,expectedCode:demo.code,expectedRevision:demo._revision,expectedStatus:'active'}],
    create:[baseRecipe('Ensalada recuperada')]};plan.digest=await recipeCorrectionDigest(plan);
  const runtime={config,repository,assertReady:async()=>{}};return{runtime,plan};
}

test('crea la receta recuperada, archiva la demo y puede repetirse sin duplicar',async()=>{
  const {runtime,plan}=await setup();
  const first=await applyRecipeCorrection(runtime,plan,{confirmDigest:plan.digest,jobName:plan.jobName});
  expect(first).toMatchObject({visibleRecipes:1,totalRecipeRecords:2,created:1,archived:1});
  const repeat=await applyRecipeCorrection(runtime,plan,{confirmDigest:plan.digest,jobName:plan.jobName});
  expect(repeat).toMatchObject({visibleRecipes:1,totalRecipeRecords:2,created:0,archived:0});
  const recipes=await runtime.repository.list('recipes');
  expect(recipes.find(r=>r.name==='Grill de prueba').status).toBe('archived');
  expect(recipes.find(r=>r.name==='Ensalada recuperada')).toMatchObject({status:'draft',lines:[{unit:'porcion',ingredientId:null}]});
});

test('rechaza destino, huella, estado concurrente o equivalencia inventada',async()=>{
  const {runtime,plan}=await setup();
  await expect(applyRecipeCorrection(runtime,plan,{confirmDigest:'b'.repeat(64),jobName:plan.jobName})).rejects.toThrow(/confirmar/);
  await expect(applyRecipeCorrection(runtime,{...plan,target:{...config,databaseId:'otra'}},{confirmDigest:plan.digest,jobName:plan.jobName})).rejects.toThrow(/alterado|destino/);
  const linked=structuredClone(plan);linked.create[0].lines[0].gramsPerPiece='50';linked.create[0].lines[0].conversionNote='Inventada';linked.digest=await recipeCorrectionDigest(linked);
  await expect(applyRecipeCorrection(runtime,linked,{confirmDigest:linked.digest,jobName:linked.jobName})).rejects.toThrow(/equivalencia/);
});

test('reanuda un plan interrumpido después de crear, antes de archivar',async()=>{
  const {runtime,plan}=await setup(),kitchen=new KitchenService(runtime.repository,{actor:{uid:'interrupted',name:'Interrumpido',role:'admin'}});
  await kitchen.saveRecipe(plan.create[0]);
  const result=await applyRecipeCorrection(runtime,plan,{confirmDigest:plan.digest,jobName:plan.jobName});
  expect(result).toMatchObject({visibleRecipes:1,totalRecipeRecords:2,created:0,archived:1});
});
