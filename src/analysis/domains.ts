/**
 * Domenski paketi kljucnih rijeci i broj+jedinica regex, zajednicki temelj za provjere koje trebaju
 * "o cemu je ovaj rad tehnicki" bez oslanjanja na profil fakulteta (domena se detektira iz SADRZAJA
 * rada, ne iz profila/studija). Prvi korisnik: src/audits/numeric-consistency.ts.
 *
 * Inspirirano vanjskim "Katedra" skillom (numbers_inventory.py + domains/__init__.py), portano na
 * TypeScript, ne prepisano 1:1: vidi gotcha ispod za JS-specificne razlike od Python izvornika.
 */

export type DomainId = 'celik' | 'elektro' | 'strojarstvo' | 'it' | 'generic';

export interface DomainDef {
  id: DomainId;
  label: string;
  keywords: string[];
}

export interface DomainScore {
  id: DomainId;
  label: string;
  score: number;
}

// Redoslijed = tie-break prioritet kad dvije domene imaju isti bod (celik > elektro > strojarstvo > it).
export const DOMAINS: DomainDef[] = [
  {
    id: 'celik',
    label: 'čelične konstrukcije / građevinarstvo',
    keywords: [
      'strehi', 'sljemenu', 'duljin', 'širin', 'površin', 'raster', 'stup', 'gred', 'okvir', 'panel',
      'sidr', 'ploč', 'stijenk', 'vijk', 'premaz', 'dizalic', 'čelik', 'profil', 'krovišt', 'temelj',
      'armatur', 'beton',
    ],
  },
  {
    id: 'elektro',
    label: 'elektrotehnika',
    keywords: [
      'napon', 'struj', 'snag', 'otpor', 'transformator', 'kabel', 'sklopk', 'relej', 'frekvenc', 'faz',
      'uzemljenj', 'osiguač', 'razvod', 'instalacij', 'generator', 'akumulator',
    ],
  },
  {
    id: 'strojarstvo',
    label: 'strojarstvo',
    keywords: [
      'moment', 'brzin', 'tlak', 'protok', 'ležaj', 'zupčanik', 'osovin', 'hidraulik', 'pneumatik',
      'zavar', 'tolerancij', 'opterećenj', 'naprezanj', 'deformacij',
    ],
  },
  {
    id: 'it',
    label: 'informatika / softversko inženjerstvo',
    keywords: [
      'algoritam', 'baz', 'upit', 'poslužitelj', 'korisnik', 'aplikacij', 'performans', 'latenc',
      'propusnost', 'api', 'sustav', 'baza podataka', 'arhitektur', 'sučelj',
    ],
  },
];

// Dulje/specificnije jedinice PRIJE kracih s istim prefiksom (kVA prije kV prije V; ms i m/s prije
// goleg m) - poredak je izravno iz Katedrinog UNIT_ALTERNATION, zadrzan radi identicnog ponasanja.
const UNIT_TOKENS = [
  'mm', 'cm', 'km', 'kg', 'kVA', 'kV', 'kW', 'kN', 'kHz', 'MHz', 'GHz', 'Hz', 'MPa', 'GPa', 'Pa', 'Nm',
  'rpm', 'min-1', 'm/s', 'ms', 'MB', 'GB', 'TB', 'bar', 'mA', 'VA', '°C', '°', '%', 'm', 't', 'g', 'A',
  'L', 'V', 'W', 'N', 's',
];

// NAPOMENA (adaptacija Python izvornika, NE 1:1 prijepis): Katedrin regex koristi zavrsnu granicu
// (?!\w) jer je Python `re` Unicode-svjestan (\w hvata i c/c//d/s/z). JS-ov \w je UVIJEK ASCII-only,
// cak i uz /u zastavicu, pa bi doslovni (?!\w) ovdje bio REGRESIJA (npr. "10 mšuma" bi lazno prekinulo
// granicu na "š" misleci da je "m" vec cijela jedinica). Zato: (?![\p{L}\p{N}]) uz /u zastavicu - ista
// namjera kao Pythonov (?!\w), ali ispravno Unicode-svjesna.
export const NUMBER_UNIT_RE = new RegExp(
  `(\\d+(?:,\\d+)?)\\s?(${UNIT_TOKENS.join('|')})(?![\\p{L}\\p{N}])`,
  'gu',
);

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Vrati domenu s najvise bodova (broj pojava kljucnih rijeci), ili 'generic' ako nijedna ne prijeđe minScore. */
export function detectDomain(text: string, minScore = 3): { domain: DomainId; label: string; scores: DomainScore[] } {
  const norm = String(text || '').toLocaleLowerCase('hr');
  const scores: DomainScore[] = DOMAINS.map((d) => ({
    id: d.id,
    label: d.label,
    score: d.keywords.reduce((s, kw) => s + countOccurrences(norm, kw.toLocaleLowerCase('hr')), 0),
  }));
  let best: DomainScore | null = null;
  for (const s of scores) if (!best || s.score > best.score) best = s;
  if (best && best.score >= minScore) return { domain: best.id, label: best.label, scores };
  return { domain: 'generic', label: 'generički (nije prepoznat specifičan inženjerski domen)', scores };
}

// Mala hrvatska stop-lista za frekvencijski fallback (nije NLP, samo filter cestih rijeci).
const HR_STOPWORDS = new Set([
  'i', 'u', 'na', 'je', 'su', 'se', 'za', 's', 'sa', 'od', 'do', 'ili', 'ali', 'kao', 'koji', 'koja',
  'koje', 'kojeg', 'kojem', 'kojih', 'te', 'pa', 'no', 'već', 'nego', 'prema', 'kroz', 'kod', 'bez',
  'iz', 'što', 'da', 'ne', 'li', 'ovaj', 'ova', 'ovo', 'taj', 'ta', 'to', 'njegov', 'njezin', 'biti',
  'ima', 'imaju', 'tako', 'kada', 'gdje', 'dok', 'jer', 'ako', 'ni', 'niti', 'svaki', 'svih', 'sve',
  'ovim', 'ovoj', 'ovog', 'ovih', 'bio', 'bila', 'bilo', 'bile', 'također', 'dakle', 'stoga', 'time',
  'ovdje', 'gore', 'dolje', 'između', 'iznosi', 'oko', 'preko', 'manje', 'više', 'mora', 'može',
]);

/**
 * Fallback BEZ fiksnog rjecnika kad se ne prepozna nijedna domena: rijeci koje se ponavljaju u
 * blizini (do `window` tokena ispred) broja, filtrirane od kratkih rijeci i stop-liste. Namjerno
 * jednostavno (frekvencija, ne NLP) - daje kandidate za pregled, ne zamjenjuje rucnu prosudbu.
 */
export function genericFallbackKeywords(
  text: string,
  opts: { top?: number; minCount?: number; window?: number } = {},
): string[] {
  const top = opts.top ?? 15;
  const minCount = opts.minCount ?? 3;
  const window = opts.window ?? 3;
  const tokens = String(text || '').match(/\d+(?:,\d+)?|[\p{L}][\p{L}'-]*/gu) ?? [];
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d/.test(tokens[i])) continue; // gledamo prozor ISPRED broja
    for (let j = Math.max(0, i - window); j < i; j++) {
      const w = tokens[j].toLocaleLowerCase('hr');
      if (w.length < 4 || /^\d/.test(w) || HR_STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([w]) => w);
}

// --- Univerzalni kandidati za tvrdnje (za cross-check protiv izvorne gradje) -------------------
// Vodeca granica je zasebna grupa (^|ne-slovo/broj), NE lookbehind: isto pravilo kao u
// src/audits/register.ts (Safari < 16.4 ne podrzava lookbehind). Prateca granica je lookahead
// (ne trosi znak, pa susjedni uzorci rade), isti (?![\p{L}\p{N}]) obrazac kao NUMBER_UNIT_RE.

export type ClaimKind = 'number-unit' | 'hrn-norm' | 'project-code' | 'bare-number';

export interface ExtractedClaim {
  kind: ClaimKind;
  raw: string;
  paragraphIndex: number;
}

const HRN_NORM_RE = /(^|[^\p{L}\p{N}])(HRN\s?EN\s?[\dA-Z\-.:/]+)(?![\p{L}\p{N}])/gu;
const PROJECT_CODE_RE = /(^|[^\p{L}\p{N}])(\d{3,4}-\d{2})(?![\p{L}\p{N}])/gu;
const BARE_NUMBER_RE = /(^|[^\p{L}\p{N}])(\d{2,4})(?![\p{L}\p{N}])/gu;

function matchGroup(re: RegExp, text: string, group: number): string[] {
  re.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[group]);
  return out;
}

/**
 * Univerzalni kandidati za tvrdnje (broj+jedinica, HRN EN norma, oznaka projekta, gola veca
 * brojka) po odlomku, za src/analysis/source-claim-check.ts. Domenski specificni uzorci (celicni
 * profili, IP-ocjene, HTTP kodovi i sl.) su namjerno ODGODJENI iz v1 (sekundarna vrijednost nad
 * ovim univerzalnim skupom, drzi opseg uzak).
 *
 * Uzorci se primjenjuju NEOVISNO (kao u Katedrinom izvorniku), pa isti brojcani niz zna dati VISE
 * kandidata (npr. "2022-61" -> project-code "2022-61" I bare-number "2022" I bare-number "61").
 * Ovo je namjerna, faithful osobina porta, ne bug: cross-check dalje samo provjerava svaki
 * kandidat neovisno, pa je visak jeftin (dodatna provjera), ne pogresan.
 */
export function extractUniversalClaims(paragraphs: Array<{ index: number; text: string }>): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  for (const p of paragraphs) {
    const text = p.text || '';
    const seen = new Set<string>();
    const push = (kind: ClaimKind, raw: string) => {
      const key = `${kind}|${raw}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, raw, paragraphIndex: p.index });
    };

    NUMBER_UNIT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMBER_UNIT_RE.exec(text))) push('number-unit', m[0]);

    for (const raw of matchGroup(HRN_NORM_RE, text, 2)) push('hrn-norm', raw);
    for (const raw of matchGroup(PROJECT_CODE_RE, text, 2)) push('project-code', raw);
    for (const raw of matchGroup(BARE_NUMBER_RE, text, 2)) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 10) push('bare-number', raw);
    }
  }
  return out;
}
