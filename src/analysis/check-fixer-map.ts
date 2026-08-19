/**
 * Dijeljeni izvor istine: dimenzija popravka <-> STABILNI checkId <-> zivi fixer.
 *
 * Povijesno je ovo znanje bilo izrazeno hrvatskim NASLOVOM provjere (`makeCheck` title), pa je
 * svaka preformulacija naslova tiho kidala vezu nalaza na fixer, bez ijedne tsc greske. Od
 * 2026-08-16 identitet je `check.id` iz `src/scoring/check-id-registry.ts`, a naslov je samo
 * prezentacija (i fallback za jos neregistrirane provjere).
 *
 * Dva razlicita namespacea koja se ne smiju brkati:
 *   - DIMENZIJA popravka (`margins`, `font`, `paper-size`, ...) - kljuc iz profila/repair-mape,
 *     ulazi u `paramsForCheck` i odlucuje KOJI parametar fixer dobiva.
 *   - stabilni checkId (`page.margins`, `format.font.dominant`, ...) - identitet PROVJERE koju
 *     analiza emitira. Jedna dimenzija moze pokrivati vise checkId-jeva (paper-size ima
 *     dinamican naslov po profilu pa i vise ID-jeva, svi u `page.size.*`).
 *
 * VAZNO: `import type` za FixerId (samo tip) da se izbjegne runtime ovisnost o src/repair/*
 * (koji koristi Web Streams CompressionStream) u analizi/preglednickoj jezgri.
 */
import type { FixerId } from '../repair/apply-fixers';
import { stableCheckId, isPaperSizeCheckId } from '../scoring/check-id-registry';

/**
 * Dimenzija popravka -> stabilni checkId-jevi koje ta dimenzija pokriva.
 *
 * `paper-size` NIJE ovdje: njegov naslov (a time i ID) ovisi o `profile.paperSizes`, pa se
 * prepoznaje preko `isPaperSizeCheckId` (svi ID-jevi u `page.size.*`).
 */
export const CHECK_IDS_BY_DIMENSION: Record<string, readonly string[]> = {
  margins: ['page.margins'],
  font: ['format.font.dominant'],
  'font-size': ['format.size.body'],
  'line-spacing': ['format.spacing.body'],
  justify: ['format.justify.body'],
  'paragraph-spacing': ['format.spacing.paragraph'],
  'page-number-start': ['page.numbers.start'],
  'page-number-scheme': ['page.numbers.scheme'],
  'footnote-spacing': ['footnote.spacing'],
  'page-number-alignment': ['page.numbers.position'],
  // Oblikovanje naslova i tipografija fusnota dobili su popravak 2026-07-20. Oba idu kroz
  // stilove (HeadingN, FootnoteText), pa ih analiza vidi jer razrjesava nasljedjivanje stila.
  'heading-format': ['structure.heading.format'],
  'footnote-typography': ['footnote.format'],
  'croatian-typography': ['format.typography.consistency'],
  'empty-paragraphs': ['element.empty-paragraphs'],
};

/**
 * checkId -> tocan naslov koji analyzeDocx proizvodi (makeCheck title).
 *
 * PREZENTACIJA, ne identitet: sluzi jos samo za `label`/`matchKeys` u repair-items (tekst koji
 * korisnik vidi). Korelacija "je li prekrseno" i klasifikacija popravljivosti idu preko
 * `CHECK_IDS_BY_DIMENSION`, pa preimenovanje naslova vise ne kida wiring.
 */
export const CHECK_TITLES: Record<string, string> = {
  margins: 'Margine dokumenta',
  font: 'Dominantni font',
  'font-size': 'Veličina osnovnog teksta',
  'line-spacing': 'Prored osnovnog teksta',
  justify: 'Poravnanje osnovnog teksta',
  'paragraph-spacing': 'Razmak prije i poslije odlomka',
  'page-number-start': 'Numeriranje od prve stranice Uvoda',
  'page-number-scheme': 'Shema numeriranja stranica',
  'footnote-spacing': 'Razmak prije i poslije fusnota',
  'page-number-alignment': 'Položaj broja stranice',
  'heading-format': 'Oblikovanje naslova po razinama',
  'footnote-typography': 'Oblikovanje fusnota',
  'croatian-typography': 'Tehničko-tipografska dosljednost',
};

/** Prefiks naslova provjere formata papira (dinamican sufiks: 'A4' / '(A4/A3)'). */
export const PAPER_SIZE_TITLE_PREFIX = 'Format stranice';

/**
 * Dimenzija -> zivi auto fixer. SAMO dimenzije koje se popravljaju bez rizika za sadrzaj
 * (svojstva oblikovanja). Strukturne dimenzije (numeriranje/sekcija/TOC/naslovi/natpisi) NISU
 * ovdje: one su 'assisted' i klasificira ih `STRUCTURAL_CHECK_RULES` (mijenjaju strukturu,
 * traze potvrdu).
 */
export const AUTO_CHECK_FIXER: Record<string, FixerId> = {
  margins: 'margins-fixer',
  'paper-size': 'paper-size-fixer',
  font: 'font-fixer',
  'font-size': 'font-fixer',
  'line-spacing': 'line-spacing-fixer',
  justify: 'alignment-fixer',
  'paragraph-spacing': 'paragraph-spacing-fixer',
  'footnote-spacing': 'footnote-spacing-fixer',
  'page-number-alignment': 'page-number-alignment-fixer',
};

/** Naslov informativne provjere praznih odlomaka (univerzalna higijena, auto empty-paragraph-fixer). */
export const EMPTY_PARAGRAPHS_CHECK_TITLE = 'Prazni odlomci';

/** Obrnuti indeks checkId -> dimenzija, izveden iz CHECK_IDS_BY_DIMENSION (bez rucnog dvojnika). */
const DIMENSION_BY_CHECK_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CHECK_IDS_BY_DIMENSION).flatMap(([dimension, ids]) => ids.map((id) => [id, dimension])),
);

/** Dimenzija popravka za stabilni checkId (ili null). `page.size.*` uvijek daje 'paper-size'. */
export function dimensionForCheckId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (isPaperSizeCheckId(id)) return 'paper-size';
  return DIMENSION_BY_CHECK_ID[id] ?? null;
}

/** Pripada li checkId dimenziji sa zivim auto fixerom? Vrati {checkId, fixerId} ili null. */
export function autoFixerForCheckId(id: string | null | undefined): { checkId: string; fixerId: FixerId } | null {
  const dimension = dimensionForCheckId(id);
  if (!dimension) return null;
  if (dimension === 'empty-paragraphs') return { checkId: 'empty-paragraphs', fixerId: 'empty-paragraph-fixer' };
  const fixerId = AUTO_CHECK_FIXER[dimension];
  return fixerId ? { checkId: dimension, fixerId } : null;
}

/**
 * Kao `autoFixerForCheckId`, ali iz naslova. Zadrzano za pozivatelje koji jos nemaju `check.id`
 * (rucno slozeni testni/UI fixturi). Nova logika neka koristi ID varijantu.
 */
export function autoFixerForCheckTitle(title: string): { checkId: string; fixerId: FixerId } | null {
  return autoFixerForCheckId(stableCheckId(title));
}

export type Fixability = 'auto' | 'assisted' | 'manual';

/** Strukturna (assisted) klasifikacija po STABILNOM checkId-u: mijenja strukturu, trazi potvrdu. */
interface StructuralCheckRule {
  checkIds: readonly string[];
  groupKey: string;
  fixId?: FixerId;
}
const STRUCTURAL_CHECK_RULES: StructuralCheckRule[] = [
  { checkIds: ['page.numbers.start', 'page.numbers.scheme'], groupKey: 'page.numbering', fixId: 'page-numbering-fixer' },
  { checkIds: ['structure.heading.word-styles'], groupKey: 'heading.style' },
  { checkIds: ['element.table.caption'], groupKey: 'caption.table' },
  { checkIds: ['element.figure.caption'], groupKey: 'caption.figure' },
  { checkIds: ['reference.alphabetical'], groupKey: 'reference.sort', fixId: 'bibliography-repair-fixer' },
  { checkIds: ['element.lists'], groupKey: 'list.illustrations' },
  // Ove cetiri postoje otkad su bibliography-rules/citation-sync-rules/section-surgery-rules/
  // required-section-rules dobili STVARNO ozicenje (repair-map.json, gen-profile-runtime-maps.mts,
  // 2026-08-02) - prije toga fixer iza njih nikad nije mogao aktivirati pa bi ih svrstavanje ovdje
  // bilo pogresno obecanje. Bez ovoga repairCeiling ove nalaze i dalje tretira kao 'manual' iako
  // sada postoji zivi popravak, pa strop lazno ostaje ispod 100 za dokumente kojima je bas ovo
  // jedini preostali problem.
  { checkIds: ['citation.author-year.missing-reference', 'reference.uncited'], groupKey: 'citation.sync', fixId: 'citation-bibliography-sync-fixer' },
  { checkIds: ['citation.author-year.suffix'], groupKey: 'reference.sort', fixId: 'bibliography-repair-fixer' },
  { checkIds: ['structure.sections.profile'], groupKey: 'required.sections', fixId: 'required-section-fixer' },
  // Oblikovanje naslova i tipografija fusnota imaju ZIVI, naplacen fixer (repair-surface.ts,
  // repair-pricing.ts) i nude se kao posebna UI stavka, ali su bile izostavljene i iz
  // AUTO_CHECK_FIXER (namjerno: mijenjaju strukturu pa nisu 'auto') i odavde (previd). Time su
  // padale na 'manual' fallback, pa je repairCeiling lazno ostajao ispod 100 i sucelje je
  // tvrdilo da nalaz trazi rucni rad iako ga alat popravlja.
  { checkIds: ['structure.heading.format'], groupKey: 'heading.format', fixId: 'heading-format-fixer' },
  { checkIds: ['footnote.format'], groupKey: 'footnote.typography', fixId: 'footnote-typography-fixer' },
];

/**
 * MRTVA PRAVILA ZATECENA PRI PORTU NA checkId (2026-08-16).
 *
 * Dva pravila iz naslijedjene, naslovima pisane tablice nisu pogadjala NIJEDNU stvarnu provjeru,
 * pa su bila mrtav kod i nikad nisu promijenila klasifikaciju:
 *
 *   1. /razina naslova/i -> 'heading.level'. Nijedan emitiran naslov ne sadrzi "razina naslova"
 *      (najblizi su 'Oblikovanje naslova po razinama' i 'Dubina decimalnog numeriranja', koji
 *      taj izraz ne sadrze).
 *   2. 'Numeriranje stranica' | 'Sekcije' -> 'section.surgery' + section-surgery-fixer. Oba su
 *      `where` oznake LOKACIJE na issueu, ne naslovi provjera, a `classifyFixability` prima
 *      `check.title`.
 *
 * Pravila su uklonjena jer je mrtav kod stetniji od praznine: sugerirao je pokrivenost koje nema.
 * `section-surgery-fixer` je time ostao bez ijedne provjere koja ga klasificira kao 'assisted'.
 * ISPRVA je to izgledalo kao rupa koja laze korisniku (repairCeiling bi tvrdio "rucni rad" za
 * nesto sto alat zna popraviti), ali MJERENJE 2026-08-19 pokazuje da nije:
 *
 *   - Sve sto section surgery dira vec je pokriveno drugim fixerima: numeriranje sekcija
 *     (`page.numbers.start`, `page.numbers.scheme`) je 'assisted' preko page-numbering-fixera,
 *     margine (`page.margins`) su 'auto' preko margins-fixera.
 *   - Jedina provjera koja bi mu preostala je `page.numbers.title-suppressed` ("Naslovnica bez
 *     broja stranice"), ali ju emitiraju samo 4 profila (svi Pravo), a NIJEDAN od njih nema
 *     `section-surgery-rules`. Obrnuto, svih 22 profila koji imaju te rules NIKAD ne emitiraju
 *     tu provjeru. Skupovi su disjunktni.
 *   - Tim 4 profila nije dostupan ni `section-insert-fixer` (checkPageNumberStartAtIntro i
 *     checkPageNumberScheme su false), pa im doista nijedan popravak ne moze pomoci.
 *
 * Zakljucak: 'manual' je za tu provjeru TOCNA klasifikacija, a ne propust. Mapirati je na
 * section-surgery bilo bi lazno obecanje za 4 profila i beskorisno za 22. Ako neki profil ikad
 * dobije i tu provjeru i `section-surgery-rules`, tada mapiranje ima smisla i treba ga dodati.
 * `check-fixer-map.test.ts` pinning testom cuva zatecenu klasifikaciju da promjena bude svjesna.
 */

/**
 * Razina popravljivosti nalaza po STABILNOM checkId-u: 'auto' (zivi fixer bez potvrde),
 * 'assisted' (mijenja strukturu, nudi se uz potvrdu) ili 'manual' (sadrzajna prosudba, alat je
 * ne smije dirati). Jedini izvor istine za triage.ts (razina nalaza) i result-readiness.ts
 * (koliko je automatski popravak realno u stanju jamciti).
 */
export function classifyFixabilityById(id: string | null | undefined): { fixability: Fixability; fixId?: FixerId; groupKey?: string } {
  const auto = autoFixerForCheckId(id);
  if (auto) return { fixability: 'auto', fixId: auto.fixerId };
  if (id) {
    for (const r of STRUCTURAL_CHECK_RULES) {
      if (r.checkIds.includes(id)) return { fixability: 'assisted', groupKey: r.groupKey, ...(r.fixId ? { fixId: r.fixId } : {}) };
    }
  }
  return { fixability: 'manual' };
}

/**
 * Kao `classifyFixabilityById`, ali iz naslova. Zadrzano za pozivatelje bez `check.id`;
 * neregistriran naslov daje `stableCheckId() === null` pa pada na 'manual', kao i prije.
 */
export function classifyFixability(title: string): { fixability: Fixability; fixId?: FixerId; groupKey?: string } {
  return classifyFixabilityById(stableCheckId(title));
}

/**
 * Svi checkId-jevi na koje se ova mapa oslanja (dimenzije + strukturna pravila).
 *
 * Postoji zbog jednog konkretnog kvara: dok su pravila bila pisana NASLOVIMA, dva su gadjala
 * naslov koji analiza nikad ne emitira i bila su mrtva, a nista to nije prijavilo. Test nad ovim
 * popisom (`tests/check-fixer-map.test.ts`) pada cim se ovdje pojavi ID koji ne postoji u
 * registru, pa mrtvo pravilo vise ne moze proci tiho.
 */
export function wiredCheckIds(): string[] {
  return [...new Set([...Object.values(CHECK_IDS_BY_DIMENSION).flat(), ...STRUCTURAL_CHECK_RULES.flatMap((r) => r.checkIds)])];
}
