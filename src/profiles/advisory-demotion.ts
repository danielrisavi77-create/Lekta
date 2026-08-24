/**
 * Scored/advisory demotion (audit nalaz #1): za verificiran profil zivi engine boduje SAMO
 * verificirani "scored" skup (published-rules); ostale strojno provjerljive dimenzije demotiraju
 * se u informativne (max 0, ne ulaze u ocjenu, i dalje se prikazuju kao preporuka s izvorom).
 *
 * Ova funkcija je jedini izvor te logike; koriste je i zivi UI (currentProfile u src/ui/app.ts)
 * i golden ulaz (resolveProfile u src/analysis/golden-entry.ts) da bodovanje bude identicno i
 * golden-zasticeno. Cista je (nema DOM-a): mutira predani `base` objekt (spljosteni rules koji
 * analyzeDocx cita) i vraca listu demotiranih checkId-jeva.
 */
import type { RuleEntry, SourceEntry } from './profile-schema';
import { computePublishedRules } from '../verification/published-rules';
import { DEMOTABLE_CHECK_IDS, applyDemotion, type ScoreBase } from './advisory-levers';
import driftArtifact from '../../data/verification/scored-value-drift.json';

/** checkId-jevi koje engine tvrdo boduje, a demotion moze prebaciti u informativne. */
export { DEMOTABLE_CHECK_IDS } from './advisory-levers';

/**
 * DRUGI razlog demotije: os na kojoj se verificirana tvrdnja i vrijednost koju motor boduje NE
 * SLAZU (`scored-value-binding.ts`).
 *
 * Prva demotija odgovara na pitanje "je li ta dimenzija uopce propisana"; ova na pitanje "boduje
 * li motor ONO sto izvor propisuje". Bez nje je lanac dokaza zavrsavao u stagingu: 40 parova
 * (profil, os) kroz 23 profila bodovalo je vrijednost koju njihova vlastita `verified` tvrdnja s
 * citatom opovrgava (npr. `unizd-pomorski-*`: izvor propisuje Merriweather 10 pt, motor je trazio
 * Times New Roman/Arial/Calibri 11-12 pt, pa je rad sukladan uputi gubio bodove).
 *
 * Demotija je PRIVREMENA mjera dok vlasnik ne presudi svaki slucaj (dosjei u
 * `data/verification/drift-dossiers/`). Bira se demotija, a ne prijepis vrijednosti iz tvrdnje,
 * jer je opovrgavajuci prolaz 2026-08-21 pokazao da 12 od 20 tvrdnji ima krivo pripisan OPSEG:
 * tvrdnja koja se ne slaze sa zrcalom nije automatski ona tocna.
 *
 * Ucitava se OVDJE, a ne kao parametar, da racunata i pecena putanja ne mogu odlutati jedna od
 * druge (`tests/profile-runtime-maps.test.ts` trazi bit-identican ishod).
 */
const DRIFT_DEMOTED: Readonly<Record<string, readonly string[]>> =
  (driftArtifact as { demotedByProfile?: Record<string, string[]> }).demotedByProfile ?? {};

/**
 * Osi na kojima se za taj profil tvrdnja i zrcalo NE SLAZU.
 *
 * Cita ga i `scripts/gen-profile-runtime-maps.mts` da ista os ispadne i iz REPAIR mape: bez toga
 * demotija zaustavi krivo BODOVANJE, ali popravak i dalje upise vrijednost iz zrcala u studentov
 * dokument. Izmjereno: `unizd-pomorski-zavrsni--font` je serverski autoritet mapirao na
 * "Times New Roman", pod ruleId-em cija provenijencija kaze Merriweather 10 pt.
 */
export function driftDemotedFor(profileId: string): readonly string[] {
  return DRIFT_DEMOTED[profileId] ?? [];
}

/**
 * Demotija koja slijedi SAMO iz toga je li dimenzija propisana, bez raskoraka vrijednosti.
 *
 * Postoji odvojeno jer je generator artefakta raskoraka mora zvati: kad bi generator zvao punu
 * verziju, racunao bi ulaz iz vlastitog izlaza. Raskorak se po konstrukciji racuna bez demotije,
 * pa kruga nema, ali granica je ovdje izrecena umjesto da se na nju oslanjamo.
 */
export function computeBaseDemotedAdvisory(
  definition: { id: string } | null | undefined,
  ruleEntries: RuleEntry[] | undefined,
  sources: SourceEntry[],
): string[] {
  if (!definition || !ruleEntries || ruleEntries.length === 0) return [];
  const { scored } = computePublishedRules(
    { ...(definition as Record<string, unknown>), ruleEntries } as any,
    sources,
  );
  const scoredIds = new Set(scored.map((e) => e.checkId));
  return DEMOTABLE_CHECK_IDS.filter((checkId) => !scoredIds.has(checkId));
}

/**
 * Izracunaj demotirane advisory dimenzije za profil iz njegovih ruleEntries + izvora (racunski put:
 * povlaci computePublishedRules). Koriste ga golden/verifikacijski put i build-time generator pecene
 * mape (gen-profile-runtime-maps). Zivi app.ts NE zove ovo nego cita pecenu mapu.
 * Prazno ako profil nema ruleEntries (neverificiran) ili nema definicije.
 */
export function computeDemotedAdvisory(
  definition: { id: string } | null | undefined,
  ruleEntries: RuleEntry[] | undefined,
  sources: SourceEntry[],
  /**
   * SAV za testove: skup raskoraka umjesto onoga iz artefakta.
   *
   * Postoji jer je 2026-08-24 broj raskoraka pao na NULU (svih 37 presudjeno i potpisano), pa je
   * mutacija koja dokazuje da demotija zbog raskoraka stize do motora ostala bez ijednog stvarnog
   * profila i tiho bi prolazila vakuumski. Gard koji trazi da kvar postoji u podacima prestaje
   * gristi tocno onda kad je posao odradjen, sto je najgori trenutak za to.
   *
   * Produkcija ovaj argument NIKAD ne prosljedjuje.
   */
  driftOverride?: Readonly<Record<string, readonly string[]>>,
): string[] {
  const base = computeBaseDemotedAdvisory(definition, ruleEntries, sources);
  const table = driftOverride ?? DRIFT_DEMOTED;
  const drifted = definition ? (table[definition.id] ?? []) : [];
  if (drifted.length === 0) return base;
  // Redoslijed ostaje onaj iz DEMOTABLE_CHECK_IDS: pecena mapa se commita, pa mora biti difabilna.
  const set = new Set([...base, ...drifted]);
  return DEMOTABLE_CHECK_IDS.filter((checkId) => set.has(checkId));
}

/**
 * Demotira advisory dimenzije na `base` prema verificiranom scored skupu profila.
 * Ne radi nista ako profil nema ruleEntries (neverificiran) ili nema definicije.
 * Vraca demotirane checkId-jeve i upisuje ih u `base.advisoryDimensions`.
 */
export function applyScoredAdvisory(
  base: ScoreBase,
  definition: { id: string } | null | undefined,
  ruleEntries: RuleEntry[] | undefined,
  sources: SourceEntry[],
): string[] {
  const demoted = computeDemotedAdvisory(definition, ruleEntries, sources);
  if (demoted.length === 0 && (!definition || !ruleEntries || ruleEntries.length === 0)) return [];
  return applyDemotion(base, demoted);
}
