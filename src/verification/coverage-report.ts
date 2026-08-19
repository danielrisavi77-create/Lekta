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
  /**
   * Bodovana pravila koja su I strojno provjerljiva. Ovo je BROJNIK omjera i mora gledati istu
   * populaciju kao nazivnik. Do 2026-08-19 se zvalo `scored`, sto je bilo dvosmisleno: izvjestaji
   * su isti pojam citali cas kao "sva bodovana" cas kao "bodovana i strojna", pa je razlika
   * izgledala kao nepomiren kvar. Ime sada nosi svoju os.
   */
  scoredMachineCheckable: number;
  /**
   * SVA bodovana pravila (verified, sljedivo, snapshotiran izvor), ukljucujuci ona koja se ne
   * mogu strojno provjeriti (`citation-style`, `required-sections`, `reference-count`). Ovo je
   * populacija koju covjek mora proci u verifikacijskom worklistu.
   */
  scoredTotal: number;
  /** Broj strojno provjerljivih pravila (nazivnik udjela). */
  machineCheckable: number;
  /** Sva pravila koja se ne boduju (draft, advisory, needs-recheck, retired). */
  advisory: number;
  /** scoredMachineCheckable / machineCheckable, 0 kad nema strojno provjerljivih. */
  ratio: number;
  /** Najsvjeziji `lastVerified` medu bodovanim pravilima, ili null. */
  lastVerified: string | null;
}

export interface CoverageMatrix {
  /** Sve celije, sortirane po profileId radi determinizma. */
  cells: CoverageCell[];
  /** Zbroj `scoredMachineCheckable` kroz sve celije. */
  scoredMachineCheckable: number;
  /** Zbroj `scoredTotal` kroz sve celije; isti broj koji vodi verifikacijski worklist. */
  scoredTotal: number;
  /** scoredTotal - scoredMachineCheckable. Razlika je objasnjena, ne nepomirena. */
  scoredNonMachineCheckable: number;
  /** Razlaganje te razlike po checkId-u, sortirano radi determinizma. */
  nonMachineCheckableByCheckId: Record<string, number>;
}

function latestVerified(dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (best == null || d > best) best = d;
  }
  return best;
}

/**
 * Racuna coverage celiju za jedan profil.
 *
 * `scored` (od `computePublishedRules`) ukljucuje SVAKO verificirano pravilo sa sluzbenim
 * izvorom, bez obzira na `machineCheckable` - to je ispravno za `effectiveScored` (npr.
 * citation-style JEST stvaran ucinak na engine iako nije strojno "provjeren" u smislu
 * checka). Ali brojnik omjera MORA gledati istu populaciju kao nazivnik (samo strojno
 * provjerljiva pravila), inace omjer moze preci 100% (npr. "8/7") kad profil ima vise
 * verificiranih ne-strojnih pravila nego strojno provjerljivih - vidi tests/coverage-report.test.ts.
 */
export function computeCoverageCell(profile: ThesisProfile, sources: SourceEntry[]): CoverageCell {
  const { scored, advisory } = computePublishedRules(profile, sources);
  const machineCheckableScored = scored.filter((e) => e.machineCheckable);
  const machineCheckable = (profile.ruleEntries ?? []).filter((e) => e.machineCheckable).length;
  return {
    profileId: profile.id,
    scoredMachineCheckable: machineCheckableScored.length,
    scoredTotal: scored.length,
    machineCheckable,
    advisory: advisory.length,
    ratio: machineCheckable ? machineCheckableScored.length / machineCheckable : 0,
    lastVerified: latestVerified(scored.map((e) => e.lastVerified)),
  };
}

/** Bodovana ali ne strojno provjerljiva pravila, prebrojana po checkId-u (za razlaganje razlike). */
function countNonMachineCheckable(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const profile of profiles) {
    for (const entry of computePublishedRules(profile, sources).scored) {
      if (entry.machineCheckable) continue;
      const key = entry.checkId ?? '(bez checkId)';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Preracunava cijelu coverage matricu. Ukljucuje samo profile koji imaju ijedan
 * ruleEntry (celije bez granularnih pravila nisu jos u verifikacijskom toku).
 */
export function computeCoverageMatrix(profiles: ThesisProfile[], sources: SourceEntry[]): CoverageMatrix {
  const withEntries = profiles.filter((p) => (p.ruleEntries ?? []).length > 0);
  const cells = withEntries
    .map((p) => computeCoverageCell(p, sources))
    .sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));
  const scoredMachineCheckable = cells.reduce((sum, c) => sum + c.scoredMachineCheckable, 0);
  const scoredTotal = cells.reduce((sum, c) => sum + c.scoredTotal, 0);
  return {
    cells,
    scoredMachineCheckable,
    scoredTotal,
    scoredNonMachineCheckable: scoredTotal - scoredMachineCheckable,
    nonMachineCheckableByCheckId: countNonMachineCheckable(withEntries, sources),
  };
}
