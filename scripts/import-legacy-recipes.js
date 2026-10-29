import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {planLegacyRecipeImport,applyLegacyRecipePlan,checkRecoveredMenu} from '../src/domain/legacy-recipe-import.js';
import {inspectBackup} from '../src/domain/backup.js';
import {validateRecipe} from '../src/domain/recipes.js';

// An explicitly local, authenticated maintenance tool. No SDK, cloud fallback,
// credentials discovery, emulator start/stop, XML calls or replacement mode.
const [mode,filename,output]=process.argv.slice(2);
if(!['preview','apply'].includes(mode)||!filename||(mode==='apply'&&!output))
  throw new Error('Uso: node scripts/import-legacy-recipes.js preview|apply respaldo.json [directorio-nuevo-fuera-del-repositorio]');
const endpoint='http://127.0.0.1:8788',origin='http://127.0.0.1:4174';
const json=await readFile(filename,'utf8'),sourceHash=createHash('sha256').update(json).digest('hex');
const response=await fetch(endpoint+'/session',{method:'POST',headers:{Origin:origin}});
if(!response.ok)throw new Error('No está disponible el servidor local. No se iniciarán ni reiniciarán servicios.');
const {token,actor}=await response.json();
const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
if(claims.aud!=='demo-forx-v2'||claims.iss!=='https://securetoken.google.com/demo-forx-v2'||actor.role!=='admin')
  throw new Error('Solo se permite la sesión administradora del emulador demo-forx-v2.');
async function command(command,input={}){
  if(!['kitchenSnapshot','exportBackup','saveRecipe'].includes(command))throw new Error('Comando fuera de alcance.');
  const r=await fetch(endpoint+'/commands',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({command,input})});
  const value=await r.json();if(!r.ok)throw new Error(value.error||'Falló el comando. No se reintentará una escritura automáticamente.');return value.result;
}
const state=await command('kitchenSnapshot');
const plan=planLegacyRecipeImport(json,{existingRecipes:state.recipes,sourceHash});
const planned=plan.entries.filter(e=>e.status==='ready').map((e,i)=>({...e.recipe,id:`preview_${i}`}));
const check=planned.length?checkRecoveredMenu(planned,state.catalog,state.settings):null;
console.log(JSON.stringify({mode,project:claims.aud,plan:plan.summary,menuCheck:check&&{days:check.days,slots:check.slots,violations:check.violations,warnings:check.warnings},pending:plan.entries.filter(e=>e.status==='pending').map(e=>({name:e.name,reason:e.reason,issues:e.issues}))},null,2));
if(check?.violations.length)throw new Error('Falló la comprobación del plan. No se guardará ninguna receta.');
if(mode==='apply'){
  const folder=path.resolve(output),repository=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
  if(folder===repository||folder.startsWith(repository+path.sep))throw new Error('Los respaldos privados deben guardarse fuera del repositorio servido por Vite.');
  await mkdir(folder,{recursive:false,mode:0o700});
  const save=(name,data)=>writeFile(path.join(folder,name),JSON.stringify(data,null,2),{flag:'wx',mode:0o600});
  const before=await command('exportBackup');await inspectBackup(JSON.stringify(before));
  await save('before.json',before);await save('plan.json',plan);
  // Every successful command leaves a durable receipt. A failed request stops
  // with before/plan/receipts intact; it never deletes or rolls back user data.
  const results=await applyLegacyRecipePlan(plan,{saveRecipe:recipe=>command('saveRecipe',recipe),onSaved:async receipt=>{
    await appendFile(path.join(folder,'receipts.jsonl'),JSON.stringify(receipt)+'\n',{mode:0o600});
  }});
  const after=await command('exportBackup');await inspectBackup(JSON.stringify(after));await save('after.json',after);
  const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const changed=[];
  for(const [collection,records] of Object.entries(before.collections)){
    const next=new Map(after.collections[collection].map(r=>[r.id,r]));
    for(const record of records){
      if(collection==='settings'&&record.id==='recipe_sequences')continue;
      if(canonical(next.get(record.id))!==canonical(record))changed.push(`${collection}/${record.id}`);
    }
    if(!['recipes','recipe_versions','recipe_names','audit','settings'].includes(collection)&&after.collections[collection].length!==records.length)
      changed.push(`${collection}: cantidad modificada`);
  }
  const newIds=new Set(results.map(r=>r.id)),savedRecipes=after.collections.recipes.filter(r=>newIds.has(r.id));
  const verification=checkRecoveredMenu(savedRecipes,state.catalog,state.settings);
  if(savedRecipes.length!==results.length)verification.violations.push('Faltan recibos de recetas guardadas.');
  for(const recipe of savedRecipes)if(recipe.salePrice!==null||recipe.baseServings!=='1'||[...recipe.lines,...recipe.disposables].some(l=>l.ingredientId||l.gramsPerPiece||l.yieldFactor!=='1'))
    verification.violations.push(`Receta alterada: ${recipe.name}`);
  const payloads=new Map(plan.entries.filter(e=>e.status==='ready').map(e=>[e.sourceKey,e.recipe]));
  for(const receipt of results){const saved=savedRecipes.find(r=>r.id===receipt.id);
    if(saved&&canonical(validateRecipe(saved))!==canonical(payloads.get(receipt.sourceKey)))verification.violations.push(`Contenido distinto del plan: ${receipt.name}`);
  }
  const report={sourceFile:path.basename(filename),sourceHash,plan:plan.summary,created:results.length,
    recipesBefore:before.collections.recipes.length,recipesAfter:after.collections.recipes.length,
    preservedExistingRecords:changed.length===0,changedExistingRecords:changed,
    createdRecipes:results,pending:plan.entries.filter(e=>e.status!=='ready'),menuCheck:verification};
  await save('result.json',report);
  console.log(JSON.stringify({created:report.created,recipesBefore:report.recipesBefore,recipesAfter:report.recipesAfter,preservedExistingRecords:report.preservedExistingRecords,menuViolations:verification.violations,backupDirectory:folder},null,2));
  if(changed.length||verification.violations.length)throw new Error('La verificación final requiere revisión. No se eliminaron registros ni se reintentó. Consulta result.json.');
}
