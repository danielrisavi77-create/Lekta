import { editableNodes, extractBodyParagraphs, paragraphFingerprint, xmlDecode } from './typography-structure.ts';

export type ConsistencyZone =
  | 'terminology'
  | 'person'
  | 'institution'
  | 'citation'
  | 'bibliography'
  | 'document-metadata'
  | 'element-label'
  | 'heading-language';

export type ConsistencyConfidence = 'high' | 'medium' | 'low';

export interface ConsistencyVariantOccurrence {
  part: string;
  paragraphIndex?: number;
  start?: number;
  end?: number;
  anchorFingerprint: string;
}

export interface ConsistencyVariant {
  text: string;
  count: number;
  occurrences: ConsistencyVariantOccurrence[];
}

export interface ConsistencyGroup {
  id: string;
  zone: ConsistencyZone;
  label: string;
  variants: ConsistencyVariant[];
  suggestedCanonical?: string;
  confidence: ConsistencyConfidence;
  evidence: string[];
  requiresConfirmation: true;
}

export interface ConsistencyMetadataMismatch {
  id: string;
  field: string;
  documentValue: string;
  observedValues: string[];
  occurrences: ConsistencyVariantOccurrence[];
  confidence: ConsistencyConfidence;
  evidence: string[];
}

export interface ConsistencyRules {
  preferredLanguage?: 'hr' | 'en';
  preferredTerms?: Record<string, string>;
  preferredLabels?: { table?: string; figure?: string; chart?: string };
  protectedTerms?: string[];
  allowAbbreviationEquivalence?: boolean;
}

export interface ConsistencyStructure {
  version: 1;
  groups: ConsistencyGroup[];
  metadataMismatches: ConsistencyMetadataMismatch[];
  skipped: Array<{ part: string; paragraphIndex?: number; reason: string }>;
  summary: {
    groups: number;
    variants: number;
    occurrences: number;
    high: number;
    medium: number;
    low: number;
    byZone: Partial<Record<ConsistencyZone, number>>;
    text: string;
  };
}

export interface ConsistencyAnalysisInput {
  documentXml: string;
  packageXmlParts?: Record<string, string>;
  paragraphs?: Array<{ index: number; text: string; headingLevel?: number | null }>;
  bibliographyStructure?: unknown;
  citationBibliographySync?: unknown;
  elementStructure?: unknown;
  rules?: ConsistencyRules;
}

interface Candidate {
  text: string;
  zone: ConsistencyZone;
  key: string;
  confidence: ConsistencyConfidence;
  evidence: string[];
  occurrence: ConsistencyVariantOccurrence;
}

const KNOWN_ALIAS_KEYS: Record<string, string> = {
  tablica: 'element-label:table',
  tabela: 'element-label:table',
  slika: 'element-label:figure',
  figure: 'element-label:figure',
  grafikon: 'element-label:chart',
  chart: 'element-label:chart',
};

const ORGANIZATION_SUFFIXES = new Set([
  'agencija', 'banka', 'centar', 'država', 'drzava', 'fakultet', 'institut', 'ministarstvo',
  'odjel', 'sveučilište', 'sveuciliste', 'unija', 'ustanova', 'zavod', 'škola', 'skola',
]);

const HEADING_TERMS: Record<'hr' | 'en', string[]> = {
  hr: ['uvod', 'zaključak', 'zakljucak', 'metodologija', 'rezultati', 'rasprava', 'literatura', 'sažetak', 'sazetak'],
  en: ['introduction', 'conclusion', 'methodology', 'results', 'discussion', 'references', 'abstract'],
};

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return `consistency-${(result >>> 0).toString(16).padStart(8, '0')}`;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('hr').replace(/[„“”‚‘’«»"'`]/g, '').replace(/[.\-‐‑‒–—_]/g, '').replace(/\s+/g, ' ').trim();
}

function compact(value: string): string { return normalize(value).replace(/[^\p{L}\p{N}]/gu, ''); }

function words(value: string): string[] { return value.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []; }

function acronymSignature(value: string): string {
  const ignored = new Set(['a', 'and', 'i', 'of', 'the', 'u', 'u', 'za', 'od', 'i']);
  return words(value).filter((word) => !ignored.has(normalize(word))).map((word) => normalize(word)[0] ?? '').join('');
}

function isAcronym(value: string): boolean {
  return /^(?:[A-ZČĆĐŠŽ]{2,}|[A-ZČĆĐŠŽ](?:\.[A-ZČĆĐŠŽ])+\.?|[A-ZČĆĐŠŽ]{2,}[-‐‑]\d+)$/u.test(value.trim());
}

function isProtectedParagraph(xml: string): string | null {
  if (/<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent|customXml)\b|<(?:m:oMath)\b/i.test(xml)) return 'složena Word struktura';
  return null;
}

function isRiskyText(value: string): boolean {
  return /(?:https?:\/\/|www\.|doi\.org|\bdoi:\s*10\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|```|<\/?[A-Za-z])/i.test(value);
}

function candidateZone(text: string): { zone: ConsistencyZone; evidence: string[] } | null {
  const normalized = normalize(text);
  const first = normalize(words(text)[0] ?? '');
  if (KNOWN_ALIAS_KEYS[first]) return { zone: KNOWN_ALIAS_KEYS[first].split(':')[1] === 'table' ? 'element-label' : 'element-label', evidence: ['poznata varijanta oznake elementa'] };
  if (/^(?:slika|figure|grafikon|chart|tablica|tabela)\s*\d+/i.test(text)) return { zone: 'element-label', evidence: ['prepoznat natpis elementa'] };
  if (/^(?:COVID|Covid|covid)[\s-]?\d+$/i.test(text) || isAcronym(text)) return { zone: 'terminology', evidence: ['akronim ili standardizirana oznaka'] };
  const tokenWords = words(text).map(normalize);
  if (tokenWords.some((word) => ORGANIZATION_SUFFIXES.has(word))) return { zone: 'institution', evidence: ['naziv završava uobičajenim nazivom ustanove'] };
  if (tokenWords.length >= 2 && tokenWords.length <= 6 && tokenWords.every((word) => /^[\p{L}]+$/u.test(word)) && /^[A-ZČĆĐŠŽ]/u.test(text)) return { zone: 'person', evidence: ['višečlani vlastiti naziv'] };
  if (normalized.length >= 4 && /^[A-ZČĆĐŠŽ]/u.test(text) && tokenWords.length >= 2) return { zone: 'terminology', evidence: ['ponavljani termin s velikim početnim slovom'] };
  return null;
}

function addCandidate(candidates: Candidate[], text: string, zone: ConsistencyZone, confidence: ConsistencyConfidence, evidence: string[], occurrence: ConsistencyVariantOccurrence, key?: string): void {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120 || isRiskyText(trimmed)) return;
  candidates.push({ text: trimmed, zone, key: key ?? compact(trimmed), confidence, evidence, occurrence });
}

function collectBodyCandidates(input: ConsistencyAnalysisInput): { candidates: Candidate[]; skipped: ConsistencyStructure['skipped'] } {
  const candidates: Candidate[] = [];
  const skipped: ConsistencyStructure['skipped'] = [];
  if (/<w:tbl\b/i.test(input.documentXml)) skipped.push({ part: 'word/document.xml', reason: 'odlomci unutar tablice nisu podržani u V1' });
  for (const paragraph of extractBodyParagraphs(input.documentXml)) {
    const protectedReason = isProtectedParagraph(paragraph.xml);
    if (protectedReason) { skipped.push({ part: 'word/document.xml', paragraphIndex: paragraph.index, reason: protectedReason }); continue; }
    const nodes = editableNodes(paragraph.xml);
    for (const node of nodes) {
      if (node.kind !== 'text' || isRiskyText(node.text ?? '')) continue;
      const text = node.text ?? '';
      const occurrenceBase = { part: 'word/document.xml', paragraphIndex: paragraph.index, anchorFingerprint: paragraphFingerprint(paragraph.xml) };
      for (const match of text.matchAll(/(?<![\p{L}\p{N}])(?:[A-ZČĆĐŠŽ]{2,}(?:[.][A-ZČĆĐŠŽ]+)*\.?|[A-ZČĆĐŠŽ](?:\.[A-ZČĆĐŠŽ])+\.?|(?:COVID|Covid|covid)[\s-]?\d+)(?=$|[^\p{L}\p{N}])/gu)) {
        const value = match[0];
        const zone = candidateZone(value) ?? { zone: 'terminology' as const, evidence: ['prepoznata standardizirana oznaka'] };
        addCandidate(candidates, value, zone.zone, 'high', zone.evidence, { ...occurrenceBase, start: match.index ?? 0, end: (match.index ?? 0) + value.length }, `token:${compact(value)}`);
      }
      for (const match of text.matchAll(/\b(?:[A-ZČĆĐŠŽ][\p{L}]+(?:\s+[a-zčćđšž][\p{L}]+){0,2}\s+)?[A-ZČĆĐŠŽ][\p{L}]+(?:\s+[A-ZČĆĐŠŽ][\p{L}]+){0,4}\b/gu)) {
        const value = match[0].trim();
        const zone = candidateZone(value);
        if (!zone) continue;
        const confidence: ConsistencyConfidence = zone.zone === 'person' || zone.zone === 'institution' ? 'medium' : 'high';
        addCandidate(candidates, value, zone.zone, confidence, zone.evidence, { ...occurrenceBase, start: match.index ?? 0, end: (match.index ?? 0) + value.length }, `phrase:${compact(value)}`);
      }
      for (const match of text.matchAll(/\b[A-ZČĆĐŠŽ][\p{L}]+(?:\s+[a-zčćđšž][\p{L}]+){1,3}\b/gu)) {
        const value = match[0].replace(/\s+(?:i|u|za|od)$/i, '').trim();
        const zone = candidateZone(value);
        if (!zone || words(value).length < 2) continue;
        addCandidate(candidates, value, zone.zone, 'medium', zone.evidence, { ...occurrenceBase, start: match.index ?? 0, end: (match.index ?? 0) + value.length }, `phrase:${compact(value)}`);
      }
      for (const match of text.matchAll(/\b(?:Tablica|Tabela|Slika|Figure|Grafikon|Chart)\b/gu)) {
        const value = match[0];
        addCandidate(candidates, value, 'element-label', 'high', ['poznata varijanta oznake elementa'], { ...occurrenceBase, start: match.index ?? 0, end: (match.index ?? 0) + value.length }, `label:${KNOWN_ALIAS_KEYS[value.toLocaleLowerCase('hr')] ?? value.toLocaleLowerCase('hr')}`);
      }
    }
  }
  return { candidates, skipped };
}

function collectHeadingCandidates(input: ConsistencyAnalysisInput): Candidate[] {
  const candidates: Candidate[] = [];
  for (const paragraph of input.paragraphs ?? []) {
    if (!paragraph.headingLevel || !paragraph.text.trim()) continue;
    const normalized = normalize(paragraph.text);
    const language = HEADING_TERMS.hr.some((term) => normalized.includes(term)) ? 'hr' : HEADING_TERMS.en.some((term) => normalized.includes(term)) ? 'en' : null;
    if (!language) continue;
    addCandidate(candidates, paragraph.text.trim(), 'heading-language', 'medium', [`prepoznat ${language === 'hr' ? 'hrvatski' : 'engleski'} naziv poglavlja`], { part: 'word/document.xml', paragraphIndex: paragraph.index, start: 0, end: paragraph.text.length, anchorFingerprint: hash(`heading:${paragraph.index}:${paragraph.text}`) }, 'heading-language');
  }
  return candidates;
}

function collectMetadataMismatches(input: ConsistencyAnalysisInput): ConsistencyMetadataMismatch[] {
  const core = input.packageXmlParts?.['docProps/core.xml'];
  if (!core) return [];
  const title = xmlDecode(core.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? '').trim();
  if (!title) return [];
  const front = (input.paragraphs ?? []).filter((paragraph) => paragraph.index <= 20 && paragraph.text.trim()).slice(0, 12);
  const candidates = front.filter((paragraph) => paragraph.text.trim().length >= 8 && !/^(?:sadržaj|sazetak|sažetak|uvod|mentor|student|godina|mesto|mjesto)\b/i.test(paragraph.text.trim()));
  const match = candidates.find((paragraph) => normalize(paragraph.text) === normalize(title));
  if (match) return [];
  const observed = candidates.slice(0, 5).map((paragraph) => paragraph.text.trim()).filter((text) => text !== title);
  if (!observed.length) return [];
  return [{ id: hash(`metadata:title:${title}:${observed.join('|')}`), field: 'dc:title', documentValue: title, observedValues: observed, occurrences: [{ part: 'docProps/core.xml', anchorFingerprint: paragraphFingerprint(core) }], confidence: 'medium', evidence: ['naslov u core.xml ne podudara se s prepoznatim prednjim tekstom'] }];
}

function buildGroups(candidates: Candidate[], rules?: ConsistencyRules): ConsistencyGroup[] {
  const buckets = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const alias = KNOWN_ALIAS_KEYS[normalize(candidate.text)];
    const acronym = isAcronym(candidate.text) ? compact(candidate.text) : words(candidate.text).length >= 2 ? acronymSignature(candidate.text) : '';
    const key = alias ?? (acronym.length >= 2 && (candidate.zone === 'terminology' || candidate.zone === 'institution') ? `acronym:${acronym}` : `${candidate.zone}:${candidate.key}`);
    const current = buckets.get(key) ?? [];
    current.push(candidate);
    buckets.set(key, current);
  }
  const groups: ConsistencyGroup[] = [];
  for (const [key, members] of buckets) {
    const byText = new Map<string, ConsistencyVariant>();
    for (const member of members) {
      const variant = byText.get(member.text) ?? { text: member.text, count: 0, occurrences: [] };
      variant.count += 1;
      variant.occurrences.push(member.occurrence);
      byText.set(member.text, variant);
    }
    if (byText.size < 2) continue;
    const variants = [...byText.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'hr'));
    const zone = members[0].zone;
    const preferred = Object.entries(rules?.preferredTerms ?? {}).find(([from]) => variants.some((variant) => normalize(variant.text) === normalize(from)))?.[1];
    const high = members.every((member) => member.confidence === 'high');
    groups.push({ id: hash(`${key}:${variants.map((variant) => variant.text).join('|')}`), zone, label: zone === 'element-label' ? 'Oznaka elementa' : zone === 'heading-language' ? 'Jezik naslova' : zone === 'institution' ? 'Naziv institucije' : zone === 'person' ? 'Ime ili autor' : 'Terminologija', variants, ...(preferred ? { suggestedCanonical: preferred } : {}), confidence: high ? 'high' : members.some((member) => member.confidence === 'medium') ? 'medium' : 'low', evidence: [...new Set(members.flatMap((member) => member.evidence))], requiresConfirmation: true });
  }
  return groups;
}

export function analyzeConsistencyStructure(input: ConsistencyAnalysisInput): ConsistencyStructure {
  const body = collectBodyCandidates(input);
  const candidates = [...body.candidates, ...collectHeadingCandidates(input)];
  const groups = buildGroups(candidates, input.rules);
  const metadataMismatches = collectMetadataMismatches(input);
  const byZone: Partial<Record<ConsistencyZone, number>> = {};
  for (const group of groups) byZone[group.zone] = (byZone[group.zone] ?? 0) + 1;
  const high = groups.filter((group) => group.confidence === 'high').length;
  const medium = groups.filter((group) => group.confidence === 'medium').length;
  const low = groups.filter((group) => group.confidence === 'low').length;
  const variants = groups.reduce((total, group) => total + group.variants.length, 0);
  const occurrences = groups.reduce((total, group) => total + group.variants.reduce((sum, variant) => sum + variant.count, 0), 0);
  return { version: 1, groups, metadataMismatches, skipped: body.skipped, summary: { groups: groups.length, variants, occurrences, high, medium, low, byZone, text: `${groups.length} grupa nedosljednosti, ${high} sigurnih, ${medium + low} traži potvrdu` } };
}
