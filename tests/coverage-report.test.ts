import { describe, it, expect } from 'vitest';

import storedCoverage from '../data/coverage/scored-coverage.json';
import manifest from '../data/manifest.json';
import { computeCoverageMatrix } from '../src/verification/coverage-report';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/profile-registry';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

describe('coverage matrica: preracunata i spremljena (sekcija 6)', () => {
  it('stored scored-coverage.json deep-equals zivi izracun (drift guard)', () => {
    const fresh = computeCoverageMatrix(profiles, SOURCE_REGISTRY as SourceEntry[]);
    expect(storedCoverage).toEqual(fresh);
  });

  it('bodovane celije imaju ratio i lastVerified; nebodovane nemaju', () => {
    expect(storedCoverage.totalScored).toBeGreaterThan(0);
    const integ = storedCoverage.cells.find((c) => c.profileId === 'pravo-integrirani-diplomski')!;
    expect(integ.scored).toBeGreaterThan(0);
    for (const cell of storedCoverage.cells) {
      if (cell.scored > 0) {
        expect(cell.ratio).toBeGreaterThan(0);
        expect(cell.lastVerified).not.toBeNull();
      } else {
        expect(cell.ratio).toBe(0);
        expect(cell.lastVerified).toBeNull();
      }
    }
  });

  it('svaka celija pokriva pravni profil sa strojno provjerljivim pravilima', () => {
    expect(storedCoverage.cells.length).toBeGreaterThan(0);
    for (const cell of storedCoverage.cells) {
      expect(cell.machineCheckable).toBeGreaterThan(0);
      // scored + advisory pokrivaju sva pravila; potpuno verificirana celija ima advisory 0
      expect(cell.scored + cell.advisory).toBeGreaterThan(0);
    }
  });

  it('broj celija se slaze s manifestom', () => {
    const row = manifest.find((m) => m.name === 'SCORED_COVERAGE');
    expect(storedCoverage.cells).toHaveLength(row!.entries);
  });
});
