import { extractBodyParagraphs, paragraphFingerprint, xmlDecode } from './typography-structure.ts';

export type RequiredSectionKind =
  | 'summary-hr'
  | 'abstract'
  | 'keywords-hr'
  | 'keywords-en'
  | 'originality-statement'
  | 'abbreviation-list'
  | 'figure-list'
  | 'table-list'
  | 'appendices';

export type RequiredSectionConfidence = 'high' | 'medium' | 'low';
export type RequiredSectionContentPolicy = 'none' | 'placeholder' | 'verified-statement';

export interface RequiredSectionRules {
  order: RequiredSectionKind[];
  labels: Partial<Record<RequiredSectionKind, string>>;
  aliases?: Partial<Record<RequiredSectionKind, string[]>>;
  headingLevel?: Partial<Record<RequiredSectionKind, number>>;
  numbered?: Partial<Record<RequiredSectionKind, boolean>>;
  styleId?: Partial<Record<RequiredSectionKind, string>>;
  contentPolicy?: Partial<Record<RequiredSectionKind, RequiredSectionContentPolicy>>;
  statementText?: Partial<Record<RequiredSectionKind, string>>;
  placeholderText?: Partial<Record<RequiredSectionKind, string>>;
  addComment?: boolean;
}

export interface RequiredSectionProfileEntry {
  key?: string;
  label: string;
  terms?: string[];
  aliases?: string[];
  required?: boolean;
}

export interface RequiredSectionCandidate {
  id: string;
  kind: RequiredSectionKind;
  label: string;
  aliases: string[];
  confidence: RequiredSectionConfidence;
  present: boolean;
  insertionAnchor?: { paragraphIndex: number; anchorFingerprint: string; position: 'before' | 'after' };
  headingLevel: number;
  styleId?: string;
  numbered: boolean;
  contentPolicy: RequiredSectionContentPolicy;
  verifiedStatement?: string;
  evidence: string[];
  warnings: string[];
}

export interface RequiredSectionsStructure {
  version: 1;
  candidates: RequiredSectionCandidate[];
  warnings: string[];
  skipped: Array<{ part: string; paragraphIndex?: number; reason: string }>;
  summary: { required: number; present: number; missing: number; high: number; medium: number; low: number; text: string };
}

interface ParagraphLike { index: number; text: string; headingLevel?: number | null; }
interface ElementLists { lists?: { table?: boolean; figure?: boolean; chart?: boolean } }

const BUILTIN: Record<RequiredSectionKind, { label: string; aliases: string[] }> = {
  'summary-hr': { label: 'Sažetak', aliases: ['sažetak', 'sazetak', 'summary'] },
  abstract: { label: 'Abstract', aliases: ['abstract'] },
  'keywords-hr': { label: 'Ključne riječi', aliases: ['ključne riječi', 'kljucne rijeci', 'ključne rijeci'] },
  'keywords-en': { label: 'Keywords', aliases: ['keywords', 'key words'] },
  'originality-statement': { label: 'Izjava o izvornosti', aliases: ['izjava o izvornosti', 'izjava o akademskoj čestitosti', 'akademska čestitost'] },
  'abbreviation-list': { label: 'Popis kratica', aliases: ['popis kratica', 'list of abbreviations', 'abbreviations'] },
  'figure-list': { label: 'Popis slika', aliases: ['popis slika', 'list of figures', 'figures'] },
  'table-list': { label: 'Popis tablica', aliases: ['popis tablica', 'list of tables', 'tables'] },
  appendices: { label: 'Prilozi', aliases: ['prilozi', 'prilog', 'appendices', 'appendix', 'dodatak', 'dodaci', 'privitak'] },
};

function normalize(value: string): string {
  return value.toLocaleLowerCase('hr-HR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `required-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function kindForKey(value: string): RequiredSectionKind | undefined {
  const key = normalize(value).replace(/ /g, '-');
  const aliases: Record<string, RequiredSectionKind> = {
    sazetak: 'summary-hr', summary: 'summary-hr', 'summary-hr': 'summary-hr', abstract: 'abstract',
    'kljucne-rijeci': 'keywords-hr', keywords: 'keywords-en', 'keywords-en': 'keywords-en',
    'izjava-o-izvornosti': 'originality-statement', 'originality-statement': 'originality-statement', 'popis-kratica': 'abbreviation-list', 'abbreviation-list': 'abbreviation-list',
    'popis-slika': 'figure-list', 'figure-list': 'figure-list', 'popis-tablica': 'table-list', 'table-list': 'table-list', prilozi: 'appendices', appendices: 'appendices',
  };
  return aliases[key];
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => xmlDecode(m[1])).join('');
}

function isHeading(xml: string, paragraph: ParagraphLike): boolean {
  if (paragraph.headingLevel && paragraph.headingLevel >= 1) return true;
  return /<w:pStyle\b[^>]*w:val=["'](?:Heading|Naslov)[1-9]["']/i.test(xml) || (paragraph.text.trim().length > 0 && paragraph.text.trim().length < 100 && !/[.!?]$/.test(paragraph.text.trim()));
}

function defaultOrder(profile: RequiredSectionProfileEntry[] | undefined): RequiredSectionKind[] {
  const fromProfile = (profile ?? []).filter((x) => x.required !== false).map((x) => kindForKey(x.key ?? x.label)).filter((x): x is RequiredSectionKind => !!x);
  return [...new Set(fromProfile)];
}

function labelAliases(kind: RequiredSectionKind, rules?: RequiredSectionRules, profile?: RequiredSectionProfileEntry): { label: string; aliases: string[] } {
  const base = BUILTIN[kind];
  const label = rules?.labels?.[kind] ?? profile?.label ?? base.label;
  const aliases = [...new Set([...(base.aliases ?? []), ...(profile?.terms ?? []), ...(profile?.aliases ?? []), ...(rules?.aliases?.[kind] ?? []), label])];
  return { label, aliases };
}

function findAnchor(index: number, paragraphs: ParagraphLike[], ranges: ReturnType<typeof extractBodyParagraphs>, existing: number[]): RequiredSectionCandidate['insertionAnchor'] | undefined {
  const next = existing.find((x) => x > index);
  if (next !== undefined && ranges[next - 1]) return { paragraphIndex: next, anchorFingerprint: ranges[next - 1].fingerprint, position: 'before' };
  const previous = [...existing].reverse().find((x) => x < index);
  if (previous !== undefined && ranges[previous - 1]) return { paragraphIndex: previous, anchorFingerprint: ranges[previous - 1].fingerprint, position: 'after' };
  const fallback = paragraphs.find((p) => p.index >= index) ?? paragraphs.at(-1);
  const range = fallback ? ranges[fallback.index - 1] : undefined;
  return range ? { paragraphIndex: fallback!.index, anchorFingerprint: range.fingerprint, position: fallback!.index >= index ? 'before' : 'after' } : undefined;
}

export function analyzeRequiredSectionsStructure(input: {
  documentXml: string;
  paragraphs: ParagraphLike[];
  profileRequiredSections?: RequiredSectionProfileEntry[];
  rules?: RequiredSectionRules;
  elementStructure?: ElementLists;
}): RequiredSectionsStructure {
  const ranges = extractBodyParagraphs(input.documentXml);
  const paragraphs = input.paragraphs.filter((p) => Number.isInteger(p.index)).map((p) => ({ ...p, text: String(p.text ?? '') }));
  const profileMap = new Map((input.profileRequiredSections ?? []).map((x) => [kindForKey(x.key ?? x.label) ?? kindForKey(x.label), x]));
  const order = input.rules?.order?.length ? input.rules.order : defaultOrder(input.profileRequiredSections);
  const headings = paragraphs.filter((p) => isHeading(ranges[p.index - 1]?.xml ?? '', p));
  const foundKinds = new Map<RequiredSectionKind, number>();
  const warnings: string[] = [];
  const skipped: RequiredSectionsStructure['skipped'] = [];
  for (const kind of order) {
    const { aliases } = labelAliases(kind, input.rules, profileMap.get(kind));
    const normalized = aliases.map(normalize);
    const matches = headings.filter((p) => normalized.some((a) => normalize(p.text) === a || normalize(p.text).startsWith(`${a} `)));
    if (matches.length === 1) foundKinds.set(kind, matches[0].index);
    else if (matches.length > 1) warnings.push(`${BUILTIN[kind].label}: pronađeno je više mogućih naslova`);
  }
  const candidates: RequiredSectionCandidate[] = [];
  const existingIndices = [...foundKinds.values()].sort((a, b) => a - b);
  for (const kind of order) {
    const profile = profileMap.get(kind);
    const { label, aliases } = labelAliases(kind, input.rules, profile);
    const existingIndex = foundKinds.get(kind);
    const present = existingIndex !== undefined || (kind === 'figure-list' && input.elementStructure?.lists?.figure === true && headings.some((p) => normalize(p.text).includes('popis slika')))
      || (kind === 'table-list' && input.elementStructure?.lists?.table === true && headings.some((p) => normalize(p.text).includes('popis tablica')));
    const headingLevel = input.rules?.headingLevel?.[kind] ?? 1;
    const styleId = input.rules?.styleId?.[kind];
    const numbered = input.rules?.numbered?.[kind] ?? false;
    const contentPolicy = input.rules?.contentPolicy?.[kind] ?? ((kind === 'originality-statement' && input.rules?.statementText?.[kind]) ? 'verified-statement' : 'none');
    const verifiedStatement = contentPolicy === 'verified-statement' ? input.rules?.statementText?.[kind] : undefined;
    let confidence: RequiredSectionConfidence = present ? 'high' : 'medium';
    let insertionAnchor: RequiredSectionCandidate['insertionAnchor'];
    const evidence: string[] = present ? ['pronađen je jedinstveni naslov ili postojeća struktura'] : ['dio nije pronađen među body-level naslovima'];
    const candidateWarnings: string[] = [];
    if (!present) {
      const anchorIndex = kind === 'appendices' ? (paragraphs.at(-1)?.index ?? 1) : (foundKinds.get(order.find((x) => order.indexOf(x) > order.indexOf(kind)) ?? kind) ?? paragraphs.find((p) => /\b(?:uvod|introduction)\b/i.test(normalize(p.text)))?.index ?? paragraphs.at(-1)?.index ?? 1);
      insertionAnchor = findAnchor(anchorIndex, paragraphs, ranges, existingIndices);
      if (!insertionAnchor) { confidence = 'low'; candidateWarnings.push('nije pronađeno sigurno body-level sidro za umetanje'); }
      if (warnings.some((w) => w.startsWith(label))) { confidence = 'low'; insertionAnchor = undefined; candidateWarnings.push('više mogućih sidara'); }
    }
    candidates.push({ id: hash(`${kind}:${label}`), kind, label, aliases, confidence, present, ...(insertionAnchor ? { insertionAnchor } : {}), headingLevel, ...(styleId ? { styleId } : {}), numbered, contentPolicy, ...(verifiedStatement ? { verifiedStatement } : {}), evidence, warnings: candidateWarnings });
  }
  const complex = input.documentXml.match(/<w:(?:txbxContent|customXml)\b/gi)?.length ?? 0;
  if (complex) skipped.push({ part: 'word/document.xml', reason: 'dokument sadrži tekstualne okvire ili customXml strukture; analizirana su samo izravna body-level sidra' });
  const present = candidates.filter((x) => x.present).length;
  const missing = candidates.length - present;
  const high = candidates.filter((x) => x.confidence === 'high').length;
  const medium = candidates.filter((x) => x.confidence === 'medium').length;
  const low = candidates.length - high - medium;
  return { version: 1, candidates, warnings, skipped, summary: { required: candidates.length, present, missing, high, medium, low, text: missing ? `Nedostaju ${candidates.filter((x) => !x.present).map((x) => x.label).join(', ')}.` : 'Svi profilno obvezni dijelovi su pronađeni.' } };
}
