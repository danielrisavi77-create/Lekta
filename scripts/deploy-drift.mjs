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
import {
  configVerifyJwt,
  contentDrift,
  deployedLocalSources,
  driftFor,
  extractSourceMaps,
  labelForOnlyLive,
  verifyJwtDrift,
} from './deploy-drift-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions');
const OUT = path.join(ROOT, 'docs', 'generated', 'DEPLOY_DRIFT.md');
const API = 'https://api.supabase.com/v1';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ENVIRONMENTS = [
  { label: 'produkcija', ref: process.env.LEKTA_PROD_REF },
  { label: 'staging', ref: process.env.LEKTA_STAGING_REF },
].filter((e) => e.ref);

/** Sadrzaj `supabase/config.toml`; prazan niz ako ga nema (skripta i dalje radi). */
function configToml() {
  const p = path.join(ROOT, 'supabase', 'config.toml');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

/** Imena funkcija u repou. `_shared` je biblioteka, ne funkcija. */
function repoFunctions() {
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

/**
 * Deployani bundle funkcije (ESZIP) kao UTF-8 tekst, ili null kad ga API ne da. Null nije
 * "jednako": presuda za tu funkciju je tada NE ZNAM.
 */
async function deployedBundle(ref, slug) {
  try {
    const res = await fetch(`${API}/projects/${ref}/functions/${slug}/body`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return null;
    return new TextDecoder().decode(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Sadrzaj datoteke iz repoa po putanji relativnoj na korijen, ili null kad je nema. */
function readRepo(repoPath) {
  const p = path.join(ROOT, ...repoPath.split('/'));
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/** Presuda po sadrzaju za svaku funkciju koja je i u repou i deployana (T101). */
async function contentVerdicts(ref, both) {
  const verdicts = [];
  for (const slug of [...both].sort()) {
    const bundle = await deployedBundle(ref, slug);
    const verdict = bundle === null
      ? { status: 'ne-znam', entry: `supabase/functions/${slug}/index.ts`, differ: [], missingInRepo: [], equal: [], why: 'API nije vratio bundle' }
      : contentDrift(slug, deployedLocalSources(extractSourceMaps(bundle), slug), readRepo);
    verdicts.push({ slug, ...verdict });
  }
  return verdicts;
}

async function deployedFunctions(ref) {
  const res = await fetch(`${API}/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status} za ${ref}: ${await res.text()}`);
  return await res.json();
}

const OZNAKA_SADRZAJA = { jednako: 'JEDNAKO', drift: 'DRIFT', 'ne-znam': 'NE ZNAM' };

/** Tablica po sadrzaju: jednako / drift / ne znam, uz datoteke koje se razlikuju. */
function contentSection(verdicts) {
  const lines = ['### Sadrzaj deployanih funkcija nasuprot repou (T101)', ''];
  lines.push(
    'Izvor se cita iz source mapa deployanog bundlea (`GET /functions/{slug}/body`) i usporedjuje s',
    'repoom bajt po bajt (CR normaliziran). NE ZNAM znaci da bundle nije dostupan ili nema citljivih',
    'source mapa; to nije prolaz.',
    '',
  );
  lines.push('| Funkcija | Sadrzaj | Razlike |', '| --- | --- | --- |');
  for (const v of verdicts) {
    const razlike = [
      ...v.differ.map((f) => `\`${f}\` razlicit`),
      ...v.missingInRepo.map((f) => `\`${f}\` nema u repou`),
      ...(v.why ? [v.why] : []),
      ...(v.status === 'ne-znam' && !v.why ? ['bundle bez source mape ulaza'] : []),
    ].join('; ');
    lines.push(`| \`${v.slug}\` | ${OZNAKA_SADRZAJA[v.status]} | ${razlike} |`);
  }
  lines.push('');
  return lines;
}

function section(label, ref, { onlyRepo, onlyLive, both, live }, verdicts = []) {
  const lines = [`## ${label} (\`${ref}\`)`, ''];
  lines.push(`Repo: ${both.length + onlyRepo.length} funkcija. Deployano: ${live.size}.`, '');

  if (!onlyRepo.length && !onlyLive.length) {
    lines.push('Bez drifta: svaka funkcija iz repozitorija je deployana i obrnuto.', '');
  } else {
    lines.push('| Funkcija | Stanje |', '| --- | --- |');
    for (const name of onlyRepo) lines.push(`| \`${name}\` | SAMO U REPOU (nije deployana) |`);
    for (const slug of onlyLive) lines.push(`| \`${slug}\` | ${labelForOnlyLive(label)} |`);
    lines.push('');
  }

  if (verdicts.length) lines.push(...contentSection(verdicts));

  // Konfiguracijski raskorak: do 2026-08-30 se usporedjivalo samo POSTOJANJE funkcije, pa je
  // funkcija bez `[functions.<slug>]` bloka izgledala uredno sve dok je prvi deploy ne zatvori.
  const jwt = verifyJwtDrift(configVerifyJwt(configToml()), live);
  if (jwt.length) {
    lines.push('### Raskorak `verify_jwt` (config.toml nasuprot okolini)', '');
    lines.push('| Funkcija | config.toml | okolina | Rizik |', '| --- | --- | --- | --- |');
    for (const f of jwt) {
      const risk = f.kind === 'missing-config'
        ? 'nema bloka: CLI default je `true`, pa bi deploy zatvorio endpoint'
        : 'deploy bi promijenio autorizaciju';
      lines.push(`| \`${f.slug}\` | ${f.declared === null ? '(nema bloka)' : f.declared} | ${f.actual} | ${risk} |`);
    }
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
let contentDrifted = 0;
let unknown = 0;
for (const env of ENVIRONMENTS) {
  const deployed = await deployedFunctions(env.ref);
  const d = driftFor(repo, deployed);
  drifted += d.onlyRepo.length + d.onlyLive.length;
  const verdicts = await contentVerdicts(env.ref, d.both);
  contentDrifted += verdicts.filter((v) => v.status === 'drift').length;
  unknown += verdicts.filter((v) => v.status === 'ne-znam').length;
  out.push(...section(env.label, env.ref, d, verdicts));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(
  `[deploy-drift] zapisano ${path.relative(ROOT, OUT)}; postojanje: ${drifted}, ` +
  `sadrzaj DRIFT: ${contentDrifted}, NE ZNAM: ${unknown}`,
);
