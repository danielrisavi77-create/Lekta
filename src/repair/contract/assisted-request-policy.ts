type DataObject = Record<string, unknown>;

const SAFE_PART = /^(?:\[Content_Types\]\.xml|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/;
const STYLE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): value is DataObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string')) return false;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) return false;
  }
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(descriptors, key))
    && (keys as string[]).every((key) => allowed.has(key));
}

function array(value: unknown, maximum: number, validate: (item: unknown) => boolean): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && value.every(validate);
}

function oneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}

function text(value: unknown, maximum = 20_000, minimum = 0): value is string {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum;
}

function identifier(value: unknown): value is string {
  return text(value, 200, 1) && value === value.trim();
}

function fingerprint(value: unknown): value is string {
  return text(value, 200, 1);
}

function integer(value: unknown, minimum = 0, maximum = 2_000_000): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function optional(value: unknown, validate: (item: unknown) => boolean): boolean {
  return value === undefined || validate(value);
}

function trueOrMissing(value: unknown): boolean {
  return value === undefined || value === true;
}

function safePart(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200 || !SAFE_PART.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4_000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function uniqueIds(items: unknown[], key = 'id'): boolean {
  const ids = items.map((item) => (item as DataObject)[key]);
  return ids.every(identifier) && new Set(ids).size === ids.length;
}

function validateElementCaption(params: DataObject): boolean {
  const kinds = ['table', 'figure', 'chart'];
  if (!array(params.elements, 200, (item) => {
    if (!object(item, ['id', 'kind', 'anchor', 'anchorFingerprint', 'description', 'position', 'replaceManualCaption'], ['source', 'label'])) return false;
    if (!object(item.anchor, ['bodyChildIndex'], ['paragraphIndex', 'drawingIndex', 'tableIndex'])) return false;
    return identifier(item.id) && oneOf(item.kind, kinds) && integer(item.anchor.bodyChildIndex)
      && optional(item.anchor.paragraphIndex, integer) && optional(item.anchor.drawingIndex, integer)
      && optional(item.anchor.tableIndex, integer) && fingerprint(item.anchorFingerprint)
      && text(item.description) && optional(item.source, (value) => text(value))
      && oneOf(item.position, ['above', 'below']) && typeof item.replaceManualCaption === 'boolean'
      && optional(item.label, (value) => text(value, 200, 1));
  }) || !uniqueIds(params.elements)) return false;
  if (params.labels !== undefined) {
    if (!object(params.labels, [], kinds) || !Object.values(params.labels).every((value) => text(value, 100, 1))) return false;
  }
  if (!optional(params.numbering, (value) => oneOf(value, ['document', 'chapter']))) return false;
  if (params.captionStyle !== undefined) {
    if (!object(params.captionStyle, [], ['font', 'sizePt', 'bold', 'italic', 'align'])) return false;
    if (!optional(params.captionStyle.font, (value) => text(value, 100, 1))
      || !optional(params.captionStyle.sizePt, (value) => finite(value, 6, 72))
      || !optional(params.captionStyle.bold, (value) => typeof value === 'boolean')
      || !optional(params.captionStyle.italic, (value) => typeof value === 'boolean')
      || !optional(params.captionStyle.align, (value) => oneOf(value, ['left', 'center', 'right']))) return false;
  }
  if (!optional(params.lists, (value) => array(value, 20, (item) => object(item, ['kind', 'title', 'placement'])
    && oneOf(item.kind, kinds) && text(item.title, 200, 1) && oneOf(item.placement, ['after-toc', 'before-intro'])))) return false;
  const elementIds = new Set((params.elements as DataObject[]).map((item) => item.id));
  return optional(params.references, (value) => array(value, 2_000, (item) => object(item, ['paragraphIndex', 'start', 'end', 'elementId'])
    && integer(item.paragraphIndex) && integer(item.start) && integer(item.end)
    && (item.end as number) >= (item.start as number) && identifier(item.elementId) && elementIds.has(item.elementId)));
}

function validateBibliography(params: DataObject): boolean {
  if (!array(params.entries, 500, (item) => object(item, ['id', 'paragraphIndices', 'anchorFingerprint'], ['remove', 'replacementText', 'normalizeText', 'hyperlink'])
    && identifier(item.id) && array(item.paragraphIndices, 2_000, integer) && fingerprint(item.anchorFingerprint)
    && optional(item.remove, (value) => typeof value === 'boolean')
    && optional(item.replacementText, (value) => text(value))
    && optional(item.normalizeText, (value) => typeof value === 'boolean')
    && optional(item.hyperlink, (value) => oneOf(value, ['doi', 'url']))) || !uniqueIds(params.entries)) return false;
  const ids = new Set((params.entries as DataObject[]).map((item) => item.id));
  if (!optional(params.order, (value) => Array.isArray(value) && value.length <= 500 && value.every((id) => identifier(id) && ids.has(id)) && new Set(value).size === value.length)) return false;
  if (params.options !== undefined) {
    if (!object(params.options, [], ['hangingIndentTwips', 'beforeTwentieths', 'afterTwentieths', 'stripUrlTerminalPunctuation'])) return false;
    if (!optional(params.options.hangingIndentTwips, (value) => integer(value, -14_400, 14_400))
      || !optional(params.options.beforeTwentieths, (value) => integer(value, -14_400, 14_400))
      || !optional(params.options.afterTwentieths, (value) => integer(value, -14_400, 14_400))
      || !optional(params.options.stripUrlTerminalPunctuation, (value) => typeof value === 'boolean')) return false;
  }
  return optional(params.suffixes, (value) => array(value, 500, (item) => object(item, ['entryId', 'suffix'], ['citationParagraphIndices'])
    && identifier(item.entryId) && ids.has(item.entryId) && typeof item.suffix === 'string' && /^[a-z]$/i.test(item.suffix)
    && optional(item.citationParagraphIndices, (indices) => array(indices, 2_000, integer))));
}

function validateCitationSync(params: DataObject): boolean {
  if (!array(params.citations, 500, (item) => object(item, ['id', 'paragraphIndex', 'start', 'end', 'anchorFingerprint', 'replacementText', 'reason'])
    && identifier(item.id) && integer(item.paragraphIndex, 1) && integer(item.start, 0) && integer(item.end, 1)
    && (item.end as number) > (item.start as number) && (item.end as number) - (item.start as number) <= 1_000 && fingerprint(item.anchorFingerprint)
    && text(item.replacementText) && text(item.reason, 2_000)) || !uniqueIds(params.citations)) return false;
  if (!array(params.entries, 500, (item) => {
    if (!object(item, ['id', 'paragraphIndices', 'anchorFingerprint', 'action'], ['replacementText', 'insertionAnchor'])
      || !identifier(item.id) || !array(item.paragraphIndices, 2_000, integer) || !fingerprint(item.anchorFingerprint)
      || !oneOf(item.action, ['add', 'replace', 'remove'])) return false;
    if (!optional(item.insertionAnchor, (value) => object(value, ['paragraphIndex', 'anchorFingerprint'])
      && integer(value.paragraphIndex, 1) && fingerprint(value.anchorFingerprint))) return false;
    if (item.action === 'replace') return text(item.replacementText);
    if (item.action === 'remove') return item.replacementText === undefined;
    return text(item.replacementText, 20_000, 1) && item.replacementText.trim().length > 0
      && object(item.insertionAnchor, ['paragraphIndex', 'anchorFingerprint'])
      && integer(item.insertionAnchor.paragraphIndex, 1) && fingerprint(item.insertionAnchor.anchorFingerprint);
  }) || !uniqueIds(params.entries)) return false;
  const citationIds = new Set((params.citations as DataObject[]).map((item) => item.id));
  const entryIds = new Set((params.entries as DataObject[]).map((item) => item.id));
  if (!array(params.mappings, 1_000, (item) => object(item, ['citationId', 'bibliographyEntryId', 'confirmed'])
    && identifier(item.citationId) && citationIds.has(item.citationId)
    && identifier(item.bibliographyEntryId)
    && (entryIds.has(item.bibliographyEntryId) || /^bibliography-[1-9][0-9]*$/.test(item.bibliographyEntryId as string))
    && item.confirmed === true)) return false;
  const mappedCitations = (params.mappings as DataObject[]).map((item) => item.citationId);
  return new Set(mappedCitations).size === mappedCitations.length;
}

function validateLegalFootnotes(params: DataObject): boolean {
  const kinds = ['move-marker', 'replace-text', 'fix-ibid', 'replace-op-cit', 'normalize-law', 'add-gazette', 'split-sources', 'link-bibliography', 'introduce-abbreviation'];
  if (!array(params.markers, 500, (item) => object(item, ['paragraphIndex', 'start', 'end', 'footnoteId', 'anchorFingerprint', 'confirmed'])
    && integer(item.paragraphIndex) && integer(item.start) && integer(item.end) && integer(item.footnoteId)
    && (item.end as number) >= (item.start as number) && fingerprint(item.anchorFingerprint) && item.confirmed === true)) return false;
  if (!array(params.operations, 1_000, (item) => object(item, ['id', 'footnoteId', 'kind', 'anchorFingerprint', 'confirmed', 'reason'], ['start', 'end', 'replacementText', 'paragraphIndex', 'markerPosition'])
    && identifier(item.id) && integer(item.footnoteId) && oneOf(item.kind, kinds) && fingerprint(item.anchorFingerprint)
    && optional(item.start, integer) && optional(item.end, integer) && optional(item.replacementText, (value) => text(value))
    && optional(item.paragraphIndex, integer) && optional(item.markerPosition, (value) => oneOf(value, ['before-punctuation', 'after-punctuation']))
    && item.confirmed === true && text(item.reason, 2_000)) || !uniqueIds(params.operations)) return false;
  return array(params.bibliographyLinks, 1_000, (item) => object(item, ['footnoteId', 'bibliographyEntryId', 'confirmed'])
    && integer(item.footnoteId) && identifier(item.bibliographyEntryId) && item.confirmed === true);
}

function validateInspector(params: DataObject): boolean {
  if (!array(params.revisions, 500, (item) => object(item, ['part', 'revisionId', 'action', 'anchorFingerprint', 'confirmed'])
    && safePart(item.part) && identifier(item.revisionId) && oneOf(item.action, ['accept', 'reject']) && fingerprint(item.anchorFingerprint) && item.confirmed === true)) return false;
  if (!array(params.comments, 500, (item) => object(item, ['commentId', 'anchorFingerprint', 'action', 'confirmed'])
    && identifier(item.commentId) && fingerprint(item.anchorFingerprint) && item.action === 'remove' && item.confirmed === true)) return false;
  if (!array(params.metadata, 500, (item) => object(item, ['part', 'field', 'fingerprint', 'action', 'confirmed'])
    && oneOf(item.part, ['core', 'app', 'custom']) && identifier(item.field) && fingerprint(item.fingerprint) && item.action === 'remove' && item.confirmed === true)) return false;
  if (!array(params.hiddenText, 500, (item) => object(item, ['part', 'anchorFingerprint', 'action', 'confirmed'])
    && safePart(item.part) && fingerprint(item.anchorFingerprint) && item.action === 'remove' && item.confirmed === true)) return false;
  if (params.settings !== undefined && (!object(params.settings, [], ['disableTracking', 'updateFields', 'removeRevisionIds'])
    || !Object.values(params.settings).every((value) => value === true))) return false;
  return optional(params.customXml, (value) => array(value, 500, (item) => object(item, ['part', 'fingerprint', 'action', 'confirmed'])
    && safePart(item.part) && (item.part as string).startsWith('customXml/')
    && fingerprint(item.fingerprint) && item.action === 'remove-unreferenced' && item.confirmed === true));
}

function validateTableFigure(params: DataObject): boolean {
  const tableActions = ['fitToTextWidth', 'equalColumns', 'repeatHeader', 'preventRowSplit', 'center', 'applyProfileTypography', 'separateSource'];
  const figureActions = ['constrainToTextWidth', 'preserveAspectRatio', 'center', 'removeWrapping', 'keepWithCaption'];
  if (!array(params.tables, 500, (item) => {
    if (!object(item, ['id', 'bodyChildIndex', 'anchorFingerprint', 'actions'], ['textWidthEmu', 'typography', 'source', 'landscape'])
      || !identifier(item.id) || !integer(item.bodyChildIndex) || !fingerprint(item.anchorFingerprint)
      || !object(item.actions, [], tableActions) || !Object.values(item.actions).every((value) => value === true)
      || !optional(item.textWidthEmu, (value) => finite(value, 0, 10_000_000_000))) return false;
    if (item.typography !== undefined && (!object(item.typography, [], ['font', 'sizePt', 'beforePt', 'afterPt'])
      || !optional(item.typography.font, (value) => text(value, 100, 1))
      || !optional(item.typography.sizePt, (value) => finite(value, 6, 72))
      || !optional(item.typography.beforePt, (value) => finite(value, 0, 1_000))
      || !optional(item.typography.afterPt, (value) => finite(value, 0, 1_000)))) return false;
    if (!optional(item.source, (value) => object(value, ['paragraphIndex', 'anchorFingerprint']) && integer(value.paragraphIndex) && fingerprint(value.anchorFingerprint))) return false;
    return optional(item.landscape, (value) => object(value, ['enabled', 'beforeFingerprint', 'afterFingerprint', 'confirmed'])
      && value.enabled === true && fingerprint(value.beforeFingerprint) && fingerprint(value.afterFingerprint) && value.confirmed === true);
  }) || !uniqueIds(params.tables)) return false;
  return array(params.figures, 500, (item) => object(item, ['id', 'paragraphIndex', 'drawingIndex', 'anchorFingerprint', 'actions'], ['maxWidthEmu', 'altText'])
    && identifier(item.id) && integer(item.paragraphIndex) && integer(item.drawingIndex) && fingerprint(item.anchorFingerprint)
    && object(item.actions, [], figureActions) && Object.values(item.actions).every((value) => value === true)
    && optional(item.maxWidthEmu, (value) => finite(value, 0, 10_000_000_000)) && optional(item.altText, (value) => text(value, 2_000)))
    && uniqueIds(params.figures as unknown[]);
}

function validateSectionSurgery(params: DataObject): boolean {
  const kinds = ['set-geometry', 'set-numbering', 'set-title-page', 'set-odd-even', 'unlink-header', 'unlink-footer', 'insert-section'];
  return array(params.operations, 100, (item) => {
    if (!object(item, ['id', 'kind', 'sectionOrdinal', 'anchorFingerprint', 'confirmed'], ['orientation', 'pageWidthTwips', 'pageHeightTwips', 'marginsTwips', 'numbering', 'enabled', 'headerType', 'footerType', 'insertAfterBodyChildIndex'])) return false;
    if (!identifier(item.id) || !oneOf(item.kind, kinds) || !integer(item.sectionOrdinal, 0, 1_000)
      || !fingerprint(item.anchorFingerprint) || item.confirmed !== true
      || !optional(item.orientation, (value) => oneOf(value, ['portrait', 'landscape']))
      || !optional(item.pageWidthTwips, (value) => integer(value, 1, 100_000))
      || !optional(item.pageHeightTwips, (value) => integer(value, 1, 100_000))
      || !optional(item.enabled, (value) => typeof value === 'boolean')
      || !optional(item.headerType, (value) => oneOf(value, ['default', 'first', 'even']))
      || !optional(item.footerType, (value) => oneOf(value, ['default', 'first', 'even']))
      || !optional(item.insertAfterBodyChildIndex, integer)) return false;
    if (item.marginsTwips !== undefined && (!object(item.marginsTwips, [], ['top', 'right', 'bottom', 'left'])
      || !Object.values(item.marginsTwips).every((value) => integer(value, 0, 14_400)))) return false;
    return optional(item.numbering, (value) => object(value, ['format'], ['start'])
      && oneOf(value.format, ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter'])
      && optional(value.start, (start) => integer(start, 0, 1_000_000)));
  }) && uniqueIds(params.operations as unknown[]);
}

function validateFieldIntegrity(params: DataObject): boolean {
  if (!array(params.fields, 2_000, (item) => object(item, ['id', 'part', 'anchorFingerprint', 'action', 'confirmed'])
    && identifier(item.id) && safePart(item.part) && fingerprint(item.anchorFingerprint) && item.action === 'mark-dirty' && item.confirmed === true)
    || !uniqueIds(params.fields)) return false;
  if (params.settings !== undefined && (!object(params.settings, [], ['updateFieldsOnOpen']) || !trueOrMissing(params.settings.updateFieldsOnOpen))) return false;
  if (!optional(params.manualToc, (value) => array(value, 20, (item) => object(item, ['startParagraphIndex', 'endParagraphIndex', 'anchorFingerprint', 'action', 'confirmed'])
    && integer(item.startParagraphIndex) && integer(item.endParagraphIndex) && (item.endParagraphIndex as number) >= (item.startParagraphIndex as number)
    && fingerprint(item.anchorFingerprint) && item.action === 'replace-with-live-toc' && item.confirmed === true))) return false;
  return optional(params.bookmarks, (value) => array(value, 100, (item) => object(item, ['part', 'bookmarkName', 'targetFingerprint', 'action', 'confirmed'])
    && safePart(item.part) && identifier(item.bookmarkName) && fingerprint(item.targetFingerprint)
    && item.action === 'repair-known-target' && item.confirmed === true));
}

const TYPOGRAPHY_CATEGORIES = ['multiple-spaces', 'punctuation-spacing', 'missing-space-after-punctuation', 'quotation-marks', 'dash-consistency', 'ellipsis', 'nonbreaking-spaces', 'decimal-comma', 'percent-format', 'date-format', 'nested-quotes', 'ordinal-numbers', 'number-unit-spacing', 'abbreviation-consistency', 'repeated-punctuation', 'text-tabs', 'manual-line-breaks'];

function validateCroatianTypography(params: DataObject): boolean {
  if (!array(params.categories, 100, (item) => object(item, ['category', 'consent']) && oneOf(item.category, TYPOGRAPHY_CATEGORIES) && item.consent === true)) return false;
  const categories = new Set((params.categories as DataObject[]).map((item) => item.category));
  return array(params.operations, 2_000, (item) => object(item, ['id', 'category', 'paragraphIndex', 'nodeKind', 'before', 'replacementText', 'anchorFingerprint', 'confirmed'], ['textNodeIndex', 'start', 'end'])
    && identifier(item.id) && oneOf(item.category, TYPOGRAPHY_CATEGORIES) && categories.has(item.category)
    && integer(item.paragraphIndex) && optional(item.textNodeIndex, integer)
    && oneOf(item.nodeKind, ['text', 'tab', 'line-break']) && optional(item.start, integer) && optional(item.end, integer)
    && text(item.before) && text(item.replacementText) && fingerprint(item.anchorFingerprint) && item.confirmed === true)
    && uniqueIds(params.operations as unknown[]);
}

function validateConsistency(params: DataObject): boolean {
  const zones = ['terminology', 'person', 'institution', 'citation', 'bibliography', 'document-metadata', 'element-label', 'heading-language'];
  if (!array(params.groups, 500, (item) => object(item, ['id', 'zone', 'canonicalText', 'confirmed'])
    && identifier(item.id) && oneOf(item.zone, zones) && text(item.canonicalText) && item.confirmed === true) || !uniqueIds(params.groups)) return false;
  const groupIds = new Set((params.groups as DataObject[]).map((item) => item.id));
  return array(params.replacements, 2_000, (item) => object(item, ['id', 'groupId', 'part', 'before', 'replacementText', 'anchorFingerprint', 'confirmed'], ['paragraphIndex', 'start', 'end', 'metadataField'])
    && identifier(item.id) && identifier(item.groupId) && groupIds.has(item.groupId)
    && oneOf(item.part, ['word/document.xml', 'docProps/core.xml']) && optional(item.paragraphIndex, integer)
    && optional(item.start, integer) && optional(item.end, integer) && text(item.before) && text(item.replacementText)
    && fingerprint(item.anchorFingerprint) && item.confirmed === true
    && optional(item.metadataField, (value) => oneOf(value, ['dc:title', 'dc:creator', 'cp:lastModifiedBy', 'cp:revision'])))
    && uniqueIds(params.replacements as unknown[]);
}

function validateRequiredSections(params: DataObject): boolean {
  const kinds = ['summary-hr', 'abstract', 'keywords-hr', 'keywords-en', 'originality-statement', 'abbreviation-list', 'figure-list', 'table-list', 'appendices'];
  if (params.numbering !== undefined && (!object(params.numbering, ['maxLevel'], ['format', 'trailingDot'])
    || !integer(params.numbering.maxLevel, 1, 9)
    || !optional(params.numbering.format, (value) => oneOf(value, ['decimal', 'upperRoman', 'lowerRoman']))
    || !optional(params.numbering.trailingDot, (value) => typeof value === 'boolean'))) return false;
  return array(params.sections, 50, (item) => object(item, ['id', 'kind', 'label', 'insertionAnchor', 'headingLevel', 'numbered', 'confirmed'], ['styleId', 'placeholderText', 'commentText', 'statementText'])
    && identifier(item.id) && oneOf(item.kind, kinds) && text(item.label, 200, 1)
    && object(item.insertionAnchor, ['paragraphIndex', 'anchorFingerprint', 'position'])
    && integer(item.insertionAnchor.paragraphIndex) && fingerprint(item.insertionAnchor.anchorFingerprint)
    && oneOf(item.insertionAnchor.position, ['before', 'after']) && integer(item.headingLevel, 1, 9)
    && optional(item.styleId, (value) => typeof value === 'string' && STYLE_ID.test(value))
    && typeof item.numbered === 'boolean' && optional(item.placeholderText, (value) => text(value))
    && optional(item.commentText, (value) => text(value)) && optional(item.statementText, (value) => text(value))
    && item.confirmed === true) && uniqueIds(params.sections as unknown[]);
}

function validateLinkDoi(params: DataObject): boolean {
  const actions = ['make-hyperlink', 'normalize-doi', 'repair-spacing', 'remove-tracking', 'replace-canonical-url', 'remove-link-styling'];
  return array(params.operations, 1_000, (item) => object(item, ['id', 'part', 'paragraphIndex', 'start', 'end', 'anchorFingerprint', 'before', 'action', 'confirmed'], ['replacementText', 'targetUrl'])
    && identifier(item.id) && item.part === 'word/document.xml' && integer(item.paragraphIndex)
    && integer(item.start) && integer(item.end) && (item.end as number) > (item.start as number)
    && fingerprint(item.anchorFingerprint) && text(item.before, 4_000) && optional(item.replacementText, (value) => text(value, 4_000))
    && optional(item.targetUrl, httpUrl) && oneOf(item.action, actions) && item.confirmed === true)
    && uniqueIds(params.operations as unknown[]);
}

function validateSubmissionMetadata(params: DataObject): boolean {
  return array(params.fields, 20, (item) => object(item, ['field', 'part', 'before', 'replacementText', 'fingerprint', 'confirmed'])
    && oneOf(item.field, ['title', 'author']) && item.part === 'docProps/core.xml'
    && text(item.before, 500) && text(item.replacementText, 500) && fingerprint(item.fingerprint) && item.confirmed === true);
}

const VALIDATORS: Record<string, (params: DataObject) => boolean> = {
  'element-caption-fixer': validateElementCaption,
  'bibliography-repair-fixer': validateBibliography,
  'citation-bibliography-sync-fixer': validateCitationSync,
  'legal-footnote-repair-fixer': validateLegalFootnotes,
  'final-document-inspector-fixer': validateInspector,
  'table-figure-rescue-fixer': validateTableFigure,
  'section-surgery-fixer': validateSectionSurgery,
  'field-integrity-fixer': validateFieldIntegrity,
  'croatian-typography-fixer': validateCroatianTypography,
  'consistency-fixer': validateConsistency,
  'required-section-fixer': validateRequiredSections,
  'link-doi-fixer': validateLinkDoi,
  'submission-metadata-fixer': validateSubmissionMetadata,
};

export function validateAssistedParams(fixerId: string, params: DataObject): boolean {
  const validator = VALIDATORS[fixerId];
  return validator === undefined || validator(params);
}
