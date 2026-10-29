import { test,expect } from 'vitest';
import { PantryService } from '../src/domain/pantry-service.js';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { IMPORT_POLICY_ID,latestAcceptedPeriod,invoicePeriod } from '../src/domain/import-policy.js';
import { purchaseXml,file } from './fixtures/monthly.js';
const xml=(day)=>purchaseXml({uuid:crypto.randomUUID().toUpperCase(),day});
async function setup(){const repo=new MemoryEntityRepository(),service=new PantryService(repo);await service.initialize();return {repo,service};}
const send=(service,content,period='2026-10')=>service.importFiles([file('compra.xml',content)],{period});

test('corte por mes real del XML: permite el mismo mes, bloquea anteriores y nunca confía en etiqueta',async()=>{
  const {repo,service}=await setup();
  await send(service,xml('2026-08-31'),'2026-10');
  expect((await service.snapshot()).importPolicy.latestAcceptedPeriod).toBe('2026-08');
  expect((await send(service,xml('2026-08-01'),'2026-10')).counts.accepted).toBe(1);
  const before=await repo.exportSnapshot();
  expect((await send(service,xml('2026-07-31'),'2026-12')).counts.blocked).toBe(1);
  const after=await repo.exportSnapshot();
  for(const name of ['purchase_events','originals','reviews','products','ingredients','price_observations','import_concepts','import_keys'])expect(after[name]).toEqual(before[name]);
  expect(after.imports.at(-1)).toMatchObject({status:'blocked',originalId:null,expiresAt:null,cutoffPeriod:'2026-08'});
  expect(after.audit.at(-2).action).toBe('import.blocked');
  await send(service,xml('2026-09-01'));
  expect((await send(service,xml('2026-08-29'))).counts.blocked).toBe(1);
});
test('duplicados y UUID conflictivos conservan su diagnóstico antes del bloqueo',async()=>{
  const {repo,service}=await setup(), august=xml('2026-08-01');
  await send(service,august);await send(service,xml('2026-09-01'));
  expect((await send(service,august)).counts.duplicate).toBe(1);
  expect((await send(service,august+'\n')).counts.conflict).toBe(1);
  expect(await repo.list('purchase_events')).toHaveLength(2);
  expect((await repo.get('settings',IMPORT_POLICY_ID)).latestAcceptedPeriod).toBe('2026-09');
});
test('fechas imposibles e ineligibles no adelantan el corte; continúa el lote',async()=>{
  const {service}=await setup();
  const batch=await service.importFiles([file('invalida.xml',xml('2028-02-30')),file('ineligible.xml',xml('2028-03-01').replace('TipoDeComprobante="I"','TipoDeComprobante="P"')),file('valida.xml',xml('2026-08-01'))],{period:'2028-03'});
  expect(batch.counts).toMatchObject({failed:1,ineligible:1,accepted:1});
  expect((await service.snapshot()).importPolicy.latestAcceptedPeriod).toBe('2026-08');
});
test('estado previo sin política: deriva de comprobantes aceptados, no reescribe sus datos',async()=>{
  const {repo,service}=await setup();await send(service,xml('2026-08-01'),'2026-10');
  // Synthetic fixture of a database created before this policy existed.
  repo.records.delete('settings/'+IMPORT_POLICY_ID);
  const before=await repo.exportSnapshot();
  expect((await send(service,xml('2026-07-01'))).counts.blocked).toBe(1);
  expect(await repo.list('purchase_events')).toEqual(before.purchase_events);
  expect((await service.snapshot()).importPolicy.latestAcceptedPeriod).toBe('2026-08');
  expect(latestAcceptedPeriod([{status:'failed',invoiceDate:'2027-01-01T00:00:00'},...before.imports])).toBe('2026-08');
  expect(invoicePeriod('2026-02-30T00:00:00')).toBeNull();
});
test('concurrencia: si otra carga adelanta el corte antes del commit, la antigua se reevalúa y bloquea',async()=>{
  const {repo,service}=await setup();const originalCommit=repo.commit.bind(repo);let interleaved=false;
  repo.commit=async operations=>{
    if(!interleaved && operations.some(o=>o.collection==='settings' && o.id===IMPORT_POLICY_ID && o.value.latestAcceptedPeriod==='2026-08')){
      interleaved=true;await send(new PantryService(repo),xml('2026-09-01'));
    }
    return originalCommit(operations);
  };
  expect((await send(service,xml('2026-08-01'))).counts.blocked).toBe(1);
  expect(await repo.list('purchase_events')).toHaveLength(1);
  expect((await repo.get('settings',IMPORT_POLICY_ID)).latestAcceptedPeriod).toBe('2026-09');
});
test('servidor ignora intentos de desactivar la política desde el cliente',async()=>{
  const {repo,service}=await setup();await send(service,xml('2026-09-01'));
  const result=await executePantryCommand(repo,{uid:'test',token:{forxActive:true,forxRole:'editor'}},{command:'importXML',input:{period:'2026-10',allowHistorical:true,cutoff:null,files:[file('pasado.xml',xml('2026-08-01'))]}});
  expect(result.counts.blocked).toBe(1);
});
