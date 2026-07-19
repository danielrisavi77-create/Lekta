/**
 * Savjetodavna provjera hrvatskog PRAVOPISA (razina rijeci). Cista, testabilna jezgra bez DOM-a,
 * bez mreze i bez WASM-a: prima INJEKTIRAN provjernik (`SpellChecker`) pa se logika (tokenizacija,
 * filtri, dedup, sortiranje, cap, prijedlozi) testira bez ucitavanja rjecnika. Stvarni provjernik je
 * pravi Hunspell u WASM-u (hunspell-asm) s hrvatskim rjecnikom; on se lijeno ucitava tek na opt-in
 * klik (spellcheck-runner.ts), a analiza .docx ga NIKAD ne zove -> analiza ostaje 100% lokalna i
 * golden ostaje netaknut (rezultat ovdje NE ide kroz analyzeDocx ni details).
 *
 * POSTENO: rjecnik nije potpun (vlastita imena, strani i strucni termini cesto fale), pa je izlaz
 * SAVJETODAVAN ("provjeri"), nikad presuda. Konzervativno, uz filtre koji dræe niski false-positive:
 *  - preskacu se vlastita imena (rijec s velikim pocetnim slovom koja NIJE na pocetku recenice; u
 *    hrvatskom se velikim slovom pisu samo vlastita imena i pocetci recenica),
 *  - kratice/akronimi (SVE velika slova), brendovi (unutarnje veliko slovo, npr. "iPhone"),
 *  - poznate kratice (npr., itd., tzv., ...), poveznice i e-adrese, tokeni s brojkama, prekratke rijeci.
 *
 * Rijec se provjerava u svom povrsinnom obliku (Hunspell zna prihvatiti veliko pocetno slovo na
 * pocetku recenice). Prijedlozi se traze SAMO za rijeci koje ce se stvarno prikazati (nakon capa),
 * da se skupi suggest() ne poziva bez potrebe.
 */

/** Injektiran provjernik pravopisa (hunspell-asm ga zadovoljava preko tanke omotnice). */
export interface SpellChecker {
  /** true kad je rijec ispravna. */
  correct(word: string): boolean;
  /** Prijedlozi ispravaka (moze biti prazno). */
  suggest(word: string): string[];
}

/** Jedan pravopisni nalaz: sumnjiva rijec + gdje se prvi put javlja + prijedlozi. */
export interface SpellFinding {
  /** Povrsinni oblik sumnjive rijeci (kako se javlja u tekstu). */
  word: string;
  /** 1-based indeks odlomka prve pojave (poravnat s PreviewParagraph.index). */
  paragraphIndex: number;
  /** Broj pojava kroz dokument (ista rijec, neovisno o velicini slova). */
  count: number;
  /** Prijedlozi ispravaka (do `suggestLimit`). */
  suggestions: string[];
}

export interface SpellSummary {
  /** Broj prikazanih (nakon capa) razlicitih sumnjivih rijeci. */
  reported: number;
  /** Ukupan broj razlicitih sumnjivih rijeci prije capa. */
  flaggedDistinct: number;
  /** Broj razlicitih rijeci-kandidata koje su uopce provjerene. */
  checkedDistinct: number;
  /** true kad je popis skracen na `maxFindings`. */
  truncated: boolean;
}

export interface SpellResult {
  findings: SpellFinding[];
  summary: SpellSummary;
}

export interface SpellParagraph {
  index: number;
  text: string;
}

export interface SpellcheckOptions {
  /** Najvise nalaza koji se vracaju (ostatak se skrati). Zadano 200. */
  maxFindings?: number;
  /** Najvise prijedloga po rijeci. Zadano 4. */
  suggestLimit?: number;
  /** Najkraca rijec koja se uopce provjerava. Zadano 3. */
  minLength?: number;
}

const DEFAULTS = { maxFindings: 200, suggestLimit: 4, minLength: 3 } as const;

/**
 * Ceste hrvatske (i akademske) kratice koje rjecnik mozda nema, a nisu pogreske. Drzi malo i
 * prosirivo; svrha je smanjiti ocite false-positive, ne biti iscrpan. Usporedba je na malim slovima.
 */
const ABBREVIATIONS = new Set<string>([
  'npr', 'itd', 'itsl', 'tj', 'tzv', 'sl', 'str', 'god', 'cca', 'op', 'cit', 'ibid', 'usp', 'vidi',
  'dr', 'mr', 'sc', 'prof', 'doc', 'ur', 'izd', 'sv', 'br', 'tab', 'pr', 'odn', 'pog', 'bilj',
]);

// Poveznice i e-adrese maknemo prije tokenizacije da njihovi dijelovi (www, com, http...) ne postanu
// laæni kandidati.
const URL_RE = /(https?:\/\/|www\.)\S+/giu;
const EMAIL_RE = /\S+@\S+\.\S+/gu;
// Rijec = niz Unicode slova (obuhvaca c/c/dz/s/z i kombinirajuce znakove). NE koristimo \b/\w jer su
// ASCII pa padaju pred hrvatskom dijakritikom.
const WORD_RE = /\p{L}[\p{L}\p{M}]*/gu;
// Znakovi koje pri trazenju pocetka recenice preskacemo (razmaci, navodnici, zagrade, crtice).
const SENT_SKIP = new Set([...' \t\r\n"\'„“”«»()[]{}-–—']);
const SENT_ENDERS = new Set([...'.!?…']);

function stripNoise(text: string): string {
  return text.replace(URL_RE, ' ').replace(EMAIL_RE, ' ');
}

/** true ako je token na pocetku recenice (pocetak odlomka ili iza .!?… preskacuci navodnike/razmake). */
function isSentenceInitial(text: string, tokenStart: number): boolean {
  let i = tokenStart - 1;
  while (i >= 0 && SENT_SKIP.has(text[i])) i--;
  if (i < 0) return true;
  return SENT_ENDERS.has(text[i]);
}

/** Odluci treba li rijec preskociti (vlastito ime, akronim, brend, kratica, prekratko). */
function shouldSkip(surface: string, sentenceInitial: boolean, minLength: number): boolean {
  if (surface.length < minLength) return true;
  const lower = surface.toLowerCase();
  if (ABBREVIATIONS.has(lower)) return true;
  const upper = surface.toUpperCase();
  // SVE velika slova (duljina >= 2) = akronim/kratica (FPZG, ISBN, DOI, EU, RH).
  if (surface === upper && surface !== lower) return true;
  const first = surface[0];
  const rest = surface.slice(1);
  const firstUpper = first === first.toUpperCase() && first !== first.toLowerCase();
  if (firstUpper) {
    // Veliko pocetno slovo + ostatak mala slova: vlastito ime OSIM ako je na pocetku recenice.
    if (rest === rest.toLowerCase()) return !sentenceInitial;
    // Unutarnje veliko slovo (iPhone, LaTeX, McDonald): brend/tehnicki, preskoci.
    return true;
  }
  // Malo pocetno slovo ali s unutarnjim velikim (npr. "eGrad"): preskoci.
  if (rest !== rest.toLowerCase()) return true;
  return false;
}

/**
 * Pokreni pravopisnu provjeru nad odlomcima koristeci injektiran provjernik. Cisto: bez DOM-a i mreze.
 */
export function runSpellcheckHr(
  paragraphs: SpellParagraph[],
  checker: SpellChecker,
  opts: SpellcheckOptions = {},
): SpellResult {
  const maxFindings = opts.maxFindings ?? DEFAULTS.maxFindings;
  const suggestLimit = opts.suggestLimit ?? DEFAULTS.suggestLimit;
  const minLength = opts.minLength ?? DEFAULTS.minLength;

  // Skupi kandidate: kljuc = mala slova rijeci; cuvamo prvi povrsinni oblik + prvi odlomak + broj pojava.
  const cand = new Map<string, { surface: string; paragraphIndex: number; count: number }>();
  for (const p of paragraphs ?? []) {
    if (!p || typeof p.text !== 'string' || !Number.isInteger(p.index)) continue;
    const text = stripNoise(p.text);
    WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_RE.exec(text))) {
      const surface = m[0];
      if (shouldSkip(surface, isSentenceInitial(text, m.index), minLength)) continue;
      const key = surface.toLowerCase();
      const hit = cand.get(key);
      if (hit) hit.count++;
      else cand.set(key, { surface, paragraphIndex: p.index, count: 1 });
    }
  }

  // Provjeri svaku razlicitu rijec jednom; skupi pogresne.
  const flagged: Array<{ surface: string; paragraphIndex: number; count: number }> = [];
  for (const c of cand.values()) {
    if (!checker.correct(c.surface)) flagged.push(c);
  }

  // Najcesce prvo (sustavna pogreska je vaznija), pa abecedno; cap; suggest() SAMO za prikazane.
  flagged.sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface, 'hr'));
  const shown = flagged.slice(0, maxFindings);
  const findings: SpellFinding[] = shown.map((c) => ({
    word: c.surface,
    paragraphIndex: c.paragraphIndex,
    count: c.count,
    suggestions: (checker.suggest(c.surface) || []).slice(0, suggestLimit),
  }));

  return {
    findings,
    summary: {
      reported: findings.length,
      flaggedDistinct: flagged.length,
      checkedDistinct: cand.size,
      truncated: flagged.length > shown.length,
    },
  };
}
