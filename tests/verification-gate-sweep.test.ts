import { describe, it, expect } from 'vitest';
import { VERIFIED_PROFILES_WITH_DRAFTS, LEGAL_DEPARTMENTS_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { runVerificationGate, isRuleScored } from '../src/verification/verification-gate';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

/**
 * Globalni verifikacijski gate sweep (audit nalaz #3). Ranije se gate izvrsavao samo u
 * pojedinacnim profilnim testovima, pa je novi draft sa `scored:true` bez sourcePage/quote
 * mogao proci `npm run check` ako nije imao vlastiti test. Ovaj sweep pokriva SVE objavljene
 * profile odjednom: nijedno bodovano pravilo ne smije lagati o svom izvoru.
 *
 * Fiksni `now` je deterministicki: gate ovdje stiti STRUKTURNE tvrdnje (verified + sluzbeni
 * autoritet + sourceId + sourcePage + quote + snapshot). Kalendarski drift svjezine je operativni
 * koncept izvan ovih vrata, pa se ne vezuje na stvarno vrijeme (izbjegava buducu laznu crvenu).
 */
const NOW = '2026-07-03';
const ALL = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const SOURCES = SOURCE_REGISTRY as SourceEntry[];

describe('verifikacijski gate: globalni sweep svih objavljenih profila', () => {
  it('nijedno bodovano pravilo ne laze o izvoru (0 gresaka)', () => {
    const errors = runVerificationGate(ALL, SOURCES, { now: NOW });
    // Prvih nekoliko kodova/profila u poruci ako ikad padne, da je odmah jasno gdje.
    const summary = errors.slice(0, 8).map((e) => `${e.profileId}/${e.ruleId ?? '-'}:${e.code}`);
    expect(summary).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('sweep je netrivijalan (stvarno provjerava bodovana pravila)', () => {
    expect(ALL.length).toBeGreaterThan(20);
    const scored = ALL.reduce((n, p) => n + (p.ruleEntries ?? []).filter(isRuleScored).length, 0);
    expect(scored).toBeGreaterThan(50);
  });
});
