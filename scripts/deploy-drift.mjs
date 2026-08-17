#!/usr/bin/env node
// scripts/deploy-drift.mjs
//
// Sto je STVARNO deployano nasuprot onome sto repozitorij misli da jest.
//
// Audit 2026-08-17 (DB-17) pokazao je da je taj jaz postojao neopazeno u oba smjera:
// produkcija je vrtjela preflight-start i preflight-result iako ih dokumentacija
// proglasava odgodjenima, dok integrity-check, katedra-agent-worker i field-render
// postoje u repou a nikad nisu deployani. Nijedan test to nije mogao vidjeti jer
// nijedan test ne gleda izvan repozitorija.
//
// Skripta je namjerno READ-ONLY: samo ispisuje razliku i pise izvjestaj. Nista ne
// deploya i nista ne brise, jer odluka o smjeru usuglasavanja (deployati ili obrisati)
// nije mehanicka.
//
// Pokretanje:
//   LEKTA_PROD_REF=... LEKTA_STAGING_REF=... SUPABASE_ACCESS_TOKEN=... npm run deploy-drift
//
// Refovi se NE hardkodiraju: produkcijski ref u repou je upravo ono na sto se audit
// zalio (DB-02), pa dolaze iz okoline. Bez tokena skripta uredno odustaje (exit 0,
// jasna poruka) da ne rusi lokalni rad onima koji nemaju pristup Management APIju.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions');
const OUT = path.join(ROOT, 'docs', 'generated', 'DEPLOY_DRIFT.md');
const API = 'https://api.supabase.com/v1';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ENVIRONMENTS = [
  { label: 'produkcija', ref: process.env.LEKTA_PROD_REF },
  { label: 'staging', ref: process.env.LEKTA_STAGING_REF },
].filter((e) => e.ref);

/** Imena funkcija u repou. `_shared` je biblioteka, ne funkcija. */
function repoFunctions() {
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

async function deployedFunctions(ref) {
  const res = await fetch(`${API}/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status} za ${ref}: ${await res.text()}`);
  return await res.json();
}

function driftFor(repo, deployed) {
  const live = new Map(deployed.map((f) => [f.slug, f]));
  const onlyRepo = repo.filter((name) => !live.has(name));
  const onlyLive = [...live.keys()].filter((slug) => !repo.includes(slug)).sort();
  const both = repo.filter((name) => live.has(name));
  return { onlyRepo, onlyLive, both, live };
}

function section(label, ref, { onlyRepo, onlyLive, both, live }) {
  const lines = [`## ${label} (\`${ref}\`)`, ''];
  lines.push(`Repo: ${both.length + onlyRepo.length} funkcija. Deployano: ${live.size}.`, '');

  if (!onlyRepo.length && !onlyLive.length) {
    lines.push('Bez drifta: svaka funkcija iz repozitorija je deployana i obrnuto.', '');
  } else {
    lines.push('| Funkcija | Stanje |', '| --- | --- |');
    for (const name of onlyRepo) lines.push(`| \`${name}\` | SAMO U REPOU (nije deployana) |`);
    for (const slug of onlyLive) lines.push(`| \`${slug}\` | SAMO U PRODUKCIJI (nema je u repou) |`);
    lines.push('');
  }

  lines.push('<details><summary>Deployane verzije</summary>', '');
  lines.push('| Funkcija | Verzija | Status | verify_jwt |', '| --- | --- | --- | --- |');
  for (const slug of [...live.keys()].sort()) {
    const f = live.get(slug);
    lines.push(`| \`${slug}\` | ${f.version} | ${f.status} | ${f.verify_jwt} |`);
  }
  lines.push('', '</details>', '');
  return lines;
}

const repo = repoFunctions();

if (!TOKEN || !ENVIRONMENTS.length) {
  const why = !TOKEN ? 'SUPABASE_ACCESS_TOKEN nije postavljen' : 'nijedan LEKTA_*_REF nije postavljen';
  console.log(`[deploy-drift] preskacem: ${why}. Repo ima ${repo.length} funkcija.`);
  process.exit(0);
}

const out = [
  '# Deploy drift: repozitorij nasuprot deployanom stanju',
  '',
  '> GENERIRANO (`npm run deploy-drift`). Ne uredjuj rucno.',
  '',
  'Popis funkcija u `supabase/functions/**` usporedjen s onime sto Supabase stvarno vrti.',
  'Prazna tablica drifta je jedino prihvatljivo stanje prije deploya.',
  '',
];

let drifted = 0;
for (const env of ENVIRONMENTS) {
  const deployed = await deployedFunctions(env.ref);
  const d = driftFor(repo, deployed);
  drifted += d.onlyRepo.length + d.onlyLive.length;
  out.push(...section(env.label, env.ref, d));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`[deploy-drift] zapisano ${path.relative(ROOT, OUT)}; stavki drifta: ${drifted}`);
