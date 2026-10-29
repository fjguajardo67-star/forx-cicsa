import { createServer } from 'node:http';
import { executePantryCommand } from './pantry-commands.js';

const MAX_BYTES=64*1024*1024;
export function createLocalCommandServer(runtime,{origin='http://127.0.0.1:4174',demoSession,generationProvider,generationLimits}={}) {
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    if(req.headers.origin!==origin){res.writeHead(403);res.end(JSON.stringify({error:'Origen no autorizado.'}));return;}
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    try {
      if(req.method!=='POST')throw Object.assign(new Error('Solo POST.'),{status:405});
      if(req.url==='/session'&&demoSession){res.end(JSON.stringify(await demoSession()));return;}
      if(req.url!=='/commands')throw Object.assign(new Error('Ruta no disponible.'),{status:404});
      const token=(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
      if(!token)throw Object.assign(new Error('Falta sesión.'),{status:401});
      let decoded;try{decoded=await runtime.auth.verifyIdToken(token,true);}catch{throw Object.assign(new Error('Sesión inválida o vencida.'),{status:401});}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES)throw Object.assign(new Error('La solicitud supera 64 MB. Divide este lote en cargas menores.'),{status:413});chunks.push(chunk);}
      let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('Solicitud JSON inválida.');}
      const result=await executePantryCommand(runtime.repository,{uid:decoded.uid,token:decoded},request,{generationProvider,generationLimits});
      res.end(JSON.stringify({result}));
    }catch(error){res.writeHead(error.status || (error.code==='permission-denied'?403:error.name==='ConcurrentEditError'?409:400));res.end(JSON.stringify({error:error.message}));}
  });
}
