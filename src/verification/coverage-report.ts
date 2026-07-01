import type { ThesisProfile, SourceEntry } from '../profiles/profile-schema';
import { computePublishedRules } from './published-rules';

/**
 * Coverage matrica bodovano-verificiranih pravila (VERIFICATION_PIPELINE.md sekcije 6 i 9).
 *
 * Po celiji (profilu) racuna: koliko je pravila bodovano (scored), koliko strojno
 * provjerljivih, udio, koliko advisory, te datum zadnje verifikacije. Matrica je
 * preracunata iz zivih profila i source registryja, pa je transparentna i ne moze
 * tiho zastarjeti. Stored artefakt (`data/coverage/scored-coverage.json`) cuva isti
 * izracun; test dokazuje da se ne razilaze (drift guard za sekciju 6).
 *
 * Advisory je iskljucen iz bodovanja po definiciji: ratio gleda samo scored.
 */

export interface CoverageCell {
  profileId: string;
  /** Broj pravila koja se stvarno boduju (verified, sljedivo, snapshotiran izvor). */
  scored: number;
  /** Broj strojno provjerljivih pravila (nazivnik udjela). */
  machineCheckable: number;
  /** Sva pravila koja se ne boduju (draft, advisory, needs-recheck, retired). */
  advisory: number;
  /** scored / machineCheckable, 0 kad nema strojno provjerljivih. */
  ratio: number;
  /** Najsvjeziji `lastVerified` medu bodovanim pravilima, ili null. */
  lastVerified: string | null;
}

export interface CoverageMatrix {
  /** Sve celije, sortirane po profileId radi determinizma. */
  cells: CoverageCell[];
  /** Zbroj scored kroz sve celije (brza provjera "jos nista nije bodovano"). */
  totalScored: number;
}

function latestVerified(dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (best == null || d > best) best = d;
  }
  return best;
}

/** Racuna coverage celiju za jedan profil. */
export function computeCoverageCell(profile: ThesisProfile, sources: SourceEntry[]): CoverageCell {
  const { scored, advisory } = computePublishedRules(profile, sources);
  const machineCheckable = (profile.ruleEntries ?? []).filter((e) => e.machineCheckable).length;
  return {
    profileId: profile.id,
    scored: scored.length,
    machineCheckable,
    advisory: advisory.length,
    ratio: machineCheckable ? scored.length / machineCheckable : 0,
    lastVerified: latestVerified(scored.map((e) => e.lastVerified)),
  };
}

/**
 * Preracunava cijelu coverage matricu. Ukljucuje samo profile koji imaju ijedan
 * ruleEntry (celije bez granularnih pravila nisu jos u verifikacijskom toku).
 */
export function computeCoverageMatrix(profiles: ThesisProfile[], sources: SourceEntry[]): CoverageMatrix {
  const cells = profiles
    .filter((p) => (p.ruleEntries ?? []).length > 0)
    .map((p) => computeCoverageCell(p, sources))
    .sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));
  return { cells, totalScored: cells.reduce((sum, c) => sum + c.scored, 0) };
}
