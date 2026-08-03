import { els, first, attr, direct } from '../utils/helpers';
import { anchorFingerprintForXml, type ElementCandidate, type ElementStructure } from './element-structure';

export interface RescueMediaInfo {
  widthPx?: number;
  heightPx?: number;
  mime?: string;
}

export interface TableRescueCandidate {
  id: string;
  bodyChildIndex: number;
  anchorFingerprint: string;
  rowCount: number;
  columnCount: number;
  tableWidthEmu: number | null;
  availableWidthEmu: number | null;
  wide: boolean;
  hasHeader: boolean;
  rowsWithCantSplit: number;
  nested: boolean;
  unsupported: boolean;
  source?: { paragraphIndex: number; text: string };
  sourceAnchorFingerprint?: string;
  landscapeAnchors?: { beforeFingerprint: string; afterFingerprint: string };
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface FigureRescueCandidate {
  id: string;
  paragraphIndex: number;
  drawingIndex: number;
  anchorFingerprint: string;
  relId: string;
  widthEmu: number | null;
  heightEmu: number | null;
  availableWidthEmu: number | null;
  widthPx: number | null;
  heightPx: number | null;
  dpiX: number | null;
  dpiY: number | null;
  aspectRatio: number | null;
  anchored: boolean;
  wrapsText: boolean;
  captionParagraphIndex?: number;
  hasAltText: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface RescueWarning {
  id: string;
  kind: 'table' | 'figure' | 'document';
  message: string;
  candidateId?: string;
  severity: 'info' | 'warning';
}

export interface TableFigureRescue {
  version: 1;
  tables: TableRescueCandidate[];
  figures: FigureRescueCandidate[];
  warnings: RescueWarning[];
  summary: {
    tables: number;
    wideTables: number;
    tablesWithoutRepeatHeader: number;
    splittableRows: number;
    figures: number;
    lowResolutionFigures: number;
    figuresWithWrapping: number;
    missingAltText: number;
  };
}

export interface TableFigureRescueInput {
  document: Document;
  elementStructure?: ElementStructure;
  paragraphs?: Array<{ index: number; text: string }>;
  availableWidthEmu?: number | null;
  media?: Record<string, RescueMediaInfo>;
  minimumDpi?: number;
}

function localName(node: Node | null): string {
  if (!node) return '';
  const element = node as Element;
  return element.localName || element.nodeName.split(':').pop() || element.nodeName;
}

function children(node: Element): Element[] {
  return [...node.childNodes].filter((child): child is Element => child.nodeType === 1) as Element[];
}

function directChildren(node: Element, name: string): Element[] {
  return children(node).filter((child) => localName(child) === name);
}

/**
 * RE-60 (treci potrosac istog indeksa): mora vratiti SVU djecu tijela, jer se indeksira
 * `children[candidate.anchor.bodyChildIndex]`, a taj indeks element-structure racuna nad punim
 * popisom. Prije se ovdje uzimalo samo p i tbl, pa je svaki `w:sdt` (automatski sadrzaj) pomicao
 * indekse i `localName(node)` vise nije bio 'tbl' ni 'p'. Kandidat bi se tiho preskocio i
 * struktura bi ostala prazna, pa popravak prelamanja nije imao sto ponuditi ni na dokumentu s
 * tablicama i slikama.
 */
function bodyChildren(document: Document): Element[] {
  const body = [...document.getElementsByTagName('*')].find((node) => localName(node) === 'body') as Element | undefined;
  if (!body) return [];
  return [...body.childNodes].filter((node): node is Element => node.nodeType === 1);
}

function numberAttribute(node: Element | null, name: string): number | null {
  const value = node ? Number(attr(node, name)) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function hasDescendant(node: Element, names: string[]): boolean {
  return els(node, '*').some((candidate) => names.includes(localName(candidate)));
}

function paragraphText(node: Element): string {
  return [...els(node, '*')].filter((child) => localName(child) === 't').map((child) => child.textContent || '').join('').trim();
}

function elementXml(node: Element): string {
  return typeof XMLSerializer !== 'undefined' ? new XMLSerializer().serializeToString(node) : node.toString();
}

function tableMetrics(table: Element, candidate: ElementCandidate, availableWidthEmu: number | null, warnings: RescueWarning[]): TableRescueCandidate {
  const rows = directChildren(table, 'tr');
  const grid = directChildren(directChildren(table, 'tblGrid')[0] || table, 'gridCol');
  const firstRowCells = rows[0] ? directChildren(rows[0], 'tc').length : 0;
  const columnCount = Math.max(firstRowCells, grid.length);
  const tableProperties = directChildren(table, 'tblPr')[0];
  const tableWidth = tableProperties ? directChildren(tableProperties, 'tblW')[0] : null;
  const tableWidthEmu = tableWidth ? (() => {
    const twips = Number(attr(tableWidth, 'w:w'));
    return Number.isFinite(twips) && twips > 0 ? Math.round(twips * 635) : null;
  })() : null;
  const hasHeader = rows.some((row) => !!directChildren(directChildren(row, 'trPr')[0] ?? row, 'tblHeader').length);
  let rowsWithCantSplit = 0;
  for (const row of rows) {
    const trPr = directChildren(row, 'trPr')[0] ?? null;
    if (trPr && directChildren(trPr, 'cantSplit').length) rowsWithCantSplit += 1;
  }
  const nested = hasDescendant(table, ['tbl']) && rows.some((row) => hasDescendant(row, ['tbl']));
  const unsupported = nested || hasDescendant(table, ['ins', 'del', 'fldSimple', 'txbxContent', 'sdtContent']);
  const wide = tableWidthEmu != null && availableWidthEmu != null && tableWidthEmu > availableWidthEmu;
  const evidence = [`${rows.length} redaka`, `${columnCount} stupaca`];
  if (tableWidthEmu != null) evidence.push('pronađena širina tablice');
  if (hasHeader) evidence.push('pronađeno zaglavlje');
  if (nested) evidence.push('ugniježđena tablica');
  if (unsupported) warnings.push({ id: `${candidate.id}-unsupported`, kind: 'table', candidateId: candidate.id, severity: 'warning', message: 'Tablica ima složenu strukturu i neće biti automatski popravljena.' });
  if (wide) warnings.push({ id: `${candidate.id}-wide`, kind: 'table', candidateId: candidate.id, severity: 'warning', message: 'Tablica je šira od raspoloživog tekstnog prostora; predloži landscape samo uz potvrdu.' });
  return {
    id: candidate.id,
    bodyChildIndex: candidate.anchor.bodyChildIndex,
    anchorFingerprint: candidate.anchorFingerprint,
    rowCount: rows.length,
    columnCount,
    tableWidthEmu,
    availableWidthEmu,
    wide,
    hasHeader,
    rowsWithCantSplit,
    nested,
    unsupported,
    ...(candidate.source ? { source: candidate.source } : {}),
    confidence: unsupported ? 'low' : wide || !hasHeader || rowsWithCantSplit < rows.length ? 'medium' : 'high',
    evidence,
  };
}

function imageDrawing(paragraph: Element): Element | null {
  return els(paragraph, '*').find((node) => localName(node) === 'drawing' || localName(node) === 'pict') || null;
}

function figureMetrics(paragraph: Element, candidate: ElementCandidate, drawingIndex: number, media: Record<string, RescueMediaInfo>, minimumDpi: number, availableWidthEmu: number | null, warnings: RescueWarning[]): FigureRescueCandidate | null {
  const drawing = imageDrawing(paragraph);
  if (!drawing) return null;
  const blip = els(drawing, '*').find((node) => localName(node) === 'blip');
  const vmlImage = els(drawing, '*').find((node) => localName(node) === 'imagedata');
  const relId = blip ? attr(blip, 'r:embed') : vmlImage ? attr(vmlImage, 'r:id') : '';
  if (!relId) return null;
  const extent = els(drawing, '*').find((node) => localName(node) === 'extent');
  const widthEmu = numberAttribute(extent ?? null, 'cx');
  const heightEmu = numberAttribute(extent ?? null, 'cy');
  const info = media[relId] || {};
  const widthPx = info.widthPx ?? null;
  const heightPx = info.heightPx ?? null;
  const dpiX = widthPx && widthEmu ? widthPx / (widthEmu / 914400) : null;
  const dpiY = heightPx && heightEmu ? heightPx / (heightEmu / 914400) : null;
  const ratio = widthEmu && heightEmu ? widthEmu / heightEmu : null;
  const anchor = !!els(drawing, '*').find((node) => localName(node) === 'anchor');
  const wrapsText = anchor && !els(drawing, '*').some((node) => localName(node) === 'wrapNone');
  const docPr = els(drawing, '*').find((node) => localName(node) === 'docPr');
  const hasAltText = !!docPr && !!(attr(docPr, 'descr') || '').trim();
  const lowResolution = dpiX != null && dpiY != null && Math.min(dpiX, dpiY) < minimumDpi;
  const evidence = ['slika u w:drawing'];
  if (anchor) evidence.push('usidrena slika');
  if (wrapsText) evidence.push('uključeno prelamanje teksta');
  if (hasAltText) evidence.push('pronađen alt tekst');
  if (lowResolution) {
    evidence.push(`procijenjeni DPI ${Math.round(Math.min(dpiX!, dpiY!))}`);
    warnings.push({ id: `${candidate.id}-dpi`, kind: 'figure', candidateId: candidate.id, severity: 'warning', message: 'Slika ima nisku procijenjenu rezoluciju; Lekta je neće povećavati.' });
  }
  if (wrapsText) warnings.push({ id: `${candidate.id}-wrap`, kind: 'figure', candidateId: candidate.id, severity: 'warning', message: 'Slika ima text wrapping koji se može ukloniti samo na jednostavnom sidru.' });
  return { id: candidate.id, paragraphIndex: candidate.anchor.paragraphIndex ?? 0, drawingIndex, anchorFingerprint: candidate.anchorFingerprint, relId, widthEmu, heightEmu, availableWidthEmu, widthPx, heightPx, dpiX, dpiY, aspectRatio: ratio, anchored: anchor, wrapsText, ...(candidate.existingCaption ? { captionParagraphIndex: candidate.existingCaption.paragraphIndex } : {}), hasAltText, confidence: lowResolution ? 'medium' : hasAltText && !wrapsText ? 'high' : 'medium', evidence };
}

export function analyzeTableFigureRescue(input: TableFigureRescueInput): TableFigureRescue {
  const structure = input.elementStructure;
  const children = bodyChildren(input.document);
  const candidates = structure?.candidates ?? [];
  const warnings: RescueWarning[] = [];
  const tables: TableRescueCandidate[] = [];
  const figures: FigureRescueCandidate[] = [];
  const availableWidthEmu = input.availableWidthEmu ?? null;
  let drawingIndex = 0;
  for (const candidate of candidates) {
    const node = children[candidate.anchor.bodyChildIndex];
    if (!node) continue;
    if (candidate.kind === 'table' && localName(node) === 'tbl') {
      const table = tableMetrics(node, candidate, availableWidthEmu, warnings);
      const sourceNode = children[candidate.anchor.bodyChildIndex + 1];
      if (table.source && sourceNode && localName(sourceNode) === 'p') table.sourceAnchorFingerprint = anchorFingerprintForXml('figure', elementXml(sourceNode));
      const beforeNode = children[candidate.anchor.bodyChildIndex - 1];
      const afterNode = children[candidate.anchor.bodyChildIndex + 1];
      if (beforeNode && afterNode && localName(beforeNode) === 'p' && localName(afterNode) === 'p') table.landscapeAnchors = { beforeFingerprint: anchorFingerprintForXml('figure', elementXml(beforeNode)), afterFingerprint: anchorFingerprintForXml('figure', elementXml(afterNode)) };
      tables.push(table);
    }
    if ((candidate.kind === 'figure' || candidate.kind === 'chart') && localName(node) === 'p') {
      const figure = figureMetrics(node, candidate, drawingIndex, input.media ?? {}, input.minimumDpi ?? 150, availableWidthEmu, warnings);
      drawingIndex += 1;
      if (figure) figures.push(figure);
    }
  }
  const splittableRows = tables.reduce((sum, table) => sum + Math.max(0, table.rowCount - table.rowsWithCantSplit), 0);
  const lowResolutionFigures = figures.filter((figure) => figure.dpiX != null && figure.dpiY != null && Math.min(figure.dpiX, figure.dpiY) < (input.minimumDpi ?? 150)).length;
  return {
    version: 1,
    tables,
    figures,
    warnings,
    summary: {
      tables: tables.length,
      wideTables: tables.filter((table) => table.wide).length,
      tablesWithoutRepeatHeader: tables.filter((table) => !table.hasHeader).length,
      splittableRows,
      figures: figures.length,
      lowResolutionFigures,
      figuresWithWrapping: figures.filter((figure) => figure.wrapsText).length,
      missingAltText: figures.filter((figure) => !figure.hasAltText).length,
    },
  };
}
