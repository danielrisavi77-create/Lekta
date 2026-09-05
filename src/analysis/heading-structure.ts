import { buildHeadingNumberingPlan } from './heading-numbering';
import type { HeadingNumberingPlan } from './heading-numbering';
import { analyzeParagraphFormatting } from './paragraph-structure';
import { normalizeAnchorText } from '../repair/anchor-text';

/**
 * Lokalna, deterministička procjena naslova koji nemaju Word Heading stil.
 *
 * Modul namjerno radi nad već razriješenim odlomcima iz analyzeDocx. Ne čita XML
 * i ne mijenja dokument, pa se heuristika može testirati bez DOCX fixturea.
 */

export type HeadingConfidence = 'high' | 'medium' | 'low';

export interface HeadingStructureParagraph {
  index: number;
  text: string;
  styleId?: string | null;
  styleName?: string | null;
  headingLevel?: number | null;
  runs?: Array<{
    text?: string;
    bold?: boolean;
    italic?: boolean;
    size?: number | null;
  }>;
  pProps?: {
    before?: number | null;
    after?: number | null;
    align?: string | null;
    num?: boolean;
  };
  cell?: unknown;
}

export interface HeadingStructureRules {
  maxLevel?: number;
  romanLevelOneAllowed?: boolean;
  numbering?: unknown;
}

export interface HeadingCandidate {
  paragraphIndex: number;
  text: string;
  proposedLevel: number;
  confidence: HeadingConfidence;
  score: number;
  evidence: string[];
  numbered: boolean;
  numberPrefix: string | null;
  existingHeading: boolean;
  selectedByDefault: boolean;
}

export interface HeadingStructureWarning {
  kind: 'skipped-level' | 'orphan-level' | 'inconsistent-level';
  paragraphIndex: number;
  message: string;
}

export interface HeadingStructureResult {
  candidates: HeadingCandidate[];
  existingHeadings: Array<{
    paragraphIndex: number;
    text: string;
    level: number;
    numbered?: boolean;
    numberPrefix?: string | null;
  }>;
  warnings: HeadingStructureWarning[];
  summary: {
    total: number;
    highConfidence: number;
    needsConfirmation: number;
  };
  headingNumberingPlan?: HeadingNumberingPlan | null;
}

const MAX_TEXT_LENGTH = 180;
const MIN_TEXT_LENGTH = 3;
const NUMBERED_PREFIX = /^\s*((?:\d+\.){0,8}\d+|[IVXLCDM]+)\s*[.)]?\s+/i;
const CAPTION_PREFIX = /^(?:slika|grafikon|tablica|table|figure|chart)\s+\d+/i;
const LIST_PREFIX = /^(?:[-•*]|\(?[a-z]\)|\(?\d+\))\s+/i;
const TOC_STYLE = /(?:toc|sadrzaj|contents|tableofcontents)/i;
const REF_SECTION = /^(?:literatura|izvori|bibliografija|references|popis literature)$/i;

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isAllCaps(text: string): boolean {
  const letters = text.match(/[\p{L}]/gu) ?? [];
  return letters.length > 3 && letters.every((c) => c === c.toUpperCase());
}

function numberInfo(text: string, romanAllowed: boolean): { level: number; prefix: string } | null {
  const match = text.match(NUMBERED_PREFIX);
  if (!match) return null;
  const prefix = match[1];
  if (/^[IVXLCDM]+$/i.test(prefix)) {
    return romanAllowed ? { level: 1, prefix } : null;
  }
  const level = prefix.split('.').filter(Boolean).length;
  return { level, prefix };
}

export function headingNumberPrefix(text: string): string | null {
  return text.match(/^\s*((?:(?:\d+\.){1,8}\d*|[IVXLCDM]+)(?:[.)])?)\s+/i)?.[1] ?? null;
}

function runStats(paragraph: HeadingStructureParagraph): { boldShare: number; maxSize: number | null; italicShare: number } {
  const runs = (paragraph.runs ?? []).filter((run) => (run.text ?? '').trim());
  if (!runs.length) return { boldShare: 0, maxSize: null, italicShare: 0 };
  const total = runs.reduce((sum, run) => sum + Math.max(1, (run.text ?? '').trim().length), 0);
  const weighted = (predicate: (run: NonNullable<HeadingStructureParagraph['runs']>[number]) => boolean) =>
    runs.reduce((sum, run) => sum + (predicate(run) ? Math.max(1, (run.text ?? '').trim().length) : 0), 0) / total;
  const sizes = runs.map((run) => run.size).filter((size): size is number => typeof size === 'number' && size > 0);
  return {
    boldShare: weighted((run) => run.bold === true),
    italicShare: weighted((run) => run.italic === true),
    maxSize: sizes.length ? Math.max(...sizes) : null,
  };
}

/**
 * RE-53: unos sadrzaja mora se prepoznati i BEZ stila. Na zivoj putanji
 * (attachHeadingStructure nad result.preview.paragraphs) odlomci nemaju ni styleId ni styleName,
 * pa je provjera po stilu ondje uvijek prazna; jedini preostali signal je tabulator pa broj
 * stranice, a njega normalizedText() unisti jer skuplja svaki razmak u obican razmak.
 * Zato se ovaj uzorak testira nad SIROVIM tekstom, prije normalizacije.
 * paragraphText pretvara <w:tab/> u \t, pa isto vrijedi i za prave Wordove sadrzaje.
 */
const TOC_ENTRY_TAIL = /\t[.\s…]*\d+\s*$/;

/**
 * Numeriran ZAPIS LITERATURE nije naslov.
 *
 * `REF_SECTION` iznad hvata samo NASLOV popisa ("Literatura"), ne i pojedine zapise. Zapis pocinje
 * brojem kao i poglavlje ("8. ..."), a `MAX_TEXT_LENGTH` je 180 znakova, pa je vecina zapisa
 * prolazila kao kandidat za naslov, i to `selectedByDefault`.
 *
 * Izmjereno 2026-08-23 na stvarnom radu (`local-37-zavrsni`): kandidat p355 je bio
 * "8. Lezaic A. Komunikacija u zdravstvenom timu. Ses...", a popravak je jednom zapisu literature
 * doista upisao `Heading1`. Posljedica nije kozmeticka: takav "naslov" ulazi u sadrzaj (TOC) i u
 * hijerarhiju naslova, dakle kvari upravo ono sto popravak treba srediti.
 *
 * Uvjet je namjerno KUMULATIVAN i uzak, da ne pojede stvaran naslov: mora biti numeriran, dug
 * najmanje 40 znakova, i nositi potpis bibliografije (inicijali autora tipa "Prezime A." ili
 * "Prezime AB,", DOI, URL, raspon stranica, ili godina uz volumen).
 */
const BIB_AUTHOR_INITIALS = /\p{Lu}\p{L}+\s+\p{Lu}{1,3}[.,]/u;
const BIB_SIGNAL = /(?:doi\s*:|https?:\/\/|\bpp?\.\s*\d|\b\d{4}\s*[;:]\s*\d|\(\d{4}\))/i;

/**
 * NASLOVNICKA OZNAKA nije naslov poglavlja.
 *
 * "ZAVRSNI RAD" na naslovnici je oznaka vrste rada, a ne dio strukture dokumenta. Detektor ju je
 * prepoznavao kao naslov visoke pouzdanosti (velika slova, veci font, kratka) i predodabirao, pa
 * je popravak upisivao `Heading1` i oznaka bi zavrsila u SADRZAJU rada.
 *
 * Izmjereno 2026-08-23 na stvarnom radu (`corpus-0221`): jedini predodabrani kandidat bio je
 * p12 "ZAVRSNI RAD". Isto vrijedi za oznake uloga ("Student:", "Mentor:") i za "Akademska godina".
 *
 * Uvjet je poklapanje CIJELOG odlomka, pa naslov poglavlja koji tu rijec samo sadrzi
 * ("Diplomski rad kao zanr") ostaje kandidat.
 */
const TITLE_PAGE_LABEL =
  /^(?:(?:zavrsn\w*|diplomsk\w*|seminarsk\w*|doktorsk\w*|specijalistick\w*|magistarsk\w*|strucn\w*)\s+rad\w*|disertacij\w*|student\w*|mentor\w*|komentor\w*|kandidat\w*|akademska\s+godina|jmbag|oib)\s*:?\s*$/;

/** Presavij dijakritiku; `d` se ne rastavlja NFD-om pa ide izricito. */
function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export function looksLikeTitlePageLabel(text: string): boolean {
  return TITLE_PAGE_LABEL.test(foldDiacritics(text).trim());
}

export function looksLikeBibliographyEntry(text: string): boolean {
  if (text.length < 40) return false;
  if (!/^\d{1,3}\.\s/.test(text)) return false;
  return BIB_AUTHOR_INITIALS.test(text) || BIB_SIGNAL.test(text);
}

function isExcluded(paragraph: HeadingStructureParagraph): boolean {
  const raw = String(paragraph.text ?? '');
  const text = normalizedText(raw);
  if (!text || text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return true;
  if (paragraph.cell) return true;
  if (TOC_STYLE.test(String(paragraph.styleName ?? paragraph.styleId ?? ''))) return true;
  if (CAPTION_PREFIX.test(text) || LIST_PREFIX.test(text)) return true;
  if (REF_SECTION.test(text)) return true;
  if (looksLikeBibliographyEntry(text)) return true;
  if (looksLikeTitlePageLabel(text)) return true;
  if (TOC_ENTRY_TAIL.test(raw)) return true;
  /**
   * NASLOV ZALIJEPLJEN S TIJELOM preko rucnog prijeloma retka nije kandidat.
   *
   * Parser `<w:br/>` emitira kao `\n`. Odlomak "3.6.1.3 Tipovi testova\nZa potrebe kvantitativne
   * analize definirani su ..." je JEDAN odlomak: naslov, prijelom, pa recenice tijela. Popravak
   * stilizira cijeli odlomak, pa bi tijelo rada postalo Heading3 i uslo u sadrzaj.
   *
   * Izmjereno 2026-09-05 na `local-01-diplomski` (p634): kandidat je imao score 7 i bio predodabran,
   * jer numerirani prefiks (+5) i "kratak odlomak" (+2) ne vide sto stoji iza prijeloma. Do tada ga je
   * skrivalo neispravno sidro (citanje samo `<w:t>`); cim je sidro popravljeno, naslov bi se upisao.
   * Prag od 40 znakova iza prijeloma pusta pravi dvoredni naslov ("Analiza\nsustava").
   */
  if (/\n[\s\S]{40,}/.test(raw)) return true;
  return false;
}

function candidateFor(
  paragraph: HeadingStructureParagraph,
  rules: HeadingStructureRules,
  bodySize: number | null,
): HeadingCandidate | null {
  if (isExcluded(paragraph) || paragraph.headingLevel != null) return null;
  const text = normalizedText(paragraph.text);
  const romanAllowed = rules.romanLevelOneAllowed === true;
  const number = numberInfo(text, romanAllowed);
  const stats = runStats(paragraph);
  const evidence: string[] = [];
  let score = 0;

  if (number) {
    score += 5;
    evidence.push(`numerirani prefiks ${number.prefix}`);
  }
  if (text.length <= 100 && text.split(/\s+/).length <= 12) {
    score += 2;
    evidence.push('kratak odlomak');
  }
  if (stats.boldShare >= 0.75) {
    score += 2;
    evidence.push('većina teksta je podebljana');
  }
  if (bodySize != null && stats.maxSize != null && stats.maxSize >= bodySize + 1) {
    score += 2;
    evidence.push('veći font od dominantnog teksta');
  }
  if ((paragraph.pProps?.before ?? 0) >= 6) {
    score += 1;
    evidence.push('razmak prije odlomka');
  }
  if (stats.italicShare >= 0.75) {
    score += 1;
    evidence.push('većina teksta je kurzivna');
  }
  if (isAllCaps(text)) {
    score += 1;
    evidence.push('velika slova');
  }
  if (/[.!?]$/.test(text) && !number) score -= 2;
  /**
   * FRAGMENT POPISA nije naslov. "4 vCPU," i "16 GB RAM," su stavke specifikacije, a numerirani prefiks
   * (+5) i kratkoca (+2) su ih dizali na score 7 i 8, dakle `high` i predodabrano; popravak bi ih
   * upisao kao Heading1 i time stvorio skok u hijerarhiji (izmjereno 2026-09-05, `local-01-diplomski`,
   * p622/p623: "4 moguca preskakanja" -> "5"). Naslov ne zavrsava zarezom ni tocka-zarezom, pa je
   * kazna veca od dobitka za prefiks: takav odlomak ostaje vidljiv kao slab kandidat, ali se ne
   * predodabire.
   */
  if (/[,;]$/.test(text)) score -= 6;
  if (text.split(/\s+/).length > 24) score -= 2;

  if (score < 4) return null;
  const maxLevel = Math.max(1, Math.min(9, Number(rules.maxLevel) || 3));
  const proposedLevel = Math.min(number?.level ?? 1, maxLevel);
  const confidence: HeadingConfidence = score >= 7 ? 'high' : 'medium';
  return {
    paragraphIndex: paragraph.index,
    text,
    proposedLevel,
    confidence,
    score,
    evidence,
    numbered: number != null,
    numberPrefix: number?.prefix ?? null,
    existingHeading: false,
    selectedByDefault: confidence === 'high',
  };
}

function inferUnnumberedLevels(candidates: HeadingCandidate[], paragraphs: HeadingStructureParagraph[], maxLevel: number): void {
  const sizes = candidates
    .filter((candidate) => !candidate.numbered)
    .map((candidate) => {
      const paragraph = paragraphs.find((item) => item.index === candidate.paragraphIndex);
      return paragraph ? runStats(paragraph).maxSize ?? 0 : 0;
    });
  const distinct = [...new Set(sizes.filter((size) => size > 0))].sort((a, b) => b - a);
  for (const candidate of candidates) {
    if (candidate.numbered) continue;
    const paragraph = paragraphs.find((item) => item.index === candidate.paragraphIndex);
    const size = paragraph ? runStats(paragraph).maxSize ?? 0 : 0;
    const rank = distinct.indexOf(size);
    candidate.proposedLevel = Math.min(maxLevel, rank >= 0 ? rank + 1 : 1);
    if (rank < 0 || distinct.length < 2) {
      candidate.confidence = 'medium';
      candidate.selectedByDefault = false;
      candidate.evidence.push('razina nije potvrđena numeracijom');
    }
  }
}

/**
 * Spusti predlozene razine tako da nijedan PREDLOZENI naslov ne preskace razinu.
 *
 * `inferUnnumberedLevels` razinu izvodi iz RANGA velicine fonta, neovisno o susjedima: naslov s
 * trecom najvecom velicinom dobiva razinu 3 i kad mu je prethodnik razina 1. Popravak je takav
 * prijedlog doslovno upisivao u dokument, pa je `structure.heading.hierarchy` padao IZ prolaza u
 * upozorenje. Izmjereno 2026-08-23 na dva stvarna rada: `corpus-0147` (6/6 -> 5/6, skok na
 * "IZJAVA O AKADEMSKOJ CESTITOSTI" koja je dobila razinu 3 iza razine 1) i `corpus-0221`
 * (isti obrazac). Kod je pritom SAM upozoravao `skipped-level`, a svejedno predlagao skok.
 *
 * Postojeci Word naslovi se NE diraju (popravak ih ne restilizira), ali daju kontekst: oni
 * pomicu `previous`, pa se prijedlog spusta u odnosu na stvarno stanje dokumenta.
 *
 * Spusta se samo NADOLJE (`Math.min`): predlozena razina nikad ne raste, pa se ne moze dogoditi
 * da popravak naslov podigne u vazniji nego sto je autor htio.
 */
/**
 * Tekstovi koji se u dokumentu pojavljuju VISE OD JEDNOM, normalizirani isto kao sidra popravka.
 *
 * Racuna se nad SVIM odlomcima, ne samo nad kandidatima, jer je uvjet popravka isti: dvojbeno je
 * sidro cijem se tekstu igdje u dokumentu nadje dvojnik, ukljucujuci celiju tablice.
 */
function ambiguousAnchorTexts(paragraphs: HeadingStructureParagraph[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const key = normalizeAnchorText(paragraph.text ?? '');
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [key, count] of counts) if (count > 1) repeated.add(key);
  return repeated;
}

function normalizeProposedLevels(
  candidates: HeadingCandidate[],
  existing: HeadingCandidate[],
  ambiguousAnchors: ReadonlySet<string>,
): void {
  /**
   * Racuna se SAMO nad naslovima koji ce stvarno postojati u popravljenom dokumentu: postojeci
   * Word naslovi plus kandidati koji su predodabrani. Neodabran kandidat se ne stilizira, pa ga
   * provjera hijerarhije nikad ne vidi; da ga se ukljuci u hod, drzao bi `previous` visoko i
   * spustanje se ne bi dogodilo (izmjereno: p6/p7 na razini 2 i 3 nisu bili odabrani, a "pokrivali"
   * su skok s razine 1 na razinu 3 na odlomku 12).
   */
  /**
   * Kandidat s DVOJBENIM SIDROM ne ulazi u hod, jer ga popravak nece ni upisati.
   *
   * `apply-fixers.ts` (`verdictFor`) preskace metu ciji se normalizirani tekst u dokumentu
   * pojavljuje vise od jednom, jer bi se uz pomak indeksa moglo sletjeti na krivi odlomak. Takav
   * kandidat je dosad svejedno drzao `previous` visoko, pa se sljedeci naslov nije spustao, a
   * onda ga fixer ne bi upisao: prvi STVARNO upisani naslov ostajao je razina 2. Provjera
   * hijerarhije krece od razine 0, pa je vodeci naslov razine 2 sam po sebi preskok.
   *
   * Izmjereno 2026-09-03 na dva stvarna rada, oba `fpzg-politologija-zavrsni`, oba
   * `structure.heading.hierarchy` iz `pass` u `warn` NAKON popravka:
   *   local-13   p12 i p40 (naslov rada dvaput) drzali razinu 1, a changelog javlja
   *              "4 pretvoreno, 2 preskoceno zbog ponovljenog teksta"; prvi upisani bio je p53
   *              (IZJAVA) razine 2.
   *   local-27   p1 i p33 (naziv ustanove dvaput); prvi upisani bio je p65 (SAZETAK) razine 2.
   *
   * Isti razred kao pravilo 4 u CLAUDE.md: mjera se racunala nad populacijom koja nije ona na
   * koju zahvat djeluje. Normalizacija se namjerno uzima IZ popravka
   * (`src/repair/anchor-text.ts`), a ne kopira, jer su se tri kopije te logike vec jednom razisle.
   */
  const ordered = [
    ...existing,
    ...candidates.filter(
      (candidate) => candidate.selectedByDefault && !ambiguousAnchors.has(normalizeAnchorText(candidate.text)),
    ),
  ].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  let previous = 0;
  for (const current of ordered) {
    /**
     * NUMERIRANI naslov se ne dira: njegovu razinu je objavio autor vlastitom numeracijom
     * ("1.1.1" je treca razina), pa bi spustanje na drugu razinu proturjecilo tekstu koji pise u
     * dokumentu. Takav preskok ostaje i dalje prijavljen kao `skipped-level` upozorenje.
     * Spusta se samo razina koju smo MI izveli iz velicine fonta (`inferUnnumberedLevels`).
     */
    const inferred = !current.existingHeading && !current.numbered;
    if (inferred && current.proposedLevel > previous + 1) {
      current.proposedLevel = Math.max(1, previous + 1);
      current.evidence.push('razina spustena da ne preskace hijerarhiju');
    }
    previous = current.proposedLevel;
  }
}

function warningsFor(candidates: HeadingCandidate[], existing: HeadingCandidate[]): HeadingStructureWarning[] {
  const ordered = [...existing, ...candidates].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  const warnings: HeadingStructureWarning[] = [];
  let previous: HeadingCandidate | null = null;
  for (const current of ordered) {
    if (previous && current.proposedLevel > previous.proposedLevel + 1) {
      warnings.push({
        kind: 'skipped-level',
        paragraphIndex: current.paragraphIndex,
        message: `Odlomak ${current.paragraphIndex} preskače s razine ${previous.proposedLevel} na ${current.proposedLevel}.`,
      });
    }
    if (current.proposedLevel > 1 && (!previous || previous.proposedLevel < current.proposedLevel - 1)) {
      warnings.push({
        kind: 'orphan-level',
        paragraphIndex: current.paragraphIndex,
        message: `Odlomak ${current.paragraphIndex} nema jasno prepoznat roditeljski naslov.`,
      });
    }
    previous = current;
  }
  return warnings;
}

export function detectHeadingStructure(
  paragraphs: HeadingStructureParagraph[],
  rules: HeadingStructureRules = {},
): HeadingStructureResult {
  /**
   * Osnovna velicina teksta, tezinski po DULJINI TEKSTA (isti kriterij kojim analiza racuna
   * `dominantFont`), a ne medijan po broju runova.
   *
   * Zasto: naslov je najcesce JEDAN run, a odlomak tijela ih ima vise, pa je medijan po runovima
   * davao naslovima tezinu nesrazmjernu kolicini teksta. Kad bi popravak ostilizirao naslove, oni
   * bi ispali iz ovog uzorka (`headingLevel != null`), osnovna velicina bi pala za tocku, i
   * odlomak koji je prije bio ispod praga odjednom bi postao kandidat. Posljedica je bila povratna
   * sprega: DRUGI prolaz istog recepta opet mijenja dokument, pa korisnik koji dvaput klikne
   * Popravi dobiva dva razlicita dokumenta (izmjereno na `local-37-zavrsni`: 1. prolaz 6 izmjena,
   * 2. prolaz jos 1, 3. prolaz cist). Pojedinacni fixeri su pritom SVI idempotentni; kvar je bio
   * u interakciji detekcije i popravka.
   *
   * Tezina po duljini teksta je stabilna: nekoliko ostiliziranih naslova nosi zanemariv udio
   * teksta, pa mod ostaje isti prije i poslije popravka.
   */
  const sizeWeights = new Map<number, number>();
  for (const paragraph of paragraphs) {
    if (paragraph.headingLevel != null || isExcluded(paragraph)) continue;
    for (const run of paragraph.runs ?? []) {
      if (typeof run.size !== 'number') continue;
      const weight = String(run.text ?? '').trim().length;
      if (!weight) continue;
      sizeWeights.set(run.size, (sizeWeights.get(run.size) ?? 0) + weight);
    }
  }
  let bodySize: number | null = null;
  let bestWeight = 0;
  for (const [size, weight] of [...sizeWeights.entries()].sort((a, b) => a[0] - b[0])) {
    if (weight > bestWeight) {
      bodySize = size;
      bestWeight = weight;
    }
  }
  const maxLevel = Math.max(1, Math.min(9, Number(rules.maxLevel) || 3));
  const existing = paragraphs
    .filter((paragraph) => paragraph.headingLevel != null)
    .map((paragraph) => ({
      paragraphIndex: paragraph.index,
      text: normalizedText(paragraph.text),
      level: paragraph.headingLevel as number,
      numbered: paragraph.pProps?.num === true || headingNumberPrefix(paragraph.text) != null,
      numberPrefix: headingNumberPrefix(paragraph.text),
    }));
  const candidates = paragraphs
    .map((paragraph) => candidateFor(paragraph, { ...rules, maxLevel }, bodySize))
    .filter((candidate): candidate is HeadingCandidate => candidate != null);
  inferUnnumberedLevels(candidates, paragraphs, maxLevel);
  const existingCandidates = existing.map((heading) => ({
    paragraphIndex: heading.paragraphIndex,
    text: heading.text,
    proposedLevel: heading.level,
    confidence: 'high' as const,
    score: 99,
    evidence: ['postojeći Word Heading stil'],
    numbered: false,
    numberPrefix: null,
    existingHeading: true,
    selectedByDefault: true,
  }));
  // Normalizacija ide PRIJE upozorenja, pa upozorenja opisuju ono sto ce popravak stvarno upisati.
  normalizeProposedLevels(candidates, existingCandidates, ambiguousAnchorTexts(paragraphs));
  const warnings = warningsFor(candidates, existingCandidates);
  return {
    candidates,
    existingHeadings: existing,
    warnings,
    summary: {
      total: candidates.length,
      highConfidence: candidates.filter((candidate) => candidate.confidence === 'high').length,
      needsConfirmation: candidates.filter((candidate) => candidate.confidence !== 'high').length,
    },
  };
}

/** Dodaje strukturu rezultatu nakon pune analize, bez ponovnog čitanja DOCX XML-a. */
export function attachHeadingStructure(result: any, rules: HeadingStructureRules = {}): any {
  const previewParagraphs = Array.isArray(result?.preview?.paragraphs) ? result.preview.paragraphs : [];
  const paragraphs: HeadingStructureParagraph[] = previewParagraphs.map((paragraph: any) => ({
    index: Number(paragraph.index),
    text: String(paragraph.text ?? ''),
    styleId: paragraph.styleId ?? null,
    styleName: paragraph.styleName ?? null,
    headingLevel: paragraph.headingLevel ?? null,
    runs: Array.isArray(paragraph.runs) ? paragraph.runs : [],
    pProps: {
      before: paragraph.spaceBefore ?? null,
      after: paragraph.spaceAfter ?? null,
      align: paragraph.align ?? null,
      num: paragraph.num === true,
    },
    cell: paragraph.cell ?? null,
  }));
  const structure = detectHeadingStructure(paragraphs, rules);
  const headingNumberingPlan = buildHeadingNumberingPlan(
    structure,
    rules.numbering,
    {
      hasTocField: result?.details?.hasTocField === true,
      tocEntryCount: result?.stats?.tocEntries,
    },
  );
  const paragraphFormatting = analyzeParagraphFormatting(previewParagraphs);
  return {
    ...result,
    details: { ...(result?.details ?? {}), headingStructure: { ...structure, headingNumberingPlan }, headingNumberingPlan, paragraphFormatting },
    documentStructure: {
      ...(result?.documentStructure ?? {}),
      headings: [
        ...((result?.documentStructure?.headings ?? []) as Array<{ level: number; text: string }>),
        ...structure.candidates.map((candidate) => ({ level: candidate.proposedLevel, text: candidate.text })),
      ],
    },
  };
}
