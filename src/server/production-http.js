import { createServer } from 'node:http';
import { executePantryCommand } from './pantry-commands.js';
import { RequestLimits } from './request-limits.js';
import { withOperationDeadline, assertOperationActive } from './operation-deadline.js';

const messages={400:'Solicitud inválida. Revisa los datos antes de repetir.',401:'Inicia sesión nuevamente.',403:'No tienes permiso para esta operación.',404:'Ruta no disponible.',405:'Método no permitido.',409:'El registro cambió o la operación entra en conflicto. Recarga y revisa.',413:'El lote supera el tamaño permitido.',415:'Se requiere JSON.',429:'Se alcanzó un límite temporal. Espera un minuto.',500:'No se pudo completar la operación. Conserva el identificador para revisión.',503:'Servicio en mantenimiento o no disponible.'};
const routes=new Set(['/commands','/identity','/access/list','/access/lookup','/access/update']);
export function createProductionServer(runtime,{log=entry=>console.log(JSON.stringify(entry)),limits=new RequestLimits(runtime.db,runtime.config.limits),operationTimeoutMs=110000}={}) {
  if (runtime.config.environment==='recovery') throw new Error('Una recuperación no puede iniciar el API público.');
  if (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs < 1 || operationTimeoutMs > 300000) throw new Error('Plazo de operación inválido.');
  let inFlight=0,preauthMinute=-1,preauthCount=0;
  const server=createServer(async(req,res)=>{
    const requestId=crypto.randomUUID(),started=Date.now();let acquired=false,workStarted=false,status=200;
    const route=routes.has(req.url)?req.url:'unknown';
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Request-Id',requestId);res.setHeader('Vary','Origin');
    const finish=()=>{try{log({event:status>=500?'server.error':status===429?'server.limit':'server.request',requestId,route,status,durationMs:Date.now()-started});}catch{/* logging cannot break request completion */}};
    try {
      if (req.url==='/health' && req.method==='GET') { res.end(JSON.stringify({ok:true}));return; }
      if (!runtime.config.origins.includes(req.headers.origin)) throw {status:403};
      res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
      if (!routes.has(req.url)) throw {status:404}; // /session is deliberately absent.
      if (req.method==='OPTIONS') {status=204;res.writeHead(status);res.end();return;}
      if (req.method!=='POST') throw {status:405};
      const minute=Math.floor(Date.now()/60000);if(minute!==preauthMinute){preauthMinute=minute;preauthCount=0;}
      if (++preauthCount>runtime.config.limits.globalMinute*2 || inFlight>=runtime.config.limits.concurrentPerProcess) throw {status:429};
      acquired=true;inFlight++;
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw {status:415};
      const bearer=(req.headers.authorization || '').match(/^Bearer ([^\s]{1,8192})$/)?.[1];
      if (!bearer) throw {status:401};
      workStarted=true;
      const result=await withOperationDeadline(async signal=>{
      const auth=await runtime.access.authenticate(bearer);
      assertOperationActive(signal);
      await limits.reserve(auth.uid);
      try {await runtime.assertReady();}catch{throw {status:503};}
      assertOperationActive(signal);
      const maxBytes=req.url==='/commands'?64*1024*1024:16*1024;
      if (Number(req.headers['content-length'] || 0)>maxBytes) throw {status:413};
      const chunks=[];let size=0;
      for await(const chunk of req){assertOperationActive(signal);size+=chunk.length;if(size>maxBytes)throw {status:413};chunks.push(chunk);}
      assertOperationActive(signal);
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw {status:400};}
      let result;
      if(req.url==='/identity')result=auth.actor;
      else if(req.url==='/access/list')result=await runtime.access.list(auth.actor);
      else if(req.url==='/access/lookup')result=await runtime.access.lookup(auth.actor,input);
      else if(req.url==='/access/update')result=await runtime.access.update(auth.actor,input);
      else {
        if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['command','input'].includes(key)) || typeof input.command!=='string') throw {status:400};
        if(input.command!=='importXML' && size>2*1024*1024)throw {status:413};
        try {result=await executePantryCommand(runtime.repository,auth,input,{generationProvider:runtime.generationProvider,
          generationBudgetPolicy:runtime.generationBudgetPolicy,signal});}
        catch(error) {
          if(error.code==='permission-denied')throw {status:403};
          if(error.code==='invalid-argument')throw {status:400};
          if(error.name==='ConcurrentEditError')throw {status:409};
          // Plain domain validation errors are safe to classify, never echo their text.
          if(error.constructor===Error && !error.code)throw {status:400};
          throw error;
        }
      }
      return result;
      },{timeoutMs:operationTimeoutMs,onSettled:()=>{inFlight--;}});
      res.end(JSON.stringify({result,requestId}));
    } catch(error) {
      status=Object.hasOwn(messages,error?.status)?error.status:500;
      if(status===429)res.setHeader('Retry-After','60');
      res.writeHead(status);res.end(JSON.stringify({error:messages[status],requestId}));
    } finally {if(acquired&&!workStarted)inFlight--;finish();}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
  return server;
}
