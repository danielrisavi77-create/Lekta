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
      expect(r.lekta === null || typeof r.lekta === 'number', r.dokument).toBe(true);
      expect(r.katedra === null || typeof r.katedra === 'number', r.dokument).toBe(true);
      expect(classifyOutcome(r.lekta, r.katedra), `${r.dokument}/${r.os}`).toBe(r.ishod);
    }
  });

  /**
   * `lekta-ne-mjeri` mora biti ZASTUPLJEN, i to je anti-vakuumska tvrdnja, ne kozmetika.
   *
   * Lektine citatne provjere nisu univerzalne: emitiraju se samo za profile koji citiranje propisuju.
   * Dok se odsutnost provjere brojala kao `lekta = 0`, artefakt je tvrdio da je Lekta gledala i nista
   * nasla, pa je 17 redaka lazno ispalo `samo-katedra`, dakle "Lektina provjera je slijepa". Da taj
   * razred opet utihne (netko vrati staru izvedbu), broj razilazenja bi SKOCIO, a to izgleda kao
   * bogatiji nalaz umjesto kao regresija mjerenja.
   */
  it('razlikuje profil na kojem Lekta os NE MJERI od onoga na kojem nije nasla nalaz', () => {
    const neMjeri = a.rows.filter((r) => r.lekta === null);
    expect(neMjeri.length, 'nijedan redak; je li se odsutnost provjere opet stopila s praznim nalazom?').toBeGreaterThan(10);
    for (const r of neMjeri) expect(r.ishod, `${r.dokument}/${r.os}`).toBe('lekta-ne-mjeri');
    // Kontrola u drugom smjeru: mora postojati i redak na kojem je Lekta DOISTA mjerila.
    expect(a.rows.some((r) => typeof r.lekta === 'number'), 'Lekta ne mjeri nijednu os').toBe(true);
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
