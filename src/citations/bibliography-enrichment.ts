import { normalizeDoi, crossrefQueryUrl, crossrefWorksUrl } from './verify-existence';
import type { CitationInput } from '../tools/citation';
import { normalize } from '../utils/helpers';

export interface BibliographyEnrichmentInput {
  id: string;
  fields: Partial<CitationInput>;
}

export interface BibliographyEnrichmentQuery {
  id: string;
  authors?: string;
  title?: string;
  year?: string;
  container?: string;
  doi?: string;
}

export interface BibliographyEnrichmentCandidate {
  id: string;
  provider: 'crossref' | 'domestic-corpus';
  score: number;
  fields: Partial<CitationInput>;
  provenance: { url: string; label: string };
}

export function sanitizeBibliographyQuery(input: BibliographyEnrichmentInput): BibliographyEnrichmentQuery {
  const fields = input.fields || {};
  const clean = (value: unknown, max = 500) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
  return {
    id: String(input.id).slice(0, 200),
    ...(clean(fields.authors) ? { authors: clean(fields.authors) } : {}),
    ...(clean(fields.title, 1000) ? { title: clean(fields.title, 1000) } : {}),
    ...(clean(fields.year, 20) ? { year: clean(fields.year, 20) } : {}),
    ...(clean(fields.container) ? { container: clean(fields.container) } : {}),
    ...(clean(fields.doi, 300) ? { doi: normalizeDoi(clean(fields.doi, 300)) } : {}),
  };
}

export function buildDomesticCorpusPayload(inputs: BibliographyEnrichmentInput[]): { references: BibliographyEnrichmentQuery[] } {
  return { references: inputs.slice(0, 60).map(sanitizeBibliographyQuery).filter((query) => query.title || query.doi) };
}

export async function enrichWithDomesticCorpus(
  endpoint: string,
  inputs: BibliographyEnrichmentInput[],
  options: { consent: boolean; fetchImpl?: typeof fetch; signal?: AbortSignal } = { consent: false },
): Promise<BibliographyEnrichmentCandidate[]> {
  if (!endpoint || options.consent !== true) return [];
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) return [];
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildDomesticCorpusPayload(inputs)),
      signal: options.signal,
    });
    if (!response.ok) return [];
    const data = await response.json() as { candidates?: Array<{ id?: string; score?: number; fields?: Partial<CitationInput>; url?: string; label?: string }> };
    return (data.candidates || []).flatMap((candidate) => candidate.id && candidate.fields
      ? [{ id: candidate.id, provider: 'domestic-corpus' as const, score: Number(candidate.score) || 0, fields: candidate.fields, provenance: { url: String(candidate.url || endpoint), label: String(candidate.label || 'Domaći korpus') } }]
      : []);
  } catch {
    return [];
  }
}

export function buildCrossrefEnrichmentUrl(query: BibliographyEnrichmentQuery): string {
  if (query.doi) return crossrefWorksUrl(query.doi);
  return crossrefQueryUrl({ title: query.title, authors: query.authors, year: query.year, container: query.container });
}

function titleScore(left: string | undefined, right: string | undefined): number {
  const a = normalize(left), b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const words = new Set(a.split(/\s+/));
  const shared = b.split(/\s+/).filter((word) => words.has(word)).length;
  return shared / Math.max(words.size, b.split(/\s+/).length);
}

function crossrefFields(message: any): Partial<CitationInput> {
  const authors = Array.isArray(message?.author)
    ? message.author.map((author: any) => `${String(author?.family || '').trim()}${author?.given ? `, ${String(author.given).trim()}` : ''}`).filter(Boolean).join('; ')
    : '';
  const year = message?.issued?.['date-parts']?.[0]?.[0];
  return {
    ...(authors ? { authors } : {}),
    ...(Array.isArray(message?.title) && message.title[0] ? { title: String(message.title[0]) } : {}),
    ...(year ? { year: String(year) } : {}),
    ...(Array.isArray(message?.['container-title']) && message['container-title'][0] ? { container: String(message['container-title'][0]) } : {}),
    ...(message?.DOI ? { doi: normalizeDoi(String(message.DOI)) } : {}),
  };
}

export function candidateFromCrossref(query: BibliographyEnrichmentQuery, message: any): BibliographyEnrichmentCandidate | null {
  const fields = crossrefFields(message);
  if (!fields.title && !fields.doi) return null;
  return {
    id: query.id,
    provider: 'crossref',
    score: fields.doi && query.doi && normalizeDoi(fields.doi) === normalizeDoi(query.doi) ? 1 : titleScore(query.title, fields.title),
    fields,
    provenance: { url: fields.doi ? `https://doi.org/${normalizeDoi(fields.doi)}` : buildCrossrefEnrichmentUrl(query), label: 'Crossref' },
  };
}

type EnrichmentResponse = { ok: boolean; status: number; json: () => Promise<any> };
type FetchImpl = (url: string, init?: RequestInit) => Promise<EnrichmentResponse>;

export async function enrichWithCrossref(
  inputs: BibliographyEnrichmentInput[],
  options: { consent: boolean; fetchImpl?: FetchImpl; signal?: AbortSignal } = { consent: false },
): Promise<BibliographyEnrichmentCandidate[]> {
  if (options.consent !== true) return [];
  const fetchImpl = options.fetchImpl || (globalThis.fetch as unknown as FetchImpl);
  if (!fetchImpl) return [];
  const out: BibliographyEnrichmentCandidate[] = [];
  for (const input of inputs.slice(0, 60)) {
    const query = sanitizeBibliographyQuery(input);
    if (!query.title && !query.doi) continue;
    try {
      const response = await fetchImpl(buildCrossrefEnrichmentUrl(query), { headers: { Accept: 'application/json' }, signal: options.signal });
      if (!response.ok) continue;
      const data = await response.json();
      const messages = query.doi ? [data?.message] : (data?.message?.items || []);
      const candidates = messages.map((message: any) => candidateFromCrossref(query, message)).filter(Boolean) as BibliographyEnrichmentCandidate[];
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      if (best) out.push(best);
    } catch {
      // Mrežna nedostupnost nije dokaz da izvor ne postoji.
    }
  }
  return out;
}
