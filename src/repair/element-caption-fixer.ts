import { parseXml } from '../docx/parser';
import { anchorFingerprintForXml, type ElementKind } from '../analysis/element-structure';
import type { DocxXmlParts, FixerOutput } from './fixers';

export interface ElementCaptionFixElement {
  id: string;
  kind: ElementKind;
  anchor: { bodyChildIndex: number; paragraphIndex?: number; drawingIndex?: number; tableIndex?: number };
  anchorFingerprint: string;
  description: string;
  source?: string;
  position: 'above' | 'below';
  replaceManualCaption: boolean;
  label?: string;
}

export interface ElementCaptionFixParams {
  version: 1;
  elements: ElementCaptionFixElement[];
  labels?: Partial<Record<ElementKind, string>>;
  numbering?: 'document' | 'chapter';
  captionStyle?: { font?: string; sizePt?: number; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right' };
  lists?: Array<{ kind: ElementKind; title: string; placement: 'after-toc' | 'before-intro' }>;
  references?: Array<{ paragraphIndex: number; start: number; end: number; elementId: string }>;
}

interface BodyChild { tag: string; start: number; end: number; xml: string; }
interface LocatedTarget { target: ElementCaptionFixElement; index: number; child: BodyChild; }

const DEFAULT_LABELS: Record<ElementKind, string> = { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' };
const XML_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function noOp(parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput {
  return { parts, applied: false, beforeLabel: '', afterLabel: '', reason };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] as string));
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function bodyChildren(documentXml: string): { before: string; children: BodyChild[]; after: string } | null {
  const body = documentXml.match(/<w:body\b[^>]*>/i);
  const close = documentXml.lastIndexOf('</w:body>');
  if (!body || close < body.index! || body.index == null) return null;
  const start = body.index + body[0].length;
  const inner = documentXml.slice(start, close);
  const tokens = /<\/?w:(p|tbl|sectPr)(?=[\s/>])[^>]*>/gi;
  const stack: Array<{ tag: string; start: number }> = [];
  const children: BodyChild[] = [];
  for (let match = tokens.exec(inner); match; match = tokens.exec(inner)) {
    const tag = match[1].toLowerCase();
    const token = match[0];
    const opening = !/^<\//.test(token);
    if (opening) {
      if (stack.length === 0) {
        if (/\/\s*>$/.test(token)) children.push({ tag, start: match.index, end: match.index + token.length, xml: token });
        else stack.push({ tag, start: match.index });
      } else if (!/\/\s*>$/.test(token)) stack.push({ tag, start: match.index });
    } else {
      const open = stack.pop();
      if (open && stack.length === 0) {
        const end = match.index + token.length;
        children.push({ tag: open.tag, start: open.start, end, xml: inner.slice(open.start, end) });
      }
    }
  }
  return { before: documentXml.slice(0, start), children, after: documentXml.slice(close) };
}

function anchorKind(xml: string): ElementKind | null {
  if (/^tbl$/.test(xml.match(/^<w:(tbl)\b/i)?.[1] || '')) return 'table';
  const chart = /<(?:c:|chart:)?chart\b/i.test(xml);
  const image = /<(?:a:blip|v:imagedata)\b/i.test(xml);
  return chart === image ? null : chart ? 'chart' : image ? 'figure' : null;
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => decodeXml(match[1])).join('').replace(/\s+/g, ' ').trim();
}

function captionKind(text: string): ElementKind | null {
  const label = text.match(/^\s*(Tablica|Tabela|Table|Slika|Figure|Grafikon|Chart)\b/i)?.[1]?.toLocaleLowerCase('hr');
  if (!label) return null;
  if (['tablica', 'tabela', 'table'].includes(label)) return 'table';
  if (['slika', 'figure'].includes(label)) return 'figure';
  return ['grafikon', 'chart'].includes(label) ? 'chart' : null;
}

function isGeneratedCaption(xml: string): boolean {
  return /LektaCaption_[A-Za-z0-9_]+/.test(xml) || /<w:instrText\b[^>]*>\s*SEQ\s+(?:Tablica|Slika|Grafikon)\b/i.test(xml);
}

function nextBookmarkId(documentXml: string): number {
  return Math.max(0, ...[...documentXml.matchAll(/<w:bookmarkStart\b[^>]*w:id="(\d+)"/gi)].map((match) => Number(match[1]) || 0)) + 1;
}

function bookmarkName(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 70);
  return `LektaCaption_${safe}`;
}

function captionStyleXml(): string {
  return `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr></w:style>`;
}

function ensureCaptionStyle(stylesXml: string): { xml: string; changed: boolean } {
  if (/<w:style\b[^>]*w:styleId="Caption"/i.test(stylesXml)) return { xml: stylesXml, changed: false };
  const xml = stylesXml.trim() || `<w:styles ${XML_NS}></w:styles>`;
  const close = xml.lastIndexOf('</w:styles>');
  return close < 0 ? { xml: stylesXml, changed: false } : { xml: `${xml.slice(0, close)}${captionStyleXml()}${xml.slice(close)}`, changed: true };
}

function fieldXml(label: string, ordinal: number, bookmark: string, description: string, numbering: 'document' | 'chapter' = 'document', style?: ElementCaptionFixParams['captionStyle']): string {
  const safeLabel = escapeXml(label);
  const safeBookmark = escapeXml(bookmark);
  const suffix = description.trim() ? ` ${escapeXml(description.trim())}` : '';
  const pPr = `<w:pPr><w:pStyle w:val="Caption"/>${style?.align ? `<w:jc w:val="${style.align}"/>` : ''}</w:pPr>`;
  const rPr = `${style?.font ? `<w:rFonts w:ascii="${escapeXml(style.font)}" w:hAnsi="${escapeXml(style.font)}"/>` : ''}${style?.sizePt != null ? `<w:sz w:val="${Math.round(style.sizePt * 2)}"/>` : ''}${style?.bold === false ? '' : '<w:b/>'}${style?.italic === true ? '<w:i/>' : ''}`;
  const switchText = numbering === 'chapter' ? ' \\s 1 \\* ARABIC' : ' \\* ARABIC';
  return `<w:p>${pPr}<w:bookmarkStart w:id="BOOKMARK_ID" w:name="${safeBookmark}"/><w:r><w:rPr>${rPr}</w:rPr><w:t>${safeLabel} </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ ${safeLabel}${switchText} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${ordinal}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r><w:r><w:t xml:space="preserve">${suffix}</w:t></w:r><w:bookmarkEnd w:id="BOOKMARK_ID"/></w:p>`;
}

function sourceXml(source: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Source"/></w:pPr><w:r><w:t xml:space="preserve">Izvor: ${escapeXml(source.trim())}</w:t></w:r></w:p>`;
}

function listXml(label: string, title: string): string {
  const safe = escapeXml(label);
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\h \\z \\c "${safe}"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve">Popis se azurira u Wordu.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

function replaceBookmarkIds(xml: string, id: number): string {
  return xml.replace(/BOOKMARK_ID/g, String(id));
}

function insertLists(documentXml: string, lists: ElementCaptionFixParams['lists'], labels: Record<ElementKind, string>): { xml: string; changed: boolean } {
  if (!lists?.length) return { xml: documentXml, changed: false };
  let xml = documentXml;
  let changed = false;
  for (const entry of lists) {
    const label = labels[entry.kind];
    if (new RegExp(`TOC[^<]*\\\\c\\s+"${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(xml)) continue;
    const body = bodyChildren(xml);
    if (!body) continue;
    const index = entry.placement === 'before-intro'
      ? body.children.findIndex((child) => child.tag === 'p' && /^(?:\s*\d+[.)]?\s*)?(?:uvod|introduction)\b/i.test(paragraphText(child.xml)))
      : body.children.findIndex((child) => child.tag === 'p' && /^(?:sadrzaj|contents|table of contents)\b/i.test(paragraphText(child.xml)));
    if (index < 0) continue;
    const insertAt = entry.placement === 'before-intro' ? index : index + 1;
    const insertion = listXml(label, entry.title);
    const offset = body.children[insertAt]?.start ?? body.children[index].end;
    const absolute = body.before.length + offset;
    xml = xml.slice(0, absolute) + insertion + xml.slice(absolute);
    changed = true;
  }
  return { xml, changed };
}

function replaceReferences(documentXml: string, references: ElementCaptionFixParams['references'], elements: ElementCaptionFixElement[]): { xml: string; changed: boolean } {
  if (!references?.length) return { xml: documentXml, changed: false };
  const byId = new Map(elements.map((element) => [element.id, bookmarkName(element.id)]));
  let paragraphIndex = 0;
  let changed = false;
  const xml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/gi, (paragraph) => {
    paragraphIndex += 1;
    const matches = references.filter((reference) => reference.paragraphIndex === paragraphIndex);
    if (!matches.length) return paragraph;
    const text = paragraphText(paragraph);
    let result = paragraph;
    for (const reference of matches.sort((a, b) => b.start - a.start)) {
      const bookmark = byId.get(reference.elementId);
      const raw = text.slice(reference.start, reference.end);
      if (!bookmark || !raw || raw.length !== reference.end - reference.start) continue;
      const run = result.match(/<w:r\b[^>]*>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t\b[^>]*>([\s\S]*?)<\/w:t>\s*<\/w:r>/i);
      if (!run || !decodeXml(run[1]).includes(raw)) continue;
      const original = decodeXml(run[1]);
      const at = original.indexOf(raw);
      if (at < 0) continue;
      const rPr = run[0].match(/<w:rPr\b[\s\S]*?<\/w:rPr>/i)?.[0] || '';
      const plainRun = (text: string) => text ? `<w:r>${rPr}<w:t>${escapeXml(text)}</w:t></w:r>` : '';
      const field = `<w:hyperlink w:anchor="${escapeXml(bookmark)}"><w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr}<w:instrText xml:space="preserve"> REF ${escapeXml(bookmark)} \\h </w:instrText></w:r><w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr}<w:t>${escapeXml(raw)}</w:t></w:r><w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>`;
      result = result.replace(run[0], `${plainRun(original.slice(0, at))}${field}${plainRun(original.slice(at + raw.length))}`);
      changed = true;
    }
    return result;
  });
  return { xml, changed };
}

function validate(params: ElementCaptionFixParams): boolean {
  if (params.version !== 1 || !Array.isArray(params.elements) || params.elements.length > 200) return false;
  const ids = new Set<string>();
  const anchors = new Set<number>();
  for (const element of params.elements) {
    if (!element || typeof element.id !== 'string' || ids.has(element.id)) return false;
    ids.add(element.id);
    if (!['table', 'figure', 'chart'].includes(element.kind) || !element.anchor || !Number.isInteger(element.anchor.bodyChildIndex) || element.anchor.bodyChildIndex < 0 || element.anchor.bodyChildIndex > 2_000_000 || anchors.has(element.anchor.bodyChildIndex)) return false;
    anchors.add(element.anchor.bodyChildIndex);
    if (typeof element.anchorFingerprint !== 'string' || !/^[0-9a-f]{8}$/i.test(element.anchorFingerprint)) return false;
    if (typeof element.description !== 'string' || element.description.length > 1000 || typeof element.position !== 'string' || !['above', 'below'].includes(element.position)) return false;
    if (element.source != null && (typeof element.source !== 'string' || element.source.length > 2000)) return false;
    for (const key of ['paragraphIndex', 'drawingIndex', 'tableIndex'] as const) {
      const value = element.anchor[key];
      if (value != null && (!Number.isInteger(value) || value < (key === 'paragraphIndex' ? 1 : 0) || value > 2_000_000)) return false;
    }
  }
  if (params.numbering != null && params.numbering !== 'document' && params.numbering !== 'chapter') return false;
  if (params.captionStyle != null && (!params.captionStyle || typeof params.captionStyle !== 'object' || (params.captionStyle.font != null && (typeof params.captionStyle.font !== 'string' || params.captionStyle.font.length > 100)) || (params.captionStyle.sizePt != null && (!Number.isFinite(params.captionStyle.sizePt) || params.captionStyle.sizePt < 6 || params.captionStyle.sizePt > 72)) || (params.captionStyle.bold != null && typeof params.captionStyle.bold !== 'boolean') || (params.captionStyle.italic != null && typeof params.captionStyle.italic !== 'boolean') || (params.captionStyle.align != null && !['left', 'center', 'right'].includes(params.captionStyle.align)))) return false;
  if (params.lists != null) {
    if (!Array.isArray(params.lists) || params.lists.length > 3) return false;
    const kinds = new Set<string>();
    for (const list of params.lists) {
      if (!list || !['table', 'figure', 'chart'].includes(list.kind) || kinds.has(list.kind) || typeof list.title !== 'string' || !list.title.trim() || list.title.length > 200 || !['after-toc', 'before-intro'].includes(list.placement)) return false;
      kinds.add(list.kind);
    }
  }
  if (params.references != null) {
    if (!Array.isArray(params.references) || params.references.length > 200) return false;
    const elementIds = new Set(params.elements.map((element) => element.id));
    for (const reference of params.references) {
      if (!reference || !elementIds.has(reference.elementId) || !Number.isInteger(reference.paragraphIndex) || reference.paragraphIndex < 1 || reference.paragraphIndex > 2_000_000 || !Number.isInteger(reference.start) || !Number.isInteger(reference.end) || reference.start < 0 || reference.end <= reference.start || reference.end - reference.start > 500) return false;
    }
  }
  return true;
}

export function elementCaptionFixer(parts: DocxXmlParts, params: ElementCaptionFixParams): FixerOutput {
  if (!validate(params)) return noOp(parts, 'invalid-params');
  const body = bodyChildren(parts.documentXml);
  if (!body) return noOp(parts, 'unsupported-structure');
  const located: LocatedTarget[] = [];
  for (const target of params.elements) {
    const exact = body.children[target.anchor.bodyChildIndex];
    const exactMatches = exact && anchorKind(exact.xml) === target.kind && anchorFingerprintForXml(target.kind, exact.xml) === target.anchorFingerprint;
    let index = exactMatches ? target.anchor.bodyChildIndex : -1;
    if (index < 0) {
      const matches = body.children.map((child, childIndex) => ({ child, childIndex })).filter(({ child }) => anchorKind(child.xml) === target.kind && anchorFingerprintForXml(target.kind, child.xml) === target.anchorFingerprint);
      if (matches.length !== 1) return noOp(parts, matches.length === 0 ? 'no-target' : 'unsupported-structure');
      index = matches[0].childIndex;
    }
    const child = body.children[index];
    if (!child) return noOp(parts, 'no-target');
    located.push({ target, index, child });
  }
  if (!located.length && !params.lists?.length && !params.references?.length) return noOp(parts, 'no-target');
  const labels = { ...DEFAULT_LABELS, ...(params.labels ?? {}) };
  const remove = new Set<number>();
  const before = new Map<number, string>();
  const after = new Map<number, string>();
  let bookmarkId = nextBookmarkId(parts.documentXml);
  for (const [ordinalIndex, locatedTarget] of located.sort((a, b) => a.index - b.index).entries()) {
    const { target, index } = locatedTarget;
    const above = body.children[index - 1];
    const below = body.children[index + 1];
    const captionIndex = above && captionKind(paragraphText(above.xml)) === target.kind ? index - 1 : below && captionKind(paragraphText(below.xml)) === target.kind ? index + 1 : -1;
    if (captionIndex >= 0 && isGeneratedCaption(body.children[captionIndex].xml)) {
      const current = paragraphText(body.children[captionIndex].xml).replace(/^\s*(?:Tablica|Tabela|Table|Slika|Figure|Grafikon|Chart)\s+\d+(?:\.\d+)*\.?\s*/i, '').trim();
      const expected = target.description.trim();
      if (current === expected && (!target.source || body.children[captionIndex + 1]?.xml.includes(escapeXml(target.source.trim())))) continue;
    }
    if (captionIndex >= 0 && !target.replaceManualCaption && !isGeneratedCaption(body.children[captionIndex].xml)) continue;
    const bookmark = bookmarkName(target.id);
    const caption = replaceBookmarkIds(fieldXml(target.label || labels[target.kind], ordinalIndex + 1, bookmark, target.description, params.numbering, params.captionStyle), bookmarkId++);
    if (captionIndex >= 0) remove.add(captionIndex);
    if (target.position === 'above') before.set(index, caption); else after.set(index, caption);
    if (target.source?.trim()) {
      const sourceIndex = (captionIndex >= 0 && body.children[captionIndex + 1]?.tag === 'p' && /^(?:izvor|source)\s*:/i.test(paragraphText(body.children[captionIndex + 1].xml))) ? captionIndex + 1 : -1;
      if (sourceIndex >= 0) remove.add(sourceIndex);
      after.set(index, `${after.get(index) ?? ''}${sourceXml(target.source)}`);
    }
  }
  let documentXml = body.before + body.children.map((child, index) => `${remove.has(index) ? '' : `${before.get(index) ?? ''}${child.xml}${after.get(index) ?? ''}`}`).join('') + body.after;
  const refs = replaceReferences(documentXml, params.references, params.elements);
  documentXml = refs.xml;
  const lists = insertLists(documentXml, params.lists, labels);
  documentXml = lists.xml;
  const changed = documentXml !== parts.documentXml || refs.changed || lists.changed;
  if (!changed) return noOp(parts, 'already-ok');
  const style = ensureCaptionStyle(parts.stylesXml);
  return { parts: { ...parts, documentXml, stylesXml: style.xml }, applied: true, beforeLabel: 'postojeći natpisi ili sidra', afterLabel: 'Word natpisi, izvori i potvrđeni popisi', };
}
