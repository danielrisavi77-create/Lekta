import { els, first, textOf } from '../utils/helpers.ts';
import { parseXml } from '../docx/parser.ts';

export type ElementKind = 'table' | 'figure' | 'chart';
export type ElementConfidence = 'high' | 'medium' | 'low';

export interface ElementAnchor {
  bodyChildIndex: number;
  paragraphIndex?: number;
  drawingIndex?: number;
  tableIndex?: number;
}

export interface ElementCaption {
  paragraphIndex: number;
  rawText: string;
  label: string;
  manualNumber?: string;
  description: string;
  position: 'above' | 'below';
}

export interface ElementSource {
  paragraphIndex: number;
  text: string;
}

export interface ElementReferenceSuggestion {
  paragraphIndex: number;
  /** Raspon SAMO BROJA u tekstu odlomka; sklonjena oznaka ostaje autorov tekst (RE-58). */
  start: number;
  end: number;
  /** Doslovan broj kako stoji u tekstu (ono sto se zamjenjuje poljem). */
  rawText: string;
  /** Cijeli prepoznati izraz ("u Tablici 1"), za prikaz korisniku u panelu. */
  contextText: string;
  elementId: string;
  confidence: ElementConfidence;
  evidence: string[];
}

export interface ElementCandidate {
  id: string;
  kind: ElementKind;
  ordinal: number;
  anchor: ElementAnchor;
  anchorFingerprint: string;
  existingCaption?: ElementCaption;
  source?: ElementSource;
  confidence: ElementConfidence;
  evidence: string[];
  referenceSuggestions?: ElementReferenceSuggestion[];
}

export interface ElementStructureSummary {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  withCaption: number;
  missingCaption: number;
  manualNumbering: number;
  sourcesMissing: number;
  byKind: Record<ElementKind, number>;
}

export interface ElementStructure {
  candidates: ElementCandidate[];
  references: ElementReferenceSuggestion[];
  lists: { table: boolean; figure: boolean; chart: boolean };
  warnings: string[];
  summary: ElementStructureSummary;
}

interface ParagraphLike { index: number; text: string; }

const KIND_LABELS: Record<ElementKind, string[]> = {
  table: ['tablica', 'tabela', 'table'],
  figure: ['slika', 'figure'],
  chart: ['grafikon', 'chart'],
};

function localName(node: Element): string {
  return node.localName || node.nodeName.split(':').pop() || node.nodeName;
}

function childElements(node: Element): Element[] {
  return [...node.childNodes].filter((child): child is Element => child.nodeType === 1) as Element[];
}

function bodyChildren(body: Element): Element[] {
  return childElements(body).filter((node) => ['p', 'tbl', 'sectPr'].includes(localName(node)));
}

function hasDescendant(node: Element, names: string[]): boolean {
  return els(node, '*').some((candidate) => names.includes(localName(candidate)));
}

function isTextbox(node: Element): boolean {
  return hasDescendant(node, ['txbxContent', 'textBox']);
}

function isInsideExcludedContext(node: Element): boolean {
  for (let parent = node.parentNode as Element | null; parent; parent = parent.parentNode as Element | null) {
    const name = localName(parent);
    if (['tbl', 'tc', 'txbxContent', 'textBox', 'sdtContent', 'header', 'footer'].includes(name)) return true;
  }
  return false;
}

function visibleParagraphText(node: Element): string {
  return textOf(node).replace(/\s+/g, ' ').trim();
}

function captionKind(label: string): ElementKind | null {
  const normalized = label.toLocaleLowerCase('hr');
  if (KIND_LABELS.table.includes(normalized)) return 'table';
  if (KIND_LABELS.figure.includes(normalized)) return 'figure';
  if (KIND_LABELS.chart.includes(normalized)) return 'chart';
  return null;
}

function parseCaption(text: string, expected: ElementKind): Omit<ElementCaption, 'paragraphIndex' | 'position'> | null {
  const match = text.match(/^\s*(Tablica|Tabela|Table|Slika|Figure|Grafikon|Chart)\s*(?:broj\s*)?(\d+(?:\.\d+)*)?\s*[.:)\-]?\s*(.*?)\s*$/iu);
  if (!match || captionKind(match[1]) !== expected) return null;
  const description = match[3].trim();
  return { rawText: text, label: match[1], ...(match[2] ? { manualNumber: match[2] } : {}), description };
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalElement(node: Element): string {
  const walk = (current: Element): string => {
    const attrs = [...current.attributes]
      .filter((a) => !/^w:rsid|^rsid/i.test(a.name))
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(';');
    const children = childElements(current).map(walk).join('|');
    return `${current.nodeName}[${attrs}](${textOf(current).replace(/\s+/g, ' ').trim()}){${children}}`;
  };
  return walk(node);
}

export function anchorFingerprintForElement(kind: ElementKind, node: Element): string {
  return hash(`${kind}|${canonicalElement(node)}`);
}

/** Isti fingerprint koristi analizator i fixer. Ne ukljucuje susjedne natpise. */
export function anchorFingerprintForXml(kind: ElementKind, anchorXml: string): string {
  try {
    const doc = parseXml(`<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchorXml}</root>`, 'element anchor');
    const node = childElements(doc.documentElement)[0];
    return node ? anchorFingerprintForElement(kind, node) : hash(`${kind}|${anchorXml}`);
  } catch {
    return hash(`${kind}|${anchorXml.replace(/w:rsid\w+="[^"]*"/gi, '').replace(/\s+/g, ' ').trim()}`);
  }
}

/**
 * RE-58: upucivanje na element u hrvatskom je gotovo uvijek u KOSOM PADEZU ("u Tablici 1",
 * "na Slici 2", "prema Grafikonu 3"). Prijasnji izraz je trazio samo nominativ, pa je na stvarnom
 * tekstu nalazio NULA upucivanja i unakrsne upute nisu imale sto povezati (izmjereno na cistom
 * dokumentu kroz lanac analiza -> fixer).
 *
 * Umjesto nabrajanja svih oblika, korijen plus dopusteni nastavci. Broj je u zasebnoj skupini jer
 * popravak mijenja SAMO broj: oznaku Word ne zna sklanjati, pa ostaje autorov tekst.
 */
const REFERENCE_STEMS: Record<ElementKind, string[]> = {
  table: ['tablic(?:a|e|i|u|om|ama)', 'tabel(?:a|e|i|u|om|ama)', 'tables?'],
  figure: ['slik(?:a|e|i|u|om|ama)', 'figures?'],
  chart: ['grafikon(?:a|u|e|om|ima)?', 'charts?'],
};

function referenceRegex(kind: ElementKind): RegExp {
  const labels = REFERENCE_STEMS[kind].join('|');
  // `d` daje tocne indekse skupina, pa se raspon BROJA ne mora pogadjati pretragom po tekstu.
  return new RegExp(`\\b(?:${labels})\\s+(?:broj\\s+)?(\\d+(?:\\.\\d+)*)\\b`, 'gdiu');
}

function listFound(paragraphs: ParagraphLike[], kind: ElementKind): boolean {
  const terms = kind === 'table' ? ['popis tablica', 'list of tables', 'listoftables'] :
    kind === 'chart' ? ['popis grafikona', 'list of charts', 'listofcharts'] :
      ['popis slika', 'popis ilustracija', 'list of figures', 'listoffigures'];
  return paragraphs.some((paragraph) => {
    const value = paragraph.text.toLocaleLowerCase('hr').replace(/\s+/g, ' ');
    return terms.some((term) => value.includes(term));
  });
}

/**
 * Lokalna analiza sidara u glavnom tijelu dokumenta. Namjerno ne promatra odlomke u
 * celijama, tekstualnim okvirima, zaglavljima ili podnozjima, jer se oni ne mogu sigurno
 * povezati s naslovom elementa u toku repaira.
 */
export function analyzeElementStructure(doc: Document, paragraphs: readonly ParagraphLike[]): ElementStructure {
  const body = first(doc, 'w:body');
  // RE-60: `children` sluzi logici (susjedni natpis iznad ili ispod elementa) i zato je filtriran
  // na p/tbl/sectPr. Ali `bodyChildIndex` u receptu MORA brojati SVU djecu tijela, jer je to ono
  // sto popravak vidi kad trazi sidro. Prije se indeks racunao nad filtriranim popisom, pa je
  // svaki `w:sdt` (Wordov automatski sadrzaj, ima ga gotovo svaki rad) pomaknuo sve indekse iza
  // sebe i sidro po indeksu nikad nije pogodilo.
  const allChildren = body ? childElements(body) : [];
  const indexInBody = new Map<Element, number>(allChildren.map((node, index) => [node, index]));
  const children = body ? bodyChildren(body) : [];
  const allParagraphNodes = els(doc, 'w:p');
  const paragraphByNode = new Map<Element, ParagraphLike>();
  for (const [index, node] of allParagraphNodes.entries()) {
    const paragraph = paragraphs.find((entry) => entry.index === index + 1);
    if (paragraph) paragraphByNode.set(node, paragraph);
  }
  const candidates: ElementCandidate[] = [];
  const counters: Record<ElementKind, number> = { table: 0, figure: 0, chart: 0 };
  let drawingIndex = 0;
  let tableIndex = 0;

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const node = children[childIndex];
    // Indeks u RECEPTU je pozicija medju SVOM djecom tijela (RE-60), ne medju filtriranima.
    const bodyChildIndex = indexInBody.get(node) ?? childIndex;
    const name = localName(node);
    let kind: ElementKind | null = null;
    let paragraph: ParagraphLike | undefined;
    let anchor: ElementAnchor = { bodyChildIndex };
    if (name === 'tbl') {
      kind = 'table';
      anchor = { bodyChildIndex, tableIndex };
      tableIndex += 1;
    } else if (name === 'p' && !isTextbox(node)) {
      const drawing = els(node, 'w:drawing').find((entry) => !isTextbox(entry)) || els(node, 'w:pict')[0];
      if (!drawing) continue;
      paragraph = paragraphByNode.get(node);
      if (!paragraph) continue;
      const chart = hasDescendant(drawing, ['chart']);
      const image = hasDescendant(drawing, ['blip', 'imagedata']);
      if (chart === image) continue;
      kind = chart ? 'chart' : 'figure';
      anchor = { bodyChildIndex, paragraphIndex: paragraph.index, drawingIndex };
      drawingIndex += 1;
    } else {
      continue;
    }
    const fingerprint = anchorFingerprintForElement(kind, node);
    const ordinal = ++counters[kind];
    // RE-56: redni broj MORA biti dio identiteta. Otisak se racuna iz sadrzaja, pa su dvije
    // bajt-identicne tablice (npr. dvaput ponovljen prazan predlozak) dobivale isti id, a
    // element-caption-fixer takav recept odbija u cijelosti ('invalid-params') pa rad ostane bez
    // ijednog natpisa. Otisak i dalje sluzi provjeri sidra; ordinal daje identitet i
    // deterministican je jer se broji redom kroz tijelo dokumenta.
    const id = `element-${kind}-${ordinal}-${fingerprint}`;
    // Susjedi se traze u FILTRIRANOM popisu (childIndex), jer natpis je uvijek odlomak; sidro se
    // broji u punom (bodyChildIndex). Mijesanje to dvoje bi natpis trazilo na krivom mjestu.
    const aboveNode = childIndex > 0 ? children[childIndex - 1] : null;
    const belowNode = childIndex + 1 < children.length ? children[childIndex + 1] : null;
    const captionCandidates: Array<{ node: Element; position: 'above' | 'below' }> = [];
    if (aboveNode && localName(aboveNode) === 'p' && !isTextbox(aboveNode)) captionCandidates.push({ node: aboveNode, position: 'above' });
    if (belowNode && localName(belowNode) === 'p' && !isTextbox(belowNode)) captionCandidates.push({ node: belowNode, position: 'below' });
    const parsedCaption = captionCandidates
      .map(({ node: captionNode, position }) => {
        const p = paragraphByNode.get(captionNode);
        const parsed = p ? parseCaption(visibleParagraphText(captionNode), kind as ElementKind) : null;
        return p && parsed ? { ...parsed, paragraphIndex: p.index, position } : null;
      })
      .find((value): value is ElementCaption => value !== null);
    const existingCaption = parsedCaption;
    const sourceNode = captionCandidates
      .map(({ node: captionNode }) => captionNode)
      .concat([node])
      .flatMap((candidate) => {
        const ownerIndex = children.indexOf(candidate);
        const next = ownerIndex >= 0 && ownerIndex + 1 < children.length ? children[ownerIndex + 1] : null;
        return next && localName(next) === 'p' ? [next] : [];
      })
      .find((candidate) => /^(?:izvor|source)\s*:/iu.test(visibleParagraphText(candidate)));
    const sourceParagraph = sourceNode ? paragraphByNode.get(sourceNode) : undefined;
    const source = sourceParagraph ? { paragraphIndex: sourceParagraph.index, text: visibleParagraphText(sourceNode as Element) } : undefined;
    const evidence = [kind === 'table' ? 'w:tbl sidro' : kind === 'chart' ? 'c:chart sidro' : 'w:drawing sidro'];
    if (existingCaption) evidence.push('susjedni natpis');
    if (source) evidence.push('susjedni izvor');
    if (anchor.paragraphIndex != null) evidence.push('odlomak izravno u tijelu');
    const confidence: ElementConfidence = existingCaption ? 'high' : kind === 'table' || anchor.paragraphIndex != null ? 'medium' : 'low';
    candidates.push({ id, kind, ordinal, anchor, anchorFingerprint: fingerprint, ...(existingCaption ? { existingCaption } : {}), ...(source ? { source } : {}), confidence, evidence });
  }

  const references: ElementReferenceSuggestion[] = [];
  for (const candidate of candidates) {
    const labels = new Set(KIND_LABELS[candidate.kind].map((label) => label.toLocaleLowerCase('hr')));
    for (const paragraph of paragraphs) {
      const node = allParagraphNodes[paragraph.index - 1];
      if (!node || isTextbox(node) || isInsideExcludedContext(node) || paragraph.text.length === 0) continue;
      if (candidate.existingCaption?.paragraphIndex === paragraph.index || candidate.source?.paragraphIndex === paragraph.index) continue;
      const matcher = referenceRegex(candidate.kind);
      for (const match of paragraph.text.matchAll(matcher)) {
        const contextText = match[0];
        const number = match[1];
        if (!number || Number(number.split('.')[0]) !== candidate.ordinal && number !== candidate.existingCaption?.manualNumber) continue;
        // Sklonjeni oblik mora pripadati OVOJ vrsti: usporedjuje se pocetak rijeci, jer je rijec u
        // tekstu sklonjena ("Tablici") a oznaka u KIND_LABELS nije ("tablica").
        const word = contextText.split(/\s+/u)[0].toLocaleLowerCase('hr');
        if (![...labels].some((label) => word.startsWith(label.slice(0, 5)))) continue;
        // Raspon pokriva SAMO broj: popravak ne smije dirati sklonjenu oznaku (RE-58).
        const numberRange = match.indices?.[1];
        if (!numberRange) continue;
        const suggestion: ElementReferenceSuggestion = {
          paragraphIndex: paragraph.index,
          start: numberRange[0],
          end: numberRange[1],
          rawText: number,
          contextText,
          elementId: candidate.id,
          confidence: candidate.existingCaption ? 'high' : 'medium',
          evidence: ['oznaka i broj podudaraju se s elementom'],
        };
        references.push(suggestion);
        (candidate.referenceSuggestions ??= []).push(suggestion);
      }
    }
  }
  const summary: ElementStructureSummary = {
    total: candidates.length,
    highConfidence: candidates.filter((candidate) => candidate.confidence === 'high').length,
    mediumConfidence: candidates.filter((candidate) => candidate.confidence === 'medium').length,
    lowConfidence: candidates.filter((candidate) => candidate.confidence === 'low').length,
    withCaption: candidates.filter((candidate) => candidate.existingCaption).length,
    missingCaption: candidates.filter((candidate) => !candidate.existingCaption).length,
    manualNumbering: candidates.filter((candidate) => candidate.existingCaption?.manualNumber).length,
    sourcesMissing: candidates.filter((candidate) => !candidate.source).length,
    byKind: { ...counters },
  };
  const warnings: string[] = [];
  for (const kind of ['table', 'figure', 'chart'] as ElementKind[]) {
    if (counters[kind] > 0 && !listFound(paragraphs as ParagraphLike[], kind)) warnings.push(`Nedostaje prepoznat popis za ${kind === 'table' ? 'tablice' : kind === 'chart' ? 'grafikone' : 'slike'}.`);
  }
  if (summary.manualNumbering > 0) warnings.push('Ručno upisani brojevi natpisa mogu se ukloniti samo nakon potvrde korisnika.');
  return { candidates, references, lists: { table: listFound(paragraphs as ParagraphLike[], 'table'), figure: listFound(paragraphs as ParagraphLike[], 'figure'), chart: listFound(paragraphs as ParagraphLike[], 'chart') }, warnings, summary };
}
