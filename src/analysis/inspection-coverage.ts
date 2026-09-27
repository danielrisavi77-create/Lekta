/**
 * T64 — sto analiza NIJE provjerila u cijelosti.
 *
 * Ovo nije profilna pokrivenost pravila (details.coverage) i nije nova ocjena.
 * Modul samo:
 *  1. radi content-free census poznatih OOXML struktura s ogranicenom podrskom;
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
  | 'nested-table';

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
  status: 'complete' | 'partial' | 'unknown';
  items: InspectionCoverageItem[];
  analyzerSkips: InspectionAnalyzerSkip[];
  summary: {
    limitedKinds: number;
    limitedOccurrences: number;
    analyzerSkips: number;
  };
}

const STRUCTURE_ORDER: readonly InspectionStructureKind[] = [
  'content-control',
  'text-box',
  'math',
  'tracked-change',
  'embedded-object',
  'nested-table',
];

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

function structureCounts(xml: string): Record<InspectionStructureKind, number> {
  const wObject = matches(xml, /<w:object\b/gi);
  const oleObject = matches(xml, /<o:OLEObject\b/gi);
  return {
    'content-control': matches(xml, /<w:sdt\b/gi),
    'text-box': matches(xml, /<w:txbxContent\b/gi),
    math: matches(xml, /<m:oMath\b/gi),
    'tracked-change': matches(xml, /<w:(?:ins|del|moveFrom|moveTo)\b/gi),
    // Wordov OLE zapis cesto ima oba omotaca za isti objekt; max sprjecava dvostruko brojanje.
    'embedded-object': Math.max(wObject, oleObject),
    'nested-table': nestedTableCount(xml),
  };
}

function skippedCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const skipped = (value as { skipped?: unknown }).skipped;
  return Array.isArray(skipped) ? skipped.length : 0;
}

export function buildInspectionCoverage(
  parts: readonly InspectionXmlPart[],
  details: Record<string, unknown> | null | undefined,
): InspectionCoverage {
  const totals = Object.fromEntries(STRUCTURE_ORDER.map((kind) => [kind, 0])) as Record<InspectionStructureKind, number>;

  for (const part of parts) {
    if (!part || typeof part.xml !== 'string' || !part.xml) continue;
    const counts = structureCounts(part.xml);
    for (const kind of STRUCTURE_ORDER) totals[kind] += counts[kind];
  }

  const items: InspectionCoverageItem[] = STRUCTURE_ORDER
    .filter((kind) => totals[kind] > 0)
    .map((kind) => ({ kind, count: totals[kind] }));

  const safeDetails = details && typeof details === 'object' ? details : {};
  const analyzerSkips: InspectionAnalyzerSkip[] = ANALYZERS.flatMap(({ analyzer, detailKey }) => {
    const count = skippedCount(safeDetails[detailKey]);
    return count > 0 ? [{ analyzer, count }] : [];
  });

  const limitedOccurrences = items.reduce((sum, item) => sum + item.count, 0);
  const skipTotal = analyzerSkips.reduce((sum, item) => sum + item.count, 0);

  return {
    version: 1,
    status: limitedOccurrences > 0 || skipTotal > 0 ? 'partial' : 'complete',
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
