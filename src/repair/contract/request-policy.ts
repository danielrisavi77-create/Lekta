import { FIXER_IDS, type FixerId } from '../apply-fixers.ts';
import { canonicalUtf8 } from './canonical-json.ts';
import { validateAssistedParams } from './assisted-request-policy.ts';
import {
  REPAIR_CONTRACT_MAX_REQUESTS,
  type AllowedExceptionV1,
  type JsonObject,
  type RepairContractRequestV1,
} from './types.ts';

export type RequestPolicyIssueCode =
  | 'requests-not-array'
  | 'request-count'
  | 'request-not-object'
  | 'unknown-fixer'
  | 'standalone-fixer-denied'
  | 'invalid-request-id'
  | 'duplicate-request-id'
  | 'invalid-rule-id'
  | 'params-not-object'
  | 'unknown-param'
  | 'invalid-param'
  | 'params-too-large'
  | 'confirmation-required';

export type RequestPolicyResult =
  | { ok: true; requests: RepairContractRequestV1[] }
  | { ok: false; issues: Array<{ index: number; code: RequestPolicyIssueCode; path: string }> };

type ContractFixerId = Exclude<FixerId, 'footer-page-fixer'>;
type DataObject = Record<string, unknown>;

const REQUEST_KEYS = ['fixerId', 'params', 'requestId', 'ruleId'] as const;
const REQUEST_ID = /^req-[0-9]{4}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ALIGNMENTS = new Set(['left', 'right', 'center', 'both']);
const VERSIONED_FIXERS = new Set<FixerId>([
  'element-caption-fixer',
  'bibliography-repair-fixer',
  'citation-bibliography-sync-fixer',
  'legal-footnote-repair-fixer',
  'final-document-inspector-fixer',
  'table-figure-rescue-fixer',
  'section-surgery-fixer',
  'field-integrity-fixer',
  'croatian-typography-fixer',
  'consistency-fixer',
  'required-section-fixer',
  'link-doi-fixer',
  'submission-metadata-fixer',
]);

export const CONTRACT_FIXER_IDS: readonly ContractFixerId[] = Object.freeze(
  FIXER_IDS.filter((fixerId): fixerId is ContractFixerId => fixerId !== 'footer-page-fixer'),
);

const CONTRACT_FIXER_SET = new Set<FixerId>(CONTRACT_FIXER_IDS);

export const TEXT_MUTATING_FIXERS = new Set<FixerId>([
  'title-page-fixer',
  'heading-case-fixer',
  'element-caption-fixer',
  'bibliography-repair-fixer',
  'citation-bibliography-sync-fixer',
  'legal-footnote-repair-fixer',
  'final-document-inspector-fixer',
  'field-integrity-fixer',
  'croatian-typography-fixer',
  'consistency-fixer',
  'required-section-fixer',
  'link-doi-fixer',
  'submission-metadata-fixer',
]);

const TEXT_MUTATING_FIXER_SET = new Set(TEXT_MUTATING_FIXERS);

const ALLOWED_PARAM_KEYS: Record<ContractFixerId, readonly string[]> = {
  'margins-fixer': ['top', 'right', 'bottom', 'left'],
  'paper-size-fixer': ['w', 'h'],
  'font-fixer': ['fontName', 'fontSizePt', 'deep'],
  'line-spacing-fixer': ['multiplier', 'deep'],
  'alignment-fixer': ['val', 'deep'],
  'paragraph-spacing-fixer': ['deep', 'styleRules', 'targets'],
  'page-numbering-fixer': ['targets'],
  'section-insert-fixer': ['target'],
  'empty-paragraph-fixer': [],
  'footnote-spacing-fixer': ['deep'],
  'page-number-alignment-fixer': ['align'],
  'toc-field-fixer': ['target'],
  'heading-format-fixer': ['targets'],
  'heading-style-fixer': ['targets', 'options'],
  'title-page-fixer': ['paragraphCount', 'lines', 'ensureTitlePageNoNumber', 'marginsCm'],
  'footnote-typography-fixer': ['fontName', 'fontSizePt', 'alignJustify', 'lineSpacing', 'deep'],
  'heading-case-fixer': ['levels'],
  'element-caption-fixer': ['version', 'elements', 'labels', 'numbering', 'captionStyle', 'lists', 'references'],
  'bibliography-repair-fixer': ['version', 'profileFingerprint', 'entries', 'order', 'options', 'suffixes'],
  'citation-bibliography-sync-fixer': ['version', 'profileFingerprint', 'citations', 'entries', 'mappings'],
  'legal-footnote-repair-fixer': ['version', 'profileFingerprint', 'markers', 'operations', 'bibliographyLinks'],
  'final-document-inspector-fixer': ['version', 'profileFingerprint', 'revisions', 'comments', 'metadata', 'hiddenText', 'settings', 'customXml'],
  'table-figure-rescue-fixer': ['version', 'profileFingerprint', 'tables', 'figures'],
  'section-surgery-fixer': ['version', 'profileFingerprint', 'operations'],
  'field-integrity-fixer': ['version', 'fields', 'settings', 'manualToc', 'bookmarks'],
  'croatian-typography-fixer': ['version', 'profileFingerprint', 'categories', 'operations'],
  'consistency-fixer': ['version', 'groups', 'replacements'],
  'required-section-fixer': ['version', 'profileFingerprint', 'numbering', 'sections'],
  'link-doi-fixer': ['version', 'profileFingerprint', 'operations'],
  'submission-metadata-fixer': ['version', 'fileFingerprint', 'fields'],
};

const REQUIRED_ARRAYS: Partial<Record<ContractFixerId, readonly string[]>> = {
  'page-numbering-fixer': ['targets'],
  'heading-format-fixer': ['targets'],
  'heading-style-fixer': ['targets'],
  'element-caption-fixer': ['elements'],
  'bibliography-repair-fixer': ['entries'],
  'citation-bibliography-sync-fixer': ['citations', 'entries', 'mappings'],
  'legal-footnote-repair-fixer': ['markers', 'operations', 'bibliographyLinks'],
  'final-document-inspector-fixer': ['revisions', 'comments', 'metadata', 'hiddenText'],
  'table-figure-rescue-fixer': ['tables', 'figures'],
  'section-surgery-fixer': ['operations'],
  'field-integrity-fixer': ['fields'],
  'croatian-typography-fixer': ['categories', 'operations'],
  'consistency-fixer': ['groups', 'replacements'],
  'required-section-fixer': ['sections'],
  'link-doi-fixer': ['operations'],
  'submission-metadata-fixer': ['fields'],
};

const CONFIRMED_ARRAYS: Partial<Record<ContractFixerId, readonly string[]>> = {
  'citation-bibliography-sync-fixer': ['mappings'],
  'legal-footnote-repair-fixer': ['markers', 'operations', 'bibliographyLinks'],
  'final-document-inspector-fixer': ['revisions', 'comments', 'metadata', 'hiddenText', 'customXml'],
  'section-surgery-fixer': ['operations'],
  'field-integrity-fixer': ['fields', 'manualToc', 'bookmarks'],
  'croatian-typography-fixer': ['operations'],
  'consistency-fixer': ['groups', 'replacements'],
  'required-section-fixer': ['sections'],
  'link-doi-fixer': ['operations'],
  'submission-metadata-fixer': ['fields'],
};

function dataObject(value: unknown): value is DataObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => {
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) return false;
    const descriptor = descriptors[key];
    return descriptor.enumerable && 'value' in descriptor;
  });
}

function exactKeys(value: DataObject, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function objectShape(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = [],
): value is DataObject {
  if (!dataObject(value)) return false;
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key))
    && required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function finiteIn(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integerIn(value: unknown, minimum: number, maximum: number): value is number {
  return finiteIn(value, minimum, maximum) && Number.isInteger(value);
}

function optionalIntegerIn(value: unknown, minimum: number, maximum: number): boolean {
  return value === undefined || integerIn(value, minimum, maximum);
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalFont(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 100);
}

function optionalFontSize(value: unknown): boolean {
  return value === undefined || finiteIn(value, 6, 72);
}

function inspectJson(
  value: unknown,
  key: string,
  depth: number,
  state: { nodes: number },
): RequestPolicyIssueCode | null {
  if (depth > 12) return 'params-too-large';
  state.nodes += 1;
  if (state.nodes > 2_000) return 'params-too-large';

  if (/(?:fingerprint)$/i.test(key) && (typeof value !== 'string' || value.length > 200)) return 'invalid-param';
  if (/^(?:replacementText|before|comment|commentText|statement|statementText)$/.test(key)
    && (typeof value !== 'string' || value.length > 20_000)) return 'invalid-param';
  if (/^(?:font|fontName)$/.test(key) && !optionalFont(value)) return 'invalid-param';
  if (/^(?:sizePt|fontSizePt)$/.test(key) && !optionalFontSize(value)) return 'invalid-param';

  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'invalid-param';
    if (/^(?:paragraphIndex|startParagraphIndex|endParagraphIndex|sectionOrdinal|bodyChildIndex|textNodeIndex|drawingIndex|tableIndex|introParagraphIndex|sadrzajParagraphIndex|insertAfterBodyChildIndex)$/.test(key)
      && !integerIn(value, 0, 2_000_000)) return 'invalid-param';
    if (/^(?:start|end|footnoteId)$/.test(key) && !integerIn(value, 0, 2_000_000)) return 'invalid-param';
    if (/^(?:level|headingLevel|maxLevel)$/.test(key) && !integerIn(value, 1, 9)) return 'invalid-param';
    if (/^(?:beforeTwentieths|afterTwentieths|firstLineTwips|hangingTwips)$/.test(key)
      && !integerIn(value, -14_400, 14_400)) return 'invalid-param';
    return null;
  }
  if (typeof value === 'string') {
    return null;
  }
  if (typeof value !== 'object') return 'invalid-param';

  if (Array.isArray(value)) {
    if (value.length > 2_000) return 'params-too-large';
    if (key === 'levels' && value.some((level) => !integerIn(level, 1, 9))) return 'invalid-param';
    for (const item of value) {
      const issue = inspectJson(item, key, depth + 1, state);
      if (issue) return issue;
    }
    return null;
  }

  if (!dataObject(value)) return 'invalid-param';
  for (const [childKey, child] of Object.entries(value)) {
    if ((childKey === 'confirmed' || childKey === 'consent') && child !== true) return 'confirmation-required';
    const issue = inspectJson(child, childKey, depth + 1, state);
    if (issue) return issue;
  }
  return null;
}

function arraysArePresent(params: DataObject, fixerId: ContractFixerId): boolean {
  return (REQUIRED_ARRAYS[fixerId] ?? []).every((key) =>
    Array.isArray(params[key]) && (params[key] as unknown[]).every(dataObject),
  );
}

function arraysAreConfirmed(params: DataObject, fixerId: ContractFixerId): boolean {
  return (CONFIRMED_ARRAYS[fixerId] ?? []).every((key) => {
    const value = params[key];
    return value === undefined || (Array.isArray(value) && value.every((item) => dataObject(item) && item.confirmed === true));
  });
}

function categoryConsentIsConfirmed(params: DataObject, fixerId: ContractFixerId): boolean {
  if (fixerId !== 'croatian-typography-fixer') return true;
  return Array.isArray(params.categories)
    && params.categories.every((item) => dataObject(item) && item.consent === true);
}

function tableLandscapeIsConfirmed(params: DataObject, fixerId: ContractFixerId): boolean {
  if (fixerId !== 'table-figure-rescue-fixer' || !Array.isArray(params.tables)) return true;
  return params.tables.every((table) => {
    if (!dataObject(table) || table.landscape === undefined) return dataObject(table);
    return dataObject(table.landscape) && table.landscape.confirmed === true;
  });
}

function paragraphStyleRule(value: unknown): boolean {
  if (!objectShape(value, [
    'styleId', 'beforeTwentieths', 'afterTwentieths', 'firstLineTwips', 'hangingTwips',
    'keepLines', 'keepNext', 'widowControl',
  ], ['styleId'])) return false;
  return typeof value.styleId === 'string'
    && value.styleId === value.styleId.trim()
    && value.styleId.length >= 1
    && value.styleId.length <= 200
    && optionalIntegerIn(value.beforeTwentieths, -14_400, 14_400)
    && optionalIntegerIn(value.afterTwentieths, -14_400, 14_400)
    && optionalIntegerIn(value.firstLineTwips, -14_400, 14_400)
    && optionalIntegerIn(value.hangingTwips, -14_400, 14_400)
    && optionalBoolean(value.keepLines)
    && optionalBoolean(value.keepNext)
    && optionalBoolean(value.widowControl);
}

function paragraphTarget(value: unknown): boolean {
  if (!objectShape(value, [
    'paragraphIndex', 'firstLineTwips', 'hangingTwips', 'keepLines', 'keepNext', 'widowControl',
    'removeFakeIndent', 'clearDirectIndent',
  ], ['paragraphIndex'])) return false;
  return integerIn(value.paragraphIndex, 0, 2_000_000)
    && optionalIntegerIn(value.firstLineTwips, -14_400, 14_400)
    && optionalIntegerIn(value.hangingTwips, -14_400, 14_400)
    && optionalBoolean(value.keepLines)
    && optionalBoolean(value.keepNext)
    && optionalBoolean(value.widowControl)
    && optionalBoolean(value.removeFakeIndent)
    && optionalBoolean(value.clearDirectIndent);
}

function sectionNumberingTarget(value: unknown): boolean {
  if (!objectShape(value, ['sectionIndex', 'fmt', 'start'], ['sectionIndex', 'fmt'])) return false;
  return integerIn(value.sectionIndex, 0, 2_000_000)
    && typeof value.fmt === 'string'
    && ['lowerRoman', 'upperRoman', 'decimal'].includes(value.fmt)
    && optionalIntegerIn(value.start, 1, 2_000_000);
}

function headingFormatTarget(value: unknown): boolean {
  if (!objectShape(value, ['level', 'sizeHalfPoints', 'bold', 'italic', 'alignLeft'], ['level'])) return false;
  return integerIn(value.level, 1, 9)
    && optionalIntegerIn(value.sizeHalfPoints, 12, 144)
    && optionalBoolean(value.bold)
    && optionalBoolean(value.italic)
    && optionalBoolean(value.alignLeft);
}

function headingStyleTarget(value: unknown): boolean {
  if (!objectShape(value, [
    'paragraphIndex', 'anchorText', 'level', 'numbered', 'removeManualNumbering',
    'clearDirectFont', 'clearDirectSize', 'clearDirectAlignment',
  ], ['paragraphIndex', 'level'])) return false;
  return integerIn(value.paragraphIndex, 1, 2_000_000)
    && integerIn(value.level, 1, 9)
    && (value.anchorText === undefined || (typeof value.anchorText === 'string' && value.anchorText.length <= 20_000))
    && optionalBoolean(value.numbered)
    && optionalBoolean(value.removeManualNumbering)
    && optionalBoolean(value.clearDirectFont)
    && optionalBoolean(value.clearDirectSize)
    && optionalBoolean(value.clearDirectAlignment);
}

function headingStyleOptions(value: unknown): boolean {
  if (!objectShape(value, ['pageBreakLevels', 'numbering'])) return false;
  if (value.pageBreakLevels !== undefined
    && (!Array.isArray(value.pageBreakLevels) || !value.pageBreakLevels.every((level) => integerIn(level, 1, 9)))) return false;
  if (value.numbering === undefined) return true;
  if (!objectShape(value.numbering, ['maxLevel', 'format', 'trailingDot'], ['maxLevel'])) return false;
  return integerIn(value.numbering.maxLevel, 1, 9)
    && (value.numbering.format === undefined
      || (typeof value.numbering.format === 'string' && ['decimal', 'upperRoman', 'lowerRoman'].includes(value.numbering.format)))
    && optionalBoolean(value.numbering.trailingDot);
}

function titlePageStyle(value: unknown): boolean {
  if (!objectShape(value, ['font', 'sizePt', 'bold', 'italic', 'uppercase', 'align'])) return false;
  return optionalFont(value.font)
    && optionalFontSize(value.sizePt)
    && optionalBoolean(value.bold)
    && optionalBoolean(value.italic)
    && optionalBoolean(value.uppercase)
    && (value.align === undefined || (typeof value.align === 'string' && ['left', 'center', 'right'].includes(value.align)));
}

function titlePageLine(value: unknown): boolean {
  if (!objectShape(value, ['role', 'text', 'group', 'style'], ['text'])) return false;
  return typeof value.text === 'string'
    && value.text.trim().length > 0
    && value.text.length <= 1_000
    && (value.role === undefined || (typeof value.role === 'string' && value.role.length <= 100))
    && optionalIntegerIn(value.group, 0, 100)
    && (value.style === undefined || titlePageStyle(value.style));
}

function titlePageMargins(value: unknown): boolean {
  if (!objectShape(value, ['top', 'right', 'bottom', 'left'])) return false;
  return Object.values(value).every((margin) => finiteIn(margin, 0, 10));
}

function validateSimpleParams(fixerId: ContractFixerId, params: DataObject): RequestPolicyIssueCode | null {
  switch (fixerId) {
    case 'margins-fixer':
      return Object.keys(params).length > 0 && Object.values(params).every((value) => finiteIn(value, 0, 10)) ? null : 'invalid-param';
    case 'paper-size-fixer':
      return finiteIn(params.w, 1, 100_000) && finiteIn(params.h, 1, 100_000) ? null : 'invalid-param';
    case 'font-fixer':
      return optionalFont(params.fontName) && optionalFontSize(params.fontSizePt) && optionalBoolean(params.deep)
        && (params.fontName !== undefined || params.fontSizePt !== undefined) ? null : 'invalid-param';
    case 'line-spacing-fixer':
      return finiteIn(params.multiplier, 0.5, 4) && optionalBoolean(params.deep) ? null : 'invalid-param';
    case 'alignment-fixer':
      return typeof params.val === 'string' && ALIGNMENTS.has(params.val) && optionalBoolean(params.deep) ? null : 'invalid-param';
    case 'paragraph-spacing-fixer':
      return optionalBoolean(params.deep)
        && (params.styleRules === undefined || (Array.isArray(params.styleRules) && params.styleRules.every(paragraphStyleRule)))
        && (params.targets === undefined || (Array.isArray(params.targets) && params.targets.every(paragraphTarget))) ? null : 'invalid-param';
    case 'page-numbering-fixer':
      return Array.isArray(params.targets) && params.targets.every(sectionNumberingTarget) ? null : 'invalid-param';
    case 'section-insert-fixer':
      return objectShape(params.target, ['introParagraphIndex', 'align', 'frontFmt'], ['introParagraphIndex'])
        && integerIn(params.target.introParagraphIndex, 0, 2_000_000)
        && (params.target.align === undefined || (typeof params.target.align === 'string' && ['left', 'center', 'right'].includes(params.target.align)))
        && (params.target.frontFmt === undefined || (typeof params.target.frontFmt === 'string' && ['lowerRoman', 'upperRoman'].includes(params.target.frontFmt)))
        ? null : 'invalid-param';
    case 'empty-paragraph-fixer':
      return null;
    case 'footnote-spacing-fixer':
      return optionalBoolean(params.deep) ? null : 'invalid-param';
    case 'page-number-alignment-fixer':
      return params.align === undefined || (typeof params.align === 'string' && ['left', 'center', 'right'].includes(params.align)) ? null : 'invalid-param';
    case 'toc-field-fixer':
      return objectShape(params.target, ['sadrzajParagraphIndex'], ['sadrzajParagraphIndex'])
        && integerIn(params.target.sadrzajParagraphIndex, 0, 2_000_000) ? null : 'invalid-param';
    case 'heading-format-fixer':
      return Array.isArray(params.targets) && params.targets.every(headingFormatTarget) ? null : 'invalid-param';
    case 'heading-style-fixer':
      return Array.isArray(params.targets)
        && params.targets.every(headingStyleTarget)
        && (params.options === undefined || headingStyleOptions(params.options)) ? null : 'invalid-param';
    case 'title-page-fixer': {
      if (!integerIn(params.paragraphCount, 1, 80) || !Array.isArray(params.lines) || params.lines.length < 1 || params.lines.length > 40) return 'invalid-param';
      if (!optionalBoolean(params.ensureTitlePageNoNumber)) return 'invalid-param';
      if (!params.lines.every(titlePageLine)) return 'invalid-param';
      if (params.marginsCm !== undefined && !titlePageMargins(params.marginsCm)) return 'invalid-param';
      return null;
    }
    case 'footnote-typography-fixer':
      return optionalFont(params.fontName)
        && optionalFontSize(params.fontSizePt)
        && optionalBoolean(params.alignJustify)
        && (params.lineSpacing === undefined || finiteIn(params.lineSpacing, Number.MIN_VALUE, 5))
        && optionalBoolean(params.deep)
        && (params.fontName !== undefined || params.fontSizePt !== undefined || params.alignJustify !== undefined || params.lineSpacing !== undefined) ? null : 'invalid-param';
    case 'heading-case-fixer':
      return Array.isArray(params.levels) && params.levels.length > 0 && params.levels.every((level) => integerIn(level, 1, 9)) ? null : 'invalid-param';
    default:
      return null;
  }
}

function validateParams(fixerId: ContractFixerId, params: DataObject): RequestPolicyIssueCode | null {
  const allowed = new Set(ALLOWED_PARAM_KEYS[fixerId]);
  if (Object.keys(params).some((key) => !allowed.has(key))) return 'unknown-param';

  const structuralIssue = inspectJson(params, 'params', 0, { nodes: 0 });
  if (structuralIssue) return structuralIssue;

  try {
    if (canonicalUtf8(params as JsonObject).byteLength > 262_144) return 'params-too-large';
  } catch {
    return 'invalid-param';
  }

  if (VERSIONED_FIXERS.has(fixerId) && params.version !== 1) return 'invalid-param';
  if (!arraysArePresent(params, fixerId)) return 'invalid-param';
  if (!validateAssistedParams(fixerId, params)) return 'invalid-param';
  if (!arraysAreConfirmed(params, fixerId) || !categoryConsentIsConfirmed(params, fixerId) || !tableLandscapeIsConfirmed(params, fixerId)) {
    return 'confirmation-required';
  }
  return validateSimpleParams(fixerId, params);
}

export function requestRequiresException(fixerId: FixerId): boolean {
  return TEXT_MUTATING_FIXER_SET.has(fixerId);
}

export function requiredExceptionScope(fixerId: FixerId): AllowedExceptionV1['scope'] | null {
  if (!requestRequiresException(fixerId)) return null;
  if (fixerId === 'submission-metadata-fixer') return 'metadata';
  if (fixerId === 'field-integrity-fixer') return 'structure';
  return 'visible-text';
}

export function parseContractRequests(value: unknown): RequestPolicyResult {
  if (!Array.isArray(value)) return { ok: false, issues: [{ index: -1, code: 'requests-not-array', path: 'requests' }] };
  if (value.length < 1 || value.length > REPAIR_CONTRACT_MAX_REQUESTS) {
    return { ok: false, issues: [{ index: -1, code: 'request-count', path: 'requests' }] };
  }

  const issues: Array<{ index: number; code: RequestPolicyIssueCode; path: string }> = [];
  const requestIds = new Set<string>();
  const requests: RepairContractRequestV1[] = [];

  for (const [index, candidate] of value.entries()) {
    const path = `requests[${index}]`;
    if (!dataObject(candidate) || !exactKeys(candidate, REQUEST_KEYS)) {
      issues.push({ index, code: 'request-not-object', path });
      continue;
    }
    if (typeof candidate.requestId !== 'string' || !REQUEST_ID.test(candidate.requestId)) {
      issues.push({ index, code: 'invalid-request-id', path: `${path}.requestId` });
      continue;
    }
    if (requestIds.has(candidate.requestId)) {
      issues.push({ index, code: 'duplicate-request-id', path: `${path}.requestId` });
      continue;
    }
    requestIds.add(candidate.requestId);

    if (candidate.fixerId === 'footer-page-fixer') {
      issues.push({ index, code: 'standalone-fixer-denied', path: `${path}.fixerId` });
      continue;
    }
    if (typeof candidate.fixerId !== 'string' || !CONTRACT_FIXER_SET.has(candidate.fixerId as FixerId)) {
      issues.push({ index, code: 'unknown-fixer', path: `${path}.fixerId` });
      continue;
    }
    if (typeof candidate.ruleId !== 'string' || candidate.ruleId.length < 1 || candidate.ruleId.length > 200 || candidate.ruleId !== candidate.ruleId.trim()) {
      issues.push({ index, code: 'invalid-rule-id', path: `${path}.ruleId` });
      continue;
    }
    if (!dataObject(candidate.params)) {
      issues.push({ index, code: 'params-not-object', path: `${path}.params` });
      continue;
    }

    const fixerId = candidate.fixerId as ContractFixerId;
    const paramsIssue = validateParams(fixerId, candidate.params);
    if (paramsIssue) {
      issues.push({ index, code: paramsIssue, path: `${path}.params` });
      continue;
    }
    requests.push(candidate as unknown as RepairContractRequestV1);
  }

  return issues.length ? { ok: false, issues } : { ok: true, requests };
}
