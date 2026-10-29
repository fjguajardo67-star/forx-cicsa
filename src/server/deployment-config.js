import { recipeAIConfiguration } from './recipe-ai-configuration.js';
import { budgetReconciliationPolicy } from './recipe-budget-operator.js';

const fail = message => { throw new Error(`Configuración FORX: ${message}`); };
export function deploymentConfig(value, env = process.env) {
  if (!value || !['staging','production','recovery'].includes(value.environment)) fail('entorno explícito requerido.');
  if (!/^forx-v2-[a-z0-9-]{2,22}$/.test(value.projectId || '')) fail('requiere un proyecto exclusivo con prefijo forx-v2-.');
  if (['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'].some(key => env[key] && env[key] !== value.projectId)) fail('el proyecto del entorno no coincide.');
  if (Object.keys(env).some(key => /EMULATOR|STORAGE_EMULATOR_HOST/.test(key) && env[key])) fail('no mezclar emuladores con arranque cloud.');
  if (!/^forx-(staging|production|recovery)-[a-z0-9-]{2,40}$/.test(value.databaseId || '') || !value.databaseId.startsWith(`forx-${value.environment}-`)) fail('base con nombre propio del entorno requerida; no se admite (default).');
  for (const key of ['originalsBucket','backupsBucket']) if (!/^forx-v2-[a-z0-9.-]{3,54}$/.test(value[key] || '')) fail(`bucket exclusivo requerido: ${key}.`);
  if (value.originalsBucket === value.backupsBucket) fail('originales y respaldos deben usar buckets separados.');
  if (!Array.isArray(value.origins) || !value.origins.length || value.origins.length > 5) fail('define los orígenes permitidos.');
  for (const origin of value.origins) {
    let url; try { url = new URL(origin); } catch { fail('origen inválido.'); }
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || /localhost|127\.0\.0\.1/.test(url.hostname)) fail('origen HTTPS exacto requerido, sin ruta ni comodines.');
  }
  if (value.apiOrigin != null) {
    let url; try { url = new URL(value.apiOrigin); } catch { fail('origen de API inválido.'); }
    if (url.protocol !== 'https:' || url.origin !== value.apiOrigin || url.username || url.password
      || /localhost|127\.0\.0\.1/.test(url.hostname)) fail('origen HTTPS exacto de API requerido.');
  }
  const limits = value.limits;
  for (const [key,min,max] of [['perUserMinute',1,300],['globalMinute',1,3000],['concurrentPerProcess',1,8]])
    if (!Number.isSafeInteger(limits?.[key]) || limits[key] < min || limits[key] > max) fail(`límite inválido: ${key}.`);
  if (!['password','google.com'].includes(value.signInProvider)) fail('proveedor de acceso explícito requerido.');
  const maintenance={retentionEnabled:false,backupsEnabled:false,generationTextRetentionEnabled:false,...value.maintenance};
  if(typeof maintenance.retentionEnabled!=='boolean'||typeof maintenance.backupsEnabled!=='boolean'
    ||typeof maintenance.generationTextRetentionEnabled!=='boolean')fail('activación de tareas inválida.');
  if((maintenance.retentionEnabled||maintenance.backupsEnabled||maintenance.generationTextRetentionEnabled)
    && (!maintenance.approvedBy || !Number.isFinite(Date.parse(maintenance.approvedAt))))
    fail('las tareas programadas necesitan aprobación explícita registrada.');
  return Object.freeze({ environment:value.environment, projectId:value.projectId, databaseId:value.databaseId,
    originalsBucket:value.originalsBucket, backupsBucket:value.backupsBucket, origins:[...value.origins],
    apiOrigin:value.apiOrigin || null,
    signInProvider:value.signInProvider, limits:{...limits},maintenance,
    adminRecovery:value.adminRecovery ? {...value.adminRecovery} : {enabled:false},
    recipeBudgetReconciliation:budgetReconciliationPolicy(value.recipeBudgetReconciliation),
    recipeGeneration:recipeAIConfiguration(value.recipeGeneration) });
}

export function requireCloudApproval(config, env = process.env) {
  // No credential discovery, SDK initialization or network before both gates.
  if (env.FORX_ENABLE_CLOUD !== 'true' || env.FORX_APPROVED_TARGET !== `${config.projectId}/${config.databaseId}`)
    fail('activación y destino aprobado requeridos; el modo de comprobación no conecta servicios.');
  if(env.GOOGLE_APPLICATION_CREDENTIALS || !(env.K_SERVICE || env.CLOUD_RUN_JOB))
    fail('requiere identidad administrada del servicio/trabajo, nunca credenciales descubiertas en el equipo.');
}

export function assertInstance(instance, config, state = 'ready') {
  if (!instance || instance.application !== 'forx-v2' || instance.projectId !== config.projectId
    || instance.databaseId !== config.databaseId || instance.environment !== config.environment || instance.state !== state)
    throw new Error('Instancia no inicializada, en mantenimiento o ajena a este entorno.');
}

export function assertBucketPolicy(metadata, config, kind) {
  if (metadata.name !== config[kind === 'originals' ? 'originalsBucket' : 'backupsBucket']
    || metadata.labels?.forx_application !== 'forx-v2' || metadata.labels?.forx_environment !== config.environment
    || metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
    || metadata.iamConfiguration?.publicAccessPrevention !== 'enforced') throw new Error('Bucket sin identidad exclusiva o protección privada requerida.');
  if (kind === 'originals' && (metadata.versioning?.enabled || metadata.retentionPolicy
    || Number(metadata.softDeletePolicy?.retentionDurationSeconds || 0) !== 0 || metadata.defaultEventBasedHold))
    throw new Error('La política del bucket prolongaría la retención de XML; requiere revisión antes de operar.');
}
