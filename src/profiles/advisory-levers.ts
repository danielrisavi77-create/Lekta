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
 * checkId -> je li overlay tu dimenziju stvarno PROPISAO.
 *
 * Predikat, ne popis kljuceva, i razlika je bitna. Do 2026-08-23 se zastita okidala na PRISUTNOST
 * kljuca, pa je overlay s golom zastavicom (`checkFont: true`, bez `font`) ponistavao demotiju a da
 * nije propisao nikakvu vrijednost: bodovala se i dalje vrijednost OSNOVNOG profila, upravo ona koju
 * je demotija ugasila jer joj tvrdnja proturjeci. Zastavica kaze "provjeravaj", ne "evo vrijednosti",
 * pa sama po sebi ne moze nadjacati verifikacijski status osnovnog izvora.
 *
 * Danasnji podaci nisu pogodjeni (sve tri katedre nose vrijednost: `sociologija` font/size/spacing/
 * justify, sve tri requireToc/requirePageNumbers), pa je ovo zatvaranje latentne rupe, ne popravak
 * zatecenog kvara. Zabiljezeno kao takvo namjerno: gard koji se uvodi bez izmjerene stete lako se
 * kasnije "pojednostavi" natrag.
 *
 * Za osi koje nose vrijednost trazi se VRIJEDNOST; za booleove osi zastavica postavljena na `true`
 * (ondje zastavica JEST vrijednost). `checkFont: false` vise ne stiti nista, i to je tocno: overlay
 * koji dimenziju gasi nema sto braniti od demotije koja radi isto.
 */
const hasValue = (v: unknown): boolean =>
  v != null && (!Array.isArray(v) || v.length > 0) && (typeof v !== 'object' || Object.keys(v as object).length > 0);

export const DEMOTION_PRESCRIBED_BY: Readonly<Record<string, (overlay: ScoreBase) => boolean>> = {
  'font': (o) => hasValue(o.font),
  'font-size': (o) => hasValue(o.size),
  'line-spacing': (o) => hasValue(o.spacing),
  'margins': (o) => hasValue(o.margins),
  'justify': (o) => o.justify === true,
  'paper-size': (o) => hasValue(o.paperSizes) || o.requireA4 === true,
  // Podprovjere PROPISUJU roditeljsku os: poravnanje broja stranice koji ne postoji nema smisla, kao
  // ni font stavki sadrzaja bez sadrzaja. Bez ovoga bi gate uveden 2026-08-23 u structure.ts i
  // auditDetailedToc (podprovjere se ne boduju dok se roditelj ne boduje) tiho ugasio bas ono sto
  // katedra izricito trazi, a zastita postoji da se to ne dogodi.
  'toc': (o) => o.requireToc === true || o.tocDetailedCheck === true,
  'page-numbers': (o) =>
    o.requirePageNumbers === true ||
    hasValue(o.pageNumberAlignment) ||
    o.checkTitlePageNumberSuppression === true ||
    o.checkPageNumberStartAtIntro === true,
};

/**
 * Dimenzije koje demotija NE SMIJE ugasiti jer ih je izricito propisao drugi izvor.
 *
 * Zasto postoji: advisory mapa je vezana uz ID OSNOVNOG profila i kaze "za taj izvor ovo pravilo
 * nije verificirano kao bodovano". Kad student odabere katedru, njezin overlay dolazi iz VLASTITOG
 * sluzbenog izvora i po hijerarhiji je specificniji. Bez ove zastite demotija osnovnog profila
 * gasila je `requireToc` koji katedra izricito trazi (5 od 8 kombinacija na Pravnom fakultetu),
 * pa se sadrzaj rada tiho nije provjeravao iako ga uputa katedre propisuje.
 *
 * Prima OVERLAY, ne njegove kljuceve: vrijednost je dio odluke (vidi DEMOTION_PRESCRIBED_BY).
 */
export function demotionProtectedBy(overlay: ScoreBase): Set<string> {
  const protectedIds = new Set<string>();
  for (const [checkId, prescribes] of Object.entries(DEMOTION_PRESCRIBED_BY)) {
    if (prescribes(overlay)) protectedIds.add(checkId);
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
