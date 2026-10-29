import { readFile } from 'node:fs/promises';

// Only non-secret deployment configuration. The same validation/approval gates
// still run before SDK initialization, whether mounted or provided by Cloud Run.
export async function readRuntimeConfiguration(env=process.env) {
  const path=env.FORX_CONFIG_PATH,inline=env.FORX_CONFIG_JSON;
  if(Boolean(path)===Boolean(inline))throw new Error('Define exactamente una configuración de FORX, por archivo o JSON.');
  const source=inline || await readFile(path,'utf8');
  if(Buffer.byteLength(source)>65536)throw new Error('Configuración demasiado grande.');
  return JSON.parse(source);
}
