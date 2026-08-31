import { extractBodyParagraphs, paragraphFingerprint, xmlDecode } from './typography-structure.ts';
import { anchorTextOfXml as anchorTextOf } from '../repair/anchor-text.ts';

export type LinkKind = 'url' | 'doi' | 'email' | 'unknown';
export type LinkStatus = 'plain-text' | 'hyperlink-ok' | 'broken-spacing' | 'invalid-format' | 'redirects' | 'unreachable' | 'display-target-mismatch' | 'tracking-parameters' | 'canonical-candidate' | 'unsupported';
export type LinkConfidence = 'high' | 'medium' | 'low';

export interface LinkRules {
  preferredScheme?: 'https' | 'preserve';
  doiFormat?: 'doi-url' | 'bare-doi' | 'preserve';
  removeTrackingParameters?: boolean;
  hyperlinkPlainUrls?: boolean;
  hyperlinkDisplayStyle?: 'default' | 'plain-text';
  stripVisibleUnderline?: boolean;
  stripVisibleColor?: boolean;
  checkHttpStatus?: boolean;
  allowCanonicalReplacement?: boolean;
  protectedDomains?: string[];
}

export interface LinkOccurrence {
  id: string;
  part: string;
  paragraphIndex?: number;
  start: number;
  end: number;
  rawText: string;
  displayedText: string;
  target?: string;
  kind: LinkKind;
  status: LinkStatus;
  confidence: LinkConfidence;
  anchorFingerprint: string;
  /** Tekst odlomka; drugo sidro, otporno na zahvat koji dira samo oblikovanje. */
  anchorText?: string;
  evidence: string[];
  safeOperations: Array<'make-hyperlink' | 'normalize-doi' | 'remove-tracking' | 'remove-link-styling' | 'repair-spacing'>;
  requiresConfirmation: boolean;
}

export interface LinkDoiStructure {
  version: 1;
  occurrences: LinkOccurrence[];
  summary: { total: number; plainUrls: number; doiCandidates: number; brokenUrls: number; trackingUrls: number; mismatches: number; redirects: number; unreachable: number };
  warnings: string[];
  skipped: Array<{ part: string; paragraphIndex?: number; reason: string }>;
}

interface ParagraphLike { index: number; text: string; }

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `link-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function decode(value: string): string {
  return xmlDecode(value).replace(/&#(\d+);/g, (_match, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_match, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function textOf(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => decode(m[1])).join('');
}

function relationTargets(relsXml: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of (relsXml ?? '').matchAll(/<Relationship\b[^>]*\bId=["']([^"']+)["'][^>]*\bTarget=["']([^"']+)["'][^>]*>/gi)) result.set(match[1], decode(match[2]));
  return result;
}

function cleanTrailing(value: string): string { return value.replace(/[.,;:!?]+$/g, ''); }
function canonicalDoi(value: string): string | undefined {
  const match = value.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|^\s*doi:\s*)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\.?$/i);
  return match ? `https://doi.org/${cleanTrailing(match[1])}` : undefined;
}
function kindOf(value: string): LinkKind {
  return canonicalDoi(value) ? 'doi' : /^https?:\/\//i.test(value) || /^www\./i.test(value) ? 'url' : /^mailto:/i.test(value) || /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value) ? 'email' : 'unknown';
}
function trackingParams(value: string): string[] {
  try {
    const url = new URL(value);
    return [...url.searchParams.keys()].filter((key) => /^(?:utm_[^]+|fbclid|gclid|dclid|mc_cid|mc_eid|_ga)$/i.test(key));
  } catch { return []; }
}
function normalizedUrl(value: string, rules?: LinkRules): string {
  let result = cleanTrailing(value.trim());
  if (/^www\./i.test(result)) result = `https://${result}`;
  try {
    const url = new URL(result);
    if (rules?.preferredScheme === 'https' && url.protocol === 'http:') url.protocol = 'https:';
    if (rules?.removeTrackingParameters) for (const key of trackingParams(url.toString())) url.searchParams.delete(key);
    result = url.toString();
  } catch { /* invalid or broken URL remains a diagnostic */ }
  return result;
}

export function analyzeLinkDoiStructure(input: {
  documentXml: string;
  documentRelsXml?: string;
  paragraphs: ParagraphLike[];
  rules?: LinkRules;
}): LinkDoiStructure {
  const ranges = extractBodyParagraphs(input.documentXml);
  const relationMap = relationTargets(input.documentRelsXml);
  const occurrences: LinkOccurrence[] = [];
  const skipped: LinkDoiStructure['skipped'] = [];
  const warnings: string[] = [];
  for (const paragraph of input.paragraphs) {
    const range = ranges[paragraph.index - 1];
    if (!range) continue;
    const block = range.xml;
    if (/<w:(?:tbl|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent|customXml)\b|<m:oMath\b/i.test(block)) {
      skipped.push({ part: 'word/document.xml', paragraphIndex: paragraph.index, reason: 'složena Word struktura ili polje' });
      continue;
    }
    const text = textOf(block);
    const hyperlinkRanges: Array<{ text: string; target?: string; start: number; end: number }> = [];
    for (const match of block.matchAll(/<w:hyperlink\b([^>]*)>[\s\S]*?<\/w:hyperlink>/gi)) {
      const visible = textOf(match[0]);
      const offset = text.indexOf(visible);
      if (!visible || offset < 0) continue;
      const id = match[1].match(/\br:id=["']([^"']+)["']/i)?.[1];
      hyperlinkRanges.push({ text: visible, target: id ? relationMap.get(id) : undefined, start: offset, end: offset + visible.length });
    }
    const candidates: Array<{ raw: string; start: number; end: number; broken: boolean }> = [];
    for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi)) candidates.push({ raw: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, broken: false });
    for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]*\s+[^\s<>]+\.[A-Za-z]{2,}(?:\/[^\s<>]*)?/gi)) {
      if (!match[0].split(/\s+/).some((part) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(part))) candidates.push({ raw: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, broken: true });
    }
    for (const match of text.matchAll(/(?:doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+|https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi)) candidates.push({ raw: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, broken: false });
    const seen = new Set<string>();
    for (const candidate of candidates.sort((a, b) => a.start - b.start)) {
      const key = `${candidate.start}:${candidate.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const link = hyperlinkRanges.find((x) => x.start <= candidate.start && x.end >= candidate.end);
      const kind = kindOf(candidate.raw);
      const target = link?.target;
      const tracking = kind === 'url' ? trackingParams(candidate.raw) : [];
      const displayMismatch = !!target && cleanTrailing(target) !== cleanTrailing(candidate.raw) && normalizedUrl(candidate.raw) !== cleanTrailing(target);
      const status: LinkStatus = candidate.broken ? 'broken-spacing' : displayMismatch ? 'display-target-mismatch' : tracking.length ? 'tracking-parameters' : link ? 'hyperlink-ok' : 'plain-text';
      const safeOperations: LinkOccurrence['safeOperations'] = [];
      if (!link && (kind === 'url' || kind === 'doi')) safeOperations.push(kind === 'doi' ? 'normalize-doi' : 'make-hyperlink');
      if (candidate.broken) safeOperations.push('repair-spacing');
      if (tracking.length) safeOperations.push('remove-tracking');
      const style = link ? (block.slice(Math.max(0, block.indexOf('<w:hyperlink', 0)), block.indexOf('</w:hyperlink>', 0) + 15).match(/<w:u\b|<w:color\b/i) ? 'styled' : 'plain') : undefined;
      if (link && style === 'styled' && input.rules?.stripVisibleUnderline) safeOperations.push('remove-link-styling');
      occurrences.push({ id: hash(`${paragraph.index}:${candidate.start}:${candidate.raw}`), part: 'word/document.xml', paragraphIndex: paragraph.index, start: candidate.start, end: candidate.end, rawText: candidate.raw, displayedText: candidate.raw, ...(target ? { target } : {}), kind, status, confidence: candidate.broken || displayMismatch ? 'medium' : kind === 'doi' || link ? 'high' : 'high', anchorFingerprint: paragraphFingerprint(range.xml), anchorText: anchorTextOf(range.xml), evidence: [candidate.broken ? 'URL sadrži razmak ili prijelom' : link ? 'pronađen postojeći Word hyperlink' : 'jasan URL ili DOI u običnom tekstu', ...(tracking.length ? [`tracking parametri: ${tracking.join(', ')}`] : []), ...(target && displayMismatch ? ['prikazani tekst i cilj hyperlinka se razlikuju'] : [])], safeOperations, requiresConfirmation: candidate.broken || displayMismatch || tracking.length > 0 });
    }
  }
  const summary = { total: occurrences.length, plainUrls: occurrences.filter((x) => x.status === 'plain-text').length, doiCandidates: occurrences.filter((x) => x.kind === 'doi').length, brokenUrls: occurrences.filter((x) => x.status === 'broken-spacing').length, trackingUrls: occurrences.filter((x) => x.status === 'tracking-parameters').length, mismatches: occurrences.filter((x) => x.status === 'display-target-mismatch').length, redirects: occurrences.filter((x) => x.status === 'redirects').length, unreachable: occurrences.filter((x) => x.status === 'unreachable').length };
  if (!occurrences.length) warnings.push('Nisu pronađene jednostavne URL ili DOI poveznice za lokalnu analizu.');
  return { version: 1, occurrences, summary, warnings, skipped };
}

export function canonicalizeLinkForRepair(value: string, rules?: LinkRules): string { return canonicalDoi(value) ?? normalizedUrl(value, rules); }
