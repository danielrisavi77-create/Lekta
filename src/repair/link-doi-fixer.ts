import { extractBodyParagraphs, xmlDecode, xmlEncode } from '../analysis/typography-structure.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export type LinkDoiAction = 'make-hyperlink' | 'normalize-doi' | 'repair-spacing' | 'remove-tracking' | 'replace-canonical-url' | 'remove-link-styling';

export interface LinkDoiFixParams {
  version: 1;
  profileFingerprint?: string;
  operations: Array<{
    id: string;
    part: string;
    paragraphIndex: number;
    start: number;
    end: number;
    anchorFingerprint: string;
    before: string;
    replacementText?: string;
    targetUrl?: string;
    action: LinkDoiAction;
    confirmed: true;
  }>;
}

const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const ALLOWED_ACTIONS = new Set<LinkDoiAction>(['make-hyperlink', 'normalize-doi', 'repair-spacing', 'remove-tracking', 'replace-canonical-url', 'remove-link-styling']);
const PROTECTED = /<w:(?:tbl|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent|customXml)\b|<m:oMath\b/i;

function noOp(parts: DocxXmlParts, reason: NonNullable<FixerOutput['reason']>): FixerOutput { return { parts, applied: false, beforeLabel: '', afterLabel: '', reason }; }
function decode(value: string): string { return xmlDecode(value).replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16))); }
function encode(value: string): string { return xmlEncode(value); }
function textOf(xml: string): string { return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => decode(m[1])).join(''); }
function relTargetValid(value: string): boolean { try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && value.length <= 4000; } catch { return false; } }
function nextRelId(rels: string): string { const ids = [...rels.matchAll(/Id=["']rId(\d+)["']/gi)].map((m) => Number(m[1])); return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`; }
function addRelationship(rels: string, target: string): { rels: string; id: string } {
  const existing = [...rels.matchAll(/<Relationship\b([^>]*)>/gi)].find((m) => new RegExp(`\bType=["']${REL_TYPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(m[1]) && new RegExp(`\bTarget=["']${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(m[1]));
  if (existing) return { rels, id: existing[1].match(/\bId=["']([^"']+)["']/i)?.[1] ?? nextRelId(rels) };
  const id = nextRelId(rels);
  const entry = `<Relationship Id="${id}" Type="${REL_TYPE}" Target="${encode(target)}" TargetMode="External"/>`;
  return { rels: rels.includes('</Relationships>') ? rels.replace('</Relationships>', `${entry}</Relationships>`) : rels, id };
}
function updateRelationshipTarget(rels: string, id: string, target: string): string {
  return rels.replace(/<Relationship\b[^>]*>/gi, (tag) => {
    if (!new RegExp(`\bId=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(tag)) return tag;
    return /\bTarget=["'][^"']*["']/i.test(tag) ? tag.replace(/(\bTarget=["'])[^"']*(["'])/i, `$1${encode(target)}$2`) : tag.replace(/\/>$/, ` Target="${encode(target)}"/>`);
  });
}
function ensureRNamespace(xml: string): string { return /xmlns:r=["']/i.test(xml) ? xml : xml.replace(/<w:document\b([^>]*)>/i, '<w:document$1 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'); }
function paragraphTextNodes(xml: string): Array<{ start: number; end: number; contentStart: number; contentEnd: number; text: string }> {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, contentStart: (match.index ?? 0) + match[0].indexOf('>') + 1, contentEnd: (match.index ?? 0) + match[0].length - match[0].match(/<\/w:t>$/i)![0].length, text: decode(match[1]) }));
}
function enclosingRun(xml: string, node: { start: number; end: number }): { start: number; end: number; xml: string } | undefined {
  const start = xml.lastIndexOf('<w:r', node.start);
  const end = xml.indexOf('</w:r>', node.end);
  if (start < 0 || end < 0) return undefined;
  const runEnd = end + '</w:r>'.length;
  const candidate = xml.slice(start, runEnd);
  if (!/^<w:r(?:\s|>)/i.test(candidate) || /<w:r\b[^>]*>[^<]*<w:r\b/i.test(candidate)) return undefined;
  return { start, end: runEnd, xml: candidate };
}
function runParts(run: string): { rPr: string; text: string; hasOther: boolean } | undefined {
  const textMatch = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/i);
  if (!textMatch) return undefined;
  const rPr = run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/i)?.[0] ?? '';
  const without = run.replace(textMatch[0], '').replace(rPr, '').replace(/^<w:r(?:\s[^>]*)?>|<\/w:r>$/gi, '');
  return { rPr, text: decode(textMatch[1]), hasOther: without.trim() !== '' };
}
function runWithText(rPr: string, text: string): string { return `<w:r>${rPr}<w:t xml:space="preserve">${encode(text)}</w:t></w:r>`; }
function findHyperlinkParent(xml: string, run: { start: number; end: number }): { start: number; end: number; id?: string } | undefined {
  const start = xml.lastIndexOf('<w:hyperlink', run.start);
  const end = xml.indexOf('</w:hyperlink>', run.end);
  if (start < 0 || end < 0) return undefined;
  const block = xml.slice(start, end + '</w:hyperlink>'.length);
  if (block.includes('<w:hyperlink', 1)) return undefined;
  return { start, end: end + '</w:hyperlink>'.length, id: block.match(/\br:id=["']([^"']+)["']/i)?.[1] };
}
function stripLinkStyle(run: string): string { return run.replace(/<w:(?:color|u)\b[^>]*\/?>/gi, ''); }
function hasTracking(value: string): boolean { try { return [...new URL(value).searchParams.keys()].some((key) => /^(?:utm_[^]+|fbclid|gclid|dclid|mc_cid|mc_eid|_ga)$/i.test(key)); } catch { return false; } }
function cleanTarget(value: string): string {
  try { const url = new URL(value); for (const key of [...url.searchParams.keys()]) if (/^(?:utm_[^]+|fbclid|gclid|dclid|mc_cid|mc_eid|_ga)$/i.test(key)) url.searchParams.delete(key); return url.toString(); } catch { return value; }
}
function alreadyApplied(documentXml: string, rels: string, operation: LinkDoiFixParams['operations'][number]): boolean {
  const range = extractBodyParagraphs(documentXml)[operation.paragraphIndex - 1];
  if (!range) return false;
  const text = textOf(range.xml);
  const replacement = operation.replacementText ?? operation.before;
  if (operation.action === 'make-hyperlink' || operation.action === 'normalize-doi') {
    const linkId = range.xml.match(/<w:hyperlink\b[^>]*\br:id=["']([^"']+)["']/i)?.[1];
    const relation = linkId ? rels.match(new RegExp(`<Relationship\\b[^>]*\\bId=["']${escapeRegex(linkId)}["'][^>]*>`, 'i'))?.[0] : undefined;
    return !!operation.targetUrl && new RegExp(`<w:hyperlink\\b[^>]*>[^]*${escapeRegex(replacement)}[^]*</w:hyperlink>`, 'i').test(range.xml) && !!relation && new RegExp(`\\bTarget=["']${escapeRegex(operation.targetUrl)}["']`, 'i').test(relation);
  }
  if (operation.action === 'remove-tracking') return operation.targetUrl ? text.includes(replacement) && !hasTracking(operation.targetUrl) : false;
  if (operation.action === 'remove-link-styling') return text.includes(operation.before) && !/<w:(?:color|u)\b/i.test(range.xml);
  return replacement === operation.before || text.includes(replacement);
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function linkDoiFixer(parts: DocxXmlParts, params: LinkDoiFixParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.operations) || params.operations.length > 1000) return noOp(parts, 'invalid-params');
  const ids = new Set<string>();
  for (const operation of params.operations) {
    if (!operation || operation.confirmed !== true || typeof operation.id !== 'string' || ids.has(operation.id) || operation.part !== 'word/document.xml' || !Number.isInteger(operation.paragraphIndex) || operation.paragraphIndex < 1 || !Number.isInteger(operation.start) || !Number.isInteger(operation.end) || operation.start < 0 || operation.end <= operation.start || typeof operation.anchorFingerprint !== 'string' || typeof operation.before !== 'string' || operation.before.length > 4000 || !ALLOWED_ACTIONS.has(operation.action)) return noOp(parts, 'invalid-params');
    if (operation.targetUrl !== undefined && !relTargetValid(operation.targetUrl)) return noOp(parts, 'invalid-params');
    if (operation.replacementText !== undefined && operation.replacementText.length > 4000) return noOp(parts, 'invalid-params');
    ids.add(operation.id);
  }
  if (!params.operations.length) return noOp(parts, 'no-target');
  const ranges = extractBodyParagraphs(parts.documentXml);
  const pending = params.operations.filter((operation) => !alreadyApplied(parts.documentXml, parts.documentRelsXml ?? parts.packageXmlParts?.['word/_rels/document.xml.rels'] ?? '', operation));
  if (!pending.length) return noOp(parts, 'already-ok');
  const grouped = new Map<number, LinkDoiFixParams['operations']>();
  for (const operation of pending) { const list = grouped.get(operation.paragraphIndex) ?? []; list.push(operation); grouped.set(operation.paragraphIndex, list); }
  for (const [paragraphIndex, operations] of grouped) {
    const range = ranges[paragraphIndex - 1];
    if (!range) return noOp(parts, 'no-target');
    if (operations.some((operation) => range.fingerprint !== operation.anchorFingerprint)) return noOp(parts, 'stale-anchor');
    if (PROTECTED.test(range.xml)) return noOp(parts, 'unsupported-structure');
    const sorted = [...operations].sort((a, b) => b.start - a.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].end > sorted[i - 1].start) return noOp(parts, 'invalid-params');
  }
  let documentXml = parts.documentXml;
  let rels = parts.documentRelsXml ?? parts.packageXmlParts?.['word/_rels/document.xml.rels'] ?? '';
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const operation of pending) {
    const range = ranges[operation.paragraphIndex - 1];
    const paragraphXml = documentXml.slice(range.start, range.end);
    const nodes = paragraphTextNodes(paragraphXml);
    const node = nodes.find((candidate) => operation.start >= nodes.slice(0, nodes.indexOf(candidate)).reduce((sum, x) => sum + x.text.length, 0) && operation.end <= nodes.slice(0, nodes.indexOf(candidate)).reduce((sum, x) => sum + x.text.length, 0) + candidate.text.length);
    if (!node) return noOp(parts, 'unsupported-structure');
    const beforeNodes = nodes.slice(0, nodes.indexOf(node));
    const baseOffset = beforeNodes.reduce((sum, x) => sum + x.text.length, 0);
    const run = enclosingRun(paragraphXml, node);
    const partsOfRun = run ? runParts(run.xml) : undefined;
    if (!run || !partsOfRun || partsOfRun.hasOther) return noOp(parts, 'unsupported-structure');
    const localStart = operation.start - baseOffset;
    const localEnd = operation.end - baseOffset;
    const beforeText = partsOfRun.text.slice(0, localStart);
    const oldText = partsOfRun.text.slice(localStart, localEnd);
    const afterText = partsOfRun.text.slice(localEnd);
    if (oldText !== operation.before) return noOp(parts, 'stale-anchor');
    const parent = findHyperlinkParent(paragraphXml, run);
    if (parent?.id && operation.targetUrl && ['normalize-doi', 'remove-tracking', 'replace-canonical-url'].includes(operation.action)) rels = updateRelationshipTarget(rels, parent.id, operation.targetUrl);
    let replacement: string;
    if (operation.action === 'remove-link-styling') replacement = stripLinkStyle(run.xml);
    else if (operation.action === 'make-hyperlink' || operation.action === 'normalize-doi') {
      if (!operation.targetUrl) return noOp(parts, 'invalid-params');
      const relation = parent?.id ? { rels, id: parent.id } : addRelationship(rels, operation.targetUrl); rels = relation.rels;
      const visible = operation.replacementText ?? oldText;
      if (parent?.id) {
        const nextRun = runWithText(partsOfRun.rPr, `${beforeText}${visible}${afterText}`);
        replacement = paragraphXml.slice(parent.start, run.start) + nextRun + paragraphXml.slice(run.end, parent.end);
        replacements.push({ start: range.start + parent.start, end: range.start + parent.end, value: paragraphXml.slice(parent.start, run.start) + nextRun + paragraphXml.slice(run.end, parent.end) });
        continue;
      }
      const targetRun = runWithText(partsOfRun.rPr, visible);
      const runs = `${beforeText ? runWithText(partsOfRun.rPr, beforeText) : ''}<w:hyperlink r:id="${relation.id}" w:history="1">${targetRun}</w:hyperlink>${afterText ? runWithText(partsOfRun.rPr, afterText) : ''}`;
      replacement = runs;
    } else {
      const visible = operation.replacementText ?? oldText;
      replacement = runWithText(partsOfRun.rPr, `${beforeText}${visible}${afterText}`);
    }
    replacements.push({ start: range.start + run.start, end: range.start + run.end, value: replacement });
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) documentXml = documentXml.slice(0, replacement.start) + replacement.value + documentXml.slice(replacement.end);
  const packageXmlParts = { ...(parts.packageXmlParts ?? {}) };
  const nextParts: DocxXmlParts = { ...parts, documentXml: ensureRNamespace(documentXml), documentRelsXml: rels, packageXmlParts: { ...packageXmlParts, 'word/_rels/document.xml.rels': rels } };
  return { parts: nextParts, applied: true, beforeLabel: `${pending.length} poveznica`, afterLabel: 'poveznice i DOI-ji normalizirani' };
}
