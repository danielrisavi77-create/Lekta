import type {
  HeadingCandidate,
  HeadingStructureResult,
} from './heading-structure';

export type HeadingNumberingFormat = 'decimal' | 'upperRoman' | 'lowerRoman';

export interface HeadingNumberingRules {
  maxLevel: number;
  format: HeadingNumberingFormat;
  trailingDot: boolean;
  /** Službeno definirani naslovi koji ostaju izvan višerazinskog popisa. */
  unnumberedHeadings?: string[];
}

export interface HeadingNumberingMapping {
  paragraphIndex: number;
  text: string;
  level: number;
  numbered: boolean;
  removeManualNumbering: boolean;
  manualPrefix: string | null;
  confidence: 'high' | 'medium' | 'low';
  existingHeading: boolean;
  selectedByDefault: boolean;
  evidence: string[];
}

export interface HeadingNumberingPlan {
  rules: HeadingNumberingRules;
  mappings: HeadingNumberingMapping[];
  warnings: string[];
  summary: {
    total: number;
    numbered: number;
    unnumbered: number;
    removeManualPrefixes: number;
    needsConfirmation: number;
  };
  tocComparison: {
    hasTocField: boolean;
    tocEntryCount: number;
    expectedHeadingCount: number;
    status: 'not-present' | 'count-match' | 'count-mismatch' | 'unknown';
  };
}

const DEFAULT_UNNUMBERED = new Set([
  'sazetak',
  'abstract',
  'literatura',
  'references',
  'bibliografija',
  'popis literature',
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isUnnumberedHeading(text: string, rules: HeadingNumberingRules): boolean {
  const value = normalize(text);
  return DEFAULT_UNNUMBERED.has(value) || (rules.unnumberedHeadings ?? []).some((item) => normalize(item) === value);
}

function manualPrefix(text: string): string | null {
  return text.match(/^\s*((?:(?:\d+\.){1,8}\d*|[IVXLCDM]+)(?:[.)])?)\s+/i)?.[1] ?? null;
}

function validRules(input: unknown): HeadingNumberingRules | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const maxLevel = Number(raw.maxLevel);
  if (!Number.isInteger(maxLevel) || maxLevel < 1) return null;
  const format = raw.format === 'upperRoman' || raw.format === 'lowerRoman' ? raw.format : 'decimal';
  return {
    maxLevel: Math.min(9, maxLevel),
    format,
    trailingDot: raw.trailingDot !== false,
    unnumberedHeadings: Array.isArray(raw.unnumberedHeadings)
      ? raw.unnumberedHeadings.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export function headingNumberingRules(input: unknown): HeadingNumberingRules | null {
  return validRules(input);
}

function mappingFromCandidate(candidate: HeadingCandidate, rules: HeadingNumberingRules): HeadingNumberingMapping {
  const unnumbered = isUnnumberedHeading(candidate.text, rules);
  const prefix = manualPrefix(candidate.text);
  const numbered = !unnumbered;
  return {
    paragraphIndex: candidate.paragraphIndex,
    text: candidate.text,
    level: Math.min(rules.maxLevel, candidate.proposedLevel),
    numbered,
    removeManualNumbering: numbered && prefix != null,
    manualPrefix: prefix,
    confidence: candidate.confidence,
    existingHeading: candidate.existingHeading,
    selectedByDefault: candidate.selectedByDefault,
    evidence: [...candidate.evidence, ...(unnumbered ? ['profilno izvan numeriranja'] : [])],
  };
}

export function buildHeadingNumberingPlan(
  structure: HeadingStructureResult,
  numberingInput: unknown,
  toc: { hasTocField?: boolean; tocEntryCount?: number } = {},
): HeadingNumberingPlan | null {
  const rules = validRules(numberingInput);
  if (!rules) return null;
  const existing = structure.existingHeadings.map((heading) => {
    const candidate: HeadingCandidate = {
      paragraphIndex: heading.paragraphIndex,
      text: heading.text,
      proposedLevel: heading.level,
      confidence: 'high',
      score: 99,
      evidence: ['postojeći Word Heading stil'],
      numbered: heading.numbered === true,
      numberPrefix: heading.numberPrefix ?? null,
      existingHeading: true,
      selectedByDefault: true,
    };
    return mappingFromCandidate(candidate, rules);
  });
  const candidates = structure.candidates.map((candidate) => mappingFromCandidate(candidate, rules));
  const mappings = [...existing, ...candidates].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  const warnings = [...structure.warnings.map((warning) => warning.message)];
  let previous: HeadingNumberingMapping | null = null;
  for (const mapping of mappings.filter((item) => item.selectedByDefault)) {
    if (previous && mapping.numbered && previous.numbered && mapping.level > previous.level + 1) {
      warnings.push(`Numeriranje preskače s razine ${previous.level} na ${mapping.level} u odlomku ${mapping.paragraphIndex}.`);
    }
    if (mapping.numbered) previous = mapping;
  }
  const hasTocField = toc.hasTocField === true;
  const tocEntryCount = Number.isInteger(toc.tocEntryCount) ? Number(toc.tocEntryCount) : 0;
  const expectedHeadingCount = mappings.filter((mapping) => mapping.selectedByDefault).length;
  const tocComparison = !hasTocField
    ? { hasTocField, tocEntryCount, expectedHeadingCount, status: 'not-present' as const }
    : toc.tocEntryCount == null
      ? { hasTocField, tocEntryCount, expectedHeadingCount, status: 'unknown' as const }
      : {
          hasTocField,
          tocEntryCount,
          expectedHeadingCount,
          status: tocEntryCount === expectedHeadingCount ? 'count-match' as const : 'count-mismatch' as const,
        };
  if (tocComparison.status === 'count-mismatch') {
    warnings.push(`Sadržaj ima ${tocEntryCount} stavki, a plan numeriranja očekuje ${expectedHeadingCount} naslova.`);
  }
  return {
    rules,
    mappings,
    warnings,
    summary: {
      total: mappings.length,
      numbered: mappings.filter((mapping) => mapping.numbered).length,
      unnumbered: mappings.filter((mapping) => !mapping.numbered).length,
      removeManualPrefixes: mappings.filter((mapping) => mapping.removeManualNumbering).length,
      needsConfirmation: mappings.filter((mapping) => mapping.confidence !== 'high' || mapping.removeManualNumbering).length,
    },
    tocComparison,
  };
}
