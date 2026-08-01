import { extractCitationOccurrences, type CitationOccurrenceDetail } from '../citations/author-year';
import type { CitationSyncRules } from '../profiles/profile-schema';
import { normalize } from '../utils/helpers';
import type { BibliographyEntry, BibliographyStructure } from './bibliography-structure';

export type SyncConfidence = 'high' | 'medium' | 'low';

export interface CitationOccurrence {
  id: string;
  paragraphIndex: number;
  start: number;
  end: number;
  rawText: string;
  author: string;
  year: string;
  suffix?: string;
  locator?: { label: string; value: string };
  directQuote: boolean;
  anchorFingerprint: string;
  confidence: SyncConfidence;
  evidence: string[];
}

export type CitationBibliographyLinkStatus =
  | 'matched'
  | 'missing'
  | 'ambiguous'
  | 'author-year-mismatch'
  | 'duplicate-candidate';

export interface CitationBibliographyLink {
  citationId: string;
  bibliographyEntryId?: string;
  status: CitationBibliographyLinkStatus;
  confidence: SyncConfidence;
  candidates: string[];
  reason: string;
}

export interface CitationBibliographySync {
  citations: CitationOccurrence[];
  links: CitationBibliographyLink[];
  missingEntries: CitationOccurrence[];
  duplicateCandidates: Array<{ entryIds: string[]; confidence: 'medium' | 'low'; reason: string }>;
  authorYearGroups: Array<{
    author: string;
    year: string;
    entryIds: string[];
    citationIds: string[];
    suggestedSuffixes: string[];
  }>;
  pageIssues: Array<{ citationId: string; paragraphIndex: number; rawText: string; reason: string }>;
  summary: {
    citations: number;
    matched: number;
    missing: number;
    ambiguous: number;
    duplicates: number;
    pageIssues: number;
  };
}

function hash(value: string): string {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function citationAnchorFingerprint(paragraphIndex: number, text: string): string {
  return `citation-${hash(`${paragraphIndex}|${normalize(text)}`)}`;
}

function authorKey(value: unknown): string {
  const raw = String(value || '').replace(/\bet\s+al\.?\b|\bi\s+dr\.?\b/gi, '').trim();
  const first = raw.split(/[;,]/)[0].split(/\s+(?:i|and|&)\s+/i)[0].trim();
  return normalize(first || raw);
}

function yearParts(value: unknown): { year: string; suffix?: string } {
  const match = String(value || '').match(/((?:18|19|20)\d{2})([a-z]?)/i);
  return match ? { year: match[1], ...(match[2] ? { suffix: match[2].toLowerCase() } : {}) } : { year: '' };
}

function entryAuthor(entry: BibliographyEntry): string {
  if (entry.authorYearKey) return entry.authorYearKey.split('|')[0] || '';
  return authorKey(entry.fields.authors);
}

function entryYear(entry: BibliographyEntry): { year: string; suffix?: string } {
  const fromFields = yearParts(entry.fields.year);
  if (fromFields.year) return fromFields;
  return yearParts(entry.rawText);
}

function detailToOccurrence(detail: CitationOccurrenceDetail, paragraphText: string): CitationOccurrence {
  const id = `citation-${detail.paragraphIndex}-${detail.start}-${hash(detail.rawText)}`;
  const evidence = [detail.form === 'parenthetical' ? 'prepoznata autor-godina zagrada' : 'prepoznat narativni autor-godina obrazac', 'pronađen raspon teksta'];
  if (detail.locator) evidence.push('pronađen lokator stranice');
  if (detail.directQuote) evidence.push('citat je uz pouzdano prepoznate navodnike');
  return {
    id,
    paragraphIndex: detail.paragraphIndex,
    start: detail.start,
    end: detail.end,
    rawText: detail.rawText,
    author: detail.author,
    year: detail.year,
    ...(detail.suffix ? { suffix: detail.suffix } : {}),
    ...(detail.locator ? { locator: detail.locator } : {}),
    directQuote: detail.directQuote,
    anchorFingerprint: citationAnchorFingerprint(detail.paragraphIndex, paragraphText),
    confidence: detail.author && detail.year ? 'high' : 'medium',
    evidence,
  };
}

function citationCandidates(citation: CitationOccurrence, entries: BibliographyEntry[]): {
  exact: BibliographyEntry[];
  sameYear: BibliographyEntry[];
} {
  const author = authorKey(citation.author);
  const citationYear = yearParts(citation.year);
  const sameYear = entries.filter((entry) => {
    const year = entryYear(entry);
    return year.year === citationYear.year && !!year.year;
  });
  const exact = sameYear.filter((entry) => {
    if (entryAuthor(entry) !== author) return false;
    const year = entryYear(entry);
    return !citation.suffix || !year.suffix || citation.suffix === year.suffix;
  });
  return { exact, sameYear };
}

function syncDuplicateCandidates(structure: BibliographyStructure): CitationBibliographySync['duplicateCandidates'] {
  return structure.duplicateGroups.map((entryIds) => ({
    entryIds,
    confidence: 'medium',
    reason: 'Zapisi imaju potpuno isti normalizirani sadržaj.',
  }));
}

export function analyzeCitationBibliographySync(
  paragraphs: Array<{ index: number; text: string; cell?: unknown }>,
  structure: BibliographyStructure,
  rules?: CitationSyncRules,
): CitationBibliographySync {
  const referenceStart = structure.startParagraphIndex ?? Number.POSITIVE_INFINITY;
  const citationParagraphs = paragraphs.filter((paragraph) => paragraph.index < referenceStart && !paragraph.cell);
  const citations = extractCitationOccurrences(citationParagraphs).map((detail) => {
    const paragraph = citationParagraphs.find((candidate) => candidate.index === detail.paragraphIndex);
    return detailToOccurrence(detail, paragraph?.text || '');
  });
  const links: CitationBibliographyLink[] = [];
  for (const citation of citations) {
    const { exact, sameYear } = citationCandidates(citation, structure.entries);
    if (exact.length === 1) {
      links.push({ citationId: citation.id, bibliographyEntryId: exact[0].id, status: 'matched', confidence: 'high', candidates: [exact[0].id], reason: 'Autor i godina imaju jedno sigurno podudaranje u literaturi.' });
    } else if (exact.length > 1) {
      const duplicate = exact.some((entry) => structure.duplicateGroups.some((group) => group.includes(entry.id)));
      links.push({ citationId: citation.id, status: duplicate ? 'duplicate-candidate' : 'ambiguous', confidence: 'low', candidates: exact.map((entry) => entry.id), reason: duplicate ? 'Više kandidata izgleda kao isti izvor.' : 'Isti autor i godina imaju više mogućih zapisa.' });
    } else if (sameYear.length > 0) {
      links.push({ citationId: citation.id, status: 'author-year-mismatch', confidence: 'medium', candidates: sameYear.map((entry) => entry.id), reason: 'Godina postoji u literaturi, ali autor se ne podudara.' });
    } else {
      links.push({ citationId: citation.id, status: 'missing', confidence: 'medium', candidates: [], reason: 'Nije pronađen bibliografski zapis s istim autorom i godinom.' });
    }
  }

  const citationsByKey = new Map<string, CitationOccurrence[]>();
  for (const citation of citations) {
    const key = `${authorKey(citation.author)}|${yearParts(citation.year).year}`;
    const group = citationsByKey.get(key) || [];
    group.push(citation);
    citationsByKey.set(key, group);
  }
  const authorYearGroups = structure.authorYearGroups.map((group) => {
    const [author, year] = group.authorYearKey.split('|');
    const matchingCitations = citationsByKey.get(`${author}|${year}`) || [];
    return { author, year, entryIds: group.entryIds, citationIds: matchingCitations.map((citation) => citation.id), suggestedSuffixes: group.suffixes };
  });

  const pageIssues = rules?.requirePageForDirectQuotes
    ? citations.filter((citation) => citation.directQuote && !citation.locator).map((citation) => ({ citationId: citation.id, paragraphIndex: citation.paragraphIndex, rawText: citation.rawText, reason: `Izravni citat nema lokator (${rules.pageLabel || 'str.'}).` }))
    : [];
  const missingEntries = citations.filter((citation) => links.find((link) => link.citationId === citation.id)?.status === 'missing');
  return {
    citations,
    links,
    missingEntries,
    duplicateCandidates: syncDuplicateCandidates(structure),
    authorYearGroups,
    pageIssues,
    summary: {
      citations: citations.length,
      matched: links.filter((link) => link.status === 'matched').length,
      missing: links.filter((link) => link.status === 'missing').length,
      ambiguous: links.filter((link) => link.status === 'ambiguous' || link.status === 'author-year-mismatch').length,
      duplicates: structure.duplicateGroups.length,
      pageIssues: pageIssues.length,
    },
  };
}
