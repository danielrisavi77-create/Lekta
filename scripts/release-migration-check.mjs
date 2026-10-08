#!/usr/bin/env node
// scripts/release-migration-check.mjs
//
// Preduvjet objave jednim gumbom (.github/workflows/release.yml): su li migracije koje Edge
// funkcije iz objave trebaju STVARNO primijenjene na ciljnom projektu.
//
// ZASTO. `repair-docx` iz #294 cita `repair_attempt_log` iz 0209. Bez te migracije fail-closed
// strop pokusaja vraca 503 na SVAKI popravak (docs/deploy/EDGE_DEPLOY_T20.md, val 0). Deploy
// funkcije prije migracije zato nije "malo ranije", nego ispad popravka.
//
// Skripta je READ-ONLY: cita dnevnik migracija kroz Management API i nista ne primjenjuje.
// Migracije i dalje primjenjuje iskljucivo vlasnik, `supabase db push` (supabase/CLAUDE.md).
//
// Identitet se trazi po IMENU, ne po verziji (docs/deploy/MIGRATION_IDENTITY.md): dio migracija je
// primijenjen MCP alatom pa nosi timestamp verziju, ali ime je sacuvano.
//
// Pokretanje:
//   SUPABASE_ACCESS_TOKEN=... node scripts/release-migration-check.mjs \
//     --ref <project-ref> --migrations 0207_monetizacija_v1,0209_repair_limit_po_korisniku
//
// Izlaz: 0 = sve trazene su primijenjene; 1 = barem jedna nedostaje; 2 = NE ZNAM (nema tokena,
// API nije odgovorio, neispravan ulaz). NE ZNAM nije prolaz: workflow ga tretira kao pad.

import { pathToFileURL } from 'node:url';

const API = 'https://api.supabase.com/v1';

/**
 * Kljuc po kojem se migracija prepoznaje bez obzira na to kako je zavedena. Isto pravilo kao
 * `identity` u scripts/migration-identity.mjs (vodeci broj, prefiks `Lekta:`, razmaci, velika slova).
 */
export function migrationKey(raw) {
  return String(raw)
    .replace(/\.sql$/i, '')
    .replace(/^\d{4,}_/, '')
    .replace(/^lekta\s*:\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Trazene migracije koje u dnevniku ciljnog projekta nema. `applied` su retci Management APIja
 * (`{ version, name }`). Prazan kljuc trazene migracije je neispravan ulaz, ne prolaz.
 */
export function missingMigrations(applied, required) {
  const have = new Set(applied.map((r) => migrationKey(r?.name ?? r?.version ?? '')));
  const missing = [];
  for (const name of required) {
    const key = migrationKey(name);
    if (!key) throw new Error(`Neispravno ime trazene migracije: "${name}"`);
    if (!have.has(key)) missing.push(name);
  }
  return missing;
}

/** `--ref x --migrations a,b` u objekt; razmak ili zarez razdvajaju imena. */
export function parseArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? argv[i + 1] : undefined;
    return v && !v.startsWith('--') ? v.trim() : '';
  };
  const ref = value('--ref');
  const required = value('--migrations').split(/[\s,]+/).filter(Boolean);
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error('--ref mora biti Supabase project ref (20 znakova a-z0-9).');
  if (required.length === 0) throw new Error('--migrations mora imenovati barem jednu migraciju.');
  return { ref, required };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[release-migration-check] NE ZNAM: ${e.message}`);
    process.exit(2);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error('[release-migration-check] NE ZNAM: SUPABASE_ACCESS_TOKEN nije postavljen.');
    process.exit(2);
  }
  let rows;
  try {
    const res = await fetch(`${API}/projects/${opts.ref}/database/migrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('odgovor nije popis');
  } catch (e) {
    console.error(`[release-migration-check] NE ZNAM: dnevnik migracija nije procitan (${e.message}).`);
    process.exit(2);
  }
  const missing = missingMigrations(rows, opts.required);
  if (missing.length > 0) {
    console.error(`[release-migration-check] NEDOSTAJE na ${opts.ref}: ${missing.join(', ')}. `
      + 'Vlasnik prvo primjenjuje migraciju (`supabase db push`), tek onda objava.');
    process.exit(1);
  }
  console.log(`[release-migration-check] OK na ${opts.ref}: ${opts.required.join(', ')} (${rows.length} zapisa u dnevniku).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
