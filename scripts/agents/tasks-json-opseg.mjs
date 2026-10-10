#!/usr/bin/env node
// Gard DAN-79 (odluka vlasnika 2026-10-08): PR zadatka ne dira `docs/agents/tasks.json`.
//
// Status zadataka zivi u Linearu. Svaka izmjena `tasks.json` u PR-u zadatka sudarala se s ostalim
// otvorenim PR-ovima nakon svakog spoja i tjerala puni gate ispocetka. `tasks.json` smije mijenjati
// samo koordinatorov skupni PR koji ne dira nista drugo, pa gard odbija PR koji mijenja `tasks.json`
// ZAJEDNO s bilo kojom drugom putanjom.
//
// Blokira spajanje: CI job `pr-opis` je obvezna provjera grane (ruleset "master", odluka vlasnika
// 2026-10-09; vidi pr-opis.yml).
//
// Cista funkcija `provjeriOpsegTasksJson` ne pokrece git; testira je
// `tests/gate-mutations-tasks-json.test.ts`. CLI (`<baseRef> <headRef>`) koristi CI job `pr-opis`.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TASKS_JSON = 'docs/agents/tasks.json';

/**
 * Popis problema za putanje koje PR mijenja (prazan popis je cisto).
 * `putanje` je popis TOCNIH imena iz `git diff -z --name-only --no-renames`; preimenovanje se tako
 * vidi kao brisanje stare i dodavanje nove putanje, pa ni premjestanje `tasks.json` ne prolazi tiho.
 * Imena se ne rezu i ne normaliziraju (git dopusta razmake i CR u imenu), samo se prazna odbacuju.
 */
export function provjeriOpsegTasksJson(putanje) {
  if (!Array.isArray(putanje) || putanje.some((p) => typeof p !== 'string')) {
    throw new TypeError('provjeriOpsegTasksJson: ocekivan niz putanja');
  }
  const cisto = putanje.filter((p) => p !== '');
  if (!cisto.includes(TASKS_JSON)) return [];
  const ostale = cisto.filter((p) => p !== TASKS_JSON);
  if (ostale.length === 0) return [];
  return [
    `${TASKS_JSON} se mijenja zajedno s ${ostale.length} drugih putanja (${ostale.slice(0, 5).join(', ')}` +
      `${ostale.length > 5 ? ', ...' : ''}). Status zadatka ide u Linear; tasks.json mijenja samo ` +
      'koordinatorov skupni PR koji ne dira nista drugo (docs/agents/README.md, "Ugovor reda zadataka").',
  ];
}

function putanjeIzGita(baseRef, headRef) {
  return execFileSync('git', ['diff', '-z', '--name-only', '--no-renames', `${baseRef}...${headRef}`], { encoding: 'utf8' })
    .split('\0')
    .filter((p) => p !== '');
}

function glavni(argv) {
  const [baseRef, headRef] = argv;
  if (!baseRef || !headRef) throw new Error('uporaba: tasks-json-opseg.mjs <baseRef> <headRef>');
  const problemi = provjeriOpsegTasksJson(putanjeIzGita(baseRef, headRef));
  for (const p of problemi) console.log(`::error title=tasks-json-opseg::${p}`);
  if (problemi.length) return 1;
  console.log(`${TASKS_JSON}: opseg PR-a je u redu.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = glavni(process.argv.slice(2));
  } catch (err) {
    console.error(`tasks-json-opseg: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  }
}
