/**
 * Dijeljeni izvor istine: checkId <-> tocan naslov provjere (makeCheck title) + zivi auto fixer.
 *
 * Do sada je ovo znanje zivjelo SAMO u src/ui/repair-items.ts (CHECK_TITLE + PAPER_SIZE_PREFIX)
 * i sluzilo korelaciji "je li dimenzija prekrsena". Triage model (src/analysis/triage.ts) treba
 * ISTI izvor da klasificira nalaz kao 'auto' (postoji zivi fixer). Da se ne vodi dvostruko,
 * mapa je izdvojena ovdje, a repair-items je uvozi. Vrijednosti su bajt-identicne dosadasnjima
 * (postojeci golden/repair testovi to cuvaju).
 *
 * VAZNO: `import type` za FixerId (samo tip) da se izbjegne runtime ovisnost o src/repair/*
 * (koji koristi Web Streams CompressionStream) u analizi/preglednickoj jezgri.
 */
import type { FixerId } from '../repair/apply-fixers';

/**
 * checkId -> tocan naslov koji analyzeDocx proizvodi (makeCheck title). Sluzi korelaciji
 * "je li prekrseno" (repair-items.isViolated) i detekciji dimenzije iz naslova (triage).
 * paper-size ima dinamican naslov ('Format stranice A4' / '(A4/A3)') pa ide preko prefiksa.
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
  // Oblikovanje naslova i tipografija fusnota dobili su popravak 2026-07-20. Oba idu kroz
  // stilove (HeadingN, FootnoteText), pa ih analiza vidi jer razrjesava nasljedjivanje stila.
  'heading-format': 'Oblikovanje naslova po razinama',
  'footnote-typography': 'Oblikovanje fusnota',
  'croatian-typography': 'Tehničko-tipografska dosljednost',
};

/** Prefiks naslova provjere formata papira (dinamican sufiks: 'A4' / '(A4/A3)'). */
export const PAPER_SIZE_TITLE_PREFIX = 'Format stranice';

/**
 * checkId -> zivi auto fixer. SAMO dimenzije koje se popravljaju bez rizika za sadrzaj
 * (svojstva oblikovanja). Strukturne dimenzije (numeriranje/sekcija/TOC/naslovi/natpisi) NISU
 * ovdje: one su 'assisted' i klasificira ih triage (mijenjaju strukturu, traze potvrdu).
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

/** Pripada li naslov provjere dimenziji sa zivim auto fixerom? Vrati {checkId, fixerId} ili null. */
export function autoFixerForCheckTitle(title: string): { checkId: string; fixerId: FixerId } | null {
  if (title === EMPTY_PARAGRAPHS_CHECK_TITLE) return { checkId: 'empty-paragraphs', fixerId: 'empty-paragraph-fixer' };
  if (title.startsWith(PAPER_SIZE_TITLE_PREFIX)) return { checkId: 'paper-size', fixerId: AUTO_CHECK_FIXER['paper-size'] };
  for (const [checkId, expected] of Object.entries(CHECK_TITLES)) {
    if (title === expected && AUTO_CHECK_FIXER[checkId]) return { checkId, fixerId: AUTO_CHECK_FIXER[checkId] };
  }
  return null;
}

export type Fixability = 'auto' | 'assisted' | 'manual';

/** Strukturna (assisted) klasifikacija po tocnom naslovu provjere: mijenja strukturu, traži potvrdu. */
interface StructuralCheckRule {
  match: (title: string) => boolean;
  groupKey: string;
  fixId?: FixerId;
}
const STRUCTURAL_CHECK_RULES: StructuralCheckRule[] = [
  {
    match: (t) => t === 'Numeriranje od prve stranice Uvoda' || t === 'Shema numeriranja stranica',
    groupKey: 'page.numbering',
    fixId: 'page-numbering-fixer',
  },
  { match: (t) => t === 'Uporaba Word stilova naslova', groupKey: 'heading.style' },
  { match: (t) => /razina naslova/i.test(t), groupKey: 'heading.level' },
  { match: (t) => t === 'Naslovi tablica', groupKey: 'caption.table' },
  { match: (t) => t === 'Naslovi slika i grafikona', groupKey: 'caption.figure' },
  { match: (t) => t === 'Abecedni poredak literature', groupKey: 'reference.sort', fixId: 'bibliography-repair-fixer' },
  { match: (t) => t === 'Popisi slika i tablica', groupKey: 'list.illustrations' },
  // Ove cetiri postoje otkad su bibliography-rules/citation-sync-rules/section-surgery-rules/
  // required-section-rules dobili STVARNO ozicenje (repair-map.json, gen-profile-runtime-maps.mts,
  // 2026-08-02) - prije toga fixer iza njih nikad nije mogao aktivirati pa bi ih svrstavanje ovdje
  // bilo pogresno obecanje. Bez ovoga repairCeiling ove nalaze i dalje tretira kao 'manual' iako
  // sada postoji zivi popravak, pa strop lazno ostaje ispod 100 za dokumente kojima je bas ovo
  // jedini preostali problem.
  { match: (t) => t === 'Citirano → literatura' || t === 'Literatura → citirano', groupKey: 'citation.sync', fixId: 'citation-bibliography-sync-fixer' },
  { match: (t) => t === 'Isti autor i godina (a/b/c)', groupKey: 'reference.sort', fixId: 'bibliography-repair-fixer' },
  { match: (t) => t === 'Numeriranje stranica' || t === 'Sekcije', groupKey: 'section.surgery', fixId: 'section-surgery-fixer' },
  { match: (t) => t === 'Dijelovi verificiranog profila', groupKey: 'required.sections', fixId: 'required-section-fixer' },
  // Oblikovanje naslova i tipografija fusnota imaju ZIVI, naplacen fixer (repair-surface.ts,
  // repair-pricing.ts) i nude se kao posebna UI stavka, ali su bile izostavljene i iz
  // AUTO_CHECK_FIXER (namjerno: mijenjaju strukturu pa nisu 'auto') i odavde (previd). Time su
  // padale na 'manual' fallback, pa je repairCeiling lazno ostajao ispod 100 i sucelje je
  // tvrdilo da nalaz trazi rucni rad iako ga alat popravlja. Isti obrazac je 2026-08-02 vec
  // popravljen za cetiri pravila iznad.
  { match: (t) => t === CHECK_TITLES['heading-format'], groupKey: 'heading.format', fixId: 'heading-format-fixer' },
  { match: (t) => t === CHECK_TITLES['footnote-typography'], groupKey: 'footnote.typography', fixId: 'footnote-typography-fixer' },
];

/**
 * Razina popravljivosti nalaza po naslovu provjere: 'auto' (zivi fixer bez potvrde), 'assisted'
 * (mijenja strukturu, nudi se uz potvrdu) ili 'manual' (sadrzajna prosudba, alat je ne smije
 * dirati). Jedini izvor istine za triage.ts (razina nalaza) i result-readiness.ts (koliko je
 * automatski popravak realno u stanju jamciti).
 */
export function classifyFixability(title: string): { fixability: Fixability; fixId?: FixerId; groupKey?: string } {
  const auto = autoFixerForCheckTitle(title);
  if (auto) return { fixability: 'auto', fixId: auto.fixerId };
  for (const r of STRUCTURAL_CHECK_RULES) {
    if (r.match(title)) return { fixability: 'assisted', groupKey: r.groupKey, ...(r.fixId ? { fixId: r.fixId } : {}) };
  }
  return { fixability: 'manual' };
}
