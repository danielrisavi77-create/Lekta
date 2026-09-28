/**
 * T64: sto analiza NIJE provjerila u cijelosti.
 *
 * Ovo nije profilna pokrivenost pravila (details.coverage) i nije nova ocjena.
 * Modul samo:
 *  1. radi content-free census poznatih OOXML struktura s ogranicenom podrskom, nad
 *     tijelom, fusnotama, endnotama, zaglavljima i podnozjima (Codex M1 na #165);
 *  2. zbraja vec postojece skipped odluke strukturiranih analizatora.
 *
 * Nikad ne prenosi tekst dokumenta ni slobodni reason iz skipped zapisa.
 */
export type InspectionStructureKind =
  | 'content-control'
  | 'text-box'
  | 'math'
  | 'tracked-change'
  | 'embedded-object'
  | 'nested-table'
  | 'unbalanced-field';

export type InspectionAnalyzer =
  | 'typography'
  | 'consistency'
  | 'link-doi'
  | 'required-sections'
  | 'legal-footnotes';

export interface InspectionXmlPart {
  part: string;
  xml: string;
}

export interface InspectionCoverageItem {
  kind: InspectionStructureKind;
  count: number;
}

export interface InspectionAnalyzerSkip {
  analyzer: InspectionAnalyzer;
  count: number;
}

export interface InspectionCoverage {
  version: 1;
  status: 'no-known-limits' | 'partial' | 'unknown';
  items: InspectionCoverageItem[];
  analyzerSkips: InspectionAnalyzerSkip[];
  summary: {
    limitedKinds: number;
    limitedOccurrences: number;
    analyzerSkips: number;
  };
}

const ANALYZERS: ReadonlyArray<{
  analyzer: InspectionAnalyzer;
  detailKey:
    | 'typographyStructure'
    | 'consistencyStructure'
    | 'linkDoiStructure'
    | 'requiredSectionsStructure'
    | 'legalFootnoteStructure';
}> = [
  { analyzer: 'typography', detailKey: 'typographyStructure' },
  { analyzer: 'consistency', detailKey: 'consistencyStructure' },
  { analyzer: 'link-doi', detailKey: 'linkDoiStructure' },
  { analyzer: 'required-sections', detailKey: 'requiredSectionsStructure' },
  { analyzer: 'legal-footnotes', detailKey: 'legalFootnoteStructure' },
];

function matches(xml: string, re: RegExp): number {
  return xml.match(re)?.length ?? 0;
}

/** Broj tablica koje zapocinju dok je druga w:tbl vec otvorena. */
export function nestedTableCount(xml: string): number {
  let depth = 0;
  let nested = 0;
  for (const match of xml.matchAll(/<\/?w:tbl\b[^>]*>/gi)) {
    const token = match[0];
    if (/^<\/w:tbl/i.test(token)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) nested += 1;
    if (!/\/\s*>$/.test(token)) depth += 1;
  }
  return nested;
}

/**
 * Broj neuravnotezenih slozenih polja: `w:fldChar` begin bez svog end, ili end bez begin.
 *
 * `field-integrity` takvo polje preskace (nema para za `end`), pa bez ovog brojaca polje u
 * fusnoti ili endnoti ne bi ostavilo nikakav trag i census bi lazno javio no-known-limits
 * (Codex M2 na #165). Broji samo oznake tipa; instrukcija i spremljeni rezultat se ne citaju.
 */
export function unbalancedFieldCount(xml: string): number {
  let depth = 0;
  let orphanEnds = 0;
  for (const match of xml.matchAll(/<w:fldChar\b[^>]*>/gi)) {
    const type = /\bw:fldCharType\s*=\s*["']([A-Za-z]+)["']/i.exec(match[0])?.[1]?.toLowerCase();
    if (type === 'begin') depth += 1;
    else if (type === 'end') {
      if (depth > 0) depth -= 1;
      else orphanEnds += 1;
    }
  }
  return depth + orphanEnds;
}

export interface InspectionStructureCounter {
  kind: InspectionStructureKind;
  count: (xml: string) => number;
}

/** Fiksni redoslijed i brojaci census-a. Svaka vrsta je samo oznaka i broj, bez teksta. */
export const INSPECTION_STRUCTURES: readonly InspectionStructureCounter[] = [
  { kind: 'content-control', count: (xml) => matches(xml, /<w:sdt\b/gi) },
  { kind: 'text-box', count: (xml) => matches(xml, /<w:txbxContent\b/gi) },
  { kind: 'math', count: (xml) => matches(xml, /<m:oMath\b/gi) },
  { kind: 'tracked-change', count: (xml) => matches(xml, /<w:(?:ins|del|moveFrom|moveTo)\b/gi) },
  // Wordov OLE zapis cesto ima oba omotaca za isti objekt; max sprjecava dvostruko brojanje.
  { kind: 'embedded-object', count: (xml) => Math.max(matches(xml, /<w:object\b/gi), matches(xml, /<o:OLEObject\b/gi)) },
  { kind: 'nested-table', count: nestedTableCount },
  { kind: 'unbalanced-field', count: unbalancedFieldCount },
];

/**
 * Dijelovi paketa koje census cita: tijelo, fusnote, endnote i SVA zaglavlja i podnozja.
 * Tekstni okvir, SDT ili objekt samo u zaglavlju inace ne bi ostavio trag (Codex M1 na #165).
 */
const INSPECTION_PART_RE = /^word\/(?:document|footnotes|endnotes|header\d*|footer\d*)\.xml$/i;

export function inspectionPartNames(names: Iterable<string>): string[] {
  return [...new Set([...names].filter((name) => INSPECTION_PART_RE.test(name)))].sort();
}

/** Minimalno sucelje ZIP citaca (ZipReader iz src/docx/parser.ts ga zadovoljava). */
export interface InspectionPackage {
  names(): string[];
  text(name: string): Promise<string>;
}

export interface InspectionPackageOptions {
  /** Vec procitani dijelovi (npr. word/document.xml), da se ne dekomprimiraju dvaput. */
  preloaded?: Readonly<Record<string, string>>;
  partNames?: (names: Iterable<string>) => string[];
  structures?: readonly InspectionStructureCounter[];
}

/** Procita sve census dijelove; baca ako se ijedan ne moze procitati. */
export async function readInspectionParts(
  zip: InspectionPackage,
  options: Pick<InspectionPackageOptions, 'preloaded' | 'partNames'> = {},
): Promise<InspectionXmlPart[]> {
  const select = options.partNames ?? inspectionPartNames;
  const preloaded = options.preloaded ?? {};
  const parts: InspectionXmlPart[] = [];
  for (const name of select(zip.names())) {
    const known = Object.prototype.hasOwnProperty.call(preloaded, name) ? preloaded[name] : undefined;
    parts.push({ part: name, xml: typeof known === 'string' ? known : await zip.text(name) });
  }
  return parts;
}

/**
 * Census nad cijelim paketom. Svaki kvar citanja ili brojanja daje `unknown`, nikad
 * `no-known-limits`: nepoznato se ne smije prikazati kao potpuno provjereno.
 */
export async function inspectionCoverageFromPackage(
  zip: InspectionPackage,
  details: Record<string, unknown> | null | undefined,
  options: InspectionPackageOptions = {},
): Promise<InspectionCoverage> {
  try {
    const parts = await readInspectionParts(zip, options);
    return buildInspectionCoverage(parts, details, options.structures);
  } catch {
    return inspectionCoverageUnavailable();
  }
}

function skippedCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const skipped = (value as { skipped?: unknown }).skipped;
  return Array.isArray(skipped) ? skipped.length : 0;
}

export function buildInspectionCoverage(
  parts: readonly InspectionXmlPart[],
  details: Record<string, unknown> | null | undefined,
  structures: readonly InspectionStructureCounter[] = INSPECTION_STRUCTURES,
): InspectionCoverage {
  const totals = new Map<InspectionStructureKind, number>();

  for (const part of parts) {
    if (!part || typeof part.xml !== 'string' || !part.xml) continue;
    for (const { kind, count } of structures) totals.set(kind, (totals.get(kind) ?? 0) + count(part.xml));
  }

  const items: InspectionCoverageItem[] = structures
    .map(({ kind }) => ({ kind, count: totals.get(kind) ?? 0 }))
    .filter((item) => item.count > 0);

  const safeDetails = details && typeof details === 'object' ? details : {};
  const analyzerSkips: InspectionAnalyzerSkip[] = ANALYZERS.flatMap(({ analyzer, detailKey }) => {
    const count = skippedCount(safeDetails[detailKey]);
    return count > 0 ? [{ analyzer, count }] : [];
  });

  const limitedOccurrences = items.reduce((sum, item) => sum + item.count, 0);
  const skipTotal = analyzerSkips.reduce((sum, item) => sum + item.count, 0);

  return {
    version: 1,
    status: limitedOccurrences > 0 || skipTotal > 0 ? 'partial' : 'no-known-limits',
    items,
    analyzerSkips,
    summary: {
      limitedKinds: items.length,
      limitedOccurrences,
      analyzerSkips: skipTotal,
    },
  };
}

export function inspectionCoverageUnavailable(): InspectionCoverage {
  return {
    version: 1,
    status: 'unknown',
    items: [],
    analyzerSkips: [],
    summary: { limitedKinds: 0, limitedOccurrences: 0, analyzerSkips: 0 },
  };
}
