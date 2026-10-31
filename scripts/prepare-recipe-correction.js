import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {planLegacyRecipeImport} from '../src/domain/legacy-recipe-import.js';
import {RECIPE_CORRECTION_FORMAT,inspectRecipeCorrectionPlan,recipeCorrectionDigest} from '../src/server/recipe-correction.js';

const args=process.argv.slice(2),values=new Map(),lists=new Map();
for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!key?.startsWith('--')||value==null)throw new Error('Argumentos incompletos.');
  if(['--recover','--archive'].includes(key))lists.set(key,[...(lists.get(key)||[]),value]);else if(values.has(key))throw new Error(`Argumento repetido: ${key}`);else values.set(key,value);}
const required=key=>{const value=values.get(key);if(!value)throw new Error(`Falta ${key}.`);return value;};
const currentPath=required('--current'),legacyPath=required('--legacy'),output=path.resolve(required('--out'));
const [projectId,databaseId]=required('--target').split('/');
if(!projectId||!databaseId)throw new Error('Usa --target proyecto/base.');
const legacy=await readFile(legacyPath,'utf8'),artifact=JSON.parse(await readFile(currentPath,'utf8'));
const backup=artifact.backup||artifact,recipes=backup.collections?.recipes;
if(!Array.isArray(recipes)||!backup.checksum)throw new Error('El respaldo actual no es un artefacto de FORX.');
const sourceHash=createHash('sha256').update(legacy).digest('hex');
const imported=planLegacyRecipeImport(legacy,{existingRecipes:recipes,source:values.get('--source')||'nube',sourceHash});
const recoverNames=lists.get('--recover')||[],archiveNames=lists.get('--archive')||[];
if(!recoverNames.length||!archiveNames.length)throw new Error('Indica al menos un --recover y un --archive.');
const recoverSet=new Set(recoverNames),archiveSet=new Set(archiveNames);
const selected=imported.entries.filter(entry=>recoverSet.has(entry.name));
if(selected.length!==recoverSet.size||selected.some(entry=>entry.status!=='ready'))throw new Error('No todas las recetas seleccionadas están listas para recuperar.');
const create=selected.map(entry=>({...entry.recipe,
  lines:entry.recipe.lines.map((line,index)=>({...line,id:`legacy-${entry.originalId}-line-${index+1}`})),
  disposables:entry.recipe.disposables.map((line,index)=>({...line,id:`legacy-${entry.originalId}-disposable-${index+1}`}))}));
const archive=recipes.filter(recipe=>archiveSet.has(recipe.name)).map(recipe=>({id:recipe.id,expectedName:recipe.name,expectedCode:recipe.code,
  expectedRevision:recipe._revision,expectedStatus:'active'}));
if(archive.length!==archiveSet.size||archive.some(item=>!item.expectedRevision))throw new Error('No todas las recetas a retirar están activas y disponibles.');
const jobName=required('--job'),plan={format:RECIPE_CORRECTION_FORMAT,version:1,target:{projectId,databaseId},jobName,
  approvedBy:required('--approved-by'),reason:required('--reason'),beforeBackupChecksum:backup.checksum,
  expectedVisibleRecipes:Number(required('--visible')),archive,create};
plan.digest=await recipeCorrectionDigest(plan);
await inspectRecipeCorrectionPlan(plan,{config:{projectId,databaseId},jobName});
await writeFile(output,JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({output,digest:plan.digest,beforeBackupChecksum:plan.beforeBackupChecksum,archive:archive.map(x=>x.expectedName),create:create.map(x=>x.name)},null,2));
