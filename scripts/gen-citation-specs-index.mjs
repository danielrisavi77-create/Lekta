#!/usr/bin/env node
/**
 * Build-time generator LAGANOG indeksa citation-specova za klijentski citat.html
 * (perf: skini ~479 KB gzip s citat-*.js glavnog chunka).
 *
 * data/tools/citation-specs/verified/*.json (71 datoteka, pun sadrzaj: evidence, sourceTypes,
 * bibliography...) se ucitavaju u src/citations/faculty-styles.ts. Dropdown u citat.html (fakultet
 * -> stil) treba samo par sitnih polja PRIJE nego korisnik uopce nesto odabere; ostatak (formatFromSpec)
 * treba TEK kad korisnik stvarno pise citat. Ova skripta izvlaci ta sitna polja u JEDAN eager JSON:
 *   data/tools/citation-specs/verified-index.json : [{ file, facultyId, styleToken, outcome, label,
 *     sourceLabel, verifiedAt }] - "file" je ime izvorne datoteke, koristi ga
 *     ensureFacultySpecsLoaded() u faculty-styles.ts da spoji lijeno ucitan puni spec natrag u pravi
 *     FacultyStyle objekt (import.meta.glob bez eager:true i dalje kodno dijeli svih 71 datoteka
 *     u zasebne chunkove, dohvacene odmah na init(), fire-and-forget, ne blokirajuci glavni chunk).
 *
 * Izvor istine ostaje data/tools/citation-specs/verified/*.json. Drift hvata
 * tests/faculty-styles.test.ts (regeneriraj pa commitaj: node scripts/gen-citation-specs-index.mjs).
 *
 * Pokreni:  node scripts/gen-citation-specs-index.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data/tools/citation-specs/verified');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

const index = files.map((file) => {
  const spec = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  return {
    file,
    facultyId: spec.facultyId,
    styleToken: spec.styleToken,
    outcome: spec.outcome,
    label: spec.label,
    sourceLabel: spec.sourceLabel,
    verifiedAt: spec.verifiedAt ?? null,
  };
});

writeFileSync(
  join(root, 'data/tools/citation-specs/verified-index.json'),
  JSON.stringify(index, null, 2) + '\n',
);
console.log(`verified-index.json: ${index.length} specova (light).`);
