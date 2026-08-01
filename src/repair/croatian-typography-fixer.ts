import {
  editableNodes,
  extractBodyParagraphs,
  paragraphFingerprint,
  xmlEncode,
  type TypographyCategory,
} from '../analysis/typography-structure';
import type { DocxXmlParts, FixerOutput } from './fixers';

export interface CroatianTypographyParams {
  version: 1;
  profileFingerprint?: string;
  categories: Array<{ category: TypographyCategory; consent: true }>;
  operations: Array<{
    id: string;
    category: TypographyCategory;
    paragraphIndex: number;
    textNodeIndex?: number;
    nodeKind: 'text' | 'tab' | 'line-break';
    start?: number;
    end?: number;
    before: string;
    replacementText: string;
    anchorFingerprint: string;
    confirmed: true;
  }>;
}

const categories = new Set<TypographyCategory>([
  'multiple-spaces', 'punctuation-spacing', 'missing-space-after-punctuation', 'quotation-marks',
  'dash-consistency', 'ellipsis', 'nonbreaking-spaces', 'decimal-comma', 'percent-format',
  'date-format', 'nested-quotes', 'ordinal-numbers', 'number-unit-spacing', 'abbreviation-consistency',
  'repeated-punctuation', 'text-tabs', 'manual-line-breaks',
]);

const NO_OP = (parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput => ({ parts, applied: false, beforeLabel: '', afterLabel: '', reason });

function protectedXml(xml: string): boolean {
  return /<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent)\b|<(?:m:oMath|w:customXml)\b/i.test(xml);
}

function applyTextOperations(original: string, operations: CroatianTypographyParams['operations']): string | null {
  const paragraphs = extractBodyParagraphs(original);
  const byParagraph = new Map<number, CroatianTypographyParams['operations']>();
  for (const operation of operations) {
    const current = byParagraph.get(operation.paragraphIndex) ?? [];
    current.push(operation);
    byParagraph.set(operation.paragraphIndex, current);
  }
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const [paragraphIndex, paragraphOperations] of byParagraph) {
    const paragraph = paragraphs.find((item) => item.index === paragraphIndex);
    if (!paragraph || protectedXml(paragraph.xml)) return null;
    const nodes = editableNodes(paragraph.xml);
    const byNode = new Map<number, CroatianTypographyParams['operations']>();
    for (const operation of paragraphOperations) {
      if (operation.textNodeIndex == null || !Number.isInteger(operation.textNodeIndex) || operation.textNodeIndex < 0) return null;
      const nodeOperations = byNode.get(operation.textNodeIndex) ?? [];
      nodeOperations.push(operation);
      byNode.set(operation.textNodeIndex, nodeOperations);
    }
    for (const [nodeIndex, nodeOperations] of byNode) {
      const node = nodes[nodeIndex];
      if (!node || node.kind !== nodeOperations[0].nodeKind) return null;
      if (node.kind === 'text') {
        const source = node.text ?? '';
        const ordered = [...nodeOperations].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
        const ascending = [...nodeOperations].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        for (let i = 1; i < ascending.length; i++) if ((ascending[i - 1].end ?? 0) > (ascending[i].start ?? 0)) return null;
        let previousStart = source.length + 1;
        let transformed = source;
        for (const operation of ordered) {
          const start = operation.start;
          const end = operation.end;
          if (start == null || end == null || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length || (start < previousStart && end > previousStart)) return null;
          const before = source.slice(start, end);
          if (before !== operation.before) {
            if (before === operation.replacementText) continue;
            return null;
          }
          const offset = start;
          const transformedStart = offset;
          transformed = transformed.slice(0, transformedStart) + operation.replacementText + transformed.slice(transformedStart + before.length);
          previousStart = start;
        }
        replacements.push({ start: paragraph.start + node.start, end: paragraph.start + node.end, value: node.xml.replace(/>([\s\S]*)<\/w:t>$/i, `>${xmlEncode(transformed)}<\/w:t>`) });
      } else {
        for (const operation of nodeOperations) {
          if (operation.before !== (node.kind === 'tab' ? '\\t' : '\\n') && operation.before !== node.xml) return null;
          replacements.push({ start: paragraph.start + node.start, end: paragraph.start + node.end, value: `<w:t xml:space="preserve">${xmlEncode(operation.replacementText)}</w:t>` });
        }
      }
    }
  }
  let output = original;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  return output;
}

export function croatianTypographyFixer(parts: DocxXmlParts, params: CroatianTypographyParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.categories) || !Array.isArray(params.operations)) return NO_OP(parts, 'invalid-params');
  const consent = new Set<TypographyCategory>();
  for (const category of params.categories) {
    if (!category || category.consent !== true || !categories.has(category.category) || consent.has(category.category)) return NO_OP(parts, 'invalid-params');
    consent.add(category.category);
  }
  const seen = new Set<string>();
  for (const operation of params.operations) {
    if (!operation || operation.confirmed !== true || !categories.has(operation.category) || !consent.has(operation.category) || seen.has(operation.id) || typeof operation.id !== 'string' || operation.id.length > 300) return NO_OP(parts, 'invalid-params');
    seen.add(operation.id);
    if (!Number.isInteger(operation.paragraphIndex) || operation.paragraphIndex < 1 || operation.paragraphIndex > 2_000_000 || operation.textNodeIndex == null || !Number.isInteger(operation.textNodeIndex) || operation.textNodeIndex < 0 || operation.before.length > 1000 || operation.replacementText.length > 1000) return NO_OP(parts, 'invalid-params');
  }
  if (!params.operations.length) return NO_OP(parts, 'no-target');
  const paragraphs = extractBodyParagraphs(parts.documentXml);
  for (const operation of params.operations) {
    const paragraph = paragraphs.find((item) => item.index === operation.paragraphIndex);
    if (!paragraph) return NO_OP(parts, 'no-target');
    if (paragraphFingerprint(paragraph.xml) !== operation.anchorFingerprint) {
      const node = editableNodes(paragraph.xml)[operation.textNodeIndex ?? -1];
      const currentText = node?.kind === 'text' ? node.text ?? '' : '';
      const alreadyOk = operation.nodeKind === 'text' && node?.kind === 'text' && !currentText.includes(operation.before) && currentText.includes(operation.replacementText)
        || operation.nodeKind !== 'text' && node?.kind === 'text' && currentText === operation.replacementText;
      if (!alreadyOk) return NO_OP(parts, 'stale-anchor');
    }
  }
  if (params.operations.every((operation) => {
    const paragraph = paragraphs.find((item) => item.index === operation.paragraphIndex);
    const node = paragraph ? editableNodes(paragraph.xml)[operation.textNodeIndex ?? -1] : undefined;
    const currentText = node?.kind === 'text' ? node.text ?? '' : '';
    return operation.nodeKind === 'text' ? node?.kind === 'text' && !currentText.includes(operation.before) && currentText.includes(operation.replacementText) : node?.kind === 'text' && currentText === operation.replacementText;
  })) return NO_OP(parts, 'already-ok');
  const documentXml = applyTextOperations(parts.documentXml, params.operations);
  if (documentXml == null) return NO_OP(parts, 'unsupported-structure');
  if (documentXml === parts.documentXml) return NO_OP(parts, 'already-ok');
  return { parts: { ...parts, documentXml }, applied: true, beforeLabel: `${params.operations.length} tipografskih zahvata`, afterLabel: 'Primijenjene potvrđene hrvatske tehničko-tipografske izmjene' };
}
