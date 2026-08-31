/**
 * Gard za `npm run tier2-freshness`.
 *
 * Alat odgovara na jedino pitanje o Tier 2 koje se DA automatizirati: vrijedi li zapisani Word
 * dokaz jos uvijek za kod koji danas stoji u repozitoriju. Sam Word je Windows-only i rucni, pa ga
 * CI ne moze pokrenuti; moze samo znati da nije pokrenut.
 *
 * MUTACIJE podmecu stvarno zatecena stanja, ne izmisljena:
 *   - zapisani dokaz na `75904ef3` uz 8 kasnijih commita nad `src/repair/` (izmjereno 2026-08-30),
 *   - dokaz u kojem je Word razina preskocena, jer se preskok NE smije citati kao prolaz,
 *   - dokaz snimljen nad prljavim radnim stablom.
 *
 * BASELINE uz svaku: nemutiran ulaz mora biti SVJEZ, inace bi "prolazio" i alat koji vristi na sve.
 *
 * Ulaz je sinteticki, ne citan iz gita: `actions/checkout` u CI-u klonira do dubine 1, pa se na
 * povijest ne smije oslanjati (ista pouka kao kod `orphan-scan`).
 */
import { describe, it, expect } from 'vitest';
import { tier2Freshness, formatFreshness, TIER2_IDS } from '../scripts/tier2-freshness-core.mjs';

const PROOF_OK = {
  commit: '75904ef347fececb6212196c504b927b7c694a64',
  dirtyWorkingTree: false,
  results: [
    { id: 'check', status: 'pass' },
    { id: 'strict-open', status: 'pass' },
    { id: 'word', status: 'pass' },
    { id: 'word-worst', status: 'pass' },
  ],
};

describe('tier2-freshness: baseline', () => {
  it('bez ijedne izmjene motora dokaz je SVJEZ', () => {
    const s = tier2Freshness(PROOF_OK, []);
    expect(s.fresh).toBe(true);
    expect(s.reason).toBe('svjez');
    expect(formatFreshness(s)).toContain('SVJEZ');
  });
});

describe('tier2-freshness: mutacije', () => {
  /** Stvarno stanje 2026-08-30: dokaz na 75904ef3, a od tada 8 commita nad src/repair/. */
  it('prijavljuje zastarjelost kad se motor promijenio', () => {
    const s = tier2Freshness(PROOF_OK, [
      { sha: '141f9848', subject: 'deep ciscenje preskakalo je tijelo rada' },
      { sha: '4fd4a965', subject: 'tiha korupcija poveznica' },
    ]);
    expect(s.fresh).toBe(false);
    expect(s.reason).toBe('motor-se-promijenio');
    expect(s.staleCommits).toHaveLength(2);
    expect(formatFreshness(s)).toContain('4fd4a965');
  });

  /** Preskocena Windows razina NIJE prolaz; inace bi svaki linux prolaz "dokazao" Word. */
  it.each(TIER2_IDS)('preskocena razina %s nije prolaz', (id) => {
    const proof = { ...PROOF_OK, results: PROOF_OK.results.map((r) => (r.id === id ? { ...r, status: 'skipped' } : r)) };
    const s = tier2Freshness(proof, []);
    expect(s.fresh).toBe(false);
    expect(s.reason).toBe('tier2-nije-prosao');
    expect(s.missingTiers).toContain(id);
  });

  it('dokaz snimljen nad prljavim stablom ne opisuje nijedan commit', () => {
    const s = tier2Freshness({ ...PROOF_OK, dirtyWorkingTree: true }, []);
    expect(s.fresh).toBe(false);
    expect(s.reason).toBe('dokaz-s-prljavog-stabla');
  });

  it('bez zapisanog dokaza ishod je NEMA DOKAZA, ne prolaz', () => {
    for (const ulaz of [null, {}, { commit: '' }]) {
      const s = tier2Freshness(ulaz as never, []);
      expect(s.fresh).toBe(false);
      expect(s.reason).toBe('nema-dokaza');
    }
  });

  /** Razina koje u zapisu UOPCE nema jednaka je preskocenoj: dokaza nema. */
  it('razina koja u zapisu ne postoji nije prolaz', () => {
    const s = tier2Freshness({ ...PROOF_OK, results: [{ id: 'check', status: 'pass' }] }, []);
    expect(s.fresh).toBe(false);
    expect(s.missingTiers).toEqual(TIER2_IDS);
  });
});

describe('tier2-freshness: izvjestaj', () => {
  it('svaki razlog zastarjelosti nosi uputu sto pokrenuti', () => {
    const razlozi = [
      tier2Freshness(null as never, []),
      tier2Freshness({ ...PROOF_OK, dirtyWorkingTree: true }, []),
      tier2Freshness(PROOF_OK, [{ sha: 'abc1234', subject: 'x' }]),
    ];
    for (const s of razlozi) expect(formatFreshness(s)).toContain('npm run verify:word');
  });
});
