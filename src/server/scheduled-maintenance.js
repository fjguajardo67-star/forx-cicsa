import { OriginalRetention } from './original-retention.js';
import { createServerBackup } from './server-backups.js';
import { GenerationTextRetention } from './generation-text-retention.js';

// Entry for a private managed job. Nothing registers a scheduler or activates
// billing. Frequency, permissions and alert routing belong to approved deployment.
export async function runScheduledMaintenance(runtime,kind,{log=entry=>console.log(JSON.stringify(entry))}={}) {
  const policy=runtime.config.maintenance;
  const flag={retention:'retentionEnabled',backup:'backupsEnabled','generation-text':'generationTextRetentionEnabled'}[kind];
  if(!flag || !policy?.[flag]
    || !policy.approvedBy || !Number.isFinite(Date.parse(policy.approvedAt)))throw new Error('Tarea programada no aprobada ni activada.');
  if(runtime.config.environment==='recovery')throw new Error('No se ejecutan tareas programadas en una recuperación.');
  const runId=crypto.randomUUID(),record=runtime.db.collection('_forx_jobs').doc(`scheduled_${runId}`),startedAt=new Date().toISOString();
  await runtime.assertReady();
  await record.set({kind:`scheduled_${kind}`,state:'running',startedAt,approvedBy:policy.approvedBy});
  try {
    let result;
    if(kind==='backup')result=await createServerBackup(runtime);
    else if(kind==='generation-text') {
      const worker=new GenerationTextRetention(runtime),plan=await worker.preview();
      result=await worker.apply(plan,{confirmDigest:plan.digest});
      if(result.failed || result.changed)throw new Error('Hay solicitudes que requieren nueva vista previa.');
    } else {
      const worker=new OriginalRetention(runtime),plan=await worker.preview();
      result=await worker.apply(plan,{confirmDigest:plan.digest});
      if(result.failed || plan.skipped.length)throw new Error('Hay objetos que requieren revisión.');
    }
    await record.set({kind:`scheduled_${kind}`,state:'done',startedAt,finishedAt:new Date().toISOString(),result});
    log({event:'job.completed',kind,runId});return {runId,...result};
  } catch {
    await record.set({kind:`scheduled_${kind}`,state:'failed',startedAt,finishedAt:new Date().toISOString()});
    log({event:'job.failed',kind,runId});throw new Error(`La tarea no terminó; referencia ${runId}.`);
  }
}
