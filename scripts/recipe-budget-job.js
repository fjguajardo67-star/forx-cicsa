import { readFile, stat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentConfig } from '../src/server/deployment-config.js';
import { createCloudRuntime } from '../src/server/cloud-runtime.js';
import { RecipeBudgetOperator, requireBudgetReconciliationJob } from '../src/server/recipe-budget-operator.js';

const readJson = async filename => {
  if (!filename || (await stat(filename)).size > 65536) throw new Error('Archivo privado requerido de hasta 64 KB.');
  return JSON.parse(await readFile(filename, 'utf8'));
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const permitted = { status: [], preview: ['--evidence', '--out'], apply: ['--plan', '--confirm'] };
  if (!Object.hasOwn(permitted, command) || args.length !== permitted[command].length * 2) throw new Error('Comando o argumentos inválidos.');
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!permitted[command].includes(args[i]) || flags[args[i]] || !args[i + 1]) throw new Error('Argumentos inválidos.');
    flags[args[i]] = args[i + 1];
  }
  const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const readPrivateJson = async filename => {
    const resolved = await realpath(filename);
    if (resolved === repo || resolved.startsWith(repo + path.sep) || (await stat(resolved)).mode & 0o077)
      throw new Error('La evidencia y el plan deben ser privados y estar fuera del repositorio.');
    return readJson(resolved);
  };
  const raw = await readJson(process.env.FORX_CONFIG_PATH), config = deploymentConfig(raw);
  // Check approval and private job identity before SDK initialization/network.
  requireBudgetReconciliationJob(config);
  const decision = command === 'preview' ? await readPrivateJson(flags['--evidence']) : null;
  const planToApply = command === 'apply' ? await readPrivateJson(flags['--plan']) : null;
  let output;
  if (command === 'preview') {
    output = path.resolve(flags['--out']);
    output = path.join(await realpath(path.dirname(output)), path.basename(output));
    if (output === repo || output.startsWith(repo + path.sep)) throw new Error('Guardar el plan privado fuera del repositorio.');
  }
  const runtime = await createCloudRuntime(raw, { connectRecipeAI: false });
  try {
    const operator = new RecipeBudgetOperator(runtime);
    let result;
    if (command === 'status') result = await operator.status();
    if (command === 'preview') {
      const plan = await operator.preview(decision);
      await writeFile(output, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
      result = { planFile: output, target: plan.target, digest: plan.digest, expiresAt: plan.expiresAt, writes: false };
    }
    if (command === 'apply') result = await operator.apply(planToApply, { confirmDigest: flags['--confirm'] });
    console.log(JSON.stringify(result, null, 2));
  } finally { await runtime.close(); }
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'recipe-budget.incomplete', message: 'No asumir ausencia de cargo ni repetir la generación. Consultar estado y evidencia privados antes de reintentar el mismo plan.' }));
  process.exitCode = 1;
});
