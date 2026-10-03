#!/usr/bin/env node
// scripts/check-edge.mjs
//
// Typecheck Supabase Edge funkcija (Deno) — audit TEST-01.
//
// `tsconfig.json` ima `include: ["src"]`, pa `npm run check` NIKAD nije provjeravao
// `supabase/functions/**`. To je najgore moguce mjesto za rupu u provjeri: ondje zivi serverski
// kod koji barata novcem (create-checkout, webhook-mor), tudjim dokumentima (repair-docx) i
// pravom pristupa. Greska se ondje vidjela tek u radu.
//
// Zasto ne kroz tsc: to je Deno kod. Uvozi preko `https://` URL-ova i koristi Deno globale, pa
// bi ga tsc mogao progutati samo uz laznu konfiguraciju koja bi provjeravala nesto drugo od
// onoga sto se stvarno vrti. `deno check` je za taj kod ispravan alat.
//
// Konfiguracija (`supabase/functions/deno.json`) prosljedjuje se IZRICITO: Deno inace trazi
// deno.json od radnog direktorija, a ne pokraj provjeravane datoteke, pa bi bez toga tiho
// vrtio bez `dom` lib-a i prijavio 66 laznih gresaka "Cannot find name 'Element'".
//
// Bez instaliranog Dena skripta PADA, ne preskace. Provjera koja se tiho preskoci je isto sto i
// provjera koja ne postoji, a upravo takvih je ovaj audit nasao previse.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions');
const CONFIG = path.join(FUNCTIONS_DIR, 'deno.json');
const CONTROL_PLANE_DIR = path.join(ROOT, 'ops', 'agent-control-plane', 'function');
const CONTROL_PLANE_ENTRY = path.join(CONTROL_PLANE_DIR, 'index.ts');
const CONTROL_PLANE_CONFIG = path.join(CONTROL_PLANE_DIR, 'deno.json');

const probe = spawnSync('deno', ['--version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error('[check-edge] FAIL: `deno` nije dostupan u PATH-u.');
  console.error('  Instaliraj Deno (https://deno.land) ili pokreni `npm run check` bez ovog koraka.');
  console.error('  Ovaj korak NE preskacemo tiho: supabase/functions/** inace ostaje bez ijedne provjere.');
  process.exit(1);
}

const targets = fs
  .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => ({
    name: d.name,
    entry: path.join(FUNCTIONS_DIR, d.name, 'index.ts'),
    config: CONFIG,
  }))
  .filter((target) => fs.existsSync(target.entry));

if (fs.existsSync(CONTROL_PLANE_ENTRY)) {
  if (!fs.existsSync(CONTROL_PLANE_CONFIG)) {
    console.error('[check-edge] FAIL: agent control-plane postoji bez ops/agent-control-plane/function/deno.json');
    process.exit(1);
  }
  targets.push({
    name: 'agent-control-plane',
    entry: CONTROL_PLANE_ENTRY,
    config: CONTROL_PLANE_CONFIG,
  });
}

if (!targets.length) {
  console.error('[check-edge] FAIL: nijedna Edge funkcija nije pronadjena.');
  process.exit(1);
}

const failed = [];
for (const target of targets) {
  try {
    execFileSync('deno', ['check', '--no-lock', '--config', target.config, target.entry], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    console.log(`  ok    ${target.name}`);
  } catch (e) {
    failed.push(target.name);
    console.log(`  FAIL  ${target.name}`);
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
    if (out) console.log(out.split('\n').map((l) => `        ${l}`).join('\n'));
  }
}

if (failed.length) {
  console.error(`[check-edge] FAIL: ${failed.length} od ${targets.length} funkcija ne prolazi typecheck: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`[check-edge] OK: ${targets.length} Edge funkcija prolazi deno typecheck.`);

// Academic Core sav: IZVRSNI smoke u samom Denu (ne samo typecheck). Ciste evaluacije
// (formatting + structure) vrte se nad sintetickim mjerenjima s tocno poznatim
// ocekivanjima; "Deno-ready" tako ostaje izvrsena cinjenica, ne tvrdnja po konstrukciji.
// Config je isti kao za funkcije (dom lib; helpers.ts nosi Element tipove).
const SMOKE = path.join(ROOT, 'scripts', 'deno', 'evaluate-smoke.ts');
try {
  execFileSync('deno', ['check', '--no-lock', '--config', CONFIG, SMOKE], { stdio: 'pipe', encoding: 'utf8' });
  const out = execFileSync('deno', ['run', '--no-lock', SMOKE], { stdio: 'pipe', encoding: 'utf8' });
  console.log(out.trim());
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
  console.error('[check-edge] FAIL: evaluate-smoke u Denu nije prosao.');
  if (out) console.error(out.split('\n').map((l) => `        ${l}`).join('\n'));
  process.exit(1);
}
