/**
 * T64: sto analiza NIJE provjerila u cijelosti.
 *
 * Ovo nije profilna pokrivenost pravila (details.coverage) i nije nova ocjena.
 * Modul samo:
 *  1. radi content-free census poznatih OOXML struktura s ogranicenom podrskom, nad
 *     tijelom, fusnotama, endnotama, komentarima, glossary dijelom te zaglavljima i
 *     podnozjima koje glavni dokument stvarno povezuje relacijom (Codex M1 i M1b na #165);
 *  2. zbraja vec postojece skipped odluke strukturiranih analizatora.
 *
 * Nikad ne prenosi tekst dokumenta ni slobodni reason iz skipped zapisa.
 */
import { parseXml } from '../docx/parser';

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
 * Granice unutar kojih polje mora biti zatvoreno: svaka fusnota, endnota, komentar i glossary
 * docPart je zaseban tok teksta, pa `begin` u jednoj i `end` u drugoj NISU par (Codex M2b na
 * #165). `\b` iza imena ne hvata footnotePr, footnoteReference, footnotes ni commentRangeStart.
 */
const FIELD_TOKEN_RE = /<\/?w:(?:footnote|endnote|comment|docPart)\b[^>]*>|<w:fldChar\b[^>]*>/gi;

/**
 * Broj neuravnotezenih slozenih polja: `w:fldChar` begin bez svog end, ili end bez begin.
 *
 * `field-integrity` takvo polje preskace (nema para za `end`), pa bez ovog brojaca polje u
 * fusnoti ili endnoti ne bi ostavilo nikakav trag i census bi lazno javio no-known-limits
 * (Codex M2 na #165). Dubina se racuna PO BILJESCI (i po komentaru i docPartu): na svakoj
 * granici se otvorena polja zbrajaju kao neuravnotezena i dubina krece od nule, a samostalni
 * `end` se broji zasebno. Tijelo, zaglavlje i podnozje nemaju takvih granica i broje se kao
 * jedan tok: slozeno polje (npr. TOC) po OOXML-u smije prelaziti granice odlomka, pa bi
 * brojanje po odlomku svaki sadrzaj oznacilo kao neuravnotezen. Broji samo oznake tipa;
 * instrukcija i spremljeni rezultat se ne citaju.
 */
export function unbalancedFieldCount(xml: string): number {
  let depth = 0;
  let unbalanced = 0;
  for (const match of xml.matchAll(FIELD_TOKEN_RE)) {
    const token = match[0];
    if (!/^<w:fldChar\b/i.test(token)) {
      unbalanced += depth;
      depth = 0;
      continue;
    }
    const type = /\bw:fldCharType\s*=\s*["']([A-Za-z]+)["']/i.exec(token)?.[1]?.toLowerCase();
    if (type === 'begin') depth += 1;
    else if (type === 'end') {
      if (depth > 0) depth -= 1;
      else unbalanced += 1;
    }
  }
  return unbalanced + depth;
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
 * Dijelovi koje census cita po fiksnom imenu: tijelo, fusnote i endnote (parser ih cita po tom
 * imenu), te komentari i glossary (building blocks). Komentare i glossary analiza ne provjerava,
 * a strukture u njima su jednako izvan dosega kao u tijelu; zato su UKLJUCENI u census, pa
 * strukture tamo daju partial (Codex m na #165). Namjerno bez nove fiksne oznake 'comments' ili
 * 'glossary': sam komentar bez ogranicenih struktura ne mijenja provjeru forme rada, a census
 * ostaje zatvoren skup vrsta koje UI vec imenuje.
 */
const FIXED_INSPECTION_PARTS = [
  'word/document.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
  'word/comments.xml',
  'word/glossary/document.xml',
];

const DOCUMENT_RELS_PART = 'word/_rels/document.xml.rels';
const DOCUMENT_PART = 'word/document.xml';
const RELATIONSHIP_BASES = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/',
];
/** Tipovi relacija glavnog dokumenta ciji ciljevi ulaze u census. */
const INSPECTED_RELATIONSHIP_TYPES = new Set(['header', 'footer', 'footnotes', 'endnotes', 'comments', 'glossaryDocument']);
const HEADER_FOOTER_REFERENCE_RE = /<w:(?:headerReference|footerReference)\b/i;

export interface InspectionPartContext {
  /** Sadrzaj word/_rels/document.xml.rels ili null kad dio ne postoji. */
  documentRelsXml?: string | null;
  /** Sadrzaj word/document.xml (za provjeru postoje li reference zaglavlja bez rels dijela). */
  documentXml?: string;
}

function relationshipKind(type: string): string | null {
  for (const base of RELATIONSHIP_BASES) if (type.startsWith(base)) return type.slice(base.length);
  return null;
}

/** Razrijesi Target relacije glavnog dokumenta (izvor je word/) u ime dijela paketa. */
function resolveDocumentTarget(target: string): string {
  let decoded = target;
  try { decoded = decodeURIComponent(target); } catch { /* neispravan escape ostaje doslovan */ }
  const segments = decoded.startsWith('/') ? [] : ['word'];
  for (const segment of decoded.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) throw new Error('relacija izlazi iz paketa');
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Ciljevi relacija glavnog dokumenta tipa header, footer, footnotes, endnotes, comments i
 * glossaryDocument. Rels se PARSIRA; nevaljan XML, krivi korijen ili relacija bez Type/Target
 * baca, pa je census tada unknown.
 */
function relatedInspectionTargets(relsXml: string): string[] {
  const doc = parseXml(relsXml, 'Word veze');
  const root = doc.documentElement;
  if (!root || root.localName !== 'Relationships') throw new Error('rels nema korijen Relationships');
  const targets: string[] = [];
  for (let node = root.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.localName !== 'Relationship') continue;
    const type = el.getAttribute('Type') ?? '';
    const target = el.getAttribute('Target') ?? '';
    if (!type || !target) throw new Error('relacija bez Type ili Target');
    const kind = relationshipKind(type);
    if (!kind || !INSPECTED_RELATIONSHIP_TYPES.has(kind)) continue;
    if ((el.getAttribute('TargetMode') ?? '').toLowerCase() === 'external') continue;
    targets.push(resolveDocumentTarget(target));
  }
  return targets;
}

/**
 * Census dijelovi: fiksni skup (ako postoji u paketu) plus SVAKI dio na koji glavni dokument
 * pokazuje relacijom tipa header/footer (i biljeske, komentari, glossary), bez obzira na ime
 * (npr. word/headerCustom.xml). Nepovezani header1.xml se ne ubraja: Word ga ne prikazuje
 * (Codex M1b na #165).
 *
 * Baca (census je tada unknown) kad je rels nevaljan, kad relacija pokazuje na dio kojeg nema,
 * ili kad document.xml referencira zaglavlje ili podnozje a rels dijela nema. Paket BEZ rels
 * dijela i bez ijedne takve reference je valjan (OPC: dio bez relacija nema rels dio); takav
 * dokument nema zaglavlja ni podnozja pa je citanje samo fiksnog skupa potpuno.
 */
export function inspectionPartNames(names: Iterable<string>, context: InspectionPartContext = {}): string[] {
  const byLower = new Map<string, string>();
  for (const name of names) if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
  const selected = new Set<string>();
  for (const fixed of FIXED_INSPECTION_PARTS) {
    const hit = byLower.get(fixed);
    if (hit) selected.add(hit);
  }
  const rels = context.documentRelsXml;
  if (rels == null) {
    if (HEADER_FOOTER_REFERENCE_RE.test(context.documentXml ?? '')) {
      throw new Error('zaglavlje ili podnozje je referencirano, a rels dio ne postoji');
    }
  } else {
    for (const target of relatedInspectionTargets(rels)) {
      const hit = byLower.get(target.toLowerCase());
      if (!hit) throw new Error('relacija pokazuje na dio kojeg nema u paketu');
      selected.add(hit);
    }
  }
  return [...selected].sort();
}

/** Minimalno sucelje ZIP citaca (ZipReader iz src/docx/parser.ts ga zadovoljava). */
export interface InspectionPackage {
  names(): string[];
  text(name: string): Promise<string>;
}

export interface InspectionPackageOptions {
  /** Vec procitani dijelovi (npr. word/document.xml), da se ne dekomprimiraju dvaput. */
  preloaded?: Readonly<Record<string, string>>;
  partNames?: (names: Iterable<string>, context: InspectionPartContext) => string[];
  structures?: readonly InspectionStructureCounter[];
}

/**
 * Procita sve census dijelove; baca ako se ijedan ne moze procitati ili ako izbor dijelova
 * ne moze pouzdano utvrditi koja su zaglavlja i podnozja povezana.
 */
export async function readInspectionParts(
  zip: InspectionPackage,
  options: Pick<InspectionPackageOptions, 'preloaded' | 'partNames'> = {},
): Promise<InspectionXmlPart[]> {
  const select = options.partNames ?? inspectionPartNames;
  const preloaded = options.preloaded ?? {};
  const cache = new Map<string, string>();
  const read = async (name: string): Promise<string> => {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const known = Object.prototype.hasOwnProperty.call(preloaded, name) ? preloaded[name] : undefined;
    const xml = typeof known === 'string' ? known : await zip.text(name);
    cache.set(name, xml);
    return xml;
  };
  const names = zip.names();
  const exact = (wanted: string) => names.find((name) => name.toLowerCase() === wanted);
  const relsName = exact(DOCUMENT_RELS_PART);
  const documentName = exact(DOCUMENT_PART);
  const context: InspectionPartContext = {
    documentRelsXml: relsName ? await read(relsName) : null,
    documentXml: documentName ? await read(documentName) : '',
  };
  const parts: InspectionXmlPart[] = [];
  for (const name of select(names, context)) parts.push({ part: name, xml: await read(name) });
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
