import { readFile } from 'node:fs/promises';
import { deploymentConfig } from '../src/server/deployment-config.js';
import { createCloudRuntime } from '../src/server/cloud-runtime.js';
import { createProductionServer } from '../src/server/production-http.js';

async function main() {
const path=process.env.FORX_CONFIG_PATH;
if(!path)throw new Error('Define FORX_CONFIG_PATH; no hay destino cloud predeterminado.');
const raw=JSON.parse(await readFile(path,'utf8')),config=deploymentConfig(raw);
if(process.argv.includes('--check'))console.log(JSON.stringify({valid:true,environment:config.environment,network:false,activation:false}));
else {
  const port=Number(process.env.PORT || 8080);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Puerto inválido.');
  const runtime=await createCloudRuntime(raw),server=createProductionServer(runtime);
  server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({event:'server.started',environment:config.environment})));
  const stop=()=>server.close(async()=>{await runtime.close();process.exit(0);});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
}
try {await main();}catch {console.error(JSON.stringify({event:'server.start_failed',message:'Revisar configuración, aprobación, identidad administrada y estado privado de la instancia.'}));process.exitCode=1;}
