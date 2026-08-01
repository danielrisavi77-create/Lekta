import { extractCitations, extractReferences } from '../citations/author-year';
import { parseReference } from '../citations/parse-reference';
import type { CitationInput } from '../tools/citation';
import { normalize } from '../utils/helpers';

export type BibliographyConfidence = 'high' | 'medium' | 'low';

export interface BibliographyEntry {
  id: string;
  paragraphIndices: number[];
  anchorFingerprint: string;
  rawText: string;
  fields: Partial<CitationInput>;
  sourceType: CitationInput['type'];
  confidence: BibliographyConfidence;
  exactKey: string;
  authorYearKey?: string;
  cited: boolean;
  evidence: string[];
  flags: string[];
}

export interface BibliographyStructure {
  startParagraphIndex: number | null;
  endParagraphIndex: number | null;
  entries: BibliographyEntry[];
  duplicateGroups: string[][];
  authorYearGroups: Array<{ authorYearKey: string; entryIds: string[]; suffixes: string[] }>;
  alphabetical: { expected: boolean; order: string[] };
  missingFromBibliography: Array<{ author: string; year: string; paragraphIndex: number }>;
  uncitedEntryIds: string[];
  incompleteEntryIds: string[];
  warnings: string[];
  safeActions: string[];
  confirmationActions: string[];
  summary: { total: number; highConfidence: number; review: number; duplicates: number; uncited: number };
}

function hash(value: string): string {
  let h = 2166136261;
  for (const ch of value) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function bibliographyAnchorFingerprint(paragraphIndices: number[], text: string): string {
  return `biblio-${hash(`${paragraphIndices.join(',')}|${normalize(text)}`)}`;
}

function firstAuthor(fields: Partial<CitationInput>, fallback: string): string {
  const parsed = String(fields.authors || fallback).split(/[;\n]/)[0] || '';
  return normalize(parsed.split(',')[0] || parsed).trim();
}

function canonical(text: string): string {
  return normalize(text)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, (url) => url.replace(/[.,;:]+$/, ''))
    .replace(/[.]+$/, '')
    .trim();
}

function citationMatches(author: string, year: string, citation: any): boolean {
  if (!author || !year || !citation?.author || !citation?.year) return false;
  if (String(citation.year).toLowerCase() !== String(year).toLowerCase()) return false;
  const left = normalize(author).split(/[,;]/)[0];
  const right = normalize(String(citation.author)).split(/[,;]/)[0];
  return !!left && (left === right || left.includes(right) || right.includes(left));
}

function confidence(fields: Partial<CitationInput>, rawText: string): { value: BibliographyConfidence; evidence: string[]; flags: string[] } {
  const evidence: string[] = [];
  const flags: string[] = [];
  let score = 0;
  if (fields.authors) { score += 2; evidence.push('prepoznat autor'); } else flags.push('missing-author');
  if (fields.year) { score += 2; evidence.push('prepoznata godina'); } else flags.push('missing-year');
  if (fields.title) { score += 2; evidence.push('prepoznat naslov'); } else flags.push('missing-title');
  if (fields.doi || fields.url) { score += 1; evidence.push('prepoznat DOI ili URL'); }
  if (rawText.length > 25) score += 1;
  const value: BibliographyConfidence = score >= 6 ? 'high' : score >= 4 ? 'medium' : 'low';
  if (value !== 'high') flags.push('manual-review');
  return { value, evidence, flags };
}

export function analyzeBibliographyStructure(
  paragraphs: Array<{ index: number; text: string; headingLevel?: number | null }>,
  language: string = 'hr',
): BibliographyStructure {
  const refData = extractReferences(paragraphs, language);
  const citationParagraphs = refData.start > 0
    ? paragraphs.slice(0, Math.max(0, refData.start - 1))
    : paragraphs;
  const citations = extractCitations(citationParagraphs);
  const entries: BibliographyEntry[] = [];

  for (const reference of refData.entries) {
    const paragraphIndices = [Number(reference.p)].filter((n) => Number.isInteger(n) && n > 0);
    const rawText = String(reference.text || '').trim();
    const parsed = parseReference(rawText, 'auto');
    const fields = parsed.fields || {};
    const author = firstAuthor(fields, reference.author || '');
    const year = String(fields.year || reference.year || '').toLowerCase();
    const quality = confidence(fields, rawText);
    const key = canonical(rawText);
    entries.push({
      id: `bibliography-${paragraphIndices[0]}`,
      paragraphIndices,
      anchorFingerprint: bibliographyAnchorFingerprint(paragraphIndices, rawText),
      rawText,
      fields,
      sourceType: parsed.type,
      confidence: quality.value,
      exactKey: key,
      ...(author && year ? { authorYearKey: `${author}|${year}` } : {}),
      cited: citations.some((citation) => citationMatches(author, year, citation)),
      evidence: [...quality.evidence, ...(parsed.lowConfidence ? ['parser označio zapis kao nesiguran'] : [])],
      flags: [...quality.flags, ...(parsed.type === 'propis' ? ['legal-source'] : []), ...(fields.url ? ['online-source'] : [])],
    });
  }

  const grouped = new Map<string, BibliographyEntry[]>();
  for (const entry of entries) (grouped.get(entry.exactKey) ?? (grouped.set(entry.exactKey, []), grouped.get(entry.exactKey)!)).push(entry);
  const duplicateGroups = [...grouped.values()].filter((group) => group.length > 1).map((group) => group.map((entry) => entry.id));
  const authorYearMap = new Map<string, BibliographyEntry[]>();
  for (const entry of entries) if (entry.authorYearKey) (authorYearMap.get(entry.authorYearKey) ?? (authorYearMap.set(entry.authorYearKey, []), authorYearMap.get(entry.authorYearKey)!)).push(entry);
  const authorYearGroups = [...authorYearMap.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([authorYearKey, group]) => ({
      authorYearKey,
      entryIds: group.map((entry) => entry.id),
      suffixes: group.map((_entry, index) => String.fromCharCode(97 + index)),
    }));
  const order = entries.map((entry) => firstAuthor(entry.fields, '') || canonical(entry.rawText));
  const sorted = [...order].sort((a, b) => a.localeCompare(b, language === 'en' ? 'en' : 'hr'));
  const alphabetical = { expected: order.every((value, index) => value === sorted[index]), order };
  const missingFromBibliography = citations
    .filter((citation) => !entries.some((entry) => citationMatches(firstAuthor(entry.fields, ''), String(entry.fields.year || ''), citation)))
    .map((citation) => ({ author: String(citation.author || ''), year: String(citation.year || ''), paragraphIndex: Number(citation.p || 0) }));
  const uncitedEntryIds = entries.filter((entry) => !entry.cited && !!entry.authorYearKey).map((entry) => entry.id);
  const incompleteEntryIds = entries.filter((entry) => entry.flags.some((flag) => ['missing-author', 'missing-year', 'missing-title'].includes(flag))).map((entry) => entry.id);
  const warnings: string[] = [];
  if (!alphabetical.expected && entries.length > 1) warnings.push('Bibliografija nije abecedno poredana.');
  if (duplicateGroups.length) warnings.push(`Pronađeno je ${duplicateGroups.length} grupa potpuno identičnih duplikata.`);
  if (authorYearGroups.length) warnings.push(`Pronađeno je ${authorYearGroups.length} grupa istog autora i godine za moguće a/b/c oznake.`);
  if (missingFromBibliography.length) warnings.push(`${missingFromBibliography.length} citatnica nema sigurno podudaranje u bibliografiji.`);
  if (uncitedEntryIds.length) warnings.push(`${uncitedEntryIds.length} bibliografskih zapisa nema pronađenu citatnicu.`);
  return {
    startParagraphIndex: refData.start >= 0 ? refData.start + 1 : null,
    endParagraphIndex: entries.length ? entries.at(-1)?.paragraphIndices.at(-1) ?? null : null,
    entries,
    duplicateGroups,
    authorYearGroups,
    alphabetical,
    missingFromBibliography,
    uncitedEntryIds,
    incompleteEntryIds,
    warnings,
    safeActions: [
      'sort-alphabetically', 'remove-exact-duplicates', 'hanging-indent', 'normalize-spacing',
      'normalize-doi', 'normalize-url', 'remove-url-terminal-punctuation',
    ],
    confirmationActions: ['merge-similar', 'enrich-metadata', 'add-missing-reference', 'remove-uncited', 'rewrite-style', 'author-order', 'author-year-suffixes'],
    summary: {
      total: entries.length,
      highConfidence: entries.filter((entry) => entry.confidence === 'high').length,
      review: entries.filter((entry) => entry.confidence !== 'high').length,
      duplicates: duplicateGroups.length,
      uncited: uncitedEntryIds.length,
    },
  };
}
