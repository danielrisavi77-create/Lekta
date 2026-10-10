#!/usr/bin/env node
// scripts/release-edge-rollback.mjs
//
// Povrat Edge funkcija u objavi jednim gumbom (.github/workflows/release.yml), kad job padne
// NAKON sto su funkcije pocele ici van, a PRIJE nego je novi klijent objavljen.
//
// ZASTO (Codex na #339). `supabase functions deploy a b` nije transakcija: `a` je ziva cim
// uspije, pa pad `b`, kao i pad objave klijenta (`restoreSiteDeploy`), ostavlja nove funkcije uz
// stari klijent i on dobiva `400 consent_required`. Ovaj korak vraca funkcije na commit koji
// zivi klijent stvarno nosi (`build-info.json` na originu), pa su klijent i funkcije opet isti.
//
// Ako zivi klijent vec nosi trazeni commit (objava je prosla), nema sto vracati. Ako se commit
// zivog klijenta ne da procitati, to je NE ZNAM: povrat ide rucno prema
// docs/deploy/EDGE_DEPLOY_T20.md, odjeljak Povrat.
//
// Okolina: SITE_ORIGIN, PROJECT_REF, RELEASE_SHA, RELEASE_FUNCTIONS, SUPABASE_ACCESS_TOKEN.
// Izlaz: 0 = vraceno ili nista za vratiti; 1 = povrat nije potpun; 2 = NE ZNAM.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Sto vratiti. `prevHas(fn)` kaze postoji li funkcija u commitu zivog klijenta; funkcija koje
 * ondje nema ne moze se vratiti i imenuje se kao `missing`.
 */
export function rollbackPlan({ liveCommit, releaseSha, functions, prevHas }) {
  if (!/^[0-9a-f]{40}$/.test(String(liveCommit ?? ''))) return { action: 'unknown', deploy: [], missing: [] };
  if (liveCommit === releaseSha) return { action: 'none', deploy: [], missing: [] };
  const fns = String(functions).split(/\s+/).filter(Boolean);
  return { action: 'deploy', deploy: fns.filter((f) => prevHas(f)), missing: fns.filter((f) => !prevHas(f)) };
}

async function liveCommitOf(origin) {
  try {
    const res = await fetch(`${origin}/build-info.json?povrat=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json())?.commit ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const env = (k) => (process.env[k] ?? '').trim();
  const [origin, ref, sha, functions] = ['SITE_ORIGIN', 'PROJECT_REF', 'RELEASE_SHA', 'RELEASE_FUNCTIONS'].map(env);
  const liveCommit = await liveCommitOf(origin);
  const prevDir = join(process.env.RUNNER_TEMP ?? '/tmp', 'povrat-edge');
  let worktree = false;
  const prevHas = (fn) => {
    if (!worktree) {
      execFileSync('git', ['worktree', 'add', '--detach', prevDir, liveCommit], { stdio: 'inherit' });
      worktree = true;
    }
    return /^[a-z0-9][a-z0-9-]*$/.test(fn) && existsSync(join(prevDir, 'supabase', 'functions', fn, 'index.ts'));
  };
  const plan = rollbackPlan({ liveCommit, releaseSha: sha, functions, prevHas });
  if (plan.action === 'unknown') {
    console.error(`[release-edge-rollback] NE ZNAM: commit zivog klijenta na ${origin} nije procitan. `
      + 'Funkcije vrati rucno (docs/deploy/EDGE_DEPLOY_T20.md, Povrat).');
    process.exit(2);
  }
  if (plan.action === 'none') {
    console.log(`[release-edge-rollback] Zivi klijent vec nosi ${sha.slice(0, 12)}; funkcije se ne vracaju.`);
    return;
  }
  if (plan.deploy.length > 0) {
    execFileSync('npx', ['supabase', '--workdir', prevDir, 'functions', 'deploy', ...plan.deploy, '--project-ref', ref, '--use-api'], { stdio: 'inherit' });
    console.log(`[release-edge-rollback] Vraceno na ${liveCommit.slice(0, 12)}: ${plan.deploy.join(', ')}.`);
  }
  if (plan.missing.length > 0) {
    console.error(`[release-edge-rollback] Nema ih u ${liveCommit.slice(0, 12)}, ostaju nove: ${plan.missing.join(', ')}.`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
