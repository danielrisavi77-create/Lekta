#!/usr/bin/env node
// scripts/migration-identity.mjs
//
// Koja je migracija iz repozitorija STVARNO primijenjena na koje okruzenje.
//
// Audit 2026-08-17 (A26-04) prijavio je da repo ima 85 numeriranih migracija, a produkcija
// pamti 67 verzija od kojih je samo jedna cetveroznamenkasta. Zakljucak "0062-0085 nisu
// primijenjene" bio je preuranjen: verzija NIJE identitet migracije u ovom projektu.
//
// Uzrok: dio migracija primijenjen je Supabase MCP alatom `apply_migration`, koji dodjeljuje
// TIMESTAMP verziju, ali u stupac `name` upisuje ime migracije. Zato se identitet mora traziti
// po IMENU, ne po verziji. Nakon normalizacije imena slika je posve drugacija od zatecene.
//
// Skripta je READ-ONLY. Ne primjenjuje migracije, ne popravlja povijest i nista ne brise;
// odluka o smjeru usuglasavanja pripada `docs/deploy/MIGRATION_IDENTITY.md`.
//
// Pokretanje:
//   LEKTA_PROD_REF=... LEKTA_STAGING_REF=... SUPABASE_ACCESS_TOKEN=... npm run migration-identity

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const OUT = path.join(ROOT, 'docs', 'generated', 'MIGRATION_IDENTITY.md');
const API = 'https://api.supabase.com/v1';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ENVIRONMENTS = [
  { label: 'produkcija', ref: process.env.LEKTA_PROD_REF },
  { label: 'staging', ref: process.env.LEKTA_STAGING_REF },
].filter((e) => e.ref);

/**
 * Kljuc po kojem se migracija prepoznaje bez obzira na to kako je zavedena.
 *
 * Podnosi sva zatecena odstupanja: vodeci redni broj (`0063_`), prefiks proizvoda
 * (`Lekta: `), razmake umjesto podvlaka i razliku u velikim slovima. Primjeri koji se
 * MORAJU svesti na isti kljuc:
 *   `0063_deadline_reminder_tiers.sql`  ->  deadline_reminder_tiers
 *   `Lekta: deadline reminder tiers`    ->  deadline_reminder_tiers
 */
function identity(raw) {
  return String(raw)
    .replace(/\.sql$/i, '')
    .replace(/^\d{4,}_/, '')
    .replace(/^lekta\s*:\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function repoMigrations() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, number: (file.match(/^(\d{4})_/) || [])[1] ?? null, key: identity(file) }));
}

async function appliedMigrations(ref) {
  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select version, name from supabase_migrations.schema_migrations order by version' }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status} za ${ref}: ${await res.text()}`);
  return (await res.json()).map((r) => ({ version: r.version, name: r.name, key: identity(r.name ?? r.version) }));
}

function compare(repo, applied) {
  /** Kljuc -> SVI zapisi s tim kljucem. Vise od jednog znaci dvaput primijenjenu migraciju. */
  const byKey = new Map();
  for (const a of applied) {
    if (!byKey.has(a.key)) byKey.set(a.key, []);
    byKey.get(a.key).push(a);
  }
  const repoKeys = new Set(repo.map((r) => r.key));
  return {
    total: applied.length,
    matched: repo.filter((r) => byKey.has(r.key)).map((r) => ({ ...r, applied: byKey.get(r.key)[0] })),
    missing: repo.filter((r) => !byKey.has(r.key)),
    extra: applied.filter((a) => !repoKeys.has(a.key)),
    duplicates: [...byKey.entries()].filter(([, v]) => v.length > 1).map(([key, rows]) => ({ key, rows })),
  };
}

function section(label, ref, repo, { total, matched, missing, extra, duplicates }) {
  const lines = [`## ${label} (\`${ref}\`)`, ''];
  lines.push(
    `Repo: ${repo.length} migracija. Zapisa u bazi: ${total}. ` +
      `Poklopljeno po imenu: **${matched.length}**. Nedostaje: **${missing.length}**. ` +
      `Samo u bazi: **${extra.length}**. Dvaput primijenjeno: **${duplicates.length}**.`,
    '',
  );

  if (duplicates.length) {
    lines.push(
      '### DVAPUT primijenjeno (isti zahvat, dva identiteta)',
      '',
      'Ista migracija zavedena je dva puta pod razlicitim identitetom: jednom kroz `supabase db push`',
      '(verzija je redni broj, ime bez broja), pa opet kroz MCP `apply_migration` (verzija je timestamp,',
      'ime s brojem). Proslo je samo zato sto su ti zahvati idempotentni. Migracijski dnevnik ovog',
      'okruzenja od tada nije pouzdan izvor onoga sto je primijenjeno.',
      '',
      '| Kljuc | Zapisi |',
      '| --- | --- |',
    );
    for (const d of duplicates) {
      lines.push(`| \`${d.key}\` | ${d.rows.map((r) => `\`${r.version}\` (${r.name})`).join(' + ')} |`);
    }
    lines.push('');
  }

  lines.push('### U REPOU, NIJE primijenjeno', '');
  if (!missing.length) lines.push('Nema takvih. Svaka migracija iz repozitorija je primijenjena.', '');
  else {
    lines.push('| Migracija | Kljuc |', '| --- | --- |');
    for (const m of missing) lines.push(`| \`${m.file}\` | \`${m.key}\` |`);
    lines.push('');
  }

  lines.push('### U BAZI, NEMA je u repozitoriju', '');
  if (!extra.length) lines.push('Nema takvih.', '');
  else {
    lines.push(
      'Ovo su izmjene sheme koje postoje samo u zivoj bazi. Repozitorij ih ne moze reproducirati,',
      'pa ih ni jedan test ni schema-diff ne vidi kao ocekivane.',
      '',
      '| Verzija | Ime | Kljuc |',
      '| --- | --- | --- |',
    );
    for (const e of extra) lines.push(`| \`${e.version}\` | ${e.name ?? '(bez imena)'} | \`${e.key}\` |`);
    lines.push('');
  }

  const renumbered = matched.filter((m) => m.number && m.applied.version !== m.number);
  // Skupi parove i za `--emit-sql` (vidi dolje): isti izvor podataka kao tablica ispod, pa se
  // ispis i generirani zahvat ne mogu razici.
  renumberedByEnv.set(label, renumbered.map((m) => ({ from: m.applied.version, to: m.number, name: m.file })));
  lines.push('<details><summary>Poklopljeno po imenu, ali pod drugom verzijom</summary>', '');
  lines.push(`${renumbered.length} od ${matched.length} poklopljenih ima drugaciju verziju u bazi nego u repou.`, '');
  lines.push('| Repo | Verzija u bazi |', '| --- | --- |');
  for (const m of renumbered) lines.push(`| \`${m.file}\` | \`${m.applied.version}\` |`);
  lines.push('', '</details>', '');
  return lines;
}

/** label -> parovi (stara verzija, ciljna verzija) za `--emit-sql`. */
const renumberedByEnv = new Map();

const repo = repoMigrations();

if (!TOKEN || !ENVIRONMENTS.length) {
  const why = !TOKEN ? 'SUPABASE_ACCESS_TOKEN nije postavljen' : 'nijedan LEKTA_*_REF nije postavljen';
  console.log(`[migration-identity] preskacem: ${why}. Repo ima ${repo.length} migracija.`);
  process.exit(0);
}

const out = [
  '# Migracijski identitet: repozitorij nasuprot primijenjenom stanju',
  '',
  '> GENERIRANO (`npm run migration-identity`). Ne uredjuj rucno.',
  '',
  'Migracije se usporedjuju po IMENU, ne po verziji. Dio ih je primijenjen Supabase MCP alatom',
  '`apply_migration`, koji dodjeljuje timestamp verziju a ime cuva, pa usporedba po verziji daje',
  'lazan dojam da gotovo nista nije primijenjeno.',
  '',
];

let problems = 0;
for (const env of ENVIRONMENTS) {
  const applied = await appliedMigrations(env.ref);
  const cmp = compare(repo, applied);
  problems += cmp.missing.length + cmp.extra.length + cmp.duplicates.length;
  out.push(...section(env.label, env.ref, repo, cmp));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`[migration-identity] zapisano ${path.relative(ROOT, OUT)}; nepodudaranja: ${problems}`);

/**
 * `--emit-sql`: ispisi zahvat koji dnevniku vraca identitet iz imena datoteka.
 *
 * Skripta ga NAMJERNO samo ispisuje, ne izvodi: zahvat dira zivi migracijski dnevnik, pa odluka
 * kad se izvodi pripada covjeku pred SQL editorom, ne alatu koji se moze pokrenuti slucajno.
 *
 * Parovi dolaze iz ISTOG izracuna kao tablica u izvjestaju, pa se ispis i zahvat ne mogu razici.
 * Zahvat dira samo `supabase_migrations.schema_migrations`; nijedna tablica, funkcija ni politika
 * se ne mijenja.
 */
if (process.argv.includes('--emit-sql')) {
  for (const [label, pairs] of renumberedByEnv) {
    console.log('');
    console.log(`-- ============================================================`);
    console.log(`-- ${label}: ${pairs.length} zapisa dobiva verziju iz imena datoteke`);
    console.log(`-- ============================================================`);
    if (!pairs.length) {
      console.log('-- (nema sto uskladiti)');
      continue;
    }
    console.log('begin;');
    for (const p of pairs) {
      console.log(`update supabase_migrations.schema_migrations set version = '${p.to}' where version = '${p.from}'; -- ${p.name}`);
    }
    console.log('commit;');
    console.log('');
    console.log('-- Provjera nakon zahvata: npm run migration-identity');
    console.log('-- Povrat: isti zahvat s zamijenjenim stranama (stare verzije su u ovom ispisu).');
  }
}
