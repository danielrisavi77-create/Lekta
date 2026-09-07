/**
 * GARD NAD USPOREDBOM DVAJU ALATA (`docs/generated/skill-compare.json`).
 *
 * Artefakt se NE moze regenerirati u CI-ju: usporedba trazi Python i Katedrin paket, kojih na
 * runneru nema. Zato NIJE registriran kao projekcija (`PROJECTIONS`): gard koji trazi svjezinu
 * artefakta koji se ondje ne moze ispeci obarao bi CI na uvjetu koji se ne moze ispuniti. Ovaj test
 * zato cuva UGOVOR zapisa i njegovu netrivijalnost, ne svjezinu.
 *
 * Presuda o ishodu se ovdje PONOVNO IZVODI iz brojki (`classifyOutcome`), ne cita iz zapisa. Redak
 * koji nosi ishod koji ne slijedi iz vlastitih brojki time pada, umjesto da se prepise kao istina.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyOutcome,
  comparisonIsVacuous,
  divergentRows,
  type ComparisonRow,
} from '../src/corpus/tool-comparison';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTEFAKT = join(ROOT, 'docs', 'generated', 'skill-compare.json');

interface Artefakt {
  schemaVersion: number;
  summary: { documentCount: number; comparisonCount: number; byOutcome: Record<string, number> };
  rows: ComparisonRow[];
  generatedAt?: string;
  generatedFromCommit?: string;
}

const a = JSON.parse(readFileSync(ARTEFAKT, 'utf8')) as Artefakt;

describe('usporedba dvaju alata: ugovor artefakta', () => {
  it('nosi verziju sheme i provenijenciju', () => {
    expect(a.schemaVersion).toBe(1);
    expect(a.generatedAt).toBeTruthy();
    expect(a.generatedFromCommit).toBeTruthy();
  });

  it('mjeri vise dokumenata i vise osi', () => {
    expect(a.summary.documentCount).toBeGreaterThan(1);
    expect(a.summary.comparisonCount).toBe(a.rows.length);
    expect(new Set(a.rows.map((r) => r.os)).size).toBeGreaterThan(1);
    expect(new Set(a.rows.map((r) => r.dokument)).size).toBe(a.summary.documentCount);
  });

  it('zbroj po ishodu se slaze s redcima, pa sazetak ne moze odlutati od podatka', () => {
    const izracunat: Record<string, number> = {};
    for (const r of a.rows) izracunat[r.ishod] = (izracunat[r.ishod] ?? 0) + 1;
    expect(izracunat).toEqual(a.summary.byOutcome);
  });

  it('svaki zapisan ishod slijedi iz vlastitih brojki', () => {
    for (const r of a.rows) {
      expect(typeof r.lekta, r.dokument).toBe('number');
      expect(r.katedra === null || typeof r.katedra === 'number', r.dokument).toBe(true);
      expect(classifyOutcome(r.lekta, r.katedra), `${r.dokument}/${r.os}`).toBe(r.ishod);
    }
  });
});

describe('usporedba dvaju alata: netrivijalnost', () => {
  /**
   * Sve na `nitko` izgleda kao slaganje, a znaci da jedna strana vise ne mjeri nista. To je glavni
   * razred laznog zelenog ovdje, jer Katedrin JSON moze promijeniti polje bez ijedne greske.
   */
  it('nije vakuumska: barem jedna os daje nalaz na barem jednoj strani', () => {
    expect(comparisonIsVacuous(a.rows), 'nijedna strana nije nista nasla; jesu li skripte trcale?').toBe(false);
  });

  /**
   * Razilazenje je jedini razlog zbog kojeg se dva alata usporedjuju: slaganje se moglo dobiti i
   * jednim. Kad razilazenja nema, usporedba je ili savrsena ili slijepa, i to treba primijetiti.
   */
  it('biljezi razilazenje, jer je ono jedini razlog usporedbe', () => {
    expect(divergentRows(a.rows).length).toBeGreaterThan(0);
  });
});
