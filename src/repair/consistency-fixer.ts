import { editableNodes, extractBodyParagraphs, paragraphFingerprint, xmlDecode, xmlEncode } from '../analysis/typography-structure.ts';
import type { ConsistencyZone } from '../analysis/consistency-structure.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface ConsistencyFixParams {
  version: 1;
  groups: Array<{ id: string; zone: ConsistencyZone; canonicalText: string; confirmed: true }>;
  replacements: Array<{
    id: string;
    groupId: string;
    part: string;
    paragraphIndex?: number;
    start?: number;
    end?: number;
    before: string;
    replacementText: string;
    anchorFingerprint: string;
    confirmed: true;
    metadataField?: 'dc:title' | 'dc:creator' | 'cp:lastModifiedBy' | 'cp:revision';
  }>;
}

const ZONES = new Set<ConsistencyZone>([
  'terminology', 'person', 'institution', 'citation', 'bibliography',
  'document-metadata', 'element-label', 'heading-language',
]);

const NO_OP = (parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason });

function protectedParagraph(xml: string): boolean {
  return /<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent|customXml)\b|<m:oMath\b/i.test(xml);
}

function replaceTextNode(xml: string, before: string, replacement: string, start: number, end: number): string | null {
  const nodes = editableNodes(xml);
  const matches = nodes.filter((node) => node.kind === 'text');
  let textOffset = 0;
  for (const node of matches) {
    const source = node.text ?? '';
    const nodeStart = textOffset;
    const nodeEnd = nodeStart + source.length;
    if (start >= nodeStart && end <= nodeEnd) {
      const localStart = start - nodeStart;
      const localEnd = end - nodeStart;
      if (source.slice(localStart, localEnd) !== before) return source.slice(localStart, localEnd) === replacement ? xml : null;
      const updated = source.slice(0, localStart) + replacement + source.slice(localEnd);
      const encoded = xmlEncode(updated);
      const oldText = node.xml;
      const newText = oldText.replace(/>([\s\S]*)<\/w:t>$/i, `>${encoded}</w:t>`);
      return xml.slice(0, node.start) + newText + xml.slice(node.end);
    }
    textOffset = nodeEnd;
  }
  return null;
}

function applyBodyReplacements(parts: DocxXmlParts, operations: ConsistencyFixParams['replacements']): FixerOutput {
  const paragraphs = extractBodyParagraphs(parts.documentXml);
  const byParagraph = new Map<number, ConsistencyFixParams['replacements']>();
  for (const operation of operations) {
    if (operation.part !== 'word/document.xml' || operation.paragraphIndex == null || operation.start == null || operation.end == null) return NO_OP(parts, 'unsupported-structure');
    const current = byParagraph.get(operation.paragraphIndex) ?? [];
    current.push(operation);
    byParagraph.set(operation.paragraphIndex, current);
  }
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const [paragraphIndex, paragraphOperations] of byParagraph) {
    const paragraph = paragraphs.find((item) => item.index === paragraphIndex);
    if (!paragraph) return NO_OP(parts, 'no-target');
    if (paragraphOperations.some((operation) => operation.anchorFingerprint !== paragraphFingerprint(paragraph.xml))) return NO_OP(parts, 'stale-anchor');
    if (protectedParagraph(paragraph.xml)) return NO_OP(parts, 'unsupported-structure');
    const sorted = [...paragraphOperations].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (let index = 1; index < sorted.length; index++) if ((sorted[index - 1].end ?? 0) > (sorted[index].start ?? 0)) return NO_OP(parts, 'invalid-params');
    let updated = paragraph.xml;
    for (const operation of [...sorted].reverse()) {
      const start = operation.start!;
      const end = operation.end!;
      const plainText = editableNodes(updated).filter((node) => node.kind === 'text').map((node) => node.text ?? '').join('');
      const current = plainText.slice(start, end);
      if (current === operation.replacementText && current !== operation.before) continue;
      if (current !== operation.before) return NO_OP(parts, 'stale-anchor');
      const next = replaceTextNode(updated, operation.before, operation.replacementText, start, end);
      if (next == null) return NO_OP(parts, 'unsupported-structure');
      updated = next;
    }
    if (updated !== paragraph.xml) replacements.push({ start: paragraph.start, end: paragraph.end, value: updated });
  }
  let documentXml = parts.documentXml;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) documentXml = documentXml.slice(0, replacement.start) + replacement.value + documentXml.slice(replacement.end);
  return { parts: { ...parts, documentXml }, applied: documentXml !== parts.documentXml, beforeLabel: `${operations.length} potvrđenih zamjena`, afterLabel: 'Usklađene potvrđene varijante' };
}

function applyMetadataReplacement(parts: DocxXmlParts, operation: ConsistencyFixParams['replacements'][number]): FixerOutput {
  if (operation.part !== 'docProps/core.xml' || !operation.metadataField) return NO_OP(parts, 'unsupported-structure');
  const source = parts.packageXmlParts?.[operation.part];
  if (source == null) return NO_OP(parts, 'no-target');
  const tag = operation.metadataField;
  const pattern = tag === 'dc:title' ? /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i : tag === 'dc:creator' ? /<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i : tag === 'cp:lastModifiedBy' ? /<cp:lastModifiedBy\b[^>]*>([\s\S]*?)<\/cp:lastModifiedBy>/i : /<cp:revision\b[^>]*>([\s\S]*?)<\/cp:revision>/i;
  const match = source.match(pattern);
  if (!match) return NO_OP(parts, 'no-target');
  const current = xmlDecode(match[1]);
  if (current === operation.replacementText) return NO_OP(parts, 'already-ok');
  if (current !== operation.before || operation.anchorFingerprint.length === 0 || paragraphFingerprint(source) !== operation.anchorFingerprint) return NO_OP(parts, 'stale-anchor');
  const updated = source.slice(0, match.index! + match[0].indexOf(match[1])) + xmlEncode(operation.replacementText) + source.slice(match.index! + match[0].indexOf(match[1]) + match[1].length);
  return { parts: { ...parts, packageXmlParts: { ...(parts.packageXmlParts ?? {}), [operation.part]: updated } }, applied: true, beforeLabel: `Metadata ${tag}`, afterLabel: 'Usklađen potvrđeni dokumentni podatak' };
}

export function consistencyFixer(parts: DocxXmlParts, params: ConsistencyFixParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.groups) || !Array.isArray(params.replacements)) return NO_OP(parts, 'invalid-params');
  const groupIds = new Set<string>();
  for (const group of params.groups) {
    if (!group || group.confirmed !== true || typeof group.id !== 'string' || groupIds.has(group.id) || !ZONES.has(group.zone) || typeof group.canonicalText !== 'string' || group.canonicalText.length === 0 || group.canonicalText.length > 500) return NO_OP(parts, 'invalid-params');
    groupIds.add(group.id);
  }
  const seen = new Set<string>();
  for (const operation of params.replacements) {
    if (!operation || operation.confirmed !== true || typeof operation.id !== 'string' || seen.has(operation.id) || !groupIds.has(operation.groupId) || typeof operation.part !== 'string' || typeof operation.before !== 'string' || typeof operation.replacementText !== 'string' || typeof operation.anchorFingerprint !== 'string' || operation.before.length > 500 || operation.replacementText.length > 500) return NO_OP(parts, 'invalid-params');
    seen.add(operation.id);
    if (operation.part === 'word/document.xml' && (!Number.isInteger(operation.paragraphIndex) || !Number.isInteger(operation.start) || !Number.isInteger(operation.end) || operation.start! < 0 || operation.end! < operation.start!)) return NO_OP(parts, 'invalid-params');
    if (operation.part !== 'word/document.xml' && operation.part !== 'docProps/core.xml') return NO_OP(parts, 'unsupported-structure');
    if (operation.part === 'docProps/core.xml' && !operation.metadataField) return NO_OP(parts, 'invalid-params');
  }
  if (!params.replacements.length) return NO_OP(parts, 'no-target');
  const paragraphs = extractBodyParagraphs(parts.documentXml);
  const bodyOps = params.replacements.filter((operation) => operation.part === 'word/document.xml');
  const pendingBodyOps = bodyOps.filter((operation) => {
    const paragraph = paragraphs.find((item) => item.index === operation.paragraphIndex);
    if (!paragraph || paragraphFingerprint(paragraph.xml) === operation.anchorFingerprint) return true;
    const text = editableNodes(paragraph.xml).filter((node) => node.kind === 'text').map((node) => node.text ?? '').join('');
    return text.includes(operation.before) || !text.includes(operation.replacementText);
  });
  const metadataOps = params.replacements.filter((operation) => operation.part !== 'word/document.xml');
  let current = parts;
  if (pendingBodyOps.length) {
    const bodyResult = applyBodyReplacements(current, pendingBodyOps);
    if (!bodyResult.applied && bodyResult.reason !== 'already-ok') return bodyResult;
    current = bodyResult.parts;
  }
  for (const operation of metadataOps) {
    const result = applyMetadataReplacement(current, operation);
    if (!result.applied && result.reason !== 'already-ok') return result;
    current = result.parts;
  }
  if (current.documentXml === parts.documentXml && JSON.stringify(current.packageXmlParts) === JSON.stringify(parts.packageXmlParts)) return NO_OP(parts, 'already-ok');
  return { parts: current, applied: true, beforeLabel: `${params.replacements.length} potvrđenih zamjena`, afterLabel: 'Dosljednost dokumenta je usklađena' };
}
