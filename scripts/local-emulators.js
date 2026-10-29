import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emulatorLaunch } from './emulator-launch.js';

const launch = emulatorLaunch(process.argv[2]);
console.log(`FORX: emuladores locales con temporales privados en ${launch.temporaryRoot}`);
const child = spawn(process.execPath, launch.args, { cwd: fileURLToPath(new URL('..', import.meta.url)), env: launch.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(`No se pudo iniciar el entorno local: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (code || signal) console.error(`FORX: proceso de emuladores terminado (${signal || code}). No vuelvas a cargar XML hasta revisar los servicios.`);
  process.exitCode = code ?? (signal ? 1 : 0);
});
// Do not recursively delete the temp root here. Firebase owns its own cleanup;
// keeping the root on abnormal exit avoids destroying possible recovery evidence.
