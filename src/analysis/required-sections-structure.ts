import { extractBodyParagraphs } from './typography-structure.ts';
import { anchorTextOfXml } from '../repair/anchor-text';

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
  insertionAnchor?: { paragraphIndex: number; anchorFingerprint: string; anchorText?: string; position: 'before' | 'after' };
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

/**
 * JEDINI matcher naslova prema aliasima. Koriste ga i analiza i `missingRequiredSectionLabels`.
 *
 * Postoji jer je prva izvedba "jednog izvora istine" bila neistinita: izraz je bio PREPISAN na dva
 * mjesta, a analiza pomocnu funkciju nikad nije ni zvala. Dva prepisa se onda mogu razici a da to
 * nitko ne primijeti, sto je i bio izvorni kvar.
 *
 * Prima SIROV tekst, jer skidanje numeracije mora vidjeti interpunkciju (vidi
 * `normalizedWithoutLeadingNumber`).
 */
function matchesAlias(rawText: string, normalizedAliases: readonly string[]): boolean {
  const text = normalize(rawText);
  const bare = normalizedWithoutLeadingNumber(rawText);
  return normalizedAliases.some((alias) => text === alias || text.startsWith(`${alias} `) || bare === alias || bare.startsWith(`${alias} `));
}

/**
 * Gruba procjena "je li ovo naslov" iz SAMOG TEKSTA, bez XML-a.
 *
 * Zrcali tekstualnu granu `isHeading`, da pozivatelj koji nema XML (generator krsenja) hrani
 * `missingRequiredSectionLabels` istom populacijom kao analiza. Bez toga su dva pozivatelja
 * davala suprotne presude nad istim dokumentom: dugi odlomak koji POCINJE rijecju `Sazetak`
 * analiza ne broji kao naslov, a generator jest.
 */
export function isHeadingLikeText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length < 100 && !/[.!?]$/.test(trimmed);
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

function isHeading(xml: string, paragraph: ParagraphLike): boolean {
  if (paragraph.headingLevel && paragraph.headingLevel >= 1) return true;
  return /<w:pStyle\b[^>]*w:val=["'](?:Heading|Naslov)[1-9]["']/i.test(xml) || (paragraph.text.trim().length > 0 && paragraph.text.trim().length < 100 && !/[.!?]$/.test(paragraph.text.trim()));
}

/**
 * Naslov bez vodece numeracije ("1.", "1.2", "2)", "IV.").
 *
 * DVIJE ISPRAVKE 2026-08-31 (drugi krug pregleda), obje na mojoj prvoj izvedbi:
 *
 * 1. Strip ide nad SIROVIM tekstom, prije `normalize`. `normalize` brise svu interpunkciju, pa su
 *    u prvoj izvedbi `[.]` i `[.)]` bili MRTVI: `2.1 Sazetak` je postajao `2 1 sazetak`, skidalo
 *    se samo `2 `, i ostajalo `1 sazetak`. Viserazinska numeracija je i dalje davala duplikat.
 * 2. Rimska grana ZAHTIJEVA interpunkciju. Bez nje `[ivxlcdm]+` pogada obicne rijeci: izmjereno
 *    je da su `Vidi prilog 3`, `Ili prilozi` i `Civil appendices` proglasavali `Prilozi`
 *    POSTOJECIM. To je obrnut i gori kvar: dio koji doista nedostaje nikad se ne bi ponudio.
 *
 * IZMJERENO 2026-08-31, prvi krug: dokument s naslovom `1. SAZETAK` uz propisanu
 * oznaku `Sazetak` normalizira se u `1 sazetak`, sto nije ni jednako `sazetak` ni pocinje s
 * `sazetak `. Dio je time proglasen NEDOSTAJUCIM, a popravak je umetao DUPLIKAT naslova u rad
 * koji ga vec ima. `hasExistingLabel` u fixeru to ne spasava, jer usporedjuje cijeli odlomak
 * doslovno.
 */
function normalizedWithoutLeadingNumber(raw: string): string {
  return normalize(raw.replace(/^(?:[0-9]+(?:[.][0-9]+)*[.)]?|[IVXLCDM]+[.)])\s+/i, ''));
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

/**
 * Vidljivi tekst odlomka iz njegova XML-a.
 *
 * Sluzi kao DRUGO sidro, uz otisak. Otisak se racuna nad cijelim XML-om odlomka, pa ga promijeni
 * svaki zahvat koji dira oblikovanje, i onda kad odlomak ostane isti: `heading-style-fixer` dodaje
 * `pStyle`, a `final-document-inspector-fixer` brise `w:rsid*` atribute iz svakog dijela paketa.
 *
 * IZMJERENO 2026-08-30: `required-section-fixer` je zbog toga u punom lancu odbijao 7 od 7 puta uz
 * `stale-anchor`, dok je SAM primjenjivao 5 od 7. Tekst oba ta zahvata prezivi, pa je pouzdaniji
 * pokazatelj "je li ovo jos uvijek isti odlomak".
 */
function findAnchor(index: number, paragraphs: ParagraphLike[], ranges: ReturnType<typeof extractBodyParagraphs>, existing: number[]): RequiredSectionCandidate['insertionAnchor'] | undefined {
  const next = existing.find((x) => x > index);
  if (next !== undefined && ranges[next - 1]) return { paragraphIndex: next, anchorFingerprint: ranges[next - 1].fingerprint, anchorText: anchorTextOfXml(ranges[next - 1].xml), position: 'before' };
  const previous = [...existing].reverse().find((x) => x < index);
  if (previous !== undefined && ranges[previous - 1]) return { paragraphIndex: previous, anchorFingerprint: ranges[previous - 1].fingerprint, anchorText: anchorTextOfXml(ranges[previous - 1].xml), position: 'after' };
  const fallback = paragraphs.find((p) => p.index >= index) ?? paragraphs.at(-1);
  const range = fallback ? ranges[fallback.index - 1] : undefined;
  return range ? { paragraphIndex: fallback!.index, anchorFingerprint: range.fingerprint, anchorText: anchorTextOfXml(range.xml), position: fallback!.index >= index ? 'before' : 'after' } : undefined;
}

/**
 * Propisani dijelovi kojih NEMA medju zadanim naslovima.
 *
 * Postoji da bi generator krsenja i analiza koristili ISTU logiku. Do 2026-08-31 je generator imao
 * vlastitu usporedbu (doslovna jednakost cijelog odlomka), pa je os `required-section` prijavljivao
 * i kad dio postoji. Neovisni pregled je nabrojao cetiri smjera razilazenja: nije se filtriralo
 * `required: false`, oznaka se nije mapirala u `kind` (pa su prolazile i oznake koje analiza ne
 * poznaje), zanemarivali su se `terms`/`aliases`, i ignorirala se oznaka pregazena preko
 * `rules.labels`. Rezultat je bila os koja PREKOMJERNO prijavljuje prekrsaj prema putu koji
 * proizvod stvarno izvodi.
 *
 * Vraca oznake radi dijagnostike; pozivatelju je obicno dovoljna duljina.
 */
export function missingRequiredSectionLabels(
  headingTexts: readonly string[],
  profileRequiredSections: RequiredSectionProfileEntry[] | undefined,
  rules?: RequiredSectionRules,
): string[] {
  const profileMap = new Map<RequiredSectionKind, RequiredSectionProfileEntry>();
  for (const entry of profileRequiredSections ?? []) {
    const kind = kindForKey(entry.key ?? entry.label);
    if (kind && !profileMap.has(kind)) profileMap.set(kind, entry);
  }
  const missing: string[] = [];
  for (const kind of defaultOrder(profileRequiredSections)) {
    const { label, aliases } = labelAliases(kind, rules, profileMap.get(kind));
    const normalized = aliases.map(normalize);
    // Ista presuda kao u analizi: dva ili vise podudaranja NIJE nalaz, nego dvojba.
    const found = headingTexts.filter((text) => matchesAlias(text, normalized)).length;
    if (found !== 1) missing.push(label);
  }
  return missing;
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
    const matches = headings.filter((p) => matchesAlias(p.text, normalized));
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
      /**
       * Upozorenje se pise UGRADJENOM oznakom (`BUILTIN[kind].label`), a ovdje je `label`
       * EFEKTIVNA (profil ju smije pregaziti preko `rules.labels`). Kad se razlikuju, zastita od
       * dvosmislenosti nikad ne bi opalila: analiza je nasla dva moguca naslova, a alat bi
       * svejedno predodabrao umetanje treceg. Zato se provjeravaju obje.
       */
      const builtinLabel = BUILTIN[kind].label;
      if (warnings.some((w) => w.startsWith(label) || w.startsWith(builtinLabel))) { confidence = 'low'; insertionAnchor = undefined; candidateWarnings.push('više mogućih sidara'); }
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
