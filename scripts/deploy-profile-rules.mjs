#!/usr/bin/env node
// scripts/deploy-profile-rules.mjs
//
// Deploy profile-rules Edge funkcije na OBA projekta (staging pa produkcija) jednim
// pozivom, pa zapis drifta. Razlog: artefakt pravila (data/generated/
// profile-rules-server.json) se peče u Deno bundle funkcije, pa svaka promjena
// pravila traži redeploy na oba projekta; dva ručna deploya su se u praksi
// razilazila (datasetVersion drift između staginga i produkcije).
//
// Env (isti izvor kao deploy-drift): SUPABASE_ACCESS_TOKEN + LEKTA_STAGING_REF i/ili
// LEKTA_PROD_REF. Bez tokena ili bez ijednog refa skripta uredno odustaje (exit 0),
// da lokalni tok bez tajni ne puca. Funkcija se deploya s --no-verify-jwt
// (anoniman GET, vidi supabase/config.toml).

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TARGETS = [
  ['staging', process.env.LEKTA_STAGING_REF],
  ['produkcija', process.env.LEKTA_PROD_REF],
].filter(([, ref]) => ref);

if (!TOKEN || !TARGETS.length) {
  const why = !TOKEN ? 'SUPABASE_ACCESS_TOKEN nije postavljen' : 'nijedan LEKTA_*_REF nije postavljen';
  console.log(`[deploy-profile-rules] preskace se: ${why}.`);
  process.exit(0);
}

for (const [label, ref] of TARGETS) {
  console.log(`[deploy-profile-rules] ${label} (${ref})...`);
  execFileSync('npx', ['supabase', 'functions', 'deploy', 'profile-rules', '--project-ref', ref, '--no-verify-jwt'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

console.log('[deploy-profile-rules] zapis drifta...');
execFileSync('node', ['scripts/deploy-drift.mjs'], { cwd: ROOT, stdio: 'inherit' });
console.log(`[deploy-profile-rules] OK: deployano na ${TARGETS.map(([l]) => l).join(' + ')}.`);
