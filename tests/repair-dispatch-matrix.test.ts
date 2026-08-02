/**
 * Dispatch matrica Repair Enginea.
 *
 * repair-golden pokriva osnovne XML fixere na generickim dokumentima. Ovdje su
 * specijalizirane Word strukture koje su potrebne da asistirani fixeri stvarno
 * naprave promjenu kroz applyFixers: fusnote, polja, metapodaci, tablice,
 * naslovnica i sidra iz analize.
 */
import { describe, expect, it } from 'vitest';
import { writeZip, type ZipEntry } from '../src/repair/zip-codec';
import { applyFixers, FIXER_IDS, type FixerId, type FixerRequest } from '../src/repair/apply-fixers';
import { anchorFingerprintForXml } from '../src/analysis/element-structure';
import { bibliographyAnchorFingerprint } from '../src/analysis/bibliography-structure';
import { citationAnchorFingerprint } from '../src/analysis/citation-bibliography-sync';
import { legalFootnoteAnchorFingerprint, legalMarkerAnchorFingerprint } from '../src/analysis/legal-footnote-structure';
import { analyzeFinalDocumentInspector, inspectorFingerprint } from '../src/analysis/final-document-inspector';
import { analyzeFieldIntegrity } from '../src/analysis/field-integrity';
import { analyzeTypographyStructure, paragraphFingerprint } from '../src/analysis/typography-structure';
import { extractBodyParagraphs } from '../src/analysis/typography-structure';
import { sectionAnchorFingerprint } from '../src/analysis/section-structure';
import { submissionMetadataFingerprint } from '../src/analysis/cross-file-submission-consistency';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const CT_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"';

interface DispatchCase {
  fixerId: FixerId;
  params: Record<string, unknown>;
  bytes: Uint8Array;
}

interface PackageOptions {
  documentXml: string;
  stylesXml?: string;
  footnotesXml?: string;
  footerXml?: string;
  packageXmlParts?: Record<string, string>;
}

const DEFAULT_STYLES = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function standardContentTypes(hasFootnotes: boolean, hasFooter: boolean): string {
  return `<Types ${CT_NS}><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hasFootnotes ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}${hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`;
}

function standardDocumentRels(hasFooter: boolean): string {
  return `<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hasFooter ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}</Relationships>`;
}

async function packageDoc(options: PackageOptions): Promise<Uint8Array> {
  const hasFootnotes = options.footnotesXml !== undefined;
  const hasFooter = options.footerXml !== undefined;
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: new TextEncoder().encode(standardContentTypes(hasFootnotes, hasFooter)) },
    { name: '_rels/.rels', data: new TextEncoder().encode(`<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: new TextEncoder().encode(standardDocumentRels(hasFooter)) },
    { name: 'word/document.xml', data: new TextEncoder().encode(options.documentXml) },
    { name: 'word/styles.xml', data: new TextEncoder().encode(options.stylesXml ?? DEFAULT_STYLES) },
  ];
  if (hasFootnotes) entries.push({ name: 'word/footnotes.xml', data: new TextEncoder().encode(options.footnotesXml!) });
  if (hasFooter) entries.push({ name: 'word/footer1.xml', data: new TextEncoder().encode(options.footerXml!) });
  for (const [name, xml] of Object.entries(options.packageXmlParts ?? {})) entries.push({ name, data: new TextEncoder().encode(xml) });
  return writeZip(entries);
}

function documentXml(body: string): string {
  return `<w:document ${WORD_NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`;
}

async function buildCases(): Promise<DispatchCase[]> {
  const cases: DispatchCase[] = [];

  const baseStyles = `<w:styles ${WORD_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style></w:styles>`;
  const baseDocument = documentXml(paragraph('Uvod'));
  const wrongPaperDocument = `<w:document ${WORD_NS}><w:body>${paragraph('Uvod')}<w:sectPr><w:pgSz w:w="10000" w:h="15000"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`;
  cases.push({ fixerId: 'margins-fixer', params: { top: 3, right: 3, bottom: 3, left: 3 }, bytes: await packageDoc({ documentXml: baseDocument }) });
  cases.push({ fixerId: 'paper-size-fixer', params: { w: 21, h: 29.7 }, bytes: await packageDoc({ documentXml: wrongPaperDocument }) });
  cases.push({ fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12 }, bytes: await packageDoc({ documentXml: baseDocument, stylesXml: baseStyles }) });
  cases.push({ fixerId: 'line-spacing-fixer', params: { multiplier: 1.5 }, bytes: await packageDoc({ documentXml: baseDocument, stylesXml: baseStyles }) });
  cases.push({ fixerId: 'alignment-fixer', params: { val: 'both' }, bytes: await packageDoc({ documentXml: baseDocument, stylesXml: baseStyles }) });
  cases.push({ fixerId: 'paragraph-spacing-fixer', params: {}, bytes: await packageDoc({ documentXml: baseDocument, stylesXml: baseStyles }) });

  const numberedDocument = `<w:document ${WORD_NS}><w:body>${paragraph('Naslovnica')}<w:p><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
  cases.push({ fixerId: 'page-numbering-fixer', params: { targets: [{ sectionIndex: 0, fmt: 'lowerRoman', start: 1 }, { sectionIndex: 1, fmt: 'decimal', start: 1 }] }, bytes: await packageDoc({ documentXml: numberedDocument }) });
  cases.push({ fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0, align: 'right' } }, bytes: await packageDoc({ documentXml: numberedDocument }) });

  const sectionInsertDocument = documentXml(`${paragraph('Naslovnica')}<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>`);
  cases.push({ fixerId: 'section-insert-fixer', params: { target: { introParagraphIndex: 2, align: 'center' } }, bytes: await packageDoc({ documentXml: sectionInsertDocument }) });
  cases.push({ fixerId: 'empty-paragraph-fixer', params: {}, bytes: await packageDoc({ documentXml: documentXml('<w:p></w:p><w:p></w:p><w:p><w:r><w:t>Tekst</w:t></w:r></w:p>') }) });

  const headingDocument = documentXml('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>UVOD</w:t></w:r></w:p>');
  const headingStyles = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style></w:styles>`;
  cases.push({ fixerId: 'heading-format-fixer', params: { targets: [{ level: 1, sizeHalfPoints: 32, bold: false }] }, bytes: await packageDoc({ documentXml: headingDocument, stylesXml: headingStyles }) });
  cases.push({ fixerId: 'heading-style-fixer', params: { targets: [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: false }], options: { numbering: { maxLevel: 3, format: 'decimal', trailingDot: true } } }, bytes: await packageDoc({ documentXml: documentXml('<w:p><w:r><w:t>Uvod</w:t></w:r></w:p>'), stylesXml: `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`, packageXmlParts: { 'word/numbering.xml': `<w:numbering ${WORD_NS}></w:numbering>` } }) });
  cases.push({ fixerId: 'heading-case-fixer', params: { levels: [1] }, bytes: await packageDoc({ documentXml: headingDocument.replace('>UVOD<', '>Uvod<') }) });

  const footnoteStyles = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Footnote Text"/><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
  const footnotes = `<w:footnotes ${WORD_NS}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:before="120" w:after="160"/></w:pPr><w:r><w:t>ibid., str. 5.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
  const footnoteDoc = await packageDoc({ documentXml: documentXml(paragraph('Tekst s fusnotom')), stylesXml: footnoteStyles, footnotesXml: footnotes });
  cases.push({ fixerId: 'footnote-spacing-fixer', params: {}, bytes: footnoteDoc });
  cases.push({ fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10 }, bytes: footnoteDoc });

  const footer = `<w:ftr ${WORD_NS}><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r></w:p></w:ftr>`;
  const footerDoc = await packageDoc({ documentXml: documentXml(`<w:p><w:pPr><w:sectPr><w:footerReference w:type="default" r:id="rId2"/></w:sectPr></w:pPr><w:r><w:t>Tijelo</w:t></w:r></w:p>`), footerXml: footer });
  cases.push({ fixerId: 'page-number-alignment-fixer', params: { align: 'right' }, bytes: footerDoc });

  const tocDoc = await packageDoc({ documentXml: documentXml(`${paragraph('Naslovnica')}<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sadrzaj</w:t></w:r></w:p>${paragraph('Uvod........ 1')}${paragraph('Uvod')}`) });
  cases.push({ fixerId: 'toc-field-fixer', params: { target: { sadrzajParagraphIndex: 2 } }, bytes: tocDoc });

  const titleDoc = await packageDoc({ documentXml: documentXml(`${paragraph('Stari naslov')}<w:p><w:r><w:t>Stari podnaslov</w:t></w:r></w:p>`) });
  cases.push({ fixerId: 'title-page-fixer', params: { paragraphCount: 2, lines: [{ text: 'Sveuciliste', style: { align: 'center', bold: true, sizePt: 16 } }, { text: 'Naslov rada', group: 1, style: { align: 'center', sizePt: 14 } }], ensureTitlePageNoNumber: true }, bytes: titleDoc });

  const captionTable = `<w:tbl ${WORD_NS}><w:tblPr/><w:tblGrid><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  cases.push({ fixerId: 'element-caption-fixer', params: { version: 1, elements: [{ id: 'table-1', kind: 'table', anchor: { bodyChildIndex: 0, tableIndex: 0 }, anchorFingerprint: anchorFingerprintForXml('table', captionTable), description: 'Opis tablice', position: 'below', replaceManualCaption: false }], labels: { table: 'Tablica' }, captionStyle: { align: 'center', bold: true }, lists: [{ kind: 'table', title: 'Popis tablica', placement: 'before-intro' }] }, bytes: await packageDoc({ documentXml: documentXml(`${captionTable}${paragraph('Uvod')}`) }) });

  const bibliographyText = 'Horvat, I. (2020). Naslov rada.';
  const bibliographyDocument = documentXml(`${paragraph('Literatura')}${paragraph(bibliographyText)}`);
  cases.push({ fixerId: 'bibliography-repair-fixer', params: { version: 1, entries: [{ id: 'b1', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], bibliographyText), normalizeText: true }], options: { hangingIndentTwips: 709 } }, bytes: await packageDoc({ documentXml: bibliographyDocument }) });

  const citationText = 'Tekst (Horvat, 2022).';
  cases.push({ fixerId: 'citation-bibliography-sync-fixer', params: { version: 1, citations: [{ id: 'c1', paragraphIndex: 1, start: 7, end: 19, anchorFingerprint: citationAnchorFingerprint(1, citationText), replacementText: 'Horvat, 2022a', reason: 'potvrdeni lokator' }], entries: [], mappings: [] }, bytes: await packageDoc({ documentXml: documentXml(paragraph(citationText)) }) });

  const legalDocument = documentXml('<w:p><w:r><w:t>Tekst </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>');
  const legalFootnotes = `<w:footnotes ${WORD_NS}><w:footnote w:id="1"><w:p><w:r><w:t>ibid., str. 5.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
  cases.push({ fixerId: 'legal-footnote-repair-fixer', params: { version: 1, markers: [{ paragraphIndex: 1, start: 6, end: 7, footnoteId: 1, anchorFingerprint: legalMarkerAnchorFingerprint(1, 6, 7, 'Tekst 1.'), confirmed: true }], operations: [{ id: 'op-1', footnoteId: 1, kind: 'fix-ibid', anchorFingerprint: legalFootnoteAnchorFingerprint(1, 'ibid., str. 5.'), start: 0, end: 14, replacementText: 'Ibid., str. 5.', confirmed: true, reason: 'standardizacija' }], bibliographyLinks: [] }, bytes: await packageDoc({ documentXml: legalDocument, footnotesXml: legalFootnotes }) });

  const inspectorPackage = {
    'word/settings.xml': `<w:settings ${WORD_NS}><w:trackRevisions/></w:settings>`,
    'word/comments.xml': `<w:comments ${WORD_NS}><w:comment w:id="7"><w:p><w:r><w:t>Komentar</w:t></w:r></w:p></w:comment></w:comments>`,
    'docProps/core.xml': '<cp:coreProperties><dc:creator>Autor</dc:creator></cp:coreProperties>',
  };
  const inspectorDocument = documentXml('<w:p><w:ins w:id="3"><w:r><w:t>novo</w:t></w:r></w:ins><w:commentRangeStart w:id="7"/><w:r><w:rPr><w:vanish/></w:rPr><w:t>skriveno</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:p>');
  const inspectorAnalysis = analyzeFinalDocumentInspector({ parts: { ...inspectorPackage, 'word/document.xml': inspectorDocument } });
  const revision = inspectorAnalysis.findings.find((finding) => finding.category === 'revisions')!.evidence[0];
  const comment = inspectorAnalysis.findings.find((finding) => finding.category === 'comments')!.evidence[0];
  const metadata = inspectorAnalysis.findings.find((finding) => finding.category === 'private-metadata')!.evidence[0];
  const hidden = inspectorAnalysis.findings.find((finding) => finding.category === 'hidden-text')!.evidence[0];
  const hiddenRun = [...inspectorDocument.matchAll(/<w:r\b[^>]*>[^]*?<\/w:r\s*>/gi)].find((match) => /<w:(?:vanish|specVanish)\b/i.test(match[0]))!;
  const hiddenDisplay = [...hiddenRun[0].matchAll(/<w:t\b[^>]*>([^]*?)<\/w:t\s*>/gi)].map((match) => match[1]).join(' ').slice(0, 160);
  expect(inspectorFingerprint('word/document.xml', 'hidden-run:' + hiddenRun.index + '|' + hiddenDisplay)).toBe(hidden.fingerprint);
  cases.push({ fixerId: 'final-document-inspector-fixer', params: { version: 1, revisions: [{ part: 'word/document.xml', revisionId: revision.revisionId!, action: 'accept', anchorFingerprint: revision.fingerprint, confirmed: true }], comments: [{ commentId: comment.commentId!, anchorFingerprint: comment.fingerprint, action: 'remove', confirmed: true }], metadata: [{ part: 'core', field: metadata.field!, fingerprint: metadata.fingerprint, action: 'remove', confirmed: true }], hiddenText: [{ part: 'word/document.xml', anchorFingerprint: hidden.fingerprint, action: 'remove', confirmed: true }], settings: { disableTracking: true } }, bytes: await packageDoc({ documentXml: inspectorDocument, packageXmlParts: inspectorPackage }) });

  const rescueTable = `<w:tbl ${WORD_NS}><w:tblPr/><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:trPr/></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="4500"/></w:tcPr><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Vrijednost</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  cases.push({ fixerId: 'table-figure-rescue-fixer', params: { version: 1, tables: [{ id: 'table-1', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', rescueTable), textWidthEmu: 6000000, actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: true, preventRowSplit: true, center: true } }], figures: [] }, bytes: await packageDoc({ documentXml: documentXml(rescueTable) }) });

  const sectionDocument = `<w:document ${WORD_NS}><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p><w:p><w:r><w:t>Glavni dio</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:body></w:document>`;
  cases.push({ fixerId: 'section-surgery-fixer', params: { version: 1, operations: [{ id: 'title', kind: 'set-title-page', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), enabled: true, confirmed: true }, { id: 'front-num', kind: 'set-numbering', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), numbering: { format: 'lowerRoman', start: 1 }, confirmed: true }, { id: 'main-geo', kind: 'set-geometry', sectionOrdinal: 1, anchorFingerprint: sectionAnchorFingerprint('', 2), orientation: 'landscape', confirmed: true }] }, bytes: await packageDoc({ documentXml: sectionDocument }) });

  const fieldDocument = documentXml('<w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>');
  const fieldAnalysis = analyzeFieldIntegrity({ parts: { 'word/document.xml': fieldDocument, 'word/settings.xml': '<w:settings/>' } });
  const field = fieldAnalysis.fields[0];
  cases.push({ fixerId: 'field-integrity-fixer', params: { version: 1, fields: [{ id: field.id, part: field.part, anchorFingerprint: field.anchorFingerprint, action: 'mark-dirty', confirmed: true }], settings: { updateFieldsOnOpen: true } }, bytes: await packageDoc({ documentXml: fieldDocument, packageXmlParts: { 'word/settings.xml': '<w:settings/>' } }) });

  const typographyDocument = documentXml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Ovo  je tekst...</w:t><w:tab/></w:r></w:p>');
  const typographyAnalysis = analyzeTypographyStructure(typographyDocument);
  const typographyOperations = typographyAnalysis.occurrences.map((occurrence) => ({ id: occurrence.id, category: occurrence.category, paragraphIndex: occurrence.paragraphIndex, textNodeIndex: occurrence.textNodeIndex, nodeKind: occurrence.category === 'text-tabs' ? 'tab' as const : occurrence.category === 'manual-line-breaks' ? 'line-break' as const : 'text' as const, ...(occurrence.category === 'text-tabs' || occurrence.category === 'manual-line-breaks' ? {} : { start: occurrence.start, end: occurrence.end }), before: occurrence.rawText, replacementText: occurrence.proposedText, anchorFingerprint: occurrence.anchorFingerprint, confirmed: true as const }));
  cases.push({ fixerId: 'croatian-typography-fixer', params: { version: 1, categories: [...new Set(typographyOperations.map((operation) => operation.category))].map((category) => ({ category, consent: true as const })), operations: typographyOperations }, bytes: await packageDoc({ documentXml: typographyDocument }) });

  const consistencyDocument = documentXml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>EU</w:t></w:r><w:r><w:t> ostaje</w:t></w:r></w:p>');
  const consistencyParagraph = consistencyDocument.match(/<w:p>[\s\S]*?<\/w:p>/)![0];
  cases.push({ fixerId: 'consistency-fixer', params: { version: 1, groups: [{ id: 'g', zone: 'terminology', canonicalText: 'Europska unija', confirmed: true }], replacements: [{ id: 'r', groupId: 'g', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 2, before: 'EU', replacementText: 'Europska unija', anchorFingerprint: paragraphFingerprint(consistencyParagraph), confirmed: true }] }, bytes: await packageDoc({ documentXml: consistencyDocument, packageXmlParts: { 'docProps/core.xml': '<cp:coreProperties><dc:title>Stari naslov</dc:title></cp:coreProperties>' } }) });

  const requiredDocument = documentXml('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>');
  const requiredAnchor = extractBodyParagraphs(requiredDocument)[0];
  cases.push({ fixerId: 'required-section-fixer', params: { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: requiredAnchor.fingerprint, position: 'before' }, headingLevel: 1, numbered: true, commentText: 'Ovdje unesi sadrzaj', confirmed: true }] }, bytes: await packageDoc({ documentXml: requiredDocument, packageXmlParts: { '[Content_Types].xml': `<Types ${CT_NS}></Types>`, 'word/_rels/document.xml.rels': `<Relationships ${REL_NS}></Relationships>` } }) });

  const doiDocument = documentXml(paragraph('doi:10.1234/abc'));
  const doiAnchor = extractBodyParagraphs(doiDocument)[0];
  cases.push({ fixerId: 'link-doi-fixer', params: { version: 1, operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: doiAnchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }] }, bytes: await packageDoc({ documentXml: doiDocument }) });

  const core = '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Stari naslov</dc:title><dc:creator>Horvat</dc:creator></cp:coreProperties>';
  cases.push({ fixerId: 'submission-metadata-fixer', params: { version: 1, fields: [{ field: 'title', part: 'docProps/core.xml', before: 'Stari naslov', replacementText: 'Novi naslov', fingerprint: submissionMetadataFingerprint('title', 'Stari naslov'), confirmed: true }] }, bytes: await packageDoc({ documentXml: '<w:document/>', packageXmlParts: { 'docProps/core.xml': core } }) });

  return cases;
}

describe('Repair Engine dispatch matrica asistiranih fixera', () => {
  it('svaki specijalizirani fixer stvarno mijenja dokument i zatim je no-op', async () => {
    const cases = await buildCases();
    const seen = new Set<FixerId>();
    for (const testCase of cases) {
      seen.add(testCase.fixerId);
      const request: FixerRequest = { fixerId: testCase.fixerId, ruleId: `${testCase.fixerId}-matrix`, params: testCase.params };
      const first = await applyFixers(testCase.bytes, [request]);
      expect(first.changelog, `${testCase.fixerId} mora imati mutation scenarij`).not.toHaveLength(0);
      const second = await applyFixers(first.docxBytes, [request]);
      expect(second.changelog, `${testCase.fixerId} drugi prolaz mora biti no-op`).toHaveLength(0);
      expect(second.docxBytes, `${testCase.fixerId} no-op mora zadrzati istu referencu`).toBe(first.docxBytes);
    }
    expect(seen).toEqual(new Set(FIXER_IDS));
  }, 120000);
});
