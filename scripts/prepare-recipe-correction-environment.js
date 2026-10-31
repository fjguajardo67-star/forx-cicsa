import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {inspectRecipeCorrectionPlan} from '../src/server/recipe-correction.js';

const [planPath,runtimePath,outputPath]=process.argv.slice(2);
if(!planPath||!runtimePath||!outputPath)throw new Error('Uso: prepare-recipe-correction-environment.js PLAN RUNTIME_ENV SALIDA_NUEVA');
const planSource=await readFile(planPath,'utf8'),plan=JSON.parse(planSource),runtime=JSON.parse(await readFile(runtimePath,'utf8'));
const raw=JSON.parse(runtime.FORX_CONFIG_JSON||'null');
await inspectRecipeCorrectionPlan(plan,{config:raw,jobName:plan.jobName});
const allowed=['FORX_CONFIG_JSON','FORX_ENABLE_CLOUD','FORX_APPROVED_TARGET'];
if(Object.keys(runtime).some(key=>!allowed.includes(key))||allowed.some(key=>typeof runtime[key]!=='string'))throw new Error('El entorno base contiene claves inesperadas.');
const output={...runtime,FORX_RECIPE_CORRECTION_BASE64:Buffer.from(planSource).toString('base64')};
const target=path.resolve(outputPath);await writeFile(target,JSON.stringify(output,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({output:target,digest:plan.digest,encodedBytes:output.FORX_RECIPE_CORRECTION_BASE64.length},null,2));
