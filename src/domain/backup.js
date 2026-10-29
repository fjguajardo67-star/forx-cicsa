import { COLLECTIONS } from '../data/entity-repository.js';
import { validateRule } from './classification-rules.js';
import { validateRecipe } from './recipes.js';
import { IMPORT_POLICY_ID, latestAcceptedPeriod } from './import-policy.js';
import { catalogPrices } from './prices.js';
import { originalExpiresAt } from './retention.js';
import { GENERATION_COLLECTIONS, exactKeys, validateGenerationInput, RECIPE_PROMPT_VERSION } from './recipe-proposal.js';
import { budgetQuota, readNanoUSD, validateRequestBudget } from './recipe-budget.js';
import { eraseGenerationText } from './generation-text-retention.js';

export const BACKUP_FORMAT = 'forx-derived-backup';
export const BACKUP_MAX_BYTES = 64 * 1024 * 1024;
const fail = message => { throw new Error(`Respaldo inválido: ${message}`); };
const text = value => typeof value === 'string' && value.length > 0;
const date = value => text(value) && Number.isFinite(Date.parse(value));
const safeId = value => text(value) && /^[A-Za-z0-9_.:%-]+$/.test(value);
// Name-index IDs are URI encoded; encodeURIComponent intentionally keeps these
// extra punctuation marks. They never become element IDs in the UI.
const safeIndex = value => text(value) && /^[A-Za-z0-9_.:%!~*'()-]+$/.test(value);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function backupDigest(payload) {
  const bytes = new TextEncoder().encode(canonical(payload));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function exportBackup(repository, { now = new Date().toISOString() } = {}) {
  const collections = await repository.exportSnapshot();
  // Never embed XML bytes or reusable storage paths in long-lived backups.
  collections.originals = collections.originals.map(({ bytes, path, ...record }) => ({ ...record, bytes: null, path: null,
    status: record.status === 'expired' ? 'expired' : 'not_included' }));
  // A long-lived backup must not extend the 30-day life of intermediate AI
  // text. Saved recipes and the budget/quota ledger remain in their collections.
  collections.generation_requests = collections.generation_requests.map(record => eraseGenerationText(record, now));
  const payload = { format: BACKUP_FORMAT, version: 3, createdAt: now, originalsPolicy: 'metadata_only',
    generationTextPolicy: 'excluded', collections };
  // JSON round-trip normalizes optional/undefined fields before checksumming.
  const clean = JSON.parse(JSON.stringify(payload));
  const result = { ...clean, checksum: await backupDigest(clean) };
  await inspectBackup(JSON.stringify(result));
  return result;
}

export async function inspectBackup(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > BACKUP_MAX_BYTES) fail('el límite es 64 MB.');
  let backup;
  try { backup = JSON.parse(source, (key, value) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('contiene una clave no permitida.');
    return value;
  }); } catch { fail('el archivo no es JSON válido.'); }
  if (!backup || backup.format !== BACKUP_FORMAT || ![1,2,3].includes(backup.version) || backup.originalsPolicy !== 'metadata_only' || !date(backup.createdAt)
    || (backup.version === 3 ? backup.generationTextPolicy !== 'excluded' : backup.generationTextPolicy != null))
    fail('formato o versión no compatible. Usa el respaldo completo de Administración.');
  const { checksum, ...payload } = backup;
  if (!/^[a-f0-9]{64}$/.test(checksum || '') || await backupDigest(payload) !== checksum) fail('la suma de integridad no coincide. Vuelve a descargar el archivo.');
  const expected=backup.version===1?COLLECTIONS.filter(c=>!GENERATION_COLLECTIONS.includes(c)):COLLECTIONS;
  if (!backup.collections || Object.keys(backup.collections).length !== expected.length || Object.keys(backup.collections).some(c => !expected.includes(c))) fail('colecciones incompletas o desconocidas.');
  // Normalize only the newly restored copy, never modify an old backup/checksum.
  const data=structuredClone(backup.collections);
  if(backup.version===1)for(const name of GENERATION_COLLECTIONS)data[name]=[];
  const indexes = {}, counts = {}; let total = 0;
  for (const name of COLLECTIONS) {
    if (!Array.isArray(data[name])) fail(`colección ${name}.`);
    counts[name] = data[name].length; total += counts[name];
    if (total > 100000) fail('supera 100000 registros.');
    indexes[name] = new Map();
    for (const record of data[name]) {
      if (!record || !(name === 'recipe_names' ? safeIndex(record.id) : safeId(record.id)) || record.id.length > 2000 || !Number.isSafeInteger(record._revision) || record._revision < 1 || indexes[name].has(record.id)) fail(`identidad o revisión en ${name}.`);
      indexes[name].set(record.id, record);
    }
  }
  const ref = (name, id, optional = false) => {
    if (optional && id == null) return;
    if (!text(id) || !indexes[name].has(id)) fail(`referencia a ${name} inexistente.`);
  };
  for (const c of data.categories) if (!text(c.name) || !['culinary', 'non_culinary', 'pending'].includes(c.type) || typeof c.active !== 'boolean') fail('categoría.');
  for (const i of data.ingredients) {
    ref('categories', i.categoryId);
    if (!text(i.canonicalName) || !Array.isArray(i.aliases) || i.aliases.some(a => !text(a)) || !['kg', 'l', 'pz'].includes(i.baseUnit) || !['active', 'merged', 'archived'].includes(i.status) || !Number.isFinite(Number(i.wastePct)) || Number(i.wastePct) < 0 || Number(i.wastePct) >= 100) fail('ingrediente.');
  }
  for (const k of data.ingredient_keys) ref('ingredients', k.ingredientId);
  for (const p of data.products) { ref('categories', p.categoryId); ref('ingredients', p.ingredientId, true); if (!text(p.preferredDescription) || !text(p.supplierId)) fail('producto.'); }
  for (const o of data.originals) if (o.bytes != null || o.path != null || !['expired', 'not_included'].includes(o.status) || !date(o.uploadedAt) || o.expiresAt !== originalExpiresAt(o.uploadedAt)) fail('original: no se admiten bytes, rutas ni plazos alterados.');
  for (const i of data.imports) { ref('batches', i.batchId); ref('originals', i.originalId, true); ref('imports', i.canonicalImportId, true); if (!text(i.filename) || !date(i.uploadedAt)) fail('importación.'); }
  for (const k of data.import_keys) { ref('imports', k.importId); ref('originals', k.originalId, true); }
  for (const c of data.import_concepts) { ref('imports', c.importId); if (!c.original) fail('concepto.'); }
  for (const e of data.purchase_events) { ref('imports', e.importId); if (!e.original || !text(e.original.descripcion_original) || !safeId(e.productId) || !date(e.observedAt)) fail('evento de compra.'); }
  for (const o of data.price_observations) { ref('ingredients', o.ingredientId); ref('products', o.productId, true); ref('purchase_events', o.eventId, true); ref('imports', o.importId, true); if (!date(o.observedAt) || !date(o.reviewedAt) || !Number.isFinite(Number(o.normalizedPrice)) || Number(o.normalizedPrice) <= 0) fail('observación de precio.'); }
  for (const r of data.reviews) { ref('purchase_events', r.eventId); ref('price_observations', r.observationId, true); if (!['pending', 'validated', 'excluded', 'archived'].includes(r.status)) fail('revisión.'); }
  for (const r of data.recipes) {
    validateRecipe(r);
    for (const line of [...r.lines, ...(r.disposables || [])]) ref('ingredients', line.ingredientId, true);
    if(r.generation)ref('generation_requests',r.generation.requestId);
  }
  for (const k of data.recipe_names) ref('recipes', k.recipeId, true);
  for (const v of data.recipe_versions) { ref('recipes', v.recipe?.id); if (!Number.isInteger(v.version) || v.version < 1) fail('versión de receta.'); validateRecipe(v.recipe); }
  for (const menu of data.menus) {
    if (!text(menu.name) || !date(menu.startDate) || !Array.isArray(menu.days) || !menu.days.length || !Number.isFinite(Number(menu.diners)) || Number(menu.diners) <= 0) fail('menú.');
    for (const day of menu.days) { if (!date(day.date) || !Array.isArray(day.slots)) fail('día del menú.'); for (const slot of day.slots) ref('recipes', slot.recipeId, true); }
  }
  for (const a of data.audit) if (!date(a.occurredAt) || !text(a.action) || !text(a.actorUid) || !text(a.reason)) fail('bitácora.');
  const expectedQuotas=new Map(), expectedBudget=new Map();
  for(const request of data.generation_requests) {
    exactKeys(request,['id','_revision','requestId','fingerprint','actorUid','mode','model','promptVersion','requestedAt','status','context','quotaIds','proposal','recipeId','error','finishedAt','budget','textErasedAt'],'Solicitud respaldada');
    if(!['simulated','openai'].includes(request.mode)||!text(request.model)||request.model.length>100||request.promptVersion!==RECIPE_PROMPT_VERSION||!date(request.requestedAt)||!text(request.actorUid)||!['pending','completed','failed','uncertain'].includes(request.status)||!/^[a-f0-9]{64}$/.test(request.fingerprint || ''))fail('solicitud de generación.');
    if (backup.version === 3) {
      if (request.context !== null || request.proposal !== null || !date(request.textErasedAt)) fail('texto de generación presente en respaldo duradero.');
    } else {
      if (request.textErasedAt != null) fail('formato antiguo con depuración incompatible.');
      exactKeys(request.context,['idea','type','protein','baseServings','restrictions','preferredIngredients'],'Contexto culinario');
      const {preferredIngredients,...culinary}=request.context;
      validateGenerationInput({...culinary,requestId:request.requestId,preferredIngredientIds:[]});
      if(!Array.isArray(preferredIngredients)||preferredIngredients.length>20)fail('ingredientes preferidos.');
      for(const ingredient of preferredIngredients){exactKeys(ingredient,['name','unit'],'Preferencia');if(!text(ingredient.name)||ingredient.name.length>180||!['kg','l','pz'].includes(ingredient.unit))fail('preferencia culinaria.');}
    }
    const actorHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.actorUid)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const quotaIds=[`day_${request.requestedAt.slice(0,10)}_${actorHash}`,`month_${request.requestedAt.slice(0,7)}`,'concurrency'];
    if(JSON.stringify(request.quotaIds)!==JSON.stringify(quotaIds))fail('referencias de cuota.');
    for(const [index,id] of quotaIds.entries())expectedQuotas.set(id,(expectedQuotas.get(id)||0)+(index!==2||['pending','uncertain'].includes(request.status)?1:0));
    if(request.mode==='openai'){
      if(!request.budget)fail('solicitud OpenAI sin reserva.');
      try{validateRequestBudget(request.budget);}catch{fail('reserva OpenAI inconsistente.');}
      const settlement=request.budget.settlement;
      if((settlement==='held'&&!['pending','uncertain'].includes(request.status))
        ||(settlement!=='held'&&!['completed','failed'].includes(request.status)))fail('estado de reserva inconsistente.');
      if(request.status==='completed'&&(readNanoUSD(request.budget.estimatedNanoUSD)>readNanoUSD(request.budget.reservedNanoUSD)
        ||request.budget.usage.inputTokens>request.budget.maxInputTokens
        ||request.budget.usage.outputTokens>request.budget.maxOutputTokens))fail('propuesta con consumo fuera de límites.');
      for(const id of quotaIds.slice(0,2)){
        const prior=expectedBudget.get(id)||{held:0n,estimated:0n};
        if(settlement==='held')prior.held+=readNanoUSD(request.budget.reservedNanoUSD);
        if(settlement==='estimated')prior.estimated+=readNanoUSD(request.budget.estimatedNanoUSD);
        expectedBudget.set(id,prior);
      }
    }else if(request.budget!=null)fail('el simulador no consume presupuesto OpenAI.');
    if(request.status==='completed' && backup.version !== 3){
      exactKeys(request.proposal,['recipe','adaptations','warnings'],'Propuesta respaldada');
      validateRecipe(request.proposal.recipe);
      if(request.proposal.recipe.status!=='draft'||request.proposal.recipe.lines.some(l=>l.ingredientId||l.gramsPerPiece||l.yieldFactor!=='1'))fail('propuesta con vínculo o equivalencia automática.');
      for(const key of ['adaptations','warnings'])if(!Array.isArray(request.proposal[key])||request.proposal[key].some(s=>typeof s!=='string'||s.length>1200))fail('advertencias de propuesta.');
    } else if(request.proposal!=null)fail('propuesta no completada.');
    ref('recipes',request.recipeId,true);
  }
  if(data.generation_quotas.length!==expectedQuotas.size)fail('cuotas incompletas.');
  for(const quota of data.generation_quotas){
    exactKeys(quota,['id','_revision','count','updatedAt','budget'],'Cuota');
    if(!Number.isSafeInteger(quota.count)||quota.count<0||!date(quota.updatedAt)||expectedQuotas.get(quota.id)!==quota.count)fail('cuota inconsistente.');
    const expected=expectedBudget.get(quota.id);
    if(expected){
      if(!quota.budget)fail('saldo monetario incompleto.');
      try{budgetQuota(quota.budget);}catch{fail('saldo monetario inválido.');}
      if(readNanoUSD(quota.budget.heldNanoUSD)!==expected.held||readNanoUSD(quota.budget.estimatedNanoUSD)!==expected.estimated)fail('saldo monetario inconsistente.');
    }else if(quota.budget!=null)fail('saldo monetario sin solicitudes.');
  }
  if (indexes.settings.get('catalog')?.originalRetentionMonths !== 2) fail('política de retención.');
  for (const s of data.settings) {
    if (s.kind === 'classification_rule') { if (!s.id.startsWith('rule_')) fail('identidad de regla.'); validateRule(s, data.categories); }
    else if (!['catalog', 'kitchen', 'recipe_sequences', 'local_recovery', IMPORT_POLICY_ID].includes(s.id)) fail('configuración desconocida.');
    if (s.id===IMPORT_POLICY_ID && (s.mode!=='block_older_months' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.latestAcceptedPeriod || '') || s.latestAcceptedPeriod!==latestAcceptedPeriod(data.imports))) fail('corte mensual de XML inconsistente.');
    if (s.id === 'kitchen') {
      if (!Array.isArray(s.contractLines) || !Array.isArray(s.complements)) fail('configuración de cocina.');
      for (const line of s.complements) ref('ingredients', line.ingredientId, true);
    }
  }
  // Exercise the real price projection; never trust a cached cost in a file.
  catalogPrices(data);
  return { backup, collections:data, counts, total };
}
