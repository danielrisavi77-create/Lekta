import { bibliographyAnchorFingerprint } from '../analysis/bibliography-structure.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface BibliographyRepairEntryTarget {
  id: string;
  paragraphIndices: number[];
  anchorFingerprint: string;
  remove?: boolean;
  replacementText?: string;
  normalizeText?: boolean;
  hyperlink?: 'doi' | 'url';
}

export interface BibliographyRepairParams {
  version: 1;
  profileFingerprint?: string;
  entries: BibliographyRepairEntryTarget[];
  order?: string[];
  options?: {
    hangingIndentTwips?: number;
    beforeTwentieths?: number;
    afterTwentieths?: number;
    stripUrlTerminalPunctuation?: boolean;
  };
  suffixes?: Array<{ entryId: string; suffix: string; citationParagraphIndices?: number[] }>;
}

interface Range { start: number; end: number; index: number; }

const NO_OP = (parts: DocxXmlParts, reason: FixerOutput['reason']): FixerOutput => ({
  parts, applied: false, beforeLabel: '', afterLabel: '', reason,
});

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function encodeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function paragraphRanges(xml: string): Range[] {
  const masked = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, (m) => ' '.repeat(m.length));
  const tokenRe = /<w:p(?=[\s/>])[^>]*\/?>|<\/w:p\s*>/g;
  const stack: number[] = [];
  const ranges: Range[] = [];
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(masked))) {
    if (/^<\/w:p/.test(token[0])) {
      const start = stack.pop();
      if (start !== undefined) ranges.push({ start, end: token.index + token[0].length, index: ranges.length + 1 });
    } else if (/\/\s*>$/.test(token[0])) {
      ranges.push({ start: token.index, end: token.index + token[0].length, index: ranges.length + 1 });
    } else stack.push(token.index);
  }
  return ranges.sort((a, b) => a.start - b.start).map((range, index) => ({ ...range, index: index + 1 }));
}

function paragraphText(block: string): string {
  return [...block.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join('');
}

function isUnsupported(block: string): boolean {
  return /<w:(?:fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|tbl|txbxContent|drawing|pict|object)\b|<w:hyperlink\b/.test(block);
}

function isInsideExcludedContainer(xml: string, range: Range): boolean {
  const before = xml.slice(0, range.start);
  const openTable = before.lastIndexOf('<w:tc');
  const closeTable = before.lastIndexOf('</w:tc>');
  const openTextBox = before.lastIndexOf('<w:txbxContent');
  const closeTextBox = before.lastIndexOf('</w:txbxContent>');
  return openTable > closeTable || openTextBox > closeTextBox;
}

function setPPr(block: string, options: BibliographyRepairParams['options']): string {
  if (!options) return block;
  const values: string[] = [];
  if (options.hangingIndentTwips !== undefined) values.push(`w:hanging="${Math.trunc(options.hangingIndentTwips)}"`);
  if (options.beforeTwentieths !== undefined) values.push(`w:before="${Math.trunc(options.beforeTwentieths)}"`);
  if (options.afterTwentieths !== undefined) values.push(`w:after="${Math.trunc(options.afterTwentieths)}"`);
  if (!values.length) return block;
  let out = block;
  const ind = options.hangingIndentTwips !== undefined ? `<w:ind ${values.filter((value) => value.startsWith('w:hanging')).join(' ')}/>` : '';
  const spacingValues = values.filter((value) => value.startsWith('w:before') || value.startsWith('w:after'));
  const spacing = spacingValues.length ? `<w:spacing ${spacingValues.join(' ')}/>` : '';
  const patchPPr = (pPr: string) => {
    let next = pPr;
    if (ind) next = next.replace(/<w:ind\b[^>]*\/?>/, '').replace(/<\/w:pPr>/, `${ind}</w:pPr>`);
    if (spacing) next = next.replace(/<w:spacing\b[^>]*\/?>/, '').replace(/<\/w:pPr>/, `${spacing}</w:pPr>`);
    return next;
  };
  if (/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/.test(out)) return out.replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/, patchPPr);
  const pPr = `<w:pPr>${ind}${spacing}</w:pPr>`;
  return out.replace(/(<w:p(?:\s[^>]*)?>)/, `$1${pPr}`);
}

function normalizePlainText(text: string, stripUrlTerminalPunctuation = false): string {
  let out = text.replace(/[ \t]+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  out = out.replace(/(?:https?:\/\/doi\.org\/|doi:\s*)(10\.\d{4,9}\/\S+)/gi, (_m, doi: string) => `https://doi.org/${doi.replace(/[.,;]+$/, '')}`);
  if (stripUrlTerminalPunctuation) out = out.replace(/(https?:\/\/\S+?)[.,;:]+(?=(?:\s|$))/gi, '$1');
  return out;
}

function replaceSingleTextNode(block: string, replacement: string): string | null {
  const nodes = [...block.matchAll(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g)];
  if (nodes.length !== 1) return null;
  const match = nodes[0];
  return block.slice(0, match.index) + `<w:t${match[1]}>${encodeXml(replacement)}</w:t>` + block.slice((match.index ?? 0) + match[0].length);
}

function withSuffix(text: string, suffix: string | undefined): string {
  if (!suffix || !/^[a-z]$/i.test(suffix)) return text;
  return text.replace(/\b((?:18|19|20)\d{2})(?![a-z])/i, `$1${suffix.toLowerCase()}`);
}

function nextRelationshipId(xml: string): string {
  let max = 0;
  for (const match of xml.matchAll(/\bId="rId(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return `rId${max + 1}`;
}

function addExternalHyperlink(block: string, rels: string, target: string): { block: string; rels: string } | null {
  if (!rels || !/<Relationships\b/.test(rels) || !/<w:r\b[^>]*>[\s\S]*?<w:t\b/.test(block)) return null;
  const id = nextRelationshipId(rels);
  const relationship = `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${encodeXml(target)}" TargetMode="External"/>`;
  const run = block.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/);
  if (!run || /<w:r\b[^>]*>[\s\S]*?<w:t\b[\s\S]*?<w:t\b/.test(block)) return null;
  const wrapped = `<w:hyperlink r:id="${id}">${run[0]}</w:hyperlink>`;
  return { block: block.replace(run[0], wrapped), rels: rels.replace('</Relationships>', `${relationship}</Relationships>`) };
}

function transformBlock(block: string, target: BibliographyRepairEntryTarget, options?: BibliographyRepairParams['options']): { block: string; rels?: string; changed: boolean } {
  if (isUnsupported(block)) return { block, changed: false };
  let next = block;
  const before = paragraphText(block);
  if (target.replacementText !== undefined) {
    const replaced = replaceSingleTextNode(next, target.replacementText);
    if (replaced === null) return { block, changed: false };
    next = replaced;
  } else if (target.normalizeText) {
    const normalized = normalizePlainText(before, options?.stripUrlTerminalPunctuation === true);
    if (normalized !== before) {
      const replaced = replaceSingleTextNode(next, normalized);
      if (replaced === null) return { block, changed: false };
      next = replaced;
    }
  }
  next = setPPr(next, options);
  return { block: next, changed: next !== block };
}

export function bibliographyRepairFixer(parts: DocxXmlParts, params: BibliographyRepairParams): FixerOutput {
  if (params.version !== 1 || !Array.isArray(params.entries) || params.entries.length === 0) return NO_OP(parts, 'invalid-params');
  if (params.entries.length > 500 || new Set(params.entries.map((entry) => entry.id)).size !== params.entries.length) return NO_OP(parts, 'invalid-params');
  const ranges = paragraphRanges(parts.documentXml);
  const byId = new Map<string, { target: BibliographyRepairEntryTarget; range: Range; block: string }>();
  const usedParagraphIndices = new Set<number>();
  for (const target of params.entries) {
    if (!target || !target.id || !Array.isArray(target.paragraphIndices) || target.paragraphIndices.length !== 1) return NO_OP(parts, 'invalid-params');
    const paragraphIndex = target.paragraphIndices[0];
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 1 || paragraphIndex > ranges.length) return NO_OP(parts, 'invalid-params');
    if (usedParagraphIndices.has(paragraphIndex)) return NO_OP(parts, 'invalid-params');
    usedParagraphIndices.add(paragraphIndex);
    const range = ranges[paragraphIndex - 1];
    const block = parts.documentXml.slice(range.start, range.end);
    if (isInsideExcludedContainer(parts.documentXml, range)) return NO_OP(parts, 'unsupported-structure');
    const suffix = params.suffixes?.find((item) => item.entryId === target.id)?.suffix;
    const currentText = paragraphText(block);
    const expectedText = withSuffix(target.replacementText ?? '', suffix);
    const anchorMatches = bibliographyAnchorFingerprint([paragraphIndex], currentText) === target.anchorFingerprint;
    // Nakon prve primjene recept više nema izvorni fingerprint ako je zamijenjen
    // tekst zapisa. Prihvaćamo samo točno potvrđeni završni tekst, nikada samo
    // sličan sadržaj, kako bi druga primjena vratila `already-ok` bez slabljenja
    // zaštite od zastarjelog anchora.
    const alreadyReplaced = !target.remove && target.replacementText !== undefined && currentText === expectedText;
    if (!anchorMatches && !alreadyReplaced) return NO_OP(parts, 'invalid-params');
    byId.set(target.id, { target, range, block });
  }
  if (params.order?.length) {
    const order = params.order;
    if (order.length !== byId.size || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) return NO_OP(parts, 'invalid-params');
  }
  if (params.suffixes?.length) {
    const suffixIds = params.suffixes.map((suffix) => suffix.entryId);
    if (new Set(suffixIds).size !== suffixIds.length || params.suffixes.some((suffix) => !byId.has(suffix.entryId) || !/^[a-z]$/i.test(suffix.suffix))) return NO_OP(parts, 'invalid-params');
  }

  const transformed = new Map<string, string>();
  let rels = parts.documentRelsXml;
  const suffixes = new Map((params.suffixes || []).map((suffix) => [suffix.entryId, suffix.suffix]));
  for (const [id, item] of byId) {
    if (item.target.remove) continue;
    const result = transformBlock(item.block, item.target, params.options);
    const expectedText = withSuffix(item.target.replacementText ?? '', suffixes.get(id));
    if (!result.changed && item.target.replacementText !== undefined && paragraphText(item.block) !== expectedText) return NO_OP(parts, 'unsupported-structure');
    let block = result.block;
    const suffix = suffixes.get(id);
    if (suffix && /^[a-z]$/i.test(suffix)) {
      const text = paragraphText(block);
      const suffixedText = withSuffix(text, suffix);
      if (suffixedText !== text) {
        const replaced = replaceSingleTextNode(block, suffixedText);
        if (replaced === null) return NO_OP(parts, 'unsupported-structure');
        block = replaced;
      }
    }
    if (item.target.hyperlink && rels) {
      const text = paragraphText(block);
      const url = item.target.hyperlink === 'doi'
        ? (text.match(/https?:\/\/doi\.org\/\S+/i)?.[0] ?? '')
        : (text.match(/https?:\/\/\S+/i)?.[0] ?? '');
      if (url && !/<w:hyperlink\b/.test(block)) {
        const linked = addExternalHyperlink(block, rels, url);
        if (linked) { block = linked.block; rels = linked.rels; }
      }
    }
    transformed.set(id, block);
  }

  const targetPositions = [...byId.values()].map((item) => item.range.index).sort((a, b) => a - b);
  const orderedIds = params.order?.length ? params.order : [...byId.keys()];
  const orderedBlocks = orderedIds.map((id) => transformed.get(id)).filter((block): block is string => block !== undefined);
  let xml = parts.documentXml;
  const replacements = new Map<number, string | null>();
  if (params.order?.length) {
    targetPositions.forEach((position, index) => replacements.set(position, orderedBlocks[index] ?? null));
  } else {
    for (const [id, item] of byId) replacements.set(item.range.index, item.target.remove ? null : transformed.get(id) ?? item.block);
  }
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    const replacement = replacements.get(range.index);
    if (replacement === undefined) continue;
    xml = xml.slice(0, range.start) + (replacement ?? '') + xml.slice(range.end);
  }
  if (rels !== parts.documentRelsXml && !/<w:document\b[^>]*\sxmlns:r=/.test(xml)) {
    xml = xml.replace(/<w:document\b/, '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  if (xml === parts.documentXml && rels === parts.documentRelsXml) return NO_OP(parts, 'already-ok');
  return {
    parts: { ...parts, documentXml: xml, ...(rels !== parts.documentRelsXml ? { documentRelsXml: rels } : {}) },
    applied: true,
    beforeLabel: `${byId.size} bibliografskih zapisa`,
    afterLabel: 'bibliografija usklađena prema potvrđenom planu',
  };
}
