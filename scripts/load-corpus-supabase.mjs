#!/usr/bin/env node
/**
 * Punjenje corpus_works (migracija 0030) iz lekta-pipeline/korpus.db u Supabase.
 *
 * Ide preko PostgREST-a s service_role kljucem, pa NE treba ni lozinku baze, ni psql, ni novu npm
 * ovisnost. RLS na corpus_works je deny-all (nula politika), a service_role zaobilazi RLS.
 *
 * IDEMPOTENTNO: upsert po `source_id` (Prefer: resolution=merge-duplicates), pa se skripta smije
 * prekinuti i ponovno pokrenuti; nastavlja od zadnje uspjesne serije bez duplikata.
 *
 * Kljuc se NIKAD ne prima kao argument (zavrsio bi u povijesti ljuske). Cita se iz okoline ili iz
 * datoteke na koju pokazuje SUPABASE_ENV_FILE (format: KLJUC=vrijednost po retku).
 *
 * Uporaba:
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-corpus-supabase.mjs
 *   ili: SUPABASE_ENV_FILE=/put/do/.env.corpus node scripts/load-corpus-supabase.mjs
 *
 * Zastavice: --db <put> --batch <n> --limit <n> --dry
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

// Tajne iz okoline ili iz env-datoteke; nikad iz argumenata.
const envFile = process.env.SUPABASE_ENV_FILE;
if (envFile && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DB_PATH = resolve(arg('db', join(repo, 'lekta-pipeline', 'korpus.db')));
const BATCH = Number(arg('batch', '2000')) || 2000;
const LIMIT = Number(arg('limit', '0')) || 0;
const DRY = has('dry');

if (!DRY && (!URL_BASE || !KEY)) {
  console.error('Nedostaje SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY (ili SUPABASE_ENV_FILE).');
  process.exit(2);
}

/** ISTA logika kao normalize() u src/utils/helpers.ts. */
const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

async function postBatch(rows, attempt = 1) {
  const res = await fetch(`${URL_BASE}/rest/v1/corpus_works?on_conflict=source_id`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      // merge-duplicates = upsert po source_id; minimal = ne vracaj umetnute retke (brze)
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  // Prolazne greske (rate limit, 5xx) ponovi s odmakom; trajne odmah prijavi.
  if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
    const wait = 1000 * attempt * attempt;
    console.warn(`  serija odbijena (${res.status}), ponavljam za ${wait}ms (pokusaj ${attempt})`);
    await new Promise((r) => setTimeout(r, wait));
    return postBatch(rows, attempt + 1);
  }
  throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
}

async function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const total = db.prepare('select count(*) c from works').get().c;
  console.log(`korpus: ${DB_PATH}`);
  console.log(`works: ${total.toLocaleString('hr-HR')} redaka, serija po ${BATCH}${DRY ? ' (SUHI HOD)' : ''}`);

  const sql =
    'select doc_id, source_id, title, authors, year, institution, url, repo, kind from works' +
    (LIMIT ? ` limit ${LIMIT}` : '');

  let batch = [];
  let sent = 0, skipped = 0;
  const t0 = Date.now();

  const flush = async () => {
    if (!batch.length) return;
    if (!DRY) await postBatch(batch);
    sent += batch.length;
    batch = [];
    const sec = (Date.now() - t0) / 1000;
    const rate = Math.round(sent / Math.max(sec, 0.001));
    process.stdout.write(`\r  poslano ${sent.toLocaleString('hr-HR')} (${rate}/s)   `);
  };

  for (const r of db.prepare(sql).iterate()) {
    const title_norm = normalize(r.title);
    if (!title_norm) { skipped++; continue; }
    batch.push({
      doc_id: r.doc_id, source_id: r.source_id, title: r.title, title_norm,
      authors: r.authors ?? null, year: r.year ?? null, institution: r.institution ?? null,
      url: r.url ?? null, repo: r.repo ?? null, kind: r.kind ?? null,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  db.close();

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\ngotovo: ${sent.toLocaleString('hr-HR')} redaka za ${sec}s, preskoceno ${skipped}`);
}

main().catch((e) => { console.error('\nPAD:', e.message); process.exit(1); });
