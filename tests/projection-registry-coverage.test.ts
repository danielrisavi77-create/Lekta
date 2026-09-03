/**
 * Gard: drift test koji zna kako se artefakt regenerira mora imati i SCREENING unos.
 *
 * Zasto postoji, izmjereno na vlastitoj gresci 2026-09-03: popravio sam `faculty-matrix`, cime je
 * `completion-ledger` (koji tu datoteku cita kao ulaz) postao ustajao. Nijedan screening to nije
 * javio, jer `completion-ledger` nije bio u `PROJECTIONS`. Kvar je otkrio tek CI, jedan pad na
 * 5242 testa, i to nakon punog prolaza koji traje desetak minuta.
 *
 * Rucno dodavanje jednog unosa ne rjesava uzrok: popis ce opet zaostati, jer se dodaje rukom a
 * projekcije nastaju stalno. Zato se popis USPOREDJUJE s onim sto testovi sami priznaju: drift test
 * koji u poruci kaze "inace: npm run X" time izjavljuje da je X pecena projekcija.
 *
 * RATCHET, ne tvrda nula: sest projekcija je zateceno neregistrirano i njihovo registriranje trazi
 * da se za svaku utvrde IZVORI, sto je istrazivanje po projekciji, a kriv popis izvora daje laznu
 * sigurnost. Popis zato smije samo PADATI; nova neregistrirana projekcija pada odmah.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECTIONS } from '../scripts/projection-freshness-core.mjs';

const ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

/** Naredbe koje drift testovi preporucuju: potpis je doslovan `inace: npm run X`. */
function hintedCommands(): string[] {
  const found = new Set<string>();
  for (const f of readdirSync(join(ROOT, 'tests')).filter((n) => n.endsWith('.test.ts'))) {
    const src = readFileSync(join(ROOT, 'tests', f), 'utf8');
    for (const m of src.matchAll(/inace: npm run ([a-z0-9:_-]+)/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** npm skripte koje `PROJECTIONS` zna regenerirati. */
function registeredScripts(): Set<string> {
  const out = new Set<string>();
  for (const p of PROJECTIONS as Array<{ regenerate: string }>) {
    const m = /^npm run ([a-z0-9:_-]+)$/.exec(p.regenerate);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Zatecено 2026-09-03. Svaka od ovih ima drift test, ali nema screening: kad joj se izvor
 * promijeni, nitko to ne vidi do punog prolaza. Skidaj s popisa tako da im utvrdis izvore i dodas
 * ih u `PROJECTIONS`, nikad tako da ublazis tvrdnju.
 */
const NEREGISTRIRANE_RATCHET = [
  'citation-dossiers',
  'reconcile-programs',
  'repair-gap',
  'scored-value-drift',
  'worklist',
];

/** Hint koji imenuje nepostojecu skriptu salje citatelja u prazno. Zatecено: jedan. */
const NEPOSTOJECE_RATCHET = ['repair-real-corpus-backlog'];

describe('pokrivenost registra projekcija', () => {
  it('svaki drift hint imenuje npm skriptu koja postoji', () => {
    const nepostojece = hintedCommands().filter((c) => !(c in pkg.scripts));
    expect(nepostojece.sort()).toEqual([...NEPOSTOJECE_RATCHET].sort());
    expect(
      nepostojece.length,
      'ratchet smije samo padati: popravi hint ili skrati popis',
    ).toBeLessThanOrEqual(NEPOSTOJECE_RATCHET.length);
  });

  it('svaka projekcija s drift testom je registrirana, osim zatecenog ratcheta', () => {
    const registrirane = registeredScripts();
    const neregistrirane = hintedCommands()
      .filter((c) => c in pkg.scripts)
      .filter((c) => !registrirane.has(c));
    expect(neregistrirane.sort()).toEqual([...NEREGISTRIRANE_RATCHET].sort());
  });

  /** Ratchet koji raste nije ratchet. Brojka je zakovana da ga nitko ne "prosiri" u prolazu. */
  it('ratchet ne smije rasti', () => {
    expect(NEREGISTRIRANE_RATCHET.length).toBeLessThanOrEqual(5);
    expect(NEPOSTOJECE_RATCHET.length).toBeLessThanOrEqual(1);
  });

  /** Negativna kontrola: detektor mora vidjeti registraciju koja POSTOJI. */
  it('detektor prepoznaje registrirane projekcije', () => {
    const reg = registeredScripts();
    expect(reg.has('completion-ledger'), 'ledger je registriran 2026-09-03').toBe(true);
    expect(reg.has('closed-loop')).toBe(true);
    expect(reg.has('repair-recipe')).toBe(true);
  });
});
