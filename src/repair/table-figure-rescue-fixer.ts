import { anchorFingerprintForXml } from '../analysis/element-structure.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface TableFigureRescueTable {
  id: string;
  bodyChildIndex: number;
  anchorFingerprint: string;
  textWidthEmu?: number;
  typography?: { font?: string; sizePt?: number; beforePt?: number; afterPt?: number };
  source?: { paragraphIndex: number; anchorFingerprint: string };
  actions: {
    fitToTextWidth?: true;
    equalColumns?: true;
    repeatHeader?: true;
    preventRowSplit?: true;
    center?: true;
    applyProfileTypography?: true;
    separateSource?: true;
  };
  landscape?: { enabled: true; beforeFingerprint: string; afterFingerprint: string; confirmed: true };
}

export interface TableFigureRescueFigure {
  id: string;
  paragraphIndex: number;
  drawingIndex: number;
  anchorFingerprint: string;
  maxWidthEmu?: number;
  actions: {
    constrainToTextWidth?: true;
    preserveAspectRatio?: true;
    center?: true;
    removeWrapping?: true;
    keepWithCaption?: true;
  };
  altText?: string;
}

export interface TableFigureRescueParams {
  version: 1;
  profileFingerprint?: string;
  tables: TableFigureRescueTable[];
  figures: TableFigureRescueFigure[];
}

interface BodyChild { tag: 'p' | 'tbl' | 'sectPr' | 'sdt'; start: number; end: number; xml: string; }

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function noOp(parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput {
  return { parts, applied: false, beforeLabel: '', afterLabel: '', reason };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] as string));
}

function bodyChildren(documentXml: string): { innerStart: number; innerEnd: number; children: BodyChild[] } | null {
  const body = documentXml.match(/<w:body\b[^>]*>/i);
  const close = documentXml.lastIndexOf('</w:body>');
  if (!body || body.index == null || close < body.index) return null;
  const innerStart = body.index + body[0].length;
  const inner = documentXml.slice(innerStart, close);
  // RE-60 (sesti potrosac istog indeksa): `sdt` MORA biti u popisu. Wordov automatski sadrzaj
  // je <w:sdt> s vise odlomaka u sebi; bez njega stog ne zna da je unutar sadrzaja pa te
  // odlomke broji kao djecu tijela, i `children[bodyChildIndex]` promasi element. Analiza
  // indeks racuna nad SVOM djecom tijela, pa i ovdje sdt mora biti jedno dijete.
  const tokens = /<\/?w:(p|tbl|sectPr|sdt)(?=[\s/>])[^>]*>/gi;
  const stack: Array<{ tag: BodyChild['tag']; start: number }> = [];
  const children: BodyChild[] = [];
  for (let match = tokens.exec(inner); match; match = tokens.exec(inner)) {
    const token = match[0];
    const tag = match[1].toLowerCase() as BodyChild['tag'];
    if (!token.startsWith('</')) {
      if (/\/\s*>$/.test(token)) children.push({ tag, start: match.index, end: match.index + token.length, xml: token });
      else stack.push({ tag, start: match.index });
    } else {
      const open = stack.pop();
      if (open && !stack.length) {
        const end = match.index + token.length;
        children.push({ tag: open.tag, start: open.start, end, xml: inner.slice(open.start, end) });
      }
    }
  }
  return { innerStart, innerEnd: close, children };
}

function hasUnsupported(xml: string): boolean {
  return /<(?:w:)?(?:ins|del|moveFrom|moveTo|fldSimple|txbxContent|sdtContent|sectPrChange)\b/i.test(xml) || /<w:instrText\b/i.test(xml);
}

function upsertChild(parentXml: string, parentTag: string, childXml: string, matcher: RegExp): string {
  if (matcher.test(parentXml)) return parentXml.replace(matcher, childXml);
  const close = parentXml.search(new RegExp(`</w:${parentTag}>`, 'i'));
  return close < 0 ? parentXml : `${parentXml.slice(0, close)}${childXml}${parentXml.slice(close)}`;
}

function patchTable(xml: string, table: TableFigureRescueTable): string {
  let result = xml;
  const actions = table.actions;
  const width = table.textWidthEmu != null ? Math.max(1, Math.round(table.textWidthEmu / 635)) : null;
  if (actions.fitToTextWidth && width != null) {
    const widthXml = `<w:tblW w:w="${width}" w:type="dxa"/>`;
    const properties = result.match(/<w:tblPr\b[^>]*>[\s\S]*?<\/w:tblPr>/i)?.[0];
    if (properties) result = result.replace(properties, upsertChild(properties, 'tblPr', widthXml, /<w:tblW\b[^>]*\/>/i));
  }
  if (actions.fitToTextWidth) {
    const properties = result.match(/<w:tblPr\b[^>]*>[\s\S]*?<\/w:tblPr>/i)?.[0];
    if (properties) result = result.replace(properties, upsertChild(properties, 'tblPr', '<w:tblLayout w:type="fixed"/>', /<w:tblLayout\b[^>]*\/>/i));
  }
  if (actions.center) {
    const properties = result.match(/<w:tblPr\b[^>]*>[\s\S]*?<\/w:tblPr>/i)?.[0];
    if (properties) result = result.replace(properties, upsertChild(properties, 'tblPr', '<w:jc w:val="center"/>', /<w:jc\b[^>]*\/>/i));
  }
  const rowRe = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/gi;
  let rowIndex = 0;
  result = result.replace(rowRe, (rowXml) => {
    const trPrMatch = rowXml.match(/<w:trPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:trPr>)/i);
    const originalTrPr = trPrMatch?.[0] || '';
    const trPr = originalTrPr && /\/\s*>$/.test(originalTrPr) ? originalTrPr.replace(/\/\s*>$/, '></w:trPr>') : originalTrPr || `<w:trPr ${W_NS}></w:trPr>`;
    let next = trPr;
    if (actions.repeatHeader && rowIndex === 0 && !/<w:tblHeader\b/i.test(next)) next = next.replace('</w:trPr>', '<w:tblHeader w:val="true"/></w:trPr>');
    if (actions.preventRowSplit && !/<w:cantSplit\b/i.test(next)) next = next.replace('</w:trPr>', '<w:cantSplit/></w:trPr>');
    rowIndex += 1;
    return originalTrPr ? rowXml.replace(originalTrPr, next) : rowXml.replace(/(<w:tr\b[^>]*>)/i, `$1${next}`);
  });
  if (actions.equalColumns) {
    const grid = result.match(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/i)?.[0];
    const cols = grid ? [...grid.matchAll(/<w:gridCol\b[^>]*>/gi)] : [];
    if (cols.length) {
      const total = width || Number(cols.reduce((sum, col) => sum + Number(col[0].match(/w:w="(\d+)"/i)?.[1] || 0), 0));
      const each = Math.max(1, Math.round(total / cols.length));
      result = result.replace(grid!, grid!.replace(/<w:gridCol\b[^>]*>/gi, '<w:gridCol w:w="' + each + '"/>'));
      result = result.replace(/<w:tcW\b[^>]*>/gi, `<w:tcW w:w="${each}" w:type="dxa"/>`);
    }
  }
  if (actions.applyProfileTypography) {
    const typography = table.typography || {};
    const before = Number.isFinite(typography.beforePt) ? Math.max(0, Math.min(14400, Math.round(typography.beforePt! * 20))) : 0;
    const after = Number.isFinite(typography.afterPt) ? Math.max(0, Math.min(14400, Math.round(typography.afterPt! * 20))) : 0;
    result = result.replace(/<w:pPr\b([^>]*)>([\s\S]*?)<\/w:pPr>/gi, (_match, attrs, inner) => {
      const spacing = `<w:spacing w:before="${before}" w:after="${after}"/>`;
      return `<w:pPr${attrs}>${inner.match(/<w:spacing\b[^>]*\/>/i) ? inner.replace(/<w:spacing\b[^>]*\/>/i, spacing) : inner + spacing}</w:pPr>`;
    });
    result = result.replace(/<w:p\b[^>]*>(?!\s*<w:pPr\b)/gi, (tag) => `${tag}<w:pPr><w:spacing w:before="${before}" w:after="${after}"/></w:pPr>`);
    if (typography.font || Number.isFinite(typography.sizePt)) {
      result = result.replace(/<w:rPr\b([^>]*)>([\s\S]*?)<\/w:rPr>/gi, (_match, attrs, inner) => {
        let next = inner;
        if (typography.font) {
          const fontXml = `<w:rFonts w:ascii="${escapeXml(typography.font)}" w:hAnsi="${escapeXml(typography.font)}" w:cs="${escapeXml(typography.font)}"/>`;
          next = next.match(/<w:rFonts\b[^>]*\/>/i) ? next.replace(/<w:rFonts\b[^>]*\/>/i, fontXml) : fontXml + next;
        }
        if (Number.isFinite(typography.sizePt)) {
          const sizeXml = `<w:sz w:val="${Math.max(2, Math.min(144, Math.round(typography.sizePt! * 2)))}"/><w:szCs w:val="${Math.max(2, Math.min(144, Math.round(typography.sizePt! * 2)))}"/>`;
          next = next.match(/<w:sz\b[^>]*\/>/i) ? next.replace(/<w:sz\b[^>]*\/>/i, sizeXml) : sizeXml + next;
        }
        return `<w:rPr${attrs}>${next}</w:rPr>`;
      });
      result = result.replace(/<w:r\b[^>]*>(?!\s*<w:rPr\b)/gi, (tag) => {
        const font = typography.font ? `<w:rFonts w:ascii="${escapeXml(typography.font)}" w:hAnsi="${escapeXml(typography.font)}" w:cs="${escapeXml(typography.font)}"/>` : '';
        const size = Number.isFinite(typography.sizePt) ? `<w:sz w:val="${Math.max(2, Math.min(144, Math.round(typography.sizePt! * 2)))}"/><w:szCs w:val="${Math.max(2, Math.min(144, Math.round(typography.sizePt! * 2)))}"/>` : '';
        return `${tag}${font || size ? `<w:rPr>${font}${size}</w:rPr>` : ''}`;
      });
    }
  }
  return result;
}

function patchSourceParagraph(xml: string): string {
  let result = patchParagraph(xml, 'left', false);
  const pPr = result.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/i)?.[0];
  if (!pPr) return result;
  const spacing = '<w:spacing w:before="0" w:after="0"/>';
  result = result.replace(pPr, pPr.match(/<w:spacing\b[^>]*\/>/i) ? pPr.replace(/<w:spacing\b[^>]*\/>/i, spacing) : pPr.replace('</w:pPr>', spacing + '</w:pPr>'));
  return result;
}

function patchParagraph(xml: string, align: 'left' | 'center' | 'right' = 'center', keepNext = false): string {
  let result = xml;
  const pPr = result.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/i)?.[0] || `<w:pPr ${W_NS}></w:pPr>`;
  let next = pPr.replace(/<w:jc\b[^>]*\/>/i, `<w:jc w:val="${align}"/>`);
  if (!/<w:jc\b/i.test(next)) next = next.replace('</w:pPr>', `<w:jc w:val="${align}"/></w:pPr>`);
  if (keepNext && !/<w:keepNext\b/i.test(next)) next = next.replace('</w:pPr>', '<w:keepNext/></w:pPr>');
  return result.includes('<w:pPr') ? result.replace(pPr, next) : result.replace(/(<w:p\b[^>]*>)/i, `$1${next}`);
}

function patchFigure(xml: string, figure: TableFigureRescueFigure): string {
  let result = xml;
  const extent = result.match(/<wp:extent\b[^>]*>/i)?.[0];
  const cx = Number(extent?.match(/cx="(\d+)"/i)?.[1] || 0);
  const cy = Number(extent?.match(/cy="(\d+)"/i)?.[1] || 0);
  if (figure.actions.constrainToTextWidth && figure.maxWidthEmu && cx > figure.maxWidthEmu && cx > 0 && cy > 0) {
    const newCx = Math.round(figure.maxWidthEmu);
    const newCy = Math.round(cy * newCx / cx);
    result = result.replace(extent!, extent!.replace(/cx="\d+"/i, `cx="${newCx}"`).replace(/cy="\d+"/i, `cy="${newCy}"`));
    result = result.replace(/<a:ext\b[^>]*>/i, (value) => value.replace(/cx="\d+"/i, `cx="${newCx}"`).replace(/cy="\d+"/i, `cy="${newCy}"`));
  }
  if (figure.actions.removeWrapping && /<wp:anchor\b/i.test(result)) {
    result = result.replace(/<wp:wrap(?:Square|Tight|Through|TopBottom|None)\b[^>]*\/?>(?:<\/wp:wrap(?:Square|Tight|Through|TopBottom|None)>)?/gi, '<wp:wrapNone/>');
  }
  if (figure.altText != null) {
    const alt = escapeXml(figure.altText.trim());
    if (alt.length > 500) return result;
    if (/<wp:docPr\b/i.test(result)) {
      result = result.replace(/(<wp:docPr\b[^>]*?)\s+descr="[^"]*"/i, `$1 descr="${alt}"`);
      if (!/descr="/i.test(result.match(/<wp:docPr\b[^>]*>/i)?.[0] || '')) result = result.replace(/<wp:docPr\b[^>]*>/i, (tag) => tag.replace(/\s*\/>$/, '') + ` descr="${alt}"/>`);
    }
  }
  return result;
}

function tableAlreadyPatched(xml: string, target: TableFigureRescueTable): boolean {
  const properties = xml.match(/<w:tblPr\b[^>]*>[\s\S]*?<\/w:tblPr>/i)?.[0] || '';
  if (target.actions.fitToTextWidth && !/<w:tblLayout\b[^>]*w:type="fixed"/i.test(properties)) return false;
  if (target.actions.center && !/<w:jc\b[^>]*w:val="center"/i.test(properties)) return false;
  if (target.actions.repeatHeader && !/<w:tblHeader\b/i.test(xml)) return false;
  if (target.actions.preventRowSplit && /<w:tr\b[\s\S]*?<\/w:tr>/gi.test(xml) && (xml.match(/<w:cantSplit\b/gi) || []).length < (xml.match(/<w:tr\b/gi) || []).length) return false;
  return Object.values(target.actions).some(Boolean);
}

function figureAlreadyPatched(xml: string, target: TableFigureRescueFigure): boolean {
  if (target.actions.removeWrapping && /<wp:anchor\b/i.test(xml) && !/<wp:wrapNone\b/i.test(xml)) return false;
  if (target.altText != null && !new RegExp(`descr="${target.altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(xml)) return false;
  return Object.values(target.actions).some(Boolean) || target.altText != null;
}

function paragraphFingerprint(xml: string): string { return anchorFingerprintForXml('figure', xml); }

function sectionXml(documentXml: string, landscape: boolean): string | null {
  const match = documentXml.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/i);
  if (!match) return null;
  let result = match[0];
  const page = result.match(/<w:pgSz\b[^>]*>/i);
  if (!page) return null;
  const width = page[0].match(/w:w="(\d+)"/i)?.[1];
  const height = page[0].match(/w:h="(\d+)"/i)?.[1];
  if (!width || !height) return null;
  result = result.replace(page[0], page[0].replace(/w:w="\d+"/i, `w:w="${landscape ? height : width}"`).replace(/w:h="\d+"/i, `w:h="${landscape ? width : height}"`));
  if (!/<w:type\b/i.test(result)) result = result.replace(/<w:sectPr\b[^>]*>/i, '$&<w:type w:val="nextPage"/>');
  return result;
}

function addSectionToParagraph(paragraphXml: string, section: string): string {
  if (/<w:sectPr\b/i.test(paragraphXml)) return paragraphXml;
  const pPr = paragraphXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/i)?.[0];
  if (pPr) return paragraphXml.replace(pPr, pPr.replace('</w:pPr>', section + '</w:pPr>'));
  return paragraphXml.replace(/(<w:p\b[^>]*>)/i, `$1<w:pPr>${section}</w:pPr>`);
}

export function tableFigureRescueFixer(parts: DocxXmlParts, params: TableFigureRescueParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.tables) || !Array.isArray(params.figures)) return noOp(parts, 'invalid-params');
  if (params.tables.length > 500 || params.figures.length > 500) return noOp(parts, 'invalid-params');
  const layout = bodyChildren(parts.documentXml);
  if (!layout) return noOp(parts, 'unsupported-structure');
  const operations = [...params.tables, ...params.figures];
  // RE-56 (isti obrazac, drugi fixer): jedinstvenost se provjerava po IDENTITETU, ne po otisku
  // sadrzaja. Otisak se racuna iz XML-a elementa, pa dvije bajt-identicne tablice (dvaput ubacen
  // isti prazan predlozak) imaju isti otisak i cijeli popravak je odustajao s 'invalid-params'.
  // Otisak i dalje sluzi provjeri sidra nize; ovdje je kljuc id, koji nosi i redni broj.
  const keys = new Set<string>();
  for (const target of operations) {
    if (!target || typeof target.id !== 'string' || !target.anchorFingerprint || keys.has(target.id)) return noOp(parts, 'invalid-params');
    keys.add(target.id);
  }
  const replacements = new Map<number, string>();
  const insertBefore = new Map<number, string>();
  const insertAfter = new Map<number, string>();
  let changed = false;
  for (const table of params.tables) {
    const child = layout.children[table.bodyChildIndex];
    if (!child || child.tag !== 'tbl') return noOp(parts, 'no-target');
    if (hasUnsupported(child.xml)) return noOp(parts, 'unsupported-structure');
    if (anchorFingerprintForXml('table', child.xml) !== table.anchorFingerprint && !tableAlreadyPatched(child.xml, table)) return noOp(parts, 'unsupported-structure');
    const next = patchTable(child.xml, table);
    if (next !== child.xml) changed = true;
    replacements.set(table.bodyChildIndex, next);
    if (table.actions.separateSource && table.source) {
      const sourceIndex = layout.children.findIndex((entry) => entry.tag === 'p' && anchorFingerprintForXml('figure', entry.xml) === table.source!.anchorFingerprint);
      const source = sourceIndex >= 0 ? layout.children[sourceIndex] : null;
      if (!source || source.tag !== 'p') {
        if (!tableAlreadyPatched(child.xml, table)) return noOp(parts, 'no-target');
      } else {
        replacements.set(sourceIndex, patchSourceParagraph(source.xml));
        changed = true;
      }
    }
    if (table.landscape?.enabled) {
      if (!table.landscape.confirmed) return noOp(parts, 'invalid-params');
      const beforeIndex = table.bodyChildIndex - 1;
      const afterIndex = table.bodyChildIndex + 1;
      const before = layout.children[beforeIndex];
      const after = layout.children[afterIndex];
      if (!before || before.tag !== 'p' || !after || before.xml.includes('sectPr') || after.xml.includes('sectPr') || paragraphFingerprint(before.xml) !== table.landscape.beforeFingerprint || paragraphFingerprint(after.xml) !== table.landscape.afterFingerprint) return noOp(parts, 'unsupported-structure');
      const landscapeSection = sectionXml(parts.documentXml, true);
      const portraitSection = sectionXml(parts.documentXml, false);
      if (!landscapeSection || !portraitSection) return noOp(parts, 'unsupported-structure');
      replacements.set(beforeIndex, addSectionToParagraph(before.xml, landscapeSection));
      insertAfter.set(table.bodyChildIndex, `<w:p><w:pPr>${portraitSection}</w:pPr></w:p>`);
      changed = true;
    }
  }
  for (const figure of params.figures) {
    const child = layout.children[figure.paragraphIndex > 0 ? layout.children.findIndex((entry) => entry.tag === 'p' && entry.xml.includes(`w:drawing`)) : -1];
    const index = layout.children.findIndex((entry) => entry.tag === 'p' && anchorFingerprintForXml('figure', entry.xml) === figure.anchorFingerprint);
    const located = index >= 0 ? layout.children[index] : child;
    if (!located || located.tag !== 'p') return noOp(parts, 'no-target');
    if (hasUnsupported(located.xml)) return noOp(parts, 'unsupported-structure');
    if (anchorFingerprintForXml('figure', located.xml) !== figure.anchorFingerprint && anchorFingerprintForXml('chart', located.xml) !== figure.anchorFingerprint && !figureAlreadyPatched(located.xml, figure)) return noOp(parts, 'unsupported-structure');
    let next = patchFigure(located.xml, figure);
    if (figure.actions.center || figure.actions.keepWithCaption) next = patchParagraph(next, 'center', figure.actions.keepWithCaption === true);
    if (next !== located.xml) changed = true;
    replacements.set(index, next);
  }
  if (!changed) return noOp(parts, 'already-ok');
  let inner = layout.children.map((child, index) => `${insertBefore.get(index) ?? ''}${replacements.get(index) ?? child.xml}${insertAfter.get(index) ?? ''}`).join('');
  const nextDocument = parts.documentXml.slice(0, layout.innerStart) + inner + parts.documentXml.slice(layout.innerEnd);
  return { parts: { ...parts, documentXml: nextDocument }, applied: true, beforeLabel: 'tablice i slike', afterLabel: 'spašene tablice i slike' };
}
