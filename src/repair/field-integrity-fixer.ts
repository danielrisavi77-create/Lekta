import { buildTocFieldXml, documentHasTocField, withAddedAttribute } from './xml-patch.ts';
import { analyzeFieldIntegrity, fieldAnchorFingerprint, manualTocAnchorFingerprint, paragraphAnchorFingerprint, type FieldIntegrity } from '../analysis/field-integrity.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

type ManualTocOperation = NonNullable<FieldIntegrityParams['manualToc']>[number];

export interface FieldIntegrityParams {
  version: 1;
  fields: Array<{
    id: string;
    part: string;
    anchorFingerprint: string;
    action: 'mark-dirty' | 'remove-orphan-control';
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
  // RE-47: samozatvarajuci tag (<w:fldChar .../>) mora dobiti atribut PRIJE kose crte, inace
  // nastane nevaljan XML koji obori vlastito brojanje odlomaka (vidi withAddedAttribute).
  const replacement = withAddedAttribute(opening, 'w:dirty="true"');
  return { xml: xml.slice(0, offset) + replacement + xml.slice(offset + opening.length), changed: true };
}

interface ParagraphRange {
  start: number;
  end: number;
}

interface BalancedFieldSpan {
  start: number;
  end: number;
  raw: string;
  paragraph: ParagraphRange;
}

function containingParagraphRange(xml: string, offset: number): ParagraphRange | null {
  const openParagraphs: number[] = [];
  for (const match of xml.matchAll(/<w:p(?=[\s/>])[^>]*>|<\/w:p>/gi)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (!match[0].startsWith('</')) {
      if (!/\/\s*>$/.test(match[0])) openParagraphs.push(index);
      continue;
    }
    const start = openParagraphs.pop();
    if (start === undefined) continue;
    const end = index + match[0].length;
    if (start < offset && offset < end) return { start, end };
  }
  return null;
}

function balancedOuterFieldSpan(xml: string, offset: number): BalancedFieldSpan | null {
  const paragraph = containingParagraphRange(xml, offset);
  if (!paragraph) return null;
  const paragraphXml = xml.slice(paragraph.start, paragraph.end);
  const controls = [...paragraphXml.matchAll(
    /<w:fldChar\b[^>]*\bw:fldCharType=["'](begin|separate|end)["'][^>]*\/?>(?:<\/w:fldChar>)?/gi,
  )];
  if ((paragraphXml.match(/<w:fldChar\b/gi) || []).length !== controls.length) return null;

  let depth = 0;
  let targetSeen = false;
  let targetEnd: number | undefined;
  for (const control of controls) {
    const relativeOffset = control.index ?? -1;
    if (relativeOffset < 0) return null;
    const absoluteOffset = paragraph.start + relativeOffset;
    const type = control[1].toLowerCase();
    if (type === 'begin') {
      if (absoluteOffset === offset) {
        if (targetSeen || depth !== 0) return null;
        targetSeen = true;
      }
      depth += 1;
      continue;
    }
    if (type === 'separate') {
      if (depth === 0) return null;
      continue;
    }
    if (depth === 0) return null;
    depth -= 1;
    if (targetSeen && targetEnd === undefined && depth === 0) {
      targetEnd = absoluteOffset + control[0].length;
    }
  }
  if (!targetSeen || targetEnd === undefined || depth !== 0) return null;
  return { start: offset, end: targetEnd, raw: xml.slice(offset, targetEnd), paragraph };
}

function containsOnlyHiddenFieldControl(raw: string): boolean {
  const residue = raw
    .replace(/<w:rPr\b[^>]*\/\s*>/gi, '')
    .replace(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/gi, '')
    .replace(/<w:instrText\b[^>]*\/\s*>/gi, '')
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gi, '')
    .replace(/<w:fldChar\b[^>]*>/gi, '')
    .replace(/<\/w:fldChar>/gi, '')
    .replace(/<\/?w:r(?=[\s/>])[^>]*>/gi, '');
  return residue.trim() === '';
}

function visibleParagraphText(xml: string): string {
  const withoutInstructions = xml
    .replace(/<w:instrText\b[^>]*\/\s*>/gi, '')
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gi, '');
  return [...withoutInstructions.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
    .map((match) => match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"))
    .join('');
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
    if (!field || field.confirmed !== true || !['mark-dirty', 'remove-orphan-control'].includes(field.action) || typeof field.id !== 'string' || typeof field.part !== 'string' || typeof field.anchorFingerprint !== 'string') return false;
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
  let removedOrphanControls = 0;
  let otherChanges = false;
  // RE-49: obradjuj od NAJVECEG offseta prema najmanjem. addDirty umece atribut i time produzi
  // XML, pa bi obrada uzlazno pomaknula offsete svih jos neobradjenih polja (koji su izracunati
  // nad IZVORNIM XML-om) i svako sljedece polje bi promasilo -> 'stale-anchor' za cijeli zahtjev.
  // Silazno je sigurno: izmjena je uvijek IZA jos neobradjenih polja. Isti obrazac koji
  // bibliography-repair-fixer vec koristi pri zamjeni raspona odlomaka.
  const offsetOf = (id: string) => Number(id.slice(id.lastIndexOf(':') + 1));
  const orderedFields = [...params.fields].sort((a, b) => offsetOf(b.id) - offsetOf(a.id));
  // RE-49: jedno neuskladivo polje ne smije oboriti ostalih 78. Semantika "zastarjelo sidro =
  // ne diraj dokument" OSTAJE, ali se sada primjenjuje na CIJELI zahtjev, a ne na prvo polje:
  // ako se NIJEDNO polje ne poklopi, dokument ostaje netaknut i vraca se izvorni razlog.
  // Djelomicna primjena je ovdje sigurna jer je jedina izmjena `w:dirty="true"` (uputa Wordu da
  // osvjezi polje); preskoceno polje se naprosto ne osvjezi, bez rizika za sadrzaj.
  let matchedFields = 0;
  let firstFailure: 'no-target' | 'stale-anchor' | 'unsupported-structure' | null = null;
  const noteFailure = (reason: 'no-target' | 'stale-anchor' | 'unsupported-structure') => {
    if (firstFailure === null) firstFailure = reason;
  };
  for (const target of orderedFields) {
    const field = byId.get(target.id);
    if (!field || field.part !== target.part || field.anchorFingerprint !== target.anchorFingerprint) { noteFailure('no-target'); continue; }
    const xml = working[field.part];
    if (xml == null) { noteFailure('unsupported-structure'); continue; }
    const offset = offsetOf(field.id);
    const raw = xml.slice(offset).match(/^(?:<w:fldSimple\b[\s\S]*?<\/w:fldSimple>|<w:fldChar\b[\s\S]*?<w:fldChar\b[^>]*w:fldCharType=["']end["'][^>]*\/?>(?:<\/w:fldChar>)?)/i)?.[0];
    if (!raw || fieldAnchorFingerprint(field.part, raw, offset) !== target.anchorFingerprint) { noteFailure('stale-anchor'); continue; }
    if (target.action === 'remove-orphan-control') {
      const span = balancedOuterFieldSpan(xml, offset);
      const isConservativeOrphan = field.kind === 'toc'
        && field.cachedResult === ''
        && span !== null
        && !/<w:fldChar\b[^>]*w:fldCharType=["']separate["']/i.test(span.raw)
        && containsOnlyHiddenFieldControl(span.raw)
        && /^\s*TOC\b[\s\S]*\bPAGEREF\b/i.test(field.instruction);
      if (!isConservativeOrphan) { noteFailure('unsupported-structure'); continue; }
      const paragraphBefore = xml.slice(span.paragraph.start, span.paragraph.end);
      const paragraphAfter = xml.slice(span.paragraph.start, span.start)
        + xml.slice(span.end, span.paragraph.end);
      if (visibleParagraphText(paragraphBefore) !== visibleParagraphText(paragraphAfter)) {
        noteFailure('unsupported-structure');
        continue;
      }
      matchedFields += 1;
      working[field.part] = xml.slice(0, span.start) + xml.slice(span.end);
      changed = true;
      removedOrphanControls += 1;
      continue;
    }
    matchedFields += 1;
    const result = addDirty(xml, offset, raw);
    if (result.changed) { working[field.part] = result.xml; changed = true; otherChanges = true; }
  }
  // Nijedno trazeno polje nije prepoznato: ponasaj se tocno kao prije (netaknut dokument).
  if (params.fields.length > 0 && matchedFields === 0 && firstFailure !== null) return NO_OP(parts, firstFailure);
  for (const toc of params.manualToc || []) {
    const result = replaceManualToc(working['word/document.xml'], toc);
    if (!result.changed) {
      if (documentHasTocField(working['word/document.xml'])) continue;
      return NO_OP(parts, 'stale-anchor');
    }
    working['word/document.xml'] = result.xml;
    changed = true;
    otherChanges = true;
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
    otherChanges = true;
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
      otherChanges = true;
    } else if (!/<w:updateFields\b[^>]*w:val=["']true["']/i.test(settings)) {
      working['word/settings.xml'] = settings.replace(/<w:updateFields\b[^>]*>/i, '<w:updateFields w:val="true"/>');
      changed = true;
      otherChanges = true;
    }
  }
  if (!changed) return NO_OP(parts, 'already-ok');
  const nextParts: DocxXmlParts = { ...parts, documentXml: working['word/document.xml'] || parts.documentXml, packageXmlParts: working };
  if (working['word/footnotes.xml'] !== undefined) nextParts.footnotesXml = working['word/footnotes.xml'];
  if (parts.footerHeaderParts) nextParts.footerHeaderParts = Object.fromEntries(Object.keys(parts.footerHeaderParts).map((name) => [name, working[name] ?? parts.footerHeaderParts?.[name] ?? '']));
  if (removedOrphanControls > 0 && !otherChanges) {
    const plural = removedOrphanControls > 1;
    return { parts: nextParts, applied: true, beforeLabel: plural ? 'Nevaljane skrivene kontrole Word polja' : 'Nevaljana skrivena kontrola Word polja', afterLabel: plural ? 'Nevaljane skrivene kontrole uklonjene' : 'Nevaljana skrivena kontrola uklonjena' };
  }

  return { parts: nextParts, applied: true, beforeLabel: 'Wordova polja i spremljeni rezultati', afterLabel: 'Polja označena za osvježavanje pri otvaranju' };
}
