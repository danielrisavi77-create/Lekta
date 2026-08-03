import { legalFootnoteAnchorFingerprint, legalMarkerAnchorFingerprint, type LegalFootnoteOperationKind } from '../analysis/legal-footnote-structure.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface LegalFootnoteRepairParams {
  version: 1;
  profileFingerprint?: string;
  markers: Array<{
    paragraphIndex: number;
    start: number;
    end: number;
    footnoteId: number;
    anchorFingerprint: string;
    confirmed: true;
  }>;
  operations: Array<{
    id: string;
    footnoteId: number;
    kind: LegalFootnoteOperationKind;
    anchorFingerprint: string;
    start?: number;
    end?: number;
    replacementText?: string;
    paragraphIndex?: number;
    markerPosition?: 'before-punctuation' | 'after-punctuation';
    confirmed: true;
    reason: string;
  }>;
  bibliographyLinks: Array<{
    footnoteId: number;
    bibliographyEntryId: string;
    confirmed: true;
  }>;
}

interface Range { start: number; end: number; index: number }
interface TextNode { start: number; end: number; xmlStart: number; xmlEnd: number; attrs: string; text: string }
interface Operation { start: number; end: number; replacement: string; priority: number }

const noOp = (parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason });
const OPERATION_KINDS = new Set<LegalFootnoteOperationKind>([
  'move-marker', 'replace-text', 'fix-ibid', 'replace-op-cit', 'normalize-law', 'add-gazette', 'split-sources', 'link-bibliography', 'introduce-abbreviation',
]);

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function encodeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function paragraphRanges(xml: string): Range[] {
  const masked = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, (match) => ' '.repeat(match.length));
  const token = /<w:p(?=[\s/>])[^>]*\/?>(?:<\/w:p\s*>)?/g;
  const ranges: Range[] = [];
  let match: RegExpExecArray | null;
  while ((match = token.exec(masked))) {
    if (/\/\s*>$/.test(match[0])) ranges.push({ start: match.index, end: match.index + match[0].length, index: ranges.length + 1 });
    else {
      const close = masked.indexOf('</w:p', match.index + match[0].length);
      if (close >= 0) {
        const end = masked.indexOf('>', close);
        ranges.push({ start: match.index, end: end >= 0 ? end + 1 : xml.length, index: ranges.length + 1 });
        token.lastIndex = end >= 0 ? end + 1 : xml.length;
      }
    }
  }
  return ranges;
}

function paragraphText(block: string): string {
  return [...block.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => decodeXml(match[1])).join('');
}

function textNodes(block: string): TextNode[] {
  const nodes: TextNode[] = [];
  let offset = 0;
  for (const match of block.matchAll(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/gi)) {
    const text = decodeXml(match[2]);
    const xmlStart = match.index ?? 0;
    nodes.push({ start: offset, end: offset + text.length, xmlStart, xmlEnd: xmlStart + match[0].length, attrs: match[1], text });
    offset += text.length;
  }
  return nodes;
}

function unsupported(block: string): boolean {
  return /<w:(?:fldSimple|fldChar|instrText|sdt|ins|del|moveFrom|moveTo|drawing|pict|object|bookmarkStart|bookmarkEnd|commentRangeStart|commentRangeEnd)\b|<w:hyperlink\b|<w:(?:tab|br|cr)\b|<w:tbl\b|<w:txbxContent\b/i.test(block);
}

function replaceTextRange(block: string, start: number, end: number, replacement: string): string | null {
  if (start < 0 || end <= start || unsupported(block)) return null;
  const nodes = textNodes(block);
  if (!nodes.length || end > nodes.at(-1)!.end) return null;
  const first = nodes.findIndex((node) => start >= node.start && start <= node.end);
  const last = nodes.findIndex((node) => end >= node.start && end <= node.end);
  if (first < 0 || last < first) return null;
  const values = new Map<number, string>();
  for (let index = first; index <= last; index++) {
    const node = nodes[index];
    const localStart = index === first ? start - node.start : 0;
    const localEnd = index === last ? end - node.start : node.text.length;
    values.set(index, index === first ? `${node.text.slice(0, localStart)}${replacement}${node.text.slice(localEnd)}` : node.text.slice(localEnd));
  }
  let result = block;
  for (let index = last; index >= first; index--) {
    const node = nodes[index];
    result = result.slice(0, node.xmlStart) + `<w:t${node.attrs}>${encodeXml(values.get(index) || '')}</w:t>` + result.slice(node.xmlEnd);
  }
  return result;
}

function footnoteBlock(xml: string, id: number): { start: number; end: number; block: string } | null {
  if (id <= 0) return null;
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`<w:footnote\\b[^>]*\\bw:id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/w:footnote\\s*>`, 'i');
  const match = expression.exec(xml);
  return match ? { start: match.index, end: match.index + match[0].length, block: match[0] } : null;
}

function footnoteHasReference(block: string, id: number): boolean {
  return new RegExp(`<w:footnoteReference\\b[^>]*\\bw:id=["']${id}["']`, 'i').test(block);
}

function footnoteReferenceRun(id: number): string {
  return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

function replaceManualMarkerRun(block: string, marker: { start: number; end: number; footnoteId: number }): string | null {
  const text = paragraphText(block);
  const leading = text.length - text.trimStart().length;
  const start = marker.start + leading;
  const end = marker.end + leading;
  let offset = 0;
  for (const match of block.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r\s*>/gi)) {
    const run = match[0];
    const runText = paragraphText(run);
    if (offset === start && offset + runText.length === end && /^\d{1,3}$/.test(runText.trim())) {
      const before = block.slice(0, match.index);
      const after = block.slice((match.index ?? 0) + run.length);
      return `${before}${footnoteReferenceRun(marker.footnoteId)}${after}`;
    }
    offset += runText.length;
  }
  return null;
}

function moveMarker(block: string, footnoteId: number, position: 'before-punctuation' | 'after-punctuation'): string | null {
  const runs = [...block.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r\s*>/gi)].map((match) => ({ xml: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  const referenceIndex = runs.findIndex((run) => new RegExp(`<w:footnoteReference\\b[^>]*\\bw:id=["']${footnoteId}["']`, 'i').test(run.xml));
  if (referenceIndex < 0) return null;
  const punctuation = /[.,;:!?)]/;
  if (position === 'before-punctuation') {
    const next = runs[referenceIndex + 1];
    if (next && punctuation.test(paragraphText(next.xml).charAt(0))) return block;
    const previous = runs[referenceIndex - 1];
    if (!previous || !punctuation.test(paragraphText(previous.xml).slice(-1)) || (previous.xml.match(/<w:t\b/gi) || []).length !== 1) return null;
    const textMatch = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t\s*>)/i.exec(previous.xml);
    if (!textMatch) return null;
    const text = decodeXml(textMatch[2]);
    if (text.length < 2) return null;
    const left = `${textMatch[1]}${encodeXml(text.slice(0, -1))}${textMatch[3]}`;
    const right = `${textMatch[1]}${encodeXml(text.slice(-1))}${textMatch[3]}`;
    return block.slice(0, previous.start) + previous.xml.replace(textMatch[0], left) + footnoteReferenceRun(footnoteId) + previous.xml.replace(textMatch[0], right) + block.slice(previous.end);
  }
  const previous = runs[referenceIndex - 1];
  if (previous && punctuation.test(paragraphText(previous.xml).slice(-1))) return block;
  const next = runs[referenceIndex + 1];
  if (!next || !punctuation.test(paragraphText(next.xml).charAt(0)) || (next.xml.match(/<w:t\b/gi) || []).length !== 1) return null;
  const textMatch = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t\s*>)/i.exec(next.xml);
  if (!textMatch) return null;
  const text = decodeXml(textMatch[2]);
  if (text.length < 2) return null;
  const punctuationRun = `${textMatch[1]}${encodeXml(text.slice(0, 1))}${textMatch[3]}`;
  const remainderRun = `${textMatch[1]}${encodeXml(text.slice(1))}${textMatch[3]}`;
  return block.slice(0, next.start) + punctuationRun + footnoteReferenceRun(footnoteId) + remainderRun + block.slice(next.end);
}

function validate(params: LegalFootnoteRepairParams): boolean {
  if (params.version !== 1 || !Array.isArray(params.markers) || !Array.isArray(params.operations) || !Array.isArray(params.bibliographyLinks)) return false;
  if (params.markers.length > 500 || params.operations.length > 1000 || params.bibliographyLinks.length > 1000) return false;
  const markerKeys = new Set<string>();
  for (const marker of params.markers) {
    if (marker.confirmed !== true || !Number.isInteger(marker.paragraphIndex) || marker.paragraphIndex < 1 || !Number.isInteger(marker.start) || !Number.isInteger(marker.end) || marker.start < 0 || marker.end <= marker.start || marker.end - marker.start > 20 || !Number.isInteger(marker.footnoteId) || marker.footnoteId <= 0 || marker.anchorFingerprint.length > 120 || markerKeys.has(`${marker.paragraphIndex}:${marker.start}:${marker.end}`)) return false;
    markerKeys.add(`${marker.paragraphIndex}:${marker.start}:${marker.end}`);
  }
  const operationIds = new Set<string>();
  for (const operation of params.operations) {
    if (operation.confirmed !== true || !operation.id.trim() || operationIds.has(operation.id) || !Number.isInteger(operation.footnoteId) || operation.footnoteId <= 0 || !OPERATION_KINDS.has(operation.kind) || operation.anchorFingerprint.length > 120 || operation.reason.length > 500) return false;
    if (operation.start !== undefined && (!Number.isInteger(operation.start) || operation.start < 0)) return false;
    if (operation.end !== undefined && (!Number.isInteger(operation.end) || (operation.kind === 'move-marker' ? operation.end < (operation.start ?? 0) : operation.end <= (operation.start ?? 0)) || operation.end - (operation.start ?? 0) > 20_000)) return false;
    if (operation.replacementText !== undefined && operation.replacementText.length > 20_000) return false;
    if (operation.kind === 'move-marker' && (!Number.isInteger(operation.paragraphIndex) || (operation.paragraphIndex ?? 0) < 1 || !operation.markerPosition)) return false;
    if (['replace-text', 'fix-ibid', 'replace-op-cit', 'normalize-law', 'add-gazette', 'split-sources', 'introduce-abbreviation'].includes(operation.kind) && typeof operation.replacementText !== 'string') return false;
    operationIds.add(operation.id);
  }
  const links = new Set<string>();
  for (const link of params.bibliographyLinks) {
    if (link.confirmed !== true || !Number.isInteger(link.footnoteId) || link.footnoteId <= 0 || !link.bibliographyEntryId.trim() || links.has(`${link.footnoteId}:${link.bibliographyEntryId}`)) return false;
    links.add(`${link.footnoteId}:${link.bibliographyEntryId}`);
  }
  return true;
}

export function legalFootnoteRepairFixer(parts: DocxXmlParts, params: LegalFootnoteRepairParams): FixerOutput {
  if (!validate(params) || !parts.footnotesXml) return noOp(parts, !validate(params) ? 'invalid-params' : 'unsupported-structure');
  const bodyRanges = paragraphRanges(parts.documentXml);
  const bodyBlocks = new Map(bodyRanges.map((range) => [range.index, parts.documentXml.slice(range.start, range.end)]));
  const footnoteBlocks = new Map<number, { start: number; end: number; block: string }>();
  for (const operation of params.operations) {
    const found = footnoteBlock(parts.footnotesXml, operation.footnoteId);
    if (!found) return noOp(parts, 'no-target');
    footnoteBlocks.set(operation.footnoteId, found);
  }
  for (const link of params.bibliographyLinks) {
    const found = footnoteBlock(parts.footnotesXml, link.footnoteId);
    if (!found || unsupported(found.block)) return noOp(parts, found ? 'unsupported-structure' : 'no-target');
  }
  const markerBlocks = params.markers.map((marker) => ({ marker, range: bodyRanges[marker.paragraphIndex - 1], block: bodyBlocks.get(marker.paragraphIndex) }));
  const operations: Operation[] = [];
  const bodyChanges = new Map<number, { range: Range; block: string }>();
  const footnoteOperations = new Map<number, typeof params.operations>();
  for (const operation of params.operations) {
    const list = footnoteOperations.get(operation.footnoteId) || [];
    list.push(operation);
    footnoteOperations.set(operation.footnoteId, list);
  }
  const footnoteChanges: Array<{ start: number; end: number; replacement: string }> = [];
  let alreadyApplied = 0;

  for (const [footnoteId, noteOperations] of footnoteOperations) {
    const found = footnoteBlocks.get(footnoteId)!;
    if (unsupported(found.block) || (found.block.match(/<w:p\b/gi) || []).length !== 1) return noOp(parts, 'unsupported-structure');
    const current = paragraphText(found.block);
    const textOperations = noteOperations.filter((operation) => operation.kind !== 'link-bibliography' && operation.kind !== 'move-marker');
    if (!textOperations.length) continue;
    if (textOperations.some((operation) => legalFootnoteAnchorFingerprint(footnoteId, current) !== operation.anchorFingerprint)) {
      const allAlreadyApplied = textOperations.every((operation) => operation.replacementText !== undefined && current === operation.replacementText);
      if (allAlreadyApplied) { alreadyApplied += textOperations.length; continue; }
      return noOp(parts, 'invalid-params');
    }
    let replacement = found.block;
    for (const operation of [...textOperations].sort((a, b) => (b.start ?? 0) - (a.start ?? 0))) {
      const currentText = paragraphText(replacement);
      const start = operation.start ?? 0;
      const end = operation.end ?? currentText.length;
      const next = replaceTextRange(replacement, start, end, operation.replacementText || '');
      if (next === null) return noOp(parts, 'unsupported-structure');
      replacement = next;
    }
    if (replacement !== found.block) footnoteChanges.push({ start: found.start, end: found.end, replacement });
  }

  for (const { marker, range, block } of markerBlocks) {
    if (!range || !block || unsupported(block)) return noOp(parts, 'unsupported-structure');
    if (new RegExp(`<w:footnoteReference\\b[^>]*\\bw:id=["']${marker.footnoteId}["']`, 'i').test(block)) { alreadyApplied += 1; continue; }
    const text = paragraphText(block);
    if (legalMarkerAnchorFingerprint(marker.paragraphIndex, marker.start, marker.end, text) !== marker.anchorFingerprint) return noOp(parts, 'invalid-params');
    const replacement = replaceManualMarkerRun(block, marker);
    if (replacement === null) return noOp(parts, 'unsupported-structure');
    bodyChanges.set(marker.paragraphIndex, { range, block: replacement });
  }

  for (const operation of params.operations.filter((candidate) => candidate.kind === 'move-marker')) {
    const paragraphIndex = operation.paragraphIndex;
    if (!paragraphIndex || !operation.markerPosition) return noOp(parts, 'invalid-params');
    const range = bodyRanges[paragraphIndex - 1];
    const existing = bodyChanges.get(paragraphIndex);
    const block = existing?.block || (range ? parts.documentXml.slice(range.start, range.end) : null);
    if (!range || !block || unsupported(block)) return noOp(parts, 'unsupported-structure');
    const text = paragraphText(block);
    if (legalMarkerAnchorFingerprint(paragraphIndex, operation.start ?? 0, operation.start ?? 0, text) !== operation.anchorFingerprint) return noOp(parts, 'invalid-params');
    const moved = moveMarker(block, operation.footnoteId, operation.markerPosition);
    if (moved === null) return noOp(parts, 'unsupported-structure');
    bodyChanges.set(paragraphIndex, { range, block: moved });
    if (moved === block) alreadyApplied += 1;
  }

  for (const change of bodyChanges.values()) {
    if (change.block !== parts.documentXml.slice(change.range.start, change.range.end)) {
      operations.push({ start: change.range.start, end: change.range.end, replacement: change.block, priority: 2 });
    }
  }

  for (const change of footnoteChanges) operations.push({ ...change, priority: 1 });
  if (!operations.length) return noOp(parts, alreadyApplied || params.operations.length || params.bibliographyLinks.length ? 'already-ok' : 'no-target');
  let documentXml = parts.documentXml;
  let footnotesXml = parts.footnotesXml;
  const documentOperations = operations.filter((operation) => operation.start < documentXml.length && operation.end <= documentXml.length && operation.priority === 2).sort((a, b) => b.start - a.start);
  for (const operation of documentOperations) documentXml = documentXml.slice(0, operation.start) + operation.replacement + documentXml.slice(operation.end);
  for (const change of footnoteChanges.sort((a, b) => b.start - a.start)) footnotesXml = footnotesXml.slice(0, change.start) + change.replacement + footnotesXml.slice(change.end);
  if (documentXml === parts.documentXml && footnotesXml === parts.footnotesXml) return noOp(parts, 'already-ok');
  return { parts: { ...parts, documentXml, footnotesXml }, applied: true, beforeLabel: 'potvrđene pravne fusnote', afterLabel: 'pravne fusnote popravljene' };
}
