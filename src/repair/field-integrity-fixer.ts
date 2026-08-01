import { buildTocFieldXml, documentHasTocField } from './xml-patch.ts';
import { analyzeFieldIntegrity, fieldAnchorFingerprint, manualTocAnchorFingerprint, paragraphAnchorFingerprint, type FieldIntegrity } from '../analysis/field-integrity';
import type { DocxXmlParts, FixerOutput } from './fixers';

type ManualTocOperation = NonNullable<FieldIntegrityParams['manualToc']>[number];

export interface FieldIntegrityParams {
  version: 1;
  fields: Array<{
    id: string;
    part: string;
    anchorFingerprint: string;
    action: 'mark-dirty';
    confirmed: true;
  }>;
  settings?: { updateFieldsOnOpen?: true };
  manualToc?: Array<{
    startParagraphIndex: number;
    endParagraphIndex: number;
    anchorFingerprint: string;
    action: 'replace-with-live-toc';
    confirmed: true;
  }>;
  bookmarks?: Array<{
    part: string;
    bookmarkName: string;
    targetFingerprint: string;
    action: 'repair-known-target';
    confirmed: true;
  }>;
}

const NO_OP = (parts: DocxXmlParts, reason: 'already-ok' | 'no-target' | 'invalid-params' | 'unsupported-structure' | 'stale-anchor'): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason });

function addDirty(xml: string, offset: number, raw: string): { xml: string; changed: boolean } {
  const openingEnd = raw.indexOf('>');
  if (openingEnd < 0) return { xml, changed: false };
  const opening = raw.slice(0, openingEnd + 1);
  if (/\bw:dirty\s*=\s*["'](?:true|1)["']/i.test(opening)) return { xml, changed: false };
  const replacement = opening.replace(/>$/, ' w:dirty="true">');
  return { xml: xml.slice(0, offset) + replacement + xml.slice(offset + opening.length), changed: true };
}

function bodyParagraphBlocks(xml: string): Array<{ start: number; end: number; raw: string }> {
  const blocks: Array<{ start: number; end: number; raw: string }> = [];
  const starts = [...xml.matchAll(/<w:p(?=[\s/>])/gi)].map((match) => match.index || 0);
  for (const start of starts) {
    const selfClosing = xml.slice(start).match(/^<w:p\b[^>]*\/>/i);
    if (selfClosing) {
      blocks.push({ start, end: start + selfClosing[0].length, raw: selfClosing[0] });
      continue;
    }
    const endMatch = /<\/w:p>/i.exec(xml.slice(start));
    if (!endMatch) continue;
    const end = start + endMatch.index + endMatch[0].length;
    const raw = xml.slice(start, end);
    const before = xml.slice(0, start);
    const openTables = (before.match(/<w:tbl(?:\s|>)/gi) || []).length;
    const closedTables = (before.match(/<\/w:tbl>/gi) || []).length;
    if (openTables === closedTables) blocks.push({ start, end, raw });
  }
  return blocks;
}

function textFromParagraph(xml: string): string {
  return xml.replace(/<w:tab\s*\/?>/gi, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function replaceManualToc(documentXml: string, operation: ManualTocOperation): { xml: string; changed: boolean } {
  const blocks = bodyParagraphBlocks(documentXml);
  const start = blocks[operation.startParagraphIndex];
  const end = blocks[operation.endParagraphIndex];
  if (!start || !end || operation.startParagraphIndex > operation.endParagraphIndex) return { xml: documentXml, changed: false };
  const rawText = blocks.slice(operation.startParagraphIndex, operation.endParagraphIndex + 1).map((block) => textFromParagraph(block.raw)).join('\n');
  if (manualTocAnchorFingerprint(operation.startParagraphIndex, operation.endParagraphIndex, rawText) !== operation.anchorFingerprint) return { xml: documentXml, changed: false };
  if (/\b(?:w:fldSimple|w:fldChar|w:sdt|w:ins|w:del)\b/i.test(blocks.slice(operation.startParagraphIndex, operation.endParagraphIndex + 1).map((block) => block.raw).join(''))) return { xml: documentXml, changed: false };
  return { xml: documentXml.slice(0, start.start) + buildTocFieldXml() + documentXml.slice(end.end), changed: true };
}

function validateParams(params: FieldIntegrityParams): boolean {
  if (params.version !== 1 || !Array.isArray(params.fields)) return false;
  if (params.fields.length > 2000 || (params.manualToc?.length || 0) > 20 || (params.bookmarks?.length || 0) > 100) return false;
  const fieldKeys = new Set<string>();
  for (const field of params.fields) {
    if (!field || field.confirmed !== true || field.action !== 'mark-dirty' || typeof field.id !== 'string' || typeof field.part !== 'string' || typeof field.anchorFingerprint !== 'string') return false;
    const key = `${field.part}:${field.id}`;
    if (fieldKeys.has(key) || field.id.length > 300 || field.part.length > 200 || field.anchorFingerprint.length > 120) return false;
    fieldKeys.add(key);
  }
  for (const toc of params.manualToc || []) if (!toc || toc.confirmed !== true || toc.action !== 'replace-with-live-toc' || !Number.isInteger(toc.startParagraphIndex) || !Number.isInteger(toc.endParagraphIndex) || toc.startParagraphIndex < 0 || toc.endParagraphIndex < toc.startParagraphIndex || toc.endParagraphIndex > 2_000_000 || typeof toc.anchorFingerprint !== 'string' || toc.anchorFingerprint.length > 120) return false;
  for (const bookmark of params.bookmarks || []) if (!bookmark || bookmark.confirmed !== true || bookmark.action !== 'repair-known-target' || typeof bookmark.part !== 'string' || typeof bookmark.bookmarkName !== 'string' || typeof bookmark.targetFingerprint !== 'string') return false;
  return true;
}

export function fieldIntegrityFixer(parts: DocxXmlParts, params: FieldIntegrityParams): FixerOutput {
  if (!validateParams(params)) return NO_OP(parts, 'invalid-params');
  const packageParts: Record<string, string> = { ...(parts.packageXmlParts || {}), 'word/document.xml': parts.documentXml, ...(parts.stylesXml ? { 'word/styles.xml': parts.stylesXml } : {}) };
  if (parts.footnotesXml !== undefined) packageParts['word/footnotes.xml'] = parts.footnotesXml;
  Object.assign(packageParts, parts.footerHeaderParts || {});
  const integrity: FieldIntegrity = analyzeFieldIntegrity({ parts: packageParts });
  const byId = new Map(integrity.fields.map((field) => [field.id, field]));
  const working = { ...packageParts };
  let changed = false;
  for (const target of params.fields) {
    const field = byId.get(target.id);
    if (!field || field.part !== target.part || field.anchorFingerprint !== target.anchorFingerprint) return NO_OP(parts, 'no-target');
    const xml = working[field.part];
    if (xml == null) return NO_OP(parts, 'unsupported-structure');
    const rawOffset = field.id.lastIndexOf(':');
    const offset = Number(field.id.slice(rawOffset + 1));
    const raw = xml.slice(offset).match(/^(?:<w:fldSimple\b[\s\S]*?<\/w:fldSimple>|<w:fldChar\b[\s\S]*?<w:fldChar\b[^>]*w:fldCharType=["']end["'][^>]*\/?>(?:<\/w:fldChar>)?)/i)?.[0];
    if (!raw || fieldAnchorFingerprint(field.part, raw, offset) !== target.anchorFingerprint) return NO_OP(parts, 'stale-anchor');
    const result = addDirty(xml, offset, raw);
    if (result.changed) { working[field.part] = result.xml; changed = true; }
  }
  for (const toc of params.manualToc || []) {
    const result = replaceManualToc(working['word/document.xml'], toc);
    if (!result.changed) {
      if (documentHasTocField(working['word/document.xml'])) continue;
      return NO_OP(parts, 'stale-anchor');
    }
    working['word/document.xml'] = result.xml;
    changed = true;
  }
  for (const bookmark of params.bookmarks || []) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(bookmark.part)) return NO_OP(parts, 'unsupported-structure');
    const xml = working[bookmark.part];
    const escapedName = bookmark.bookmarkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!xml || new RegExp(`<w:bookmarkStart\\b[^>]*\\bw:name=["']${escapedName}["']`, 'i').test(xml)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(bookmark.bookmarkName)) return NO_OP(parts, 'invalid-params');
    const blocks = bodyParagraphBlocks(xml);
    const target = blocks.find((block, index) => paragraphAnchorFingerprint(bookmark.part, block.raw, index) === bookmark.targetFingerprint);
    if (!target || /<w:(?:fldSimple|fldChar|ins|del|sdt|hyperlink)\b/i.test(target.raw)) return NO_OP(parts, 'no-target');
    const ids = [...xml.matchAll(/<w:bookmark(?:Start|End)\b[^>]*w:id=["'](\d+)["']/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
    const id = (ids.length ? Math.max(...ids) : 0) + 1;
    const openingEnd = target.raw.indexOf('>') + 1;
    if (openingEnd <= 0) return NO_OP(parts, 'unsupported-structure');
    const startTag = `<w:bookmarkStart w:id="${id}" w:name="${bookmark.bookmarkName}"/>`;
    const endTag = `<w:bookmarkEnd w:id="${id}"/>`;
    const replacement = target.raw.slice(0, openingEnd) + startTag + target.raw.slice(openingEnd, target.raw.length - 6) + endTag + '</w:p>';
    working[bookmark.part] = xml.slice(0, target.start) + replacement + xml.slice(target.end);
    changed = true;
  }
  if (params.settings?.updateFieldsOnOpen === true) {
    const settings = working['word/settings.xml'];
    if (!settings) return NO_OP(parts, 'no-target');
    if (!/<w:updateFields\b/i.test(settings)) {
      const close = settings.lastIndexOf('</w:settings>');
      if (close < 0) {
        if (!/<w:settings\b[^>]*\/>/i.test(settings)) return NO_OP(parts, 'unsupported-structure');
        working['word/settings.xml'] = settings.replace(/<w:settings\b([^>]*)\/>/i, '<w:settings$1><w:updateFields w:val="true"/></w:settings>');
      } else {
        working['word/settings.xml'] = `${settings.slice(0, close)}<w:updateFields w:val="true"/>${settings.slice(close)}`;
      }
      changed = true;
    } else if (!/<w:updateFields\b[^>]*w:val=["']true["']/i.test(settings)) {
      working['word/settings.xml'] = settings.replace(/<w:updateFields\b[^>]*>/i, '<w:updateFields w:val="true"/>');
      changed = true;
    }
  }
  if (!changed) return NO_OP(parts, 'already-ok');
  const nextParts: DocxXmlParts = { ...parts, documentXml: working['word/document.xml'] || parts.documentXml, packageXmlParts: working };
  if (working['word/footnotes.xml'] !== undefined) nextParts.footnotesXml = working['word/footnotes.xml'];
  if (parts.footerHeaderParts) nextParts.footerHeaderParts = Object.fromEntries(Object.keys(parts.footerHeaderParts).map((name) => [name, working[name] ?? parts.footerHeaderParts?.[name] ?? '']));
  return { parts: nextParts, applied: true, beforeLabel: 'Wordova polja i spremljeni rezultati', afterLabel: 'Polja označena za osvježavanje pri otvaranju' };
}
