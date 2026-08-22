/**
 * Zajednicki "poluge" scored/advisory demotije (audit nalaz #1): mapiranje checkId -> engine flag
 * koji dimenziju pretvara u informativnu (max 0, ne ulazi u ocjenu). Ovo je JEDINI izvor te mape.
 *
 * Namjerno odvojeno od advisory-demotion.ts (koji racuna scored skup preko computePublishedRules i
 * povlaci published-rules/verification-gate/rule-compiler lanac): zivi app.ts cita PECENU advisory
 * mapu (profile-runtime-maps.ts) pa mu treba samo primjena poluga, bez tog racunskog lanca u
 * glavnom chunku. Golden i verifikacijski put i dalje racunaju preko advisory-demotion.ts.
 */

export type ScoreBase = Record<string, unknown>;

/**
 * Mapiranje checkId -> engine "flag off" koji dimenziju pretvara u informativnu provjeru.
 *
 * 'paper-size' gasi OBA puta kojima engine boduje format stranice: `requireA4` (A4 grana) i
 * `paperSizes` (grana s vlastitim popisom formata). Do 2026-08-22 je gasio samo `requireA4`, pa je
 * arh-diplomski, koji format propisuje kao `paperSizes: ['A3','A0']`, i dalje GUBIO bodove na
 * pravilu koje je verifikacija oznacila kao nebodovano. Prazan popis je namjerno (a ne brisanje
 * kljuca): engine grana na `paperSizes && length`, pa prazan popis znaci "nema bodovane grane",
 * dok vrijednost pravila ostaje vidljiva onome tko cita profil.
 */
export const DEMOTION: Array<[string, (b: ScoreBase) => void]> = [
  ['font', (b) => { b.checkFont = false; }],
  ['font-size', (b) => { b.checkSize = false; }],
  ['line-spacing', (b) => { b.checkSpacing = false; }],
  ['margins', (b) => { b.checkMargins = false; }],
  ['justify', (b) => { b.checkJustify = false; }],
  ['paper-size', (b) => { b.requireA4 = false; if (Array.isArray(b.paperSizes)) b.paperSizes = []; }],
  ['toc', (b) => { b.requireToc = false; }],
  ['page-numbers', (b) => { b.requirePageNumbers = false; }],
];

/** checkId-jevi koje engine tvrdo boduje, a demotion moze prebaciti u informativne. */
export const DEMOTABLE_CHECK_IDS: readonly string[] = DEMOTION.map(([id]) => id);

/**
 * checkId -> kljucevi profila kojima se ta dimenzija PROPISUJE. Sluzi da se prepozna kad neki
 * drugi, specificniji izvor (danas: profil katedre) tu dimenziju izricito trazi.
 */
export const DEMOTION_RULE_KEYS: Readonly<Record<string, readonly string[]>> = {
  'font': ['font', 'checkFont'],
  'font-size': ['size', 'checkSize'],
  'line-spacing': ['spacing', 'checkSpacing'],
  'margins': ['margins', 'checkMargins'],
  'justify': ['justify', 'checkJustify'],
  'paper-size': ['paperSizes', 'requireA4'],
  'toc': ['requireToc'],
  'page-numbers': ['requirePageNumbers'],
};

/**
 * Dimenzije koje demotija NE SMIJE ugasiti jer ih je izricito propisao drugi izvor.
 *
 * Zasto postoji: advisory mapa je vezana uz ID OSNOVNOG profila i kaze "za taj izvor ovo pravilo
 * nije verificirano kao bodovano". Kad student odabere katedru, njezin overlay dolazi iz VLASTITOG
 * sluzbenog izvora i po hijerarhiji je specificniji. Bez ove zastite demotija osnovnog profila
 * gasila je `requireToc` koji katedra izricito trazi (5 od 8 kombinacija na Pravnom fakultetu),
 * pa se sadrzaj rada tiho nije provjeravao iako ga uputa katedre propisuje.
 */
export function demotionProtectedBy(overlayKeys: Iterable<string>): Set<string> {
  const keys = new Set(overlayKeys);
  const protectedIds = new Set<string>();
  for (const [checkId, ruleKeys] of Object.entries(DEMOTION_RULE_KEYS)) {
    if (ruleKeys.some((k) => keys.has(k))) protectedIds.add(checkId);
  }
  return protectedIds;
}

/**
 * Primijeni demotiju: za svaki checkId iz `demoted` ugasi pripadnu dimenziju na `base` i upisi
 * `base.advisoryDimensions`. Cista funkcija; dijele je i izracun (advisory-demotion) i pecena
 * mapa (profile-runtime-maps) da primjena poluga bude bit-identicna.
 *
 * `protectedIds` (dimenzije koje je specificniji izvor izricito propisao) se PRESKACU i ne ulaze
 * u `advisoryDimensions`: te dimenzije ostaju bodovane, pa bi ih prijaviti kao informativne bilo
 * netocno prema korisniku.
 */
export function applyDemotion(
  base: ScoreBase,
  demoted: readonly string[],
  protectedIds: ReadonlySet<string> = new Set(),
): string[] {
  const applied = demoted.filter((id) => !protectedIds.has(id));
  const set = new Set(applied);
  for (const [checkId, off] of DEMOTION) {
    if (set.has(checkId)) off(base);
  }
  base.advisoryDimensions = [...applied];
  return [...applied];
}
