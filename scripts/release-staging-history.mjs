#!/usr/bin/env node
// scripts/release-staging-history.mjs
//
// Korak prije `supabase db push` na STAGINGU u objavi jednim gumbom (.github/workflows/release.yml).
//
// ZASTO. Staging dijeli dnevnik migracija s Katedrom: verzije 0104 do 0199 su njezine i namjerno
// ih nema u supabase/migrations (root CLAUDE.md, Migracije). `db push` tada odbija raditi
// ("Remote migration versions not found in local migrations directory") i predlaze
// `migration repair --status reverted`, sto BRISE tudje retke iz dnevnika. Isti put kao rucni
// iz docs/deploy/KANAL_A_UKLJUCIVANJE.md: za svaku verziju samo u bazi privremena datoteka
// `<verzija>_privremeno_samo_u_bazi.sql` (samo komentar) u checkoutu runnera. Runner je
// jednokratan, pa datoteka nikad ne ulazi u repozitorij, a dnevnik u bazi ostaje netaknut.
//
// Placeholder se pise SAMO za Katedrin raspon. Sve drugo je pad, jer bi db push inace tiho
// preskocio ili ponovio migraciju:
//   - verzija samo u bazi izvan 0104 do 0199 (nepoznata tudja izmjena);
//   - migracija ciji je naziv u bazi pod drugom verzijom nego lokalno (npr. primijenjena MCP-om
//     s timestamp verzijom): db push bi lokalnu verziju smatrao neprimijenjenom i ponovio je;
//   - ista verzija s drugim nazivom u bazi i lokalno.
//
// Pokretanje: SUPABASE_ACCESS_TOKEN=... node scripts/release-staging-history.mjs --ref <ref>
// Izlaz: 0 = povijest uskladjena (placeholderi napisani); 1 = neuskladivo; 2 = NE ZNAM.

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fetchAppliedMigrations, migrationKey } from './release-migration-check.mjs';

/** Katedrin raspon verzija na dijeljenom stagingu (tests/migration-numbering.test.ts). */
export function isKatedraVersion(version) {
  if (!/^\d{4}$/.test(version)) return false;
  const n = Number(version);
  return n >= 104 && n <= 199;
}

/**
 * Plan uskladjivanja: `applied` su retci Management APIja (`{ version, name }`), `localFiles` imena
 * datoteka u supabase/migrations. Vraca verzije za placeholder i popis problema (prazan je cisto).
 */
export function stagingHistoryPlan(applied, localFiles) {
  const local = new Map();
  const localByKey = new Map();
  for (const f of localFiles) {
    const m = /^(\d{4,})_(.+)\.sql$/.exec(f);
    if (!m) continue;
    local.set(m[1], migrationKey(f));
    localByKey.set(migrationKey(f), m[1]);
  }
  const placeholders = [];
  const problems = [];
  for (const row of applied) {
    const version = String(row?.version ?? '');
    const key = migrationKey(row?.name ?? '');
    if (local.has(version)) {
      if (key && key !== local.get(version)) problems.push(`verzija ${version} je u bazi "${row.name}", a lokalno ${local.get(version)}`);
    } else if (key && localByKey.has(key)) {
      problems.push(`migracija ${key} je u bazi pod verzijom ${version}, a lokalno ${localByKey.get(key)}; db push bi je ponovio`);
    } else if (isKatedraVersion(version)) {
      placeholders.push(version);
    } else {
      problems.push(`verzija ${version} ("${row?.name ?? ''}") postoji samo u bazi i nije u Katedrinom rasponu 0104 do 0199`);
    }
  }
  return { placeholders, problems };
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--ref');
  const ref = i >= 0 ? (argv[i + 1] ?? '').trim() : '';
  if (!/^[a-z0-9]{20}$/.test(ref)) {
    console.error('[release-staging-history] NE ZNAM: --ref mora biti Supabase project ref.');
    process.exit(2);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error('[release-staging-history] NE ZNAM: SUPABASE_ACCESS_TOKEN nije postavljen.');
    process.exit(2);
  }
  let rows;
  try {
    rows = await fetchAppliedMigrations(ref, token);
  } catch (e) {
    console.error(`[release-staging-history] NE ZNAM: dnevnik migracija nije procitan (${e.message}).`);
    process.exit(2);
  }
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const { placeholders, problems } = stagingHistoryPlan(rows, readdirSync(dir));
  if (problems.length > 0) {
    for (const p of problems) console.error(`[release-staging-history] ${p}`);
    process.exit(1);
  }
  for (const v of placeholders) {
    writeFileSync(join(dir, `${v}_privremeno_samo_u_bazi.sql`), `-- Privremeno: verzija ${v} postoji samo u bazi (Katedra). Ne commitati.\n`);
  }
  console.log(`[release-staging-history] OK na ${ref}: ${placeholders.length} placeholdera (${placeholders.join(', ') || 'nijedan'}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
