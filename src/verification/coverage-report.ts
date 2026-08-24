import type { ThesisProfile, SourceEntry } from '../profiles/profile-schema';
import { computePublishedRules } from './published-rules';

/**
 * Stanje celije kad u njoj nema bodovanih pravila. Razlika je bitna i namjerno se ne skracuje:
 * "jos nismo istrazili" nije isto sto i "dokazali smo da pravila nema".
 */
export type CoverageState =
  /** Ima bodovanih pravila. */
  | 'scored'
  /** Pravila postoje u stagingu, ali nijedno nije bodovano (izvor ili verifikacija nedostaju). */
  | 'advisory-only'
  /**
   * Pravila postoje, izvor je PROCITAN i presudjeno je da ne obvezuje vise od preporuke.
   * Konacno stanje, ne zaostatak. Razlika prema `advisory-only` nije kozmeticka: ondje nedostaje
   * dokaz, ovdje dokaz postoji i kaze "fakultet ovo ne propisuje". Bez te razlike se ispravno
   * stanje (FER) ne moze razlikovati od stvarne rupe.
   */
  | 'advisory-by-decision'
  /** Nema nijednog staging pravila i nitko jos nije istrazio zasto. ZADANO, ne zakljucak. */
  | 'no-rules-sourced'
  /** Dokazano: fakultet ne propisuje strojno provjerljive zahtjeve. */
  | 'no-technical-rules'
  /** Pravila postoje, ali nisu javno objavljena. */
  | 'source-not-found';

/** Razlozi koje je covjek istrazio (data/profiles/no-rules-reasons.json). */
export type NoRulesReasons = Record<
  string,
  { state: 'no-technical-rules' | 'source-not-found' | 'advisory-by-decision' }
>;

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
  /**
   * scoredMachineCheckable / machineCheckable. `null` kad profil NEMA strojno provjerljivih
   * pravila: nula bi lazno sugerirala izmjeren promasaj tamo gdje mjerenja uopce nije bilo.
   */
  ratio: number | null;
  /** Zasto celija nema bodovanih pravila; `scored` kad ih ima. Nikad tiho odsustvo. */
  state: CoverageState;
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
export function computeCoverageCell(
  profile: ThesisProfile,
  sources: SourceEntry[],
  reasons: NoRulesReasons = {},
): CoverageCell {
  const { scored, advisory } = computePublishedRules(profile, sources);
  const machineCheckableScored = scored.filter((e) => e.machineCheckable);
  const entries = profile.ruleEntries ?? [];
  const machineCheckable = entries.filter((e) => e.machineCheckable).length;

  // Zadano je "jos nije istrazeno", ne "nema pravila": zakljucak o odsutnosti pravila smije doci
  // samo iz `no-rules-reasons.json`, gdje ga je covjek potpisao nakon pretrage izvora.
  // Razlog koji je covjek POTPISAO ima prednost pred izvedenim stanjem. Do 2026-08-22 se
  // `no-rules-reasons.json` konzultirao TEK kad profil nema nijedan ruleEntry, pa se za profil s
  // advisory pravilima nikad nije ni pogledao: postojanje ijednog zapisa presijecalo je prije nego
  // se do razloga dodje. Time se dokazano stanje ("izvor procitan, ne obvezuje") nije moglo
  // razlikovati od zaostatka ("nitko jos nije pogledao"), a to je razlika izmedju gotovog posla i
  // rupe u pokrivenosti.
  const signed = reasons[profile.id]?.state;
  const state: CoverageState = scored.length
    ? 'scored'
    : (signed ?? (entries.length ? 'advisory-only' : 'no-rules-sourced'));

  return {
    profileId: profile.id,
    scoredMachineCheckable: machineCheckableScored.length,
    scoredTotal: scored.length,
    machineCheckable,
    advisory: advisory.length,
    ratio: machineCheckable ? machineCheckableScored.length / machineCheckable : null,
    state,
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
export function computeCoverageMatrix(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
  reasons: NoRulesReasons = {},
): CoverageMatrix {
  // Od P2-2 ulaze SVI profili. Prije je profil bez ijednog staging pravila jednostavno izostajao
  // iz matrice, pa se 24 profila nije moglo razlikovati od onih koji su uredno pokriveni - tiho
  // odsustvo je izgledalo isto kao da profila nema.
  const withEntries = profiles.filter((p) => (p.ruleEntries ?? []).length > 0);
  const cells = profiles
    .map((p) => computeCoverageCell(p, sources, reasons))
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
