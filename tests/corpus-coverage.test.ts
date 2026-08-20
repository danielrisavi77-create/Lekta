/**
 * Faza 6 (Lekta Error Corpus): coverage izvjestaj je KONZISTENTAN i posten.
 *
 * Kljucne invarijante: (1) svaki korpusni slucaj cilja checkId koji stvarno postoji u registru
 * stabilnih ID-eva i odgovara naslovu koji cilja (nema drifta katalog<->registar); (2) coverage
 * se racuna nad stvarnim inventarom; (3) gap-backlog je neprazan, prioritiziran i bez izmisljenog
 * P0 (nemamo parser-crash nalaz) - transparentno prikazuje sto JOS nije pokriveno.
 */
import { describe, it, expect } from 'vitest';
import { buildCoverage, renderCoverageMarkdown, renderGapBacklog, KNOWN_HARD, KNOWN_ADVISORY } from './corpus/coverage/coverage-report';
import committedCoverage from './corpus/reports/check-coverage.json';
import { ATOMIC_CASES } from './corpus/catalog/atomic';
import { VALID_CONTROL_CASES } from './corpus/catalog/valid-controls';
import { BOUNDARY_CASES } from './corpus/catalog/boundary';
import { LEGAL_ATOMIC_CASES, LEGAL_VALID_CASES } from './corpus/catalog/legal';
import { PROFILE_ATOMIC_CASES } from './corpus/catalog/profile-enabled';
import { FOOTNOTE_ATOMIC_CASES } from './corpus/catalog/footnote-format';
import { TOC_ATOMIC_CASES } from './corpus/catalog/toc-hierarchy';
import { SCHEME_PUNCT_ATOMIC_CASES } from './corpus/catalog/scheme-punctuation';
import { INFORMATIVE_VALID_CASES } from './corpus/catalog/informative-controls';
import { CHECK_ID_BY_TITLE, stableCheckId } from './corpus/ids/check-id-registry';

const ALL_CASES = [...ATOMIC_CASES, ...LEGAL_ATOMIC_CASES, ...PROFILE_ATOMIC_CASES, ...FOOTNOTE_ATOMIC_CASES, ...TOC_ATOMIC_CASES, ...SCHEME_PUNCT_ATOMIC_CASES, ...VALID_CONTROL_CASES, ...LEGAL_VALID_CASES, ...INFORMATIVE_VALID_CASES, ...BOUNDARY_CASES];
const KNOWN_IDS = new Set(Object.values(CHECK_ID_BY_TITLE));

describe('Lekta Error Corpus - coverage izvjestaj (faza 6)', () => {
  it('svaki slucaj cilja postojeci, konzistentan checkId (nema drifta katalog<->registar)', () => {
    for (const c of ALL_CASES) {
      expect(KNOWN_IDS.has(c.expect.checkId), `${c.id}: checkId "${c.expect.checkId}" nije u registru`).toBe(true);
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" -> ID ne odgovara deklariranom`).toBe(c.expect.checkId);
    }
  });

  it('coverage se racuna nad stvarnim inventarom', () => {
    const rep = buildCoverage();
    expect(rep.rows.length).toBeGreaterThanOrEqual(60);
    expect(rep.summary.scoredChecks).toBeGreaterThanOrEqual(30);
    // Broj bodovanih s atomskim = broj razlicitih atomskih checkId-eva koji su bodovani.
    expect(rep.summary.scoredWithAtomic).toBeGreaterThanOrEqual(10);
    expect(rep.summary.scoredAtomicPct).toBeGreaterThan(0);
    expect(rep.summary.scoredAtomicPct).toBeLessThanOrEqual(100);
    expect(rep.summary.atomicCases).toBe(ATOMIC_CASES.length + LEGAL_ATOMIC_CASES.length + PROFILE_ATOMIC_CASES.length + FOOTNOTE_ATOMIC_CASES.length + TOC_ATOMIC_CASES.length + SCHEME_PUNCT_ATOMIC_CASES.length);
    expect(rep.summary.boundaryCases).toBe(BOUNDARY_CASES.length);
  });

  it('svaka provjera s atomic/valid/boundary oznakom stvarno ima odgovarajuci slucaj', () => {
    const rep = buildCoverage();
    const atomicIds = new Set([...ATOMIC_CASES, ...LEGAL_ATOMIC_CASES, ...PROFILE_ATOMIC_CASES, ...FOOTNOTE_ATOMIC_CASES, ...TOC_ATOMIC_CASES, ...SCHEME_PUNCT_ATOMIC_CASES].map((c) => c.expect.checkId));
    const validIds = new Set([...VALID_CONTROL_CASES, ...LEGAL_VALID_CASES, ...INFORMATIVE_VALID_CASES].map((c) => c.expect.checkId));
    const boundaryIds = new Set(BOUNDARY_CASES.map((c) => c.expect.checkId));
    for (const r of rep.rows) {
      if (r.hasAtomic) expect(atomicIds.has(r.checkId!)).toBe(true);
      if (r.hasValidControl) expect(validIds.has(r.checkId!)).toBe(true);
      if (r.hasBoundary) expect(boundaryIds.has(r.checkId!)).toBe(true);
    }
  });

  it('gap-backlog je neprazan, prioritiziran i bez izmisljenog P0', () => {
    const rep = buildCoverage();
    expect(rep.gaps.length).toBeGreaterThan(0);
    for (const g of rep.gaps) {
      expect(['P0', 'P1', 'P2', 'P3']).toContain(g.priority);
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.desiredTest.length).toBeGreaterThan(0);
    }
    // Nemamo parser-crash/sigurnosni nalaz pa ne izmisljamo P0.
    expect(rep.gaps.filter((g) => g.priority === 'P0')).toEqual([]);
  });

  it('renderi daju neprazne artefakte', () => {
    const rep = buildCoverage();
    expect(renderCoverageMarkdown(rep)).toContain('coverage');
    expect(renderGapBacklog(rep)).toContain('gap-backlog');
  });

  /**
   * Registar poznatih rupa ne smije postati mjesto gdje posao tiho parkira.
   *
   * Zateceno 2026-08-20: 19 od 23 zapisa u KNOWN_HARD opisivalo je rupe koje su odavno zatvorene
   * (npr. "Builder ne kontrolira oblik fusnota" dok footnote-format.ts pokriva sva cetiri fusnotna
   * checkId-a). Kod ih nikad ne cita, jer pokrivena provjera ne postane rupa, pa postoci nisu bili
   * krivi. Steta je bila u tome sto se preostale PRAVE rupe utope medju laznima.
   *
   * Pokrivenost se racuna iz `rep.rows`, dakle iz ISTOG izvora koji izvjestaj koristi, a ne iz
   * zasebnog popisa koji bi mogao odlutati na svoju stranu.
   */
  describe('registar poznatih rupa ne smije zastarjeti', () => {
    /**
     * Zapis je ZIV samo ako njegov razlog stvarno zavrsi u gap-backlogu. Slabija tvrdnja
     * ("checkId nema fail-slucaj") propusta drugi oblik smrti: kad provjera postane informativna,
     * razlog dolazi iz KNOWN_ADVISORY grane, pa KNOWN_HARD zapis ostaje nepročitan. Oba su oblika
     * izmjerena 2026-08-20 (19 pokrivenih + 2 informativna od 23 zapisa).
     */
    it('svaki KNOWN_HARD zapis stvarno daje razlog nekoj rupi', () => {
      const rep = buildCoverage();
      const byId = new Map(rep.gaps.map((g) => [g.checkId, g]));
      const dead = Object.entries(KNOWN_HARD)
        .filter(([id, entry]) => byId.get(id)?.reason !== entry.reason)
        .map(([id]) => id);
      expect(dead, 'ovi zapisi se nikad ne citaju; obrisi ih iz KNOWN_HARD').toEqual([]);
    });

    it('svaki KNOWN_ADVISORY zapis stvarno daje razlog nekoj rupi', () => {
      const rep = buildCoverage();
      const byId = new Map(rep.gaps.map((g) => [g.checkId, g]));
      const dead = Object.entries(KNOWN_ADVISORY)
        .filter(([id, entry]) => byId.get(id)?.reason !== entry.reason)
        .map(([id]) => id);
      expect(dead, 'ovi zapisi se nikad ne citaju; obrisi ih iz KNOWN_ADVISORY').toEqual([]);
    });

    it('svaki zapis pripada provjeri koja stvarno postoji u inventaru', () => {
      const rep = buildCoverage();
      const known = new Set(rep.rows.map((r) => r.checkId).filter(Boolean) as string[]);
      const orphans = [...Object.keys(KNOWN_HARD), ...Object.keys(KNOWN_ADVISORY)].filter((id) => !known.has(id));
      expect(orphans, 'zapis gadja checkId kojeg nema u inventaru provjera').toEqual([]);
    });
  });

  /**
   * Commitani artefakt mora odgovarati zivom izracunu.
   *
   * Zateceno 2026-08-20: `check-coverage.json` je tvrdio 3 rupe dok ih je zivo bilo 7, i za
   * `citation.direct-quote-locator` je tvrdio `hasAtomic: true` iako taj checkId ima samo
   * valid-control, dakle nijedan dokaz da provjera moze PASTI. Artefakt je time PRECJENJIVAO
   * pokrivenost, sto je tocno suprotno od svrhe modula ("NE lazira 100%").
   *
   * Nista to nije usporedjivalo, pa je odlutao tiho. Isti obrazac kao repair-real-corpus.test.ts,
   * koji svoj generirani izvjestaj usporedjuje na isti nacin.
   */
  it('commitani check-coverage.json odgovara zivom izracunu', () => {
    expect(
      JSON.parse(JSON.stringify(buildCoverage())),
      'artefakt je odlutao: pokreni `npm run corpus:coverage` i commitaj rezultat',
    ).toEqual(committedCoverage);
  });
});
