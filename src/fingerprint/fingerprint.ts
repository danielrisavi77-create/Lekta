import { normalize, sectionName } from '../utils/helpers.ts';

/**
 * Otisak dokumenta (MONETIZATION_AND_ANTI_ABUSE.md sekcije 4 i 11).
 *
 * Identitet rada gradi se IZ signala koji prezive uredivanje, NIKAD iz hasha datoteke
 * (spremanje pod drugim imenom, .docx vs .pdf, sitne izmjene sve mijenjaju hash pa bi
 * re-check postenog korisnika brojao kao novi rad). Otisak = { titleNorm, authorNorm,
 * headings[], sectionCount }: normaliziran naslov, autor, sekvenca naslova H1/H2 i broj
 * sekcija. Server racuna otisak iz ISTOG payloada iz kojeg generira izvjestaj.
 *
 * Podudaranje je LABAVO i optimizirano za false-allow (radije propusti malo zloupotrebe
 * od 3 EUR nego blokiraj postenog usred predaje): match ako je jaki match naslova ILI
 * (slicnost sekvence naslova >= prag I match autora). Slicnost je Jaccard nad skupom
 * normaliziranih naslova, dakle neosjetljiv na promjenu redoslijeda sekcija (sto je
 * legitimna izmjena izmedu draftova).
 */

export interface HeadingInput {
  level: number;
  text: string;
}

/** Ulaz za otisak: parsirana struktura dokumenta (ne sirovi bajtovi). */
export interface FingerprintInput {
  title?: string | null;
  author?: string | null;
  /** Naslovi redom; koriste se razine 1 i 2. */
  headings?: HeadingInput[];
}

/** Otisak dokumenta. Isti oblik kao jsonb u document_slots.fingerprint. */
export interface DocumentFingerprint {
  titleNorm: string;
  authorNorm: string;
  /** Normalizirani naslovi H1/H2 redom (bez vodecih brojeva sekcija). */
  headings: string[];
  /** Broj sekcija (naslova 1. razine). */
  sectionCount: number;
}

export interface FingerprintMatchOptions {
  /** Prag slicnosti sekvence (default labav, 0.6). */
  threshold?: number;
}

/** Racuna otisak iz parsirane strukture. Naslov fallback na prvi Heading 1. */
export function computeFingerprint(input: FingerprintInput): DocumentFingerprint {
  const headingNodes = (input.headings ?? []).filter((h) => h && (h.level === 1 || h.level === 2));
  const firstH1 = (input.headings ?? []).find((h) => h && h.level === 1);

  const titleSource = input.title && input.title.trim() ? input.title : firstH1?.text ?? '';
  const titleNorm = normalize(titleSource);
  const authorNorm = normalize(input.author ?? '');

  const headings = headingNodes
    .map((h) => sectionName(h.text))
    .filter((h) => h.length > 0);

  const sectionCount = headingNodes.filter((h) => h.level === 1).length;

  return { titleNorm, authorNorm, headings, sectionCount };
}

/** Jaccard slicnost dvaju skupova normaliziranih naslova; 0 kad je unija prazna. */
export function sequenceSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Jaki match naslova: oba normalizirana naslova neprazna i jednaka. */
function strongTitleMatch(a: DocumentFingerprint, b: DocumentFingerprint): boolean {
  return a.titleNorm.length > 0 && a.titleNorm === b.titleNorm;
}

/** Match autora: oba normalizirana autora neprazna i jednaka. */
function authorMatch(a: DocumentFingerprint, b: DocumentFingerprint): boolean {
  return a.authorNorm.length > 0 && a.authorNorm === b.authorNorm;
}

/**
 * Labavo podudaranje otisaka (slot match). Match ako je jaki match naslova ILI
 * (slicnost sekvence >= prag I match autora). Simetricno.
 */
export function fingerprintMatch(
  a: DocumentFingerprint,
  b: DocumentFingerprint,
  options: FingerprintMatchOptions = {},
): boolean {
  if (strongTitleMatch(a, b)) return true;
  const threshold = options.threshold ?? 0.6;
  const sim = sequenceSimilarity(a.headings, b.headings);
  return sim >= threshold && authorMatch(a, b);
}
