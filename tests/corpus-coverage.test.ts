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
    it('KNOWN_HARD ne sadrzi checkId koji vec ima fail-slucaj', () => {
      const rep = buildCoverage();
      const covered = new Set(
        rep.rows.filter((r) => r.checkId && (r.hasAtomic || r.hasBoundary)).map((r) => r.checkId as string),
      );
      const dead = Object.keys(KNOWN_HARD).filter((id) => covered.has(id));
      expect(
        dead,
        'ovi zapisi tvrde da se rupa ne moze zatvoriti, a vec je zatvorena; obrisi ih iz KNOWN_HARD',
      ).toEqual([]);
    });

    it('KNOWN_ADVISORY ne sadrzi checkId koji vec ima valid-control', () => {
      const rep = buildCoverage();
      const covered = new Set(
        rep.rows.filter((r) => r.checkId && r.hasValidControl).map((r) => r.checkId as string),
      );
      const dead = Object.keys(KNOWN_ADVISORY).filter((id) => covered.has(id));
      expect(dead, 'obrisi ih iz KNOWN_ADVISORY: valid-control vec postoji').toEqual([]);
    });

    it('svaki zapis pripada provjeri koja stvarno postoji u inventaru', () => {
      const rep = buildCoverage();
      const known = new Set(rep.rows.map((r) => r.checkId).filter(Boolean) as string[]);
      const orphans = [...Object.keys(KNOWN_HARD), ...Object.keys(KNOWN_ADVISORY)].filter((id) => !known.has(id));
      expect(orphans, 'zapis gadja checkId kojeg nema u inventaru provjera').toEqual([]);
    });
  });
});
