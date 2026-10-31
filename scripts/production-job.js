import { readFile, stat } from 'node:fs/promises';
import { createCloudRuntime } from '../src/server/cloud-runtime.js';
import { OriginalRetention } from '../src/server/original-retention.js';
import { createServerBackup, restoreServerBackup } from '../src/server/server-backups.js';
import { initializeEmptyInstance } from '../src/server/initialize-instance.js';
import { runScheduledMaintenance } from '../src/server/scheduled-maintenance.js';
import { GenerationTextRetention } from '../src/server/generation-text-retention.js';
import { initializeFromBackup } from '../src/server/initialize-from-backup.js';
import { readRuntimeConfiguration } from '../src/server/runtime-config-input.js';
import { applyRecipeCorrection } from '../src/server/recipe-correction.js';

async function main() {
const [job,...args]=process.argv.slice(2),flag=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
if(!['initialize','initialize-from-backup','backup','retention-preview','retention-apply','generation-text-preview','generation-text-apply',
  'restore','scheduled-backup','scheduled-retention','scheduled-generation-text','recipe-correction'].includes(job))throw new Error('Trabajo no permitido.');
const readJson=async path=>{if(!path||(await stat(path)).size>64*1024*1024)throw new Error('Archivo requerido de hasta 64 MB.');return JSON.parse(await readFile(path,'utf8'));};
const raw=await readRuntimeConfiguration();
const runtime=await createCloudRuntime(raw,{allowUninitialized:['initialize','initialize-from-backup','restore'].includes(job),connectRecipeAI:false});
try {
  let result;
  if(job==='initialize')result=await initializeEmptyInstance(runtime,{adminUid:flag('--admin'),confirmTarget:flag('--confirm')});
  if(job==='initialize-from-backup') {
    const path=flag('--backup');let source;
    if(path===`gs://${runtime.config.backupsBucket}/bootstrap/initial-data.json`) {
      const file=runtime.backupsBucket.file('bootstrap/initial-data.json');
      const metadata=(await file.getMetadata())[0];
      if(!/^\d+$/.test(String(metadata.generation))||Number(metadata.size)>64*1024*1024)throw new Error('Respaldo de carga inválido.');
      source=(await runtime.backupsBucket.file('bootstrap/initial-data.json',{generation:metadata.generation}).download())[0].toString('utf8');
    } else {
      if(!path||path.startsWith('gs:')||(await stat(path)).size>64*1024*1024)throw new Error('Respaldo requerido de hasta 64 MB en el destino autorizado.');
      source=await readFile(path,'utf8');
    }
    result=await initializeFromBackup(runtime,source,{adminUid:flag('--admin'),confirmTarget:flag('--confirm'),confirmChecksum:flag('--checksum')});
  }
  if(job==='backup')result=await createServerBackup(runtime);
  if(job==='retention-preview')result=await new OriginalRetention(runtime).preview();
  if(job==='retention-apply')result=await new OriginalRetention(runtime).apply(await readJson(flag('--plan')),{confirmDigest:flag('--confirm')});
  if(job==='generation-text-preview')result=await new GenerationTextRetention(runtime).preview();
  if(job==='generation-text-apply')result=await new GenerationTextRetention(runtime).apply(await readJson(flag('--plan')),{confirmDigest:flag('--confirm')});
  if(job==='restore')result=await restoreServerBackup(runtime,await readJson(flag('--backup')),{confirmChecksum:flag('--confirm')});
  if(job==='recipe-correction'){
    const planPath=flag('--plan'),encoded=process.env.FORX_RECIPE_CORRECTION_BASE64;let source;
    if(planPath==='env'){
      if(!encoded||encoded.length>90000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Plan privado codificado requerido.');
      const bytes=Buffer.from(encoded,'base64');
      if(bytes.length>65536||bytes.toString('base64')!==encoded)throw new Error('Plan privado codificado inválido.');
      source=bytes.toString('utf8');
    }else{
      const prefix=`gs://${runtime.config.backupsBucket}/corrections/`;
      if(!planPath?.startsWith(prefix)||!planPath.endsWith('.json'))throw new Error('Plan privado de corrección requerido en el bucket autorizado.');
      const objectPath=planPath.slice(`gs://${runtime.config.backupsBucket}/`.length),file=runtime.backupsBucket.file(objectPath);
      const metadata=(await file.getMetadata())[0];
      if(!/^\d+$/.test(String(metadata.generation))||Number(metadata.size)>65536)throw new Error('Plan de corrección inválido.');
      source=(await runtime.backupsBucket.file(objectPath,{generation:metadata.generation}).download())[0].toString('utf8');
    }
    result=await applyRecipeCorrection(runtime,JSON.parse(source),{confirmDigest:flag('--confirm')});
  }
  if(job==='scheduled-backup'||job==='scheduled-retention'||job==='scheduled-generation-text')result=await runScheduledMaintenance(runtime,job.slice(10));
  console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
} catch(error) {
  console.error(JSON.stringify({event:'job.failed',job,message:'Trabajo incompleto. Conservar plan y registros privados; no repetir con otro destino.',
    ...(job==='recipe-correction'?{controlledReason:error?.message || 'Fallo sin detalle controlado.'}:{})}));process.exitCode=1;
} finally {await runtime.close();}
}
try {await main();}catch {console.error(JSON.stringify({event:'job.start_failed',message:'Trabajo no iniciado. Revisar configuración y aprobación sin modificar el destino.'}));process.exitCode=1;}
