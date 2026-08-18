import { attr } from '../utils/helpers.ts';

export type SectionOrientation = 'portrait' | 'landscape' | 'unknown';
export type SectionNumberFormat = 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter' | string;

export interface SectionMargins {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface SectionHeaderFooterState {
  default?: string;
  first?: string;
  even?: string;
  linkedToPrevious: boolean;
}

export interface SectionCandidate {
  id: string;
  ordinal: number;
  paragraphIndex?: number;
  bodyChildIndex?: number;
  anchorFingerprint: string;
  sectionFingerprint: string;
  geometry: {
    orientation: SectionOrientation;
    pageWidthTwips?: number;
    pageHeightTwips?: number;
    margins?: SectionMargins;
  };
  headers: SectionHeaderFooterState;
  footers: SectionHeaderFooterState;
  numbering: {
    format?: SectionNumberFormat;
    start?: number;
    hasPageField: boolean;
  };
  differentFirstPage: boolean;
  differentOddEven: boolean;
  isTitlePage: boolean;
  isAppendix: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  warnings: string[];
}

export interface SectionStructure {
  version: 1;
  sections: SectionCandidate[];
  warnings: string[];
  summary: {
    sections: number;
    landscape: number;
    linkedHeaders: number;
    linkedFooters: number;
    differentFirstPage: number;
    differentOddEven: number;
    titlePage: number;
    appendixSections: number;
  };
}

export interface SectionStructureInput {
  document: Document;
  documentXml?: string;
  packageXmlParts?: Record<string, string>;
  paragraphs?: Array<{ index: number; text: string }>;
}

function localName(node: Node | null): string {
  if (!node) return '';
  const element = node as Element;
  return element.localName || element.nodeName.split(':').pop() || element.nodeName;
}

function elementChildren(node: Element): Element[] {
  return [...node.childNodes].filter((child): child is Element => child.nodeType === 1) as Element[];
}

function direct(node: Element | null, name: string): Element | null {
  if (!node) return null;
  return elementChildren(node).find((child) => localName(child) === name) ?? null;
}

function descendants(node: Element | Document, name: string): Element[] {
  return [...node.getElementsByTagName('*')].filter((child) => localName(child) === name) as Element[];
}

function textOf(node: Element | null): string {
  return node?.textContent ?? '';
}

function paragraphText(node: Element): string {
  return descendants(node, 't').map((text) => textOf(text)).join('');
}

function serialize(node: Element): string {
  return typeof XMLSerializer !== 'undefined' ? new XMLSerializer().serializeToString(node) : node.toString();
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Fingerprint sidra ne uključuje sectPr, pa ostaje stabilan nakon patchiranja sekcije. */
export function sectionAnchorFingerprint(text: string, bodyChildIndex: number): string {
  return fnv1a(`section-anchor|${bodyChildIndex}|${text.replace(/\s+/g, ' ').trim()}`);
}

export function sectionXmlFingerprint(xml: string): string {
  return fnv1a(xml.replace(/\s+/g, ' ').trim());
}

function bodyChildren(document: Document): Element[] {
  const body = descendants(document, 'body')[0];
  return body ? elementChildren(body) : [];
}

function bodyChildIndex(node: Element, children: Element[]): number {
  return children.indexOf(node);
}

function intAttr(node: Element | null, name: string): number | undefined {
  const value = Number(attr(node, name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function margins(section: Element): SectionMargins | undefined {
  const node = direct(section, 'pgMar');
  if (!node) return undefined;
  const result: SectionMargins = {};
  for (const [key, attribute] of [['top', 'w:top'], ['right', 'w:right'], ['bottom', 'w:bottom'], ['left', 'w:left']] as const) {
    const value = intAttr(node, attribute);
    if (value !== undefined) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

function geometry(section: Element): SectionCandidate['geometry'] {
  const size = direct(section, 'pgSz');
  const width = intAttr(size, 'w:w');
  const height = intAttr(size, 'w:h');
  const explicit = attr(size, 'w:orient');
  const orientation: SectionOrientation = explicit === 'landscape'
    ? 'landscape'
    : explicit === 'portrait'
      ? 'portrait'
      : width !== undefined && height !== undefined
        ? width > height ? 'landscape' : 'portrait'
        : 'unknown';
  return {
    orientation,
    ...(width !== undefined ? { pageWidthTwips: width } : {}),
    ...(height !== undefined ? { pageHeightTwips: height } : {}),
    ...(margins(section) ? { margins: margins(section) } : {}),
  };
}

function refs(section: Element, kind: 'headerReference' | 'footerReference'): SectionHeaderFooterState {
  const result: SectionHeaderFooterState = { linkedToPrevious: false };
  for (const ref of elementChildren(section).filter((child) => localName(child) === kind)) {
    const type = attr(ref, 'w:type') || 'default';
    const id = attr(ref, 'r:id') || attr(ref, 'id') || undefined;
    if (!id) continue;
    if (type === 'first') result.first = id;
    else if (type === 'even') result.even = id;
    else result.default = id;
  }
  return result;
}

function pageFields(parts: Record<string, string> | undefined, relationshipIds: string[]): boolean {
  if (!parts) return false;
  return relationshipIds.some((id) => {
    const part = parts[id];
    return !!part && /(?:PAGE|NUMPAGES)\b/i.test(part);
  });
}

function relationshipTargets(parts: Record<string, string> | undefined): Map<string, string> {
  const result = new Map<string, string>();
  const rels = parts?.['word/_rels/document.xml.rels'] ?? '';
  for (const match of rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/gi)) {
    const target = match[2].replace(/^\.?\//, '');
    result.set(match[1], target.startsWith('word/') ? target : `word/${target}`);
  }
  return result;
}

function oddEvenEnabled(parts: Record<string, string> | undefined): boolean {
  return /<w:evenAndOddHeaders\b/i.test(parts?.['word/settings.xml'] ?? '');
}

function sectionNodes(document: Document): Array<{ section: Element; paragraph?: Element; bodyChildIndex: number }> {
  const children = bodyChildren(document);
  const result: Array<{ section: Element; paragraph?: Element; bodyChildIndex: number }> = [];
  for (const child of children) {
    if (localName(child) === 'p') {
      const pPr = direct(child, 'pPr');
      const section = direct(pPr, 'sectPr');
      if (section) result.push({ section, paragraph: child, bodyChildIndex: bodyChildIndex(child, children) });
    }
  }
  const body = descendants(document, 'body')[0];
  const finalSection = body ? direct(body, 'sectPr') : null;
  if (finalSection) result.push({ section: finalSection, bodyChildIndex: children.indexOf(finalSection) });
  return result;
}

export function analyzeSectionStructure(input: SectionStructureInput): SectionStructure {
  const parts = input.packageXmlParts ?? {};
  const relationships = relationshipTargets(parts);
  const allSections = sectionNodes(input.document);
  const globalWarnings: string[] = [];
  const evenOdd = oddEvenEnabled(parts);

  const sections = allSections.map(({ section, paragraph, bodyChildIndex }, ordinal) => {
    const header = refs(section, 'headerReference');
    const footer = refs(section, 'footerReference');
    const headerLinked = ordinal > 0 && !header.default && !header.first && !header.even;
    const footerLinked = ordinal > 0 && !footer.default && !footer.first && !footer.even;
    header.linkedToPrevious = headerLinked;
    footer.linkedToPrevious = footerLinked;
    const headerIds = [header.default, header.first, header.even].filter((id): id is string => !!id);
    const footerIds = [footer.default, footer.first, footer.even].filter((id): id is string => !!id);
    const headerParts = headerIds.map((id) => relationships.get(id)).filter((name): name is string => !!name);
    const footerParts = footerIds.map((id) => relationships.get(id)).filter((name): name is string => !!name);
    const pageNum = direct(section, 'pgNumType');
    const format = attr(pageNum, 'w:fmt') ?? undefined;
    const start = intAttr(pageNum, 'w:start');
    const text = paragraph ? paragraphText(paragraph) : '';
    const paragraphIndex = paragraph ? (input.paragraphs?.find((item) => item.text === text)?.index) : undefined;
    const isAppendix = /(^|\s)(prilog|appendix|appendices)\b/i.test(text);
    const isTitlePage = ordinal === 0 || !!direct(section, 'titlePg');
    const warnings: string[] = [];
    const evidence: string[] = [];
    if (paragraph) evidence.push('sekcija je vezana uz body-level odlomak');
    else evidence.push('završna sekcija dokumenta');
    if (headerLinked) evidence.push('zaglavlje nasljeđuje prethodnu sekciju');
    if (footerLinked) evidence.push('podnožje nasljeđuje prethodnu sekciju');
    if (direct(section, 'titlePg')) evidence.push('Different First Page');
    if (evenOdd) evidence.push('uključene neparne/parne stranice');
    if (format) evidence.push(`numeriranje stranica: ${format}`);
    if (isAppendix) evidence.push('pronađen naslov priloga');
    if (direct(section, 'sectPrChange')) warnings.push('sekcija sadrži tracked change i nije sigurna za automatski zahvat');
    if (!direct(section, 'pgSz')) warnings.push('nedostaje w:pgSz');
    if (headerIds.some((id) => !relationships.has(id)) || footerIds.some((id) => !relationships.has(id))) warnings.push('zaglavlje ili podnožje nema razriješenu relaciju');
    if (headerParts.some((name) => !parts[name]) || footerParts.some((name) => !parts[name])) warnings.push('XML dio zaglavlja ili podnožja nije dostupan');
    const confidence = warnings.length ? 'low' : paragraph || ordinal === allSections.length - 1 ? 'high' : 'medium';
    const anchorFingerprint = sectionAnchorFingerprint(text, bodyChildIndex);
    const sectionFingerprint = sectionXmlFingerprint(serialize(section));
    const hasPageField = pageFields(parts, [...headerParts, ...footerParts]);
    return {
      id: `section-${ordinal + 1}`,
      ordinal,
      ...(paragraphIndex !== undefined ? { paragraphIndex } : {}),
      ...(paragraph ? { bodyChildIndex } : {}),
      anchorFingerprint,
      sectionFingerprint,
      geometry: geometry(section),
      headers: header,
      footers: footer,
      numbering: { ...(format ? { format } : {}), ...(start !== undefined ? { start } : {}), hasPageField },
      differentFirstPage: !!direct(section, 'titlePg'),
      differentOddEven: evenOdd,
      isTitlePage,
      isAppendix,
      confidence,
      evidence,
      warnings,
    } satisfies SectionCandidate;
  });

  for (let i = 1; i < sections.length; i += 1) {
    if (sections[i].headers.linkedToPrevious) sections[i].headers.linkedToPrevious = !sections[i].headers.default && !sections[i].headers.first && !sections[i].headers.even;
    if (sections[i].footers.linkedToPrevious) sections[i].footers.linkedToPrevious = !sections[i].footers.default && !sections[i].footers.first && !sections[i].footers.even;
  }
  if (sections.length > 1) globalWarnings.push(`${sections.length} postojećih sekcija zahtijeva provjeru redoslijeda i nasljeđivanja.`);
  if (sections.some((section) => section.warnings.length)) globalWarnings.push('Neke sekcije imaju složenu ili nepotpunu XML strukturu.');
  return {
    version: 1,
    sections,
    warnings: globalWarnings,
    summary: {
      sections: sections.length,
      landscape: sections.filter((section) => section.geometry.orientation === 'landscape').length,
      linkedHeaders: sections.filter((section) => section.headers.linkedToPrevious).length,
      linkedFooters: sections.filter((section) => section.footers.linkedToPrevious).length,
      differentFirstPage: sections.filter((section) => section.differentFirstPage).length,
      differentOddEven: sections.filter((section) => section.differentOddEven).length,
      titlePage: sections.filter((section) => section.isTitlePage).length,
      appendixSections: sections.filter((section) => section.isAppendix).length,
    },
  };
}
