import { readFile, stat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentConfig } from '../src/server/deployment-config.js';
import { createCloudRuntime } from '../src/server/cloud-runtime.js';
import { AdminRecovery, requireRecoveryJob } from '../src/server/admin-recovery.js';

const readJson = async filename => {
  if (!filename || (await stat(filename)).size > 65536) throw new Error('Archivo privado requerido de hasta 64 KB.');
  return JSON.parse(await readFile(filename, 'utf8'));
};
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const permitted = { preview: ['--lost-uid', '--replacement-uid', '--reason', '--out'], apply: ['--plan', '--confirm'], status: ['--operation'], 'retry-revocations': ['--operation', '--confirm'] };
  if (!permitted[command] || args.length !== permitted[command].length * 2) throw new Error('Comando o argumentos inválidos.');
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!permitted[command].includes(args[i]) || flags[args[i]] || !args[i + 1]) throw new Error('Argumentos inválidos.');
    flags[args[i]] = args[i + 1];
  }
  const raw = await readJson(process.env.FORX_CONFIG_PATH), config = deploymentConfig(raw);
  // This gate precedes credential discovery and any SDK/network connection.
  requireRecoveryJob(config);
  const runtime = await createCloudRuntime(raw, { connectRecipeAI: false });
  try {
    const recovery = new AdminRecovery(runtime); let result;
    if (command === 'preview') {
      const output = path.resolve(flags['--out']);
      const resolved = path.join(await realpath(path.dirname(output)), path.basename(output));
      const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)));
      if (resolved === repo || resolved.startsWith(repo + path.sep)) throw new Error('El plan contiene identidades; guardar fuera del repositorio servido.');
      const plan = await recovery.preview({ lostUid: flags['--lost-uid'], replacementUid: flags['--replacement-uid'], reason: flags['--reason'] });
      await writeFile(resolved, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
      result = { planFile: resolved, operationId: plan.operationId, digest: plan.digest, expiresAt: plan.expiresAt, writes: false };
    } else if (command === 'apply') result = await recovery.apply(await readJson(flags['--plan']), { confirmDigest: flags['--confirm'] });
    else if (command === 'status') result = await recovery.status(flags['--operation']);
    else result = await recovery.retryRevocations(flags['--operation'], { confirmDigest: flags['--confirm'] });
    const { lostUid, replacementUid, approvedBy, ...safe } = result;
    if (Array.isArray(safe.revocationPending)) safe.revocationPending = safe.revocationPending.length;
    console.log(JSON.stringify(safe, null, 2));
  } finally { await runtime.close(); }
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'admin-recovery.incomplete', message: 'No asumir éxito ni fallo del cambio. Consultar el recibo de la operación; conservar el plan privado y no generar otro automáticamente.' }));
  process.exitCode = 1;
});
