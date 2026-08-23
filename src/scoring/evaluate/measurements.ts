/**
 * DocumentMeasurements: formalan, verzioniran ugovor MJERLJIVIH cinjenica dokumenta
 * (faza D plana zastite baze pravila, "cisti sav" za buduci Academic Core).
 *
 * Ovo je "facts" polovica para: druga polovica (pravila) vec postoji kao
 * src/integration/academic-core-export.ts (exportAcademicRuleSet). Zajedno omogucuju
 * cistu evaluaciju (measurements, rules) -> Check[] koja moze zivjeti i u Deno Edge
 * funkciji: zato ova datoteka NEMA nijedan import (ni DOM, ni zip, ni helpere) i sutra
 * ide u Deno netaknuta.
 *
 * IME: NIJE "DocumentFacts" jer profile.facts vec postoji i znaci nesto drugo (cinjenice
 * o profilu/uputi, ne o dokumentu). "Measurements" je semanticki tocan: izmjerene
 * vrijednosti, ne pravila i ne ocjene.
 *
 * STO NIKAD NE ULAZI (cuva tests/measurements-tripwire.test.ts): tekst odlomaka, tekst
 * fusnota, tekst naslova, runs, preview, reference, imena datoteka slika. Jedina iznimka
 * su JEDNOZNAKOVNI interpunkcijski before/after uz oznaku fusnote (zarez/tocka) i izvedeni
 * brojevi/enumi. Measurements je otisak FORME, ne SADRZAJA rada.
 */

export const MEASUREMENTS_VERSION = 1 as const;

/** Rezultat modeWeighted (src/audits/metrics.ts): dominantna vrijednost + njezin udio. */
export interface WeightedMode {
  value: unknown;
  share: number;
}

/** Jedna sekcija dokumenta (w:sectPr): margine u cm, format stranice, numeriranje. */
export interface SectionMeasurement {
  margins: { top: number | null; right: number | null; bottom: number | null; left: number | null } | null;
  page: { w: number | null; h: number | null } | null;
  pageNumbering: { format: string; start: number | null } | null;
  paragraphIndex: number | null;
  titlePageDifferent: boolean;
  pageFields: { default: boolean; first: boolean; even: boolean };
  pageAlignments: { default: string | null; first: string | null; even: string | null };
  hasAnyPageField: boolean;
}

/** Oznaka fusnote: id, odlomak, JEDNOZNAKOVNI interpunkcijski susjedi (ne tekst), stil. */
export interface FootnoteMarkerMeasurement {
  id: number;
  paragraph: number;
  before: string;
  after: string;
  italic: boolean;
}

/** Izmjerene dominante tijela odnosno fusnota. */
export interface DominantsMeasurement {
  font: WeightedMode;
  size: WeightedMode;
  spacing: WeightedMode;
  align: WeightedMode;
}

/** Brojaci izvedeni iz dokumenta (presjek result.stats bez ijedne rijeci teksta). */
export interface CountsMeasurement {
  words: number;
  characters: number;
  paragraphs: number;
  headings: number;
  tables: number;
  images: number;
  sections: number;
  storedPages: number | null;
  footnoteMarkers: number;
  tocEntries: number;
  references: number;
}

/**
 * Mjerenje razmaka prije/poslije odlomka: SAMO brojevi i indeksi (badSamples nose
 * indeks odlomka ili oznaku "fusnota" te pt vrijednosti, nikad tekst). Puni ih
 * measureZeroParagraphSpacing (src/audits/structure.ts) pri mjerenju, trosi ih
 * evaluateZeroParagraphSpacing pri evaluaciji.
 */
export interface ZeroSpacingMeasurement {
  knownCount: number;
  badCount: number;
  badSamples: Array<{ index: number | string; before: number | null; after: number | null }>;
}

/**
 * Podskup mjerenja koji evaluacija OBLIKOVANJA (evaluateFormatting) treba: bez
 * brojaca i bez wordCount. DocumentMeasurements ga strukturno sadrzi.
 */
export interface FormattingMeasurements {
  body: DominantsMeasurement;
  footnotes: {
    count: number;
    endnoteCount: number;
    dominants: DominantsMeasurement;
    markers: FootnoteMarkerMeasurement[];
  };
  sections: SectionMeasurement[];
  paragraphSpacing: ZeroSpacingMeasurement;
  footnoteParagraphSpacing: ZeroSpacingMeasurement;
}

export interface DocumentMeasurements {
  measurementsVersion: typeof MEASUREMENTS_VERSION;
  body: DominantsMeasurement;
  footnotes: {
    count: number;
    endnoteCount: number;
    wordCount: number;
    dominants: DominantsMeasurement;
    markers: FootnoteMarkerMeasurement[];
  };
  sections: SectionMeasurement[];
  paragraphSpacing: ZeroSpacingMeasurement;
  footnoteParagraphSpacing: ZeroSpacingMeasurement;
  counts: CountsMeasurement;
}
