import { buildHeadingNumberingPlan } from './heading-numbering';
import type { HeadingNumberingPlan } from './heading-numbering';
import { analyzeParagraphFormatting } from './paragraph-structure';

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

function isExcluded(paragraph: HeadingStructureParagraph): boolean {
  const raw = String(paragraph.text ?? '');
  const text = normalizedText(raw);
  if (!text || text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return true;
  if (paragraph.cell) return true;
  if (TOC_STYLE.test(String(paragraph.styleName ?? paragraph.styleId ?? ''))) return true;
  if (CAPTION_PREFIX.test(text) || LIST_PREFIX.test(text)) return true;
  if (REF_SECTION.test(text)) return true;
  if (TOC_ENTRY_TAIL.test(raw)) return true;
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
  const bodySizes: number[] = paragraphs
    .filter((paragraph) => paragraph.headingLevel == null && !isExcluded(paragraph))
    .flatMap((paragraph) =>
      (paragraph.runs ?? [])
        .map((run) => run.size)
        .filter((size): size is number => typeof size === 'number'),
    );
  const bodySize = bodySizes.length ? bodySizes.sort((a, b) => a - b)[Math.floor(bodySizes.length / 2)] : null;
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

function requireHeadingNumbering(): typeof import('./heading-numbering') {
  // Statički import bi napravio cikličku ovisnost samo na razini tipova. Ovaj mali adapter
  // ostavlja detektor upotrebljivim u izoliranim testovima, a bundler ga i dalje razrješava lokalno.
  return { buildHeadingNumberingPlan } as typeof import('./heading-numbering');
}
