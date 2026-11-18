#!/usr/bin/env node
// One-command GrowthGrid demo: boots the API (:4000) with the seeded demo
// workspace and the client dev server (:5173) together.
//
//   npm run demo              # API + client
//   npm run demo -- --api-only
//
// Sign in at http://localhost:5173 with admin@growthgrid.dev / admin123
// (agency admin) or client@growthgrid.dev / client123 (Meridian Realty).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const clientRoot = path.resolve(serverRoot, '..', 'client');
const apiOnly = process.argv.includes('--api-only');

process.env.SEED_DEMO_DATA ||= 'true';
process.env.PREFER_MEMORY_DB ||= 'true'; // zero-setup: always embedded MongoDB
process.env.PORT ||= '4000';

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function run(cmd, args, cwd, tag) {
  const child = spawn(cmd, args, { cwd, env: process.env, shell: false });
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.log(`[${tag}] ${line}`);
    }
  });
  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.error(`[${tag}] ${line}`);
    }
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${tag}] exited with code ${code}`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│  GrowthGrid demo                               │');
  console.log('│  API    → http://localhost:4000/api/health     │');
  if (!apiOnly) console.log('│  Client → http://localhost:5173                │');
  console.log('│  Admin  → admin@growthgrid.dev / admin123      │');
  console.log('│  Client → client@growthgrid.dev / client123    │');
  console.log('└────────────────────────────────────────────────┘');

  // API in-process so its logs stay readable and shutdown is clean.
  await import('../src/index.js');

  const apiUp = await waitFor(`http://127.0.0.1:${process.env.PORT}/api/health`);
  if (!apiUp) {
    console.error('[demo] API did not come up — see errors above');
    stop(1);
    return;
  }
  console.log('[demo] API is up');

  if (apiOnly) return;

  if (!existsSync(path.join(clientRoot, 'package.json'))) {
    console.warn('[demo] client/ not found — running API only');
    return;
  }
  if (!existsSync(path.join(clientRoot, 'node_modules'))) {
    console.log('[demo] installing client dependencies (first run)…');
    const installer = spawn('npm', ['install'], { cwd: clientRoot, stdio: 'inherit' });
    await new Promise((resolve, reject) => installer.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('client install failed')))));
  }
  run('npm', ['run', 'dev'], clientRoot, 'client');

  const clientUp = await waitFor('http://127.0.0.1:5173/login', 45000);
  console.log(clientUp ? '[demo] client is up — open http://localhost:5173' : '[demo] client is still starting… watch [client] logs');
}

main().catch((err) => {
  console.error('[demo] failed:', err);
  stop(1);
});
