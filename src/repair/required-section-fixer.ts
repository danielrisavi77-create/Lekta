import { extractBodyParagraphs, xmlEncode } from '../analysis/typography-structure.ts';
import { anchorTextOfXml as anchorTextOf, normalizeAnchorText } from './anchor-text';
import type { RequiredSectionKind } from '../analysis/required-sections-structure.ts';
import {
  ensureHeadingNumbering,
  ensureHeadingStyles,
  markTocFieldsDirty,
} from './xml-patch.ts';
import type { DocxXmlParts, FixerOutput } from './fixers.ts';

export interface RequiredSectionFixParams {
  version: 1;
  profileFingerprint?: string;
  numbering?: { maxLevel: number; format?: 'decimal' | 'upperRoman' | 'lowerRoman'; trailingDot?: boolean };
  sections: Array<{
    id: string;
    kind: RequiredSectionKind;
    label: string;
    insertionAnchor: { paragraphIndex: number; anchorFingerprint: string; anchorText?: string; position: 'before' | 'after' };
    headingLevel: number;
    styleId?: string;
    numbered: boolean;
    placeholderText?: string;
    commentText?: string;
    statementText?: string;
    confirmed: true;
  }>;
}

const KINDS = new Set<RequiredSectionKind>(['summary-hr', 'abstract', 'keywords-hr', 'keywords-en', 'originality-statement', 'abbreviation-list', 'figure-list', 'table-list', 'appendices']);
const STYLE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const PROTECTED = /<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent|customXml|bookmarkStart|bookmarkEnd|commentRangeStart|commentRangeEnd)\b|<m:oMath\b/i;
const COMMENT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';

function noOp(parts: DocxXmlParts, reason: NonNullable<FixerOutput['reason']>): FixerOutput { return { parts, applied: false, beforeLabel: '', afterLabel: '', reason }; }
function xmlText(text: string): string { return `<w:r><w:t xml:space="preserve">${xmlEncode(text)}</w:t></w:r>`; }
function paragraph(text: string, styleId?: string, keepNext = false): string {
  const pPr = `${styleId ? `<w:pStyle w:val="${xmlEncode(styleId)}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${xmlText(text)}</w:p>`;
}
function commentRange(text: string, id: number, styleId?: string, keepNext = false): string {
  const pPr = styleId || keepNext ? `<w:pPr>${styleId ? `<w:pStyle w:val="${xmlEncode(styleId)}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}</w:pPr>` : '';
  return `<w:p>${pPr}<w:commentRangeStart w:id="${id}"/>${xmlText(text)}<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r></w:p>`;
}
function withNumbering(xml: string, level: number, numId: number | null): string {
  if (!numId) return xml;
  return xml.replace('<w:pPr>', `<w:pPr><w:numPr><w:ilvl w:val="${level - 1}"/><w:numId w:val="${numId}"/></w:numPr>`);
}
function maxCommentId(xml: string): number {
  const ids = [...xml.matchAll(/w:id="(-?\d+)"/g)].map((m) => Number(m[1])).filter((x) => x >= 0);
  return ids.length ? Math.max(...ids) : -1;
}
function commentXml(id: number, text: string): string {
  return `<w:comment w:id="${id}" w:author="Lekta" w:initials="L"><w:p><w:r><w:t xml:space="preserve">${xmlEncode(text)}</w:t></w:r></w:p></w:comment>`;
}
function ensureCommentsPart(parts: DocxXmlParts, comments: string): { parts: DocxXmlParts; comments: string } {
  const packageXmlParts = { ...(parts.packageXmlParts ?? {}) };
  const existing = packageXmlParts['word/comments.xml'] ?? '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:comments>';
  const content = existing.replace(/<\/w:comments>\s*$/i, `${comments}</w:comments>`);
  packageXmlParts['word/comments.xml'] = content;
  let rels = parts.documentRelsXml ?? packageXmlParts['word/_rels/document.xml.rels'] ?? '';
  if (!new RegExp(`Type=["']${COMMENT_REL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(rels)) {
    const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    const rid = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
    rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${COMMENT_REL}" Target="comments.xml"/></Relationships>`);
  }
  let types = parts.contentTypesXml ?? packageXmlParts['[Content_Types].xml'] ?? '';
  if (types && !/PartName="\/word\/comments\.xml"/i.test(types)) types = types.replace('</Types>', '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>');
  packageXmlParts['word/_rels/document.xml.rels'] = rels;
  packageXmlParts['[Content_Types].xml'] = types;
  return { parts: { ...parts, documentRelsXml: rels, contentTypesXml: types, packageXmlParts, addedPackageParts: [{ name: 'word/comments.xml', content }] }, comments: content };
}

function hasExistingLabel(documentXml: string, label: string): boolean {
  const wanted = label.trim().toLocaleLowerCase('hr-HR');
  return extractBodyParagraphs(documentXml).some((range) => {
    const text = [...range.xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => m[1]).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().toLocaleLowerCase('hr-HR');
    return text === wanted;
  });
}

export function requiredSectionFixer(parts: DocxXmlParts, params: RequiredSectionFixParams): FixerOutput {
  if (!params || params.version !== 1 || !Array.isArray(params.sections) || params.sections.length > 50) return noOp(parts, 'invalid-params');
  const ids = new Set<string>();
  const kinds = new Set<RequiredSectionKind>();
  for (const section of params.sections) {
    if (!section || section.confirmed !== true || typeof section.id !== 'string' || ids.has(section.id) || kinds.has(section.kind) || !KINDS.has(section.kind) || typeof section.label !== 'string' || section.label.length < 1 || section.label.length > 200 || !section.insertionAnchor || !Number.isInteger(section.insertionAnchor.paragraphIndex) || section.insertionAnchor.paragraphIndex < 1 || section.insertionAnchor.position === undefined || !Number.isInteger(section.headingLevel) || section.headingLevel < 1 || section.headingLevel > 9 || (section.styleId !== undefined && !STYLE_ID.test(section.styleId))) return noOp(parts, 'invalid-params');
    for (const text of [section.placeholderText, section.commentText, section.statementText]) if (text !== undefined && (typeof text !== 'string' || text.length > 20000)) return noOp(parts, 'invalid-params');
    ids.add(section.id); kinds.add(section.kind);
  }
  if (!params.sections.length) return noOp(parts, 'no-target');
  const ranges = extractBodyParagraphs(parts.documentXml);
  /**
   * Mapa se gradi JEDNOM i LIJENO: prebrojavanje po sekciji bilo bi O(sekcija x odlomaka), a
   * placalo bi se i kad otisak odgovara pa se tekstualno sidro nikad ne konzultira.
   */
  let textCounts: Map<string, number> | undefined;
  const textOccurrencesOf = (text: string): number => {
    if (!textCounts) {
      textCounts = new Map<string, number>();
      for (const candidate of ranges) {
        const key = anchorTextOf(candidate.xml);
        if (key) textCounts.set(key, (textCounts.get(key) ?? 0) + 1);
      }
    }
    return textCounts.get(text) ?? 0;
  };
  const validated = params.sections.map((section) => {
    if (hasExistingLabel(parts.documentXml, section.label)) return { section, range: undefined };
    const range = ranges[section.insertionAnchor.paragraphIndex - 1];
    /**
     * Sidro vrijedi ako se poklapa OTISAK ili, kad ga zahvat nad oblikovanjem promijeni, TEKST.
     *
     * IZMJERENO 2026-08-30: u punom lancu je ovaj fixer odbijao 7 od 7 puta uz `stale-anchor`, a
     * SAM je primjenjivao 5 od 7. Krivci su tocno dva, oba utvrdjena testom u parovima:
     * `heading-style-fixer` (dodaje `pStyle`) i `final-document-inspector-fixer` (brise `w:rsid*`).
     * Nijedan od njih ne mijenja tekst odlomka, pa je odbijanje bilo lazno.
     *
     * Ovo NIJE re-anchoring: ne trazi se odlomak drugdje u dokumentu, nego se na ISTOM indeksu
     * dopusta druga, uza potvrda identiteta. Prazan tekst se ne priznaje kao podudaranje, inace bi
     * svaki prazan odlomak prolazio kao sidro za bilo sto.
     */
    /**
     * TEKSTUALNO SIDRO VRIJEDI SAMO AKO JE TEKST JEDINSTVEN U DOKUMENTU.
     *
     * Inace se lazno ODBIJANJE zamjenjuje tihim lazno PRIHVACANJEM. Indekse prije ovoga pomicu
     * `bibliography-repair-fixer` (uklanja duplikate, red 0) i `citation-bibliography-sync-fixer`
     * (dodaje zapise, red 1), pa indeks N moze pokazivati na DRUGI odlomak s istim tekstom.
     * Ponovljeni tekst nije rubni slucaj (npr. "Izvor: Izrada autora" ispod svake tablice).
     */
    const anchorText = section.insertionAnchor.anchorText;
    const anchorTextUnique = typeof anchorText === 'string' && anchorText.length > 0
      && textOccurrencesOf(normalizeAnchorText(anchorText)) === 1;
    const fingerprintOk = Boolean(range) && range.fingerprint === section.insertionAnchor.anchorFingerprint;
    const textOk = Boolean(range) && anchorTextUnique && anchorTextOf(range.xml) === normalizeAnchorText(anchorText ?? '');
    if (!range || (!fingerprintOk && !textOk)) return { section, range: undefined, error: 'stale-anchor' as const };
    if (PROTECTED.test(range.xml)) return { section, range, error: 'unsupported-structure' as const };
    return { section, range };
  });
  const failed = validated.find((x) => x.error);
  if (failed?.error) return noOp(parts, failed.error);
  const targets = validated.filter((x): x is { section: RequiredSectionFixParams['sections'][number]; range: NonNullable<typeof x.range> } => !!x.range && !hasExistingLabel(parts.documentXml, x.section.label));
  if (!targets.length) return noOp(parts, 'already-ok');
  const levels = [...new Set(targets.map((x) => x.section.headingLevel))];
  const styles = ensureHeadingStyles(parts.stylesXml, levels);
  let numberingXml = parts.numberingXml;
  let numId: number | null = null;
  const needsNumbering = targets.some((x) => x.section.numbered);
  if (needsNumbering) {
    const numbering = ensureHeadingNumbering(numberingXml, { maxLevel: params.numbering?.maxLevel ?? Math.max(...levels), format: params.numbering?.format, trailingDot: params.numbering?.trailingDot });
    numberingXml = numbering.xml; numId = numbering.numId;
  }
  let documentXml = parts.documentXml;
  let commentId = maxCommentId(parts.packageXmlParts?.['word/comments.xml'] ?? '');
  const commentNodes: string[] = [];
  for (const target of [...targets].sort((a, b) => b.range.start - a.range.start)) {
    const s = target.section;
    if (s.commentText) { commentId += 1; commentNodes.push(commentXml(commentId, s.commentText)); }
    let title = s.commentText ? commentRange(s.label, commentId, s.styleId ?? `Heading${s.headingLevel}`, true) : paragraph(s.label, s.styleId ?? `Heading${s.headingLevel}`, true);
    if (s.numbered) title = withNumbering(title, s.headingLevel, numId);
    const blocks = [title];
    if (s.statementText) blocks.push(paragraph(s.statementText));
    else if (s.placeholderText) blocks.push(paragraph(s.placeholderText));
    const inserted = blocks.join('');
    const offset = s.insertionAnchor.position === 'before' ? target.range.start : target.range.end;
    documentXml = documentXml.slice(0, offset) + inserted + documentXml.slice(offset);
  }
  const dirty = markTocFieldsDirty(documentXml);
  documentXml = dirty.xml;
  let nextParts: DocxXmlParts = { ...parts, documentXml, stylesXml: styles.xml, ...(numberingXml !== undefined ? { numberingXml } : {}) };
  if (commentNodes.length) nextParts = ensureCommentsPart(nextParts, commentNodes.join('')).parts;
  return { parts: nextParts, applied: true, beforeLabel: `${targets.length} nedostajućih dijelova`, afterLabel: `${targets.length} strukturnih dijelova umetnuto` };
}
