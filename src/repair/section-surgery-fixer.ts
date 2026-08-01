import { sectionAnchorFingerprint } from '../analysis/section-structure';
import type { DocxXmlParts, FixerOutput } from './fixers';

export type SectionSurgeryOperationKind =
  | 'set-geometry'
  | 'set-numbering'
  | 'set-title-page'
  | 'set-odd-even'
  | 'unlink-header'
  | 'unlink-footer'
  | 'insert-section';

export interface SectionSurgeryOperation {
  id: string;
  kind: SectionSurgeryOperationKind;
  sectionOrdinal: number;
  anchorFingerprint: string;
  confirmed: true;
  orientation?: 'portrait' | 'landscape';
  pageWidthTwips?: number;
  pageHeightTwips?: number;
  marginsTwips?: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>;
  numbering?: { format: 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter'; start?: number };
  enabled?: boolean;
  headerType?: 'default' | 'first' | 'even';
  footerType?: 'default' | 'first' | 'even';
  insertAfterBodyChildIndex?: number;
}

export interface SectionSurgeryParams {
  version: 1;
  profileFingerprint?: string;
  operations: SectionSurgeryOperation[];
}

interface SectionLocation {
  ordinal: number;
  anchorFingerprint: string;
  sectionStart: number;
  sectionEnd: number;
  sectionXml: string;
  bodyChildIndex: number;
  paragraphText: string;
}

const NO_OP = (parts: DocxXmlParts, reason: 'already-ok' | 'no-target' | 'invalid-params' | 'unsupported-structure'): FixerOutput => ({
  parts, applied: false, beforeLabel: '', afterLabel: '', reason,
});

function localTagName(token: string): string {
  return (token.match(/^<\/?([\w:.-]+)/)?.[1] ?? '').split(':').pop() ?? '';
}

function isClosing(token: string): boolean { return /^<\//.test(token); }
function isSelfClosing(token: string): boolean { return /\/\s*>$/.test(token); }

function matchingTag(xml: string, start: number): number {
  const first = xml.slice(start).match(/^<([\w:.-]+)\b[^>]*>/);
  if (!first || isSelfClosing(first[0])) return start + (first?.[0].length ?? 0);
  const name = first[1].split(':').pop() ?? first[1];
  const tokenRe = /<\/?[\w:.-]+\b[^>]*>/g;
  tokenRe.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(xml))) {
    const token = match[0];
    if (localTagName(token) !== name) continue;
    if (isClosing(token)) depth -= 1;
    else if (!isSelfClosing(token)) depth += 1;
    if (depth === 0) return tokenRe.lastIndex;
  }
  return -1;
}

function directBodyChildren(xml: string): Array<{ name: string; start: number; end: number; xml: string }> {
  const bodyStart = xml.search(/<w:body\b[^>]*>/i);
  const bodyEnd = bodyStart < 0 ? -1 : xml.indexOf('</w:body>', bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) return [];
  const openEnd = xml.indexOf('>', bodyStart) + 1;
  const tokenRe = /<w:[\w.-]+\b[^>]*>/gi;
  tokenRe.lastIndex = openEnd;
  const result: Array<{ name: string; start: number; end: number; xml: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(xml)) && match.index < bodyEnd) {
    const start = match.index;
    const token = match[0];
    const name = localTagName(token);
    if (!['p', 'tbl', 'sectPr'].includes(name)) continue;
    const end = matchingTag(xml, start);
    if (end < 0 || end > bodyEnd) return [];
    result.push({ name, start, end, xml: xml.slice(start, end) });
    tokenRe.lastIndex = end;
  }
  return result;
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => match[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '');
}

function sectionLocations(documentXml: string): SectionLocation[] {
  const children = directBodyChildren(documentXml);
  const result: SectionLocation[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.name === 'p') {
      const match = child.xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/i);
      if (!match || match.index === undefined) continue;
      const sectionStart = child.start + match.index;
      result.push({ ordinal: result.length, anchorFingerprint: sectionAnchorFingerprint(paragraphText(child.xml), index), sectionStart, sectionEnd: sectionStart + match[0].length, sectionXml: match[0], bodyChildIndex: index, paragraphText: paragraphText(child.xml) });
    } else if (child.name === 'sectPr') {
      result.push({ ordinal: result.length, anchorFingerprint: sectionAnchorFingerprint('', index), sectionStart: child.start, sectionEnd: child.end, sectionXml: child.xml, bodyChildIndex: index, paragraphText: '' });
    }
  }
  return result;
}

function attrValue(xml: string, name: string): string | undefined {
  return xml.match(new RegExp(`\\b${name.replace(':', '\\:')}="([^"]*)"`, 'i'))?.[1];
}

function patchChild(xml: string, name: string, attributes: string, enabled = true): string {
  const pattern = new RegExp(`<w:${name}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/w:${name}>)`, 'i');
  if (!enabled) return xml.replace(pattern, '');
  const replacement = `<w:${name}${attributes ? ` ${attributes}` : ''}/>`;
  if (pattern.test(xml)) return xml.replace(pattern, replacement);
  if (/<w:sectPr\b[^>]*\/>/i.test(xml)) return xml.replace(/<w:sectPr\b[^>]*\/>/i, `<w:sectPr>${replacement}</w:sectPr>`);
  return xml.replace(/<\/w:sectPr>|\/>$/i, (close) => replacement + close);
}

function setAttr(attributes: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name.replace(':', '\\:')}="[^"]*"`, 'i');
  return pattern.test(attributes) ? attributes.replace(pattern, `${name}="${value}"`) : `${attributes} ${name}="${value}"`;
}

function patchGeometry(sectionXml: string, operation: SectionSurgeryOperation): string {
  let next = sectionXml;
  const currentSize = next.match(/<w:pgSz\b([^>]*)\/>/i)?.[1] ?? '';
  let width = operation.pageWidthTwips ?? Number(attrValue(currentSize, 'w:w'));
  let height = operation.pageHeightTwips ?? Number(attrValue(currentSize, 'w:h'));
  if (operation.orientation === 'landscape' && width && height && width < height) [width, height] = [height, width];
  if (operation.orientation === 'portrait' && width && height && width > height) [width, height] = [height, width];
  let sizeAttrs = currentSize;
  if (Number.isFinite(width) && width > 0) sizeAttrs = setAttr(sizeAttrs, 'w:w', String(Math.round(width)));
  if (Number.isFinite(height) && height > 0) sizeAttrs = setAttr(sizeAttrs, 'w:h', String(Math.round(height)));
  if (operation.orientation) sizeAttrs = setAttr(sizeAttrs, 'w:orient', operation.orientation);
  if (sizeAttrs || /<w:pgSz\b/i.test(next)) next = patchChild(next, 'pgSz', sizeAttrs.trim());
  let marginAttrs = next.match(/<w:pgMar\b([^>]*)\/>/i)?.[1] ?? '';
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    const value = operation.marginsTwips?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000) marginAttrs = setAttr(marginAttrs, `w:${key}`, String(Math.round(value)));
  }
  if (marginAttrs || /<w:pgMar\b/i.test(next)) next = patchChild(next, 'pgMar', marginAttrs.trim());
  return next;
}

function patchNumbering(sectionXml: string, operation: SectionSurgeryOperation): string {
  if (!operation.numbering) return sectionXml;
  let attributes = sectionXml.match(/<w:pgNumType\b([^>]*)\/>/i)?.[1] ?? '';
  attributes = setAttr(attributes, 'w:fmt', operation.numbering.format);
  if (operation.numbering.start !== undefined) attributes = setAttr(attributes, 'w:start', String(operation.numbering.start));
  return patchChild(sectionXml, 'pgNumType', attributes.trim());
}

function patchSectionXml(sectionXml: string, operation: SectionSurgeryOperation): string {
  let next = sectionXml;
  if (operation.kind === 'set-geometry') next = patchGeometry(next, operation);
  if (operation.kind === 'set-numbering') next = patchNumbering(next, operation);
  if (operation.kind === 'set-title-page') next = patchChild(next, 'titlePg', '', operation.enabled !== false);
  return next;
}

function maxRelationshipId(xml: string): number {
  return Math.max(0, ...[...xml.matchAll(/\bId="rId(\d+)"/gi)].map((match) => Number(match[1])));
}

function nextPartName(parts: DocxXmlParts, kind: 'header' | 'footer'): string {
  const names = new Set([...(parts.existingParts ?? []), ...Object.keys(parts.packageXmlParts ?? {}), ...(parts.addedParts ?? []).map((part) => part.name)]);
  let number = 1;
  while (names.has(`word/${kind}${number}.xml`)) number += 1;
  return `word/${kind}${number}.xml`;
}

function cloneLinkedPart(parts: DocxXmlParts, sectionXml: string, operation: SectionSurgeryOperation, inheritedSectionXml?: string): { sectionXml: string; parts: DocxXmlParts; changed: boolean } | null {
  const kind = operation.kind === 'unlink-header' ? 'header' : 'footer';
  const type = operation.headerType ?? operation.footerType ?? 'default';
  const referencePattern = new RegExp(`<w:${kind}Reference\\b[^>]*\\bw:type="${type}"[^>]*\\br:id="([^"]+)"[^>]*/?>`, 'i');
  const currentRef = referencePattern.exec(sectionXml);
  const ref = currentRef ?? (inheritedSectionXml ? referencePattern.exec(inheritedSectionXml) : null);
  if (!ref) return { sectionXml, parts, changed: false };
  const oldId = ref[1];
  const rels = parts.documentRelsXml ?? parts.packageXmlParts?.['word/_rels/document.xml.rels'] ?? '';
  const relationTag = (rels.match(/<Relationship[^>]*(?:\/>|>)/gi) ?? []).find((tag) => new RegExp(`Id="${oldId}"`, 'i').test(tag));
  if (!relationTag) return null;
  const oldTarget = attrValue(relationTag, 'Target');
  const relationType = attrValue(relationTag, 'Type');
  if (!oldTarget || !relationType) return null;
  const oldName = oldTarget.replace(/^\.\//, '').startsWith('word/') ? oldTarget.replace(/^\.\//, '') : `word/${oldTarget.replace(/^\.\//, '')}`;
  const content = parts.packageXmlParts?.[oldName] ?? parts.footerHeaderParts?.[oldName];
  if (!content) return null;
  const newName = nextPartName(parts, kind);
  const newId = `rId${maxRelationshipId(rels) + 1}`;
  const target = newName.slice('word/'.length);
  const close = rels.lastIndexOf('</Relationships>');
  if (close < 0) return null;
  const newRels = `${rels.slice(0, close)}<Relationship Id="${newId}" Type="${relationType}" Target="${target}"/>${rels.slice(close)}`;
  const contentTypes = parts.contentTypesXml ?? parts.packageXmlParts?.['[Content_Types].xml'] ?? '';
  const contentType = kind === 'header' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
  const typeTag = `<Override PartName="/${newName}" ContentType="${contentType}"/>`;
  const newContentTypes = /PartName="\/${newName}"/i.test(contentTypes) ? contentTypes : contentTypes.replace('</Types>', `${typeTag}</Types>`);
  const reference = ref[0].replace(new RegExp(`r:id="${oldId}"`, 'i'), `r:id="${newId}"`);
  const updatedSection = currentRef
    ? sectionXml.replace(currentRef[0], reference)
    : sectionXml.replace(/(<w:sectPr\b[^>]*>)/i, `$1${reference}`);
  const updatedParts: DocxXmlParts = {
    ...parts,
    documentRelsXml: newRels,
    contentTypesXml: newContentTypes,
    addedParts: [...(parts.addedParts ?? []), { name: newName, content }],
    footerHeaderParts: { ...(parts.footerHeaderParts ?? {}), [newName]: content },
    packageXmlParts: { ...(parts.packageXmlParts ?? {}), [newName]: content, 'word/_rels/document.xml.rels': newRels, '[Content_Types].xml': newContentTypes },
  };
  return { sectionXml: updatedSection, parts: updatedParts, changed: true };
}

function insertSectionAfter(xml: string, bodyChildIndex: number, anchorFingerprint: string, operation: SectionSurgeryOperation): string | null {
  const children = directBodyChildren(xml);
  const anchor = children[bodyChildIndex];
  if (!anchor || anchor.name !== 'p' || sectionAnchorFingerprint(paragraphText(anchor.xml), bodyChildIndex) !== anchorFingerprint) return null;
  if (/<w:sectPr\b/i.test(anchor.xml)) return null;
  const width = operation.pageWidthTwips ?? 11906;
  const height = operation.pageHeightTwips ?? 16838;
  const orientation = operation.orientation ? ` w:orient="${operation.orientation}"` : '';
  const number = operation.numbering ? `<w:pgNumType w:fmt="${operation.numbering.format}"${operation.numbering.start ? ` w:start="${operation.numbering.start}"` : ''}/>` : '';
  const sectPr = `<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${orientation}/>${number}</w:sectPr>`;
  const pPr = anchor.xml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/i);
  const paragraph = pPr
    ? anchor.xml.replace(pPr[0], pPr[0].replace(/<\/w:pPr>/i, `${sectPr}</w:pPr>`))
    : anchor.xml.replace(/(<w:p\b[^>]*>)/i, `$1<w:pPr>${sectPr}</w:pPr>`);
  return xml.slice(0, anchor.start) + paragraph + xml.slice(anchor.end);
}

function updateSettings(parts: DocxXmlParts, enabled: boolean): DocxXmlParts {
  const name = 'word/settings.xml';
  const current = parts.packageXmlParts?.[name] ?? '';
  if (!current) return parts;
  const updated = enabled
    ? /<w:evenAndOddHeaders\b/i.test(current) ? current : current.replace('</w:settings>', '<w:evenAndOddHeaders/></w:settings>')
    : current.replace(/<w:evenAndOddHeaders\b[^>]*\/>/gi, '');
  return { ...parts, packageXmlParts: { ...(parts.packageXmlParts ?? {}), [name]: updated } };
}

export function sectionSurgeryFixer(parts: DocxXmlParts, params: SectionSurgeryParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.operations) || params.operations.length > 100) return NO_OP(parts, 'invalid-params');
  if (/<w:sectPrChange\b|<w:ins\b|<w:del\b|<w:txbxContent\b/i.test(parts.documentXml)) return NO_OP(parts, 'unsupported-structure');
  const operations = params.operations.filter((operation) => operation && operation.confirmed === true);
  if (operations.length !== params.operations.length || operations.some((operation) => !operation.id || !Number.isInteger(operation.sectionOrdinal) || operation.sectionOrdinal < 0 || operation.sectionOrdinal > 1000 || typeof operation.anchorFingerprint !== 'string')) return NO_OP(parts, 'invalid-params');
  let working = parts.documentXml;
  let workingParts: DocxXmlParts = { ...parts, addedParts: [...(parts.addedParts ?? [])] };
  let changed = false;
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(`${operation.sectionOrdinal}:${operation.kind}`)) return NO_OP(parts, 'invalid-params');
    seen.add(`${operation.sectionOrdinal}:${operation.kind}`);
    const location = sectionLocations(working)[operation.sectionOrdinal];
    if (!location) return NO_OP(parts, 'unsupported-structure');
    if (operation.kind === 'insert-section') {
      const insertionAnchor = directBodyChildren(working)[operation.insertAfterBodyChildIndex ?? -1];
      if (!insertionAnchor || insertionAnchor.name !== 'p' || sectionAnchorFingerprint(paragraphText(insertionAnchor.xml), operation.insertAfterBodyChildIndex ?? -1) !== operation.anchorFingerprint) return NO_OP(parts, 'unsupported-structure');
    } else if (location.anchorFingerprint !== operation.anchorFingerprint) return NO_OP(parts, 'unsupported-structure');
    if (operation.kind === 'set-odd-even') {
      const before = workingParts.packageXmlParts?.['word/settings.xml'] ?? '';
      workingParts = updateSettings(workingParts, operation.enabled !== false);
      changed ||= before !== (workingParts.packageXmlParts?.['word/settings.xml'] ?? '');
      continue;
    }
    if (operation.kind === 'insert-section') {
      const inserted = insertSectionAfter(working, operation.insertAfterBodyChildIndex ?? -1, operation.anchorFingerprint, operation);
      if (!inserted) return NO_OP(parts, 'unsupported-structure');
      working = inserted;
      changed = true;
      continue;
    }
    if (operation.kind === 'unlink-header' || operation.kind === 'unlink-footer') {
      const inherited = operation.sectionOrdinal > 0 ? sectionLocations(working)[operation.sectionOrdinal - 1]?.sectionXml : undefined;
      const clone = cloneLinkedPart(workingParts, location.sectionXml, operation, inherited);
      if (!clone) return NO_OP(parts, 'unsupported-structure');
      if (clone.changed) {
        working = working.slice(0, location.sectionStart) + clone.sectionXml + working.slice(location.sectionEnd);
        workingParts = clone.parts;
        changed = true;
      }
      continue;
    }
    const nextSection = patchSectionXml(location.sectionXml, operation);
    if (nextSection !== location.sectionXml) {
      working = working.slice(0, location.sectionStart) + nextSection + working.slice(location.sectionEnd);
      changed = true;
    }
  }
  if (!changed) return NO_OP(parts, 'already-ok');
  return {
    parts: { ...workingParts, documentXml: working },
    applied: true,
    beforeLabel: `${operations.length} operacija nad sekcijama nije primijenjeno`,
    afterLabel: `Primijenjeno ${operations.length} potvrđenih operacija nad Word sekcijama`,
  };
}
