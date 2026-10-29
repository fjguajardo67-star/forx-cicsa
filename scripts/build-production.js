import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { clientConfig } from '../src/data/client-config.js';

try {
  if (!process.versions.node.startsWith('24.')) throw new Error('Requiere Node 24.');
  const path=process.env.FORX_CLIENT_CONFIG_PATH;
  const raw=JSON.parse(path?await readFile(path,'utf8'):process.env.FORX_PUBLIC_CONFIG || 'null');
  const config=clientConfig(JSON.stringify(raw),new URL(raw.appOrigin));
  if(config.environment!=='production'||config.appOrigin!=='https://menu-cicsa.cicsacomedores.com.mx') throw new Error('Destino de publicación incorrecto.');
  execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,VITE_FORX_PUBLIC_CONFIG:JSON.stringify(raw)}});
  await writeFile('dist/CNAME','menu-cicsa.cicsacomedores.com.mx\n');
} catch {
  console.error('No se creó un artefacto publicable. Revisa Node 24 y la configuración pública de producción; no incluyas secretos.');
  process.exitCode=1;
}
