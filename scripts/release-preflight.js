import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { releasePreflight, validateReleaseConfiguration, validateReleaseClientConfiguration } from '../src/server/release-preflight.js';

async function main() {
  const mode = process.argv[2];
  if (!['--example', '--candidate', '--pilot-without-ai'].includes(mode) || process.argv.length !== 3)
    throw new Error('Usa --example, --candidate o --pilot-without-ai.');
  const candidate=mode!=='--example',pilotWithoutAI=mode==='--pilot-without-ai';
  const root = fileURLToPath(new URL('..', import.meta.url));
  const configPath = process.env.FORX_CONFIG_PATH;
  if (!configPath) throw new Error('Define FORX_CONFIG_PATH.');
  const approvedPolicy = JSON.parse(await readFile(path.join(root, 'config/recipe-ai-pilot.policy.json'), 'utf8'));
  const clientConfigPath = process.env.FORX_CLIENT_CONFIG_PATH;
  let publicConfig;
  if (candidate) {
    if (!process.versions.node.startsWith('24.')) throw new Error('El candidato requiere Node 24 LTS.');
    if (!clientConfigPath) throw new Error('Define FORX_CLIENT_CONFIG_PATH para el build público del candidato.');
    const server = validateReleaseConfiguration(JSON.parse(await readFile(configPath, 'utf8')), approvedPolicy, { candidate: true, pilotWithoutAI });
    publicConfig = JSON.parse(await readFile(clientConfigPath, 'utf8'));
    validateReleaseClientConfiguration(publicConfig, server);
    // Rebuild from this checkout immediately before fingerprinting dist.
    execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], { cwd: root, stdio: 'inherit' });
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, stdio: 'inherit',
      env: { ...process.env, VITE_FORX_PUBLIC_CONFIG: JSON.stringify(publicConfig) } });
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const clean = !execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(JSON.stringify(await releasePreflight({ root, configPath, clientConfigPath, approvedPolicy,
    candidate, pilotWithoutAI, commit, clean }), null, 2));
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'release.preflight_failed', message: 'El artefacto no está validado. No publicar ni interpretar esta comprobación como aprobación externa.' }));
  process.exitCode = 1;
});
