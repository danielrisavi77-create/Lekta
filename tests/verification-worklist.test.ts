/**
 * Drift gard za verifikacijski worklist (data/verification/dossiers/**).
 *
 * Zasto postoji: commitani INDEX.md je tvrdio 2150 bodovanih pravila i 26 za ljudski audit, dok
 * je ziva regeneracija davala 2208 i 38 kroz 8 profila. Ustajali izvjestaj o verifikaciji gori je
 * od nikakvog, jer se po njemu planira ljudski rad. Coverage matrica je takav gard imala
 * (tests/coverage-report.test.ts), dosjei ga nisu.
 *
 * Kad padne: `npm run worklist` pa commitaj regenerirani izlaz.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  DRAFT_PROFILE_IDS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist, BULK_APPROVAL } from '../src/verification/worklist';
import storedCoverage from '../data/coverage/scored-coverage.json';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const registered = new Set(profiles.map((p) => p.id));
const orphans = DRAFT_PROFILE_IDS.filter((id) => !registered.has(id));

const fresh = computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], orphans);
const DOSSIER_DIR = 'data/verification/dossiers';

/**
 * core.autocrlf=true pretvara ove .md u CRLF na checkoutu, a generator ih pise s \n. Gard cuva
 * SADRZAJ, ne politiku zavrsetaka redaka, pa se usporedjuje normalizirano.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('verifikacijski worklist je u koraku s pravilima', () => {
  it('svaka commitana datoteka je identicna svjezem izracunu (inace: npm run worklist)', () => {
    for (const [rel, content] of Object.entries(fresh.files)) {
      const onDisk = normalize(readFileSync(resolve(process.cwd(), rel), 'utf8'));
      expect(onDisk, `${rel} je ustajao`).toBe(content);
    }
  });

  it('u dosjeima nema datoteke koju generator vise ne pise (uklonjen audit ostavlja trag)', () => {
    const expected = new Set(
      Object.keys(fresh.files).map((rel) => rel.slice(rel.lastIndexOf('/') + 1)),
    );
    const actual = readdirSync(resolve(process.cwd(), DOSSIER_DIR)).filter((f) => f.endsWith('.md'));
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it('dosje se pise tocno za profile koji imaju bulk ili recheck', () => {
    const withWork = fresh.rows.filter((r) => r.bulk || r.recheck).map((r) => r.profileId).sort();
    const dossiers = Object.keys(fresh.files)
      .filter((rel) => !rel.endsWith('INDEX.md'))
      .map((rel) => rel.slice(rel.lastIndexOf('/') + 1, -'.md'.length))
      .sort();
    expect(dossiers).toEqual(withWork);
  });

  it('nijedan draft ne zivi mimo registra profila', () => {
    expect(fresh.orphanDraftProfileIds).toEqual([]);
  });

  /**
   * Ovo je poanta P0-2: dva broja koja su izgledala kao nepomirena razlika ("2135 vs 2150") mjere
   * dvije razlicite populacije. Worklist broji SVA bodovana pravila jer ih covjek sva mora proci;
   * coverage broji samo strojno provjerljiva jer su ona nazivnik omjera. Test to zakljucava, pa se
   * razlika vise ne moze citati kao kvar ni tiho promijeniti.
   */
  it('scoredTotal je nadskup coverage brojnika, s tocno objasnjenom razlikom', () => {
    expect(fresh.totals.scoredTotal).toBe(storedCoverage.scoredTotal);
    expect(fresh.totals.scoredTotal).toBeGreaterThan(storedCoverage.scoredMachineCheckable);
    expect(fresh.totals.scoredTotal - storedCoverage.scoredMachineCheckable).toBe(
      storedCoverage.scoredNonMachineCheckable,
    );
  });

  it('bulk i human su disjunktni podskupovi bodovanih pravila', () => {
    for (const row of fresh.rows) {
      expect(row.bulk + row.human).toBeLessThanOrEqual(row.scored);
    }
    expect(fresh.totals.bulk + fresh.totals.human).toBe(fresh.totals.scoredTotal);
    expect(BULK_APPROVAL).toBe('owner-bulk-approval');
  });
});
