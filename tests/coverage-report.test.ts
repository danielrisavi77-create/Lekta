import { describe, it, expect } from 'vitest';

import storedCoverage from '../data/coverage/scored-coverage.json';
import manifest from '../data/manifest.json';
import { computeCoverageMatrix, type NoRulesReasons } from '../src/verification/coverage-report';
import noRulesReasons from '../data/profiles/no-rules-reasons.json';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

describe('coverage matrica: preracunata i spremljena (sekcija 6)', () => {
  it('stored scored-coverage.json deep-equals zivi izracun (drift guard)', () => {
    const fresh = computeCoverageMatrix(
      profiles,
      SOURCE_REGISTRY as SourceEntry[],
      noRulesReasons.reasons as NoRulesReasons,
    );
    expect(storedCoverage).toEqual(fresh);
  });

  it('bodovane celije imaju ratio i lastVerified; nebodovane nemaju', () => {
    expect(storedCoverage.scoredMachineCheckable).toBeGreaterThan(0);
    const integ = storedCoverage.cells.find((c) => c.profileId === 'pravo-integrirani-diplomski')!;
    expect(integ.scoredMachineCheckable).toBeGreaterThan(0);
    for (const cell of storedCoverage.cells) {
      if (cell.scoredMachineCheckable > 0) {
        expect(cell.ratio).toBeGreaterThan(0);
        expect(cell.lastVerified).not.toBeNull();
      } else if (cell.machineCheckable === 0) {
        // Bez strojno provjerljivih pravila omjer je null, ne 0: nula bi lazno sugerirala
        // izmjeren promasaj tamo gdje mjerenja uopce nije bilo.
        expect(cell.ratio).toBeNull();
      } else {
        expect(cell.ratio).toBe(0);
      }
    }
  });

  /**
   * Od P2-2 matrica pokriva SVAKI profil, i onaj bez ijednog pravila. Prije je takav profil samo
   * izostajao, pa se 24 njih nije moglo razlikovati od pokrivenih - tiho odsustvo je izgledalo
   * isto kao da profila nema.
   */
  it('svaki profil ima celiju, a celija bez pravila ima izricito stanje', () => {
    expect(storedCoverage.cells).toHaveLength(profiles.length);
    for (const cell of storedCoverage.cells) {
      if (cell.machineCheckable > 0) {
        expect(cell.scoredTotal + cell.advisory).toBeGreaterThan(0);
      } else {
        expect(['no-rules-sourced', 'no-technical-rules', 'source-not-found', 'advisory-only']).toContain(cell.state);
      }
    }
  });

  /**
   * `no-rules-sourced` je ZADANO stanje i znaci "jos nismo istrazili", a ne "pravila nema".
   * Zakljucak o odsutnosti pravila smije doci samo iz `no-rules-reasons.json`, gdje ga je covjek
   * potpisao. Test cuva da se to dvoje ne izjednaci.
   */
  it('dokazano odsustvo pravila dolazi samo iz istrazenih razloga', () => {
    const researched = new Set(Object.keys(noRulesReasons.reasons));
    for (const cell of storedCoverage.cells) {
      if (cell.state === 'no-technical-rules' || cell.state === 'source-not-found') {
        expect(researched.has(cell.profileId), `${cell.profileId}: stanje bez potpisanog razloga`).toBe(true);
      }
    }
  });

  /**
   * P0-2 (docs/PLAN_POTPUNA_POKRIVENOST.md): dva broja koja su izgledala kao nepomirena razlika
   * ("2135 vs 2150") mjere dvije razlicite populacije. Otkad svaka nosi svoje ime, razlika mora
   * biti IZRACUNATA i RAZLOZENA, a ne prepricana. Test pada i ako se razlika promijeni bez
   * osvjezenog razlaganja po checkId-u.
   */
  it('razlika strojno provjerljivih i svih bodovanih je razlozena po checkId-u', () => {
    const { scoredMachineCheckable, scoredTotal, scoredNonMachineCheckable } = storedCoverage;
    expect(scoredTotal - scoredMachineCheckable).toBe(scoredNonMachineCheckable);
    const breakdown = Object.values(storedCoverage.nonMachineCheckableByCheckId);
    expect(breakdown.reduce((n, v) => n + v, 0)).toBe(scoredNonMachineCheckable);
    // Ne-strojna bodovana pravila nisu proizvoljan skup: to su tocno one osi koje engine
    // primjenjuje, ali nijedan check ne mjeri strojno.
    for (const checkId of Object.keys(storedCoverage.nonMachineCheckableByCheckId)) {
      expect(['citation-style', 'required-sections', 'reference-count']).toContain(checkId);
    }
    const perCell = storedCoverage.cells.reduce((n, c) => n + c.scoredTotal - c.scoredMachineCheckable, 0);
    expect(perCell).toBe(scoredNonMachineCheckable);
  });

  it('broj celija se slaze s manifestom', () => {
    const row = manifest.find((m) => m.name === 'SCORED_COVERAGE');
    expect(storedCoverage.cells).toHaveLength(row!.entries);
  });
});
