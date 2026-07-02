/**
 * Faithfulness testovi za data/** loadere (CLAUDE.md backlog 1 i 3).
 * Dokazuju: (1) loaderi su vjeran prolaz kroz JSON (deep-equal, bez mutacije),
 * (2) brojevi zapisa se slazu s data/manifest.json. Ovo drzi vitest smislenim
 * prije rewiringa src/main.ts da cita iz loadera.
 */
import { describe, it, expect } from 'vitest';

import manifest from '../data/manifest.json';

import rawVerified from '../data/profiles/verified-profiles.json';
import rawLegal from '../data/profiles/legal-departments.json';
import rawCatalog from '../data/catalog/zagreb-catalog.json';
import rawMatrix from '../data/coverage/institutional-coverage-matrix.json';
import rawPackages from '../data/packages.json';
import rawCheckItems from '../data/checks/check-items.json';

import {
  VERIFIED_PROFILE_REGISTRY,
  LEGAL_DEPARTMENT_REGISTRY,
  findVerifiedProfile,
} from '../src/profiles/profile-registry';
import { ZAGREB_CATALOG, allUnits, findUnit } from '../src/catalog/catalog-loader';
import { INSTITUTIONAL_COVERAGE_MATRIX } from '../src/coverage/coverage-loader';
import { PACKAGES, CHECK_ITEMS, workTypeLabel } from '../src/config/config-loader';

function manifestEntries(name: string): number {
  const row = manifest.find((m) => m.name === name);
  if (!row) throw new Error(`Manifest nema zapis za ${name}`);
  return row.entries;
}

describe('data loaderi: faithfulness (deep-equal s JSON-om)', () => {
  it('verificirani profili = raw JSON', () => {
    expect(VERIFIED_PROFILE_REGISTRY).toEqual(rawVerified);
  });
  it('pravne katedre = raw JSON', () => {
    expect(LEGAL_DEPARTMENT_REGISTRY).toEqual(rawLegal);
  });
  it('katalog = raw JSON', () => {
    expect(ZAGREB_CATALOG).toEqual(rawCatalog);
  });
  it('coverage matrica = raw JSON', () => {
    expect(INSTITUTIONAL_COVERAGE_MATRIX).toEqual(rawMatrix);
  });
  it('paketi = raw JSON', () => {
    expect(PACKAGES).toEqual(rawPackages);
  });
  it('check stavke = raw JSON', () => {
    expect(CHECK_ITEMS).toEqual(rawCheckItems);
  });
});

describe('data loaderi: brojevi se slazu s manifestom', () => {
  it('verificirani profili (26)', () => {
    expect(VERIFIED_PROFILE_REGISTRY).toHaveLength(manifestEntries('VERIFIED_PROFILE_REGISTRY'));
  });
  it('pravne katedre (3)', () => {
    expect(LEGAL_DEPARTMENT_REGISTRY).toHaveLength(manifestEntries('LEGAL_DEPARTMENT_REGISTRY'));
  });
  it('katalog (25)', () => {
    expect(ZAGREB_CATALOG).toHaveLength(manifestEntries('ZAGREB_CATALOG'));
  });
  it('paketi (4)', () => {
    expect(PACKAGES).toHaveLength(manifestEntries('PACKAGES'));
  });
});

describe('data loaderi: pomocni pristupnici', () => {
  it('findVerifiedProfile nalazi po id-u', () => {
    const first = VERIFIED_PROFILE_REGISTRY[0];
    expect(findVerifiedProfile(first.id)).toBe(first);
    expect(findVerifiedProfile('ne-postoji')).toBeUndefined();
  });
  it('allUnits/findUnit prolaze kroz ustanove', () => {
    expect(allUnits().length).toBeGreaterThan(0);
    const someUnit = allUnits()[0];
    expect(findUnit(someUnit.id)).toEqual(someUnit);
  });
  it('workTypeLabel mapira poznate i fallback nepoznate', () => {
    expect(workTypeLabel('final')).toBe('Završni rad');
    expect(workTypeLabel('nepoznato')).toBe('nepoznato');
  });
});
