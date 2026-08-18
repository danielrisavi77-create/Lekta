/**
 * Lokalni, konzervativni pregled Word polja. Ovaj modul ne pokušava izračunati
 * rezultate polja. Čita instrukcije i spremljeni rezultat, a Wordu ili zasebnom
 * render workeru prepušta konačni izračun stranica i sadržaja.
 */

export type FieldKind =
  | 'toc'
  | 'page'
  | 'numpages'
  | 'seq'
  | 'ref'
  | 'pageref'
  | 'hyperlink'
  | 'date'
  | 'docproperty'
  | 'unknown';

export type FieldStatus =
  | 'ok'
  | 'stale'
  | 'broken'
  | 'error-reference-not-found'
  | 'needs-render'
  | 'unsupported';

export interface FieldOccurrence {
  id: string;
  part: string;
  kind: FieldKind;
  instruction: string;
  cachedResult: string;
  paragraphIndex?: number;
  anchorFingerprint: string;
  dirty: boolean;
  targetBookmark?: string;
  status: FieldStatus;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface FieldIntegrity {
  version: 1;
  fields: FieldOccurrence[];
  bookmarks: Array<{
    name: string;
    part: string;
    startFingerprint?: string;
    endFingerprint?: string;
    status: 'ok' | 'broken' | 'duplicate';
  }>;
  manualTocCandidates: Array<{
    startParagraphIndex: number;
    endParagraphIndex: number;
    rawText: string;
    confidence: 'high' | 'medium' | 'low';
    replacementAllowed: boolean;
    anchorFingerprint: string;
  }>;
  summary: {
    totalFields: number;
    staleFields: number;
    brokenFields: number;
    errorReferenceFields: number;
    tocFields: number;
    pageFields: number;
    sequenceFields: number;
    crossReferenceFields: number;
    manualTocCandidates: number;
  };
}

export interface FieldIntegrityInput {
  parts: Record<string, string>;
  names?: string[];
  paragraphs?: Array<{ index: number; text: string; headingLevel?: number | null }>;
  headings?: Array<{ index: number; text: string; headingLevel?: number | null }>;
  elements?: { tables?: number; images?: number; figures?: number };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `f${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function fieldAnchorFingerprint(part: string, raw: string, offset = 0): string {
  return hash(`${part}|field|${offset}|${raw.replace(/\s+w:dirty=["'](?:true|1)["']/gi, '')}`);
}

export function paragraphAnchorFingerprint(part: string, paragraphXml: string, paragraphIndex?: number): string {
  return hash(`${part}|paragraph|${paragraphIndex ?? ''}|${paragraphXml}`);
}

export function manualTocAnchorFingerprint(startParagraphIndex: number, endParagraphIndex: number, rawText: string): string {
  return hash(`manual-toc|${startParagraphIndex}|${endParagraphIndex}|${rawText}`);
}

function attr(tag: string, name: string): string | undefined {
  const escaped = name.replace(':', '\\:');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

function textFromXml(xml: string): string {
  return decodeXml(xml
    .replace(/<w:tab\s*\/?>/gi, '\t')
    .replace(/<w:br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function partParagraphIndex(xml: string, offset: number): number | undefined {
  const before = xml.slice(0, offset);
  const count = (before.match(/<w:p(?:\s|>)/g) || []).length;
  return count ? count - 1 : undefined;
}

function kindForInstruction(instruction: string): FieldKind {
  const command = instruction.trim().split(/\s+/)[0]?.toUpperCase() || '';
  if (command === 'TOC') return 'toc';
  if (command === 'PAGE') return 'page';
  if (command === 'NUMPAGES') return 'numpages';
  if (command === 'SEQ') return 'seq';
  if (command === 'REF') return 'ref';
  if (command === 'PAGEREF') return 'pageref';
  if (command === 'HYPERLINK') return 'hyperlink';
  if (command === 'DATE' || command === 'TIME') return 'date';
  if (command === 'DOCPROPERTY') return 'docproperty';
  return 'unknown';
}

function targetFor(kind: FieldKind, instruction: string): string | undefined {
  if (!['ref', 'pageref', 'hyperlink'].includes(kind)) return undefined;
  const value = instruction.trim().replace(/^(?:REF|PAGEREF|HYPERLINK)\s+/i, '').trim();
  const quoted = value.match(/^"([^"]+)"/);
  const plain = value.match(/^([^\\\s]+)/);
  return decodeXml(quoted?.[1] || plain?.[1] || '').trim() || undefined;
}

function dirtyFromTag(tag: string): boolean {
  return /\bw:dirty\s*=\s*["'](?:true|1)["']/i.test(tag);
}

function cachedFieldResult(xml: string, separateOffset?: number): string {
  const body = separateOffset == null ? xml : xml.slice(separateOffset);
  return textFromXml(body.replace(/<w:fldChar\b[^>]*w:fldCharType=["']end["'][^>]*>[\s\S]*$/i, ''));
}

interface RawField {
  raw: string;
  offset: number;
  instruction: string;
  cachedResult: string;
  dirty: boolean;
  paragraphIndex?: number;
}

function scanFields(_part: string, xml: string): RawField[] {
  const found: RawField[] = [];
  const simple = /<w:fldSimple\b[^>]*>[\s\S]*?<\/w:fldSimple>/gi;
  for (const match of xml.matchAll(simple)) {
    const raw = match[0];
    const instruction = attr(raw.slice(0, raw.indexOf('>') + 1), 'w:instr') || '';
    found.push({ raw, offset: match.index || 0, instruction: decodeXml(instruction), cachedResult: cachedFieldResult(raw), dirty: dirtyFromTag(raw.slice(0, raw.indexOf('>') + 1)), paragraphIndex: partParagraphIndex(xml, match.index || 0) });
  }

  const begin = /<w:fldChar\b[^>]*w:fldCharType=["']begin["'][^>]*\/?>(?:<\/w:fldChar>)?/gi;
  for (const match of xml.matchAll(begin)) {
    const start = match.index || 0;
    const endMatch = /<w:fldChar\b[^>]*w:fldCharType=["']end["'][^>]*\/?>(?:<\/w:fldChar>)?/i.exec(xml.slice(start + match[0].length));
    if (!endMatch) continue;
    const end = start + match[0].length + endMatch.index + endMatch[0].length;
    const raw = xml.slice(start, end);
    const instructions = [...raw.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/gi)].map((item) => decodeXml(item[1])).join('');
    const separator = raw.search(/<w:fldChar\b[^>]*w:fldCharType=["']separate["']/i);
    found.push({ raw, offset: start, instruction: instructions, cachedResult: cachedFieldResult(raw, separator >= 0 ? separator : undefined), dirty: dirtyFromTag(match[0]), paragraphIndex: partParagraphIndex(xml, start) });
  }
  return found.sort((a, b) => a.offset - b.offset);
}

function bookmarkStatus(parts: Record<string, string>): FieldIntegrity['bookmarks'] {
  const result: FieldIntegrity['bookmarks'] = [];
  for (const [part, xml] of Object.entries(parts)) {
    const starts = new Map<string, Array<{ id: string; fingerprint: string }>>();
    const ends = new Map<string, string[]>();
    for (const match of xml.matchAll(/<w:bookmarkStart\b[^>]*>/gi)) {
      const name = attr(match[0], 'w:name');
      if (!name) continue;
      const list = starts.get(name) || [];
      list.push({ id: attr(match[0], 'w:id') || '', fingerprint: hash(`${part}|bookmark-start|${match.index || 0}|${match[0]}`) });
      starts.set(name, list);
    }
    for (const match of xml.matchAll(/<w:bookmarkEnd\b[^>]*>/gi)) {
      const id = attr(match[0], 'w:id');
      if (!id) continue;
      const list = ends.get(id) || [];
      list.push(hash(`${part}|bookmark-end|${match.index || 0}|${match[0]}`));
      ends.set(id, list);
    }
    const names = new Set(starts.keys());
    for (const name of names) {
      const start = starts.get(name) || [];
      const end = start.flatMap((entry) => ends.get(entry.id) || []);
      result.push({ name, part, startFingerprint: start[0]?.fingerprint, endFingerprint: end[0], status: start.length > 1 ? 'duplicate' : end.length ? 'ok' : 'broken' });
    }
    for (const [id, values] of ends) {
      if (!values.length || [...starts.values()].some((items) => items.some((item) => item.id === id))) continue;
      result.push({ name: `#${id}`, part, endFingerprint: values[0], status: 'broken' });
    }
  }
  return result;
}

function manualTocCandidates(paragraphs: FieldIntegrityInput['paragraphs']): FieldIntegrity['manualTocCandidates'] {
  if (!paragraphs?.length) return [];
  const out: FieldIntegrity['manualTocCandidates'] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (!/^\s*(?:sadr[žz]aj|contents|table of contents)\s*:?$/i.test(paragraphs[i].text)) continue;
    const entries: typeof paragraphs = [];
    for (let j = i + 1; j < paragraphs.length; j++) {
      const p = paragraphs[j];
      if (!p.text.trim() || (p.headingLevel && p.headingLevel <= 1)) break;
      if (/[.·…]{2,}\s*\d+\s*$/.test(p.text) || /\t\s*\d+\s*$/.test(p.text)) entries.push(p);
      else if (entries.length) break;
    }
    if (!entries.length) continue;
    const start = entries[0].index;
    const end = entries[entries.length - 1].index;
    const rawText = entries.map((p) => p.text).join('\n');
    out.push({ startParagraphIndex: start, endParagraphIndex: end, rawText, confidence: entries.length >= 2 ? 'high' : 'medium', replacementAllowed: entries.length >= 2, anchorFingerprint: manualTocAnchorFingerprint(start, end, rawText) });
  }
  return out;
}

export function analyzeFieldIntegrity(input: FieldIntegrityInput): FieldIntegrity {
  const fields: FieldOccurrence[] = [];
  const bookmarks = bookmarkStatus(input.parts);
  const knownBookmarks = new Set(bookmarks.filter((b) => b.status === 'ok').map((b) => b.name));
  for (const [part, xml] of Object.entries(input.parts)) {
    if (!/\.xml$/i.test(part)) continue;
    for (const rawField of scanFields(part, xml)) {
      const kind = kindForInstruction(rawField.instruction);
      const targetBookmark = targetFor(kind, rawField.instruction);
      const errorResult = /error!\s+reference\s+source\s+not\s+found/i.test(rawField.cachedResult);
      const broken = targetBookmark !== undefined && !knownBookmarks.has(targetBookmark);
      const status: FieldStatus = errorResult ? 'error-reference-not-found' : broken ? 'broken' : rawField.dirty ? 'stale' : (!rawField.cachedResult && ['toc', 'page', 'numpages', 'seq', 'ref', 'pageref', 'date', 'docproperty'].includes(kind) ? 'needs-render' : 'ok');
      const evidence = [rawField.dirty ? 'polje već ima w:dirty oznaku' : '', rawField.cachedResult ? `spremljeni rezultat: ${rawField.cachedResult.slice(0, 100)}` : 'rezultat nije spremljen', targetBookmark ? (broken ? `bookmark ${targetBookmark} nije pronađen` : `bookmark ${targetBookmark} postoji`) : ''].filter(Boolean);
      fields.push({ id: `${part}:${rawField.offset}`, part, kind, instruction: rawField.instruction.trim(), cachedResult: rawField.cachedResult, ...(rawField.paragraphIndex !== undefined ? { paragraphIndex: rawField.paragraphIndex } : {}), anchorFingerprint: fieldAnchorFingerprint(part, rawField.raw, rawField.offset), dirty: rawField.dirty, ...(targetBookmark ? { targetBookmark } : {}), status, confidence: status === 'broken' || status === 'error-reference-not-found' ? 'low' : kind === 'unknown' ? 'low' : 'high', evidence });
    }
    const sdtToc = /<w:sdt\b[\s\S]*?<w:docPartGallery\b[^>]*w:val=["']Table of Contents["'][\s\S]*?<\/w:sdt>/gi;
    for (const match of xml.matchAll(sdtToc)) {
      const raw = match[0];
      if (fields.some((field) => field.part === part && Math.abs(Number(field.id.split(':').at(-1)) - (match.index || 0)) < 10)) continue;
      fields.push({ id: `${part}:sdt:${match.index || 0}`, part, kind: 'toc', instruction: 'TOC', cachedResult: textFromXml(raw), paragraphIndex: partParagraphIndex(xml, match.index || 0), anchorFingerprint: fieldAnchorFingerprint(part, raw, match.index || 0), dirty: /\bw:dirty=["'](?:true|1)/i.test(raw), status: 'needs-render', confidence: 'high', evidence: ['SDT galerija Table of Contents'] });
    }
  }
  fields.sort((a, b) => a.part.localeCompare(b.part) || a.id.localeCompare(b.id));
  const manual = manualTocCandidates(input.paragraphs);
  const tocFields = fields.filter((field) => field.kind === 'toc').length;
  const pageFields = fields.filter((field) => field.kind === 'page' || field.kind === 'numpages').length;
  const sequenceFields = fields.filter((field) => field.kind === 'seq').length;
  const crossReferenceFields = fields.filter((field) => ['ref', 'pageref', 'hyperlink'].includes(field.kind)).length;
  return {
    version: 1,
    fields,
    bookmarks,
    manualTocCandidates: manual,
    summary: {
      totalFields: fields.length,
      staleFields: fields.filter((field) => field.status === 'stale').length,
      brokenFields: fields.filter((field) => field.status === 'broken').length,
      errorReferenceFields: fields.filter((field) => field.status === 'error-reference-not-found').length,
      tocFields,
      pageFields,
      sequenceFields,
      crossReferenceFields,
      manualTocCandidates: manual.length,
    },
  };
}
