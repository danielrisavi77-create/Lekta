/**
 * Reusable DOCX predlosci za Repair Engine testove.
 *
 * Svaki predlozak pokriva jednu sposobnost i ima dovoljno stvarne Word XML
 * strukture da fixer ne zavrsi kao lazni no-op. Predlosci su mali i citljivi,
 * pa se kombinirani scenariji mogu slagati bez kopiranja cijelih XML dokumenata.
 */
import { writeZip, type ZipEntry } from '../../src/repair/zip-codec';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const CT_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"';
const enc = new TextEncoder();

export type RepairTemplateId =
  | 'basic-text-styles'
  | 'headings-numbering'
  | 'title-page-sections'
  | 'footnotes-legal-citations'
  | 'bibliography-citations'
  | 'tables-images'
  | 'fields-toc'
  | 'links-doi';

export interface RepairTemplate {
  id: RepairTemplateId;
  description: string;
  requiredEntries: readonly string[];
  requiredMarkers: Readonly<Record<string, readonly string[]>>;
  build(): Promise<Uint8Array>;
}

interface PackageOptions {
  documentXml: string;
  stylesXml?: string;
  numberingXml?: string;
  footnotesXml?: string;
  settingsXml?: string;
  footerXml?: string;
  image?: Uint8Array;
  documentRelsXml?: string;
  packageXmlParts?: Readonly<Record<string, string>>;
}

function paragraph(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function documentXml(body: string, finalSection = true): string {
  const sectPr = finalSection ? '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>' : '';
  return `<w:document ${WORD_NS}><w:body>${body}${sectPr}</w:body></w:document>`;
}

function contentTypes(options: PackageOptions): string {
  return `<Types ${CT_NS}><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${options.image ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${options.numberingXml ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}${options.footnotesXml ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}${options.footerXml ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`;
}

function defaultDocumentRels(options: PackageOptions): string {
  const extras = [
    options.footerXml ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '',
    options.image ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>' : '',
  ].join('');
  return `<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${extras}</Relationships>`;
}

async function packageDoc(options: PackageOptions): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes(options)) },
    { name: '_rels/.rels', data: enc.encode(`<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(options.documentRelsXml ?? defaultDocumentRels(options)) },
    { name: 'word/document.xml', data: enc.encode(options.documentXml) },
    { name: 'word/styles.xml', data: enc.encode(options.stylesXml ?? `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`) },
  ];
  if (options.numberingXml) entries.push({ name: 'word/numbering.xml', data: enc.encode(options.numberingXml) });
  if (options.footnotesXml) entries.push({ name: 'word/footnotes.xml', data: enc.encode(options.footnotesXml) });
  if (options.settingsXml) entries.push({ name: 'word/settings.xml', data: enc.encode(options.settingsXml) });
  if (options.footerXml) entries.push({ name: 'word/footer1.xml', data: enc.encode(options.footerXml) });
  if (options.image) entries.push({ name: 'word/media/image1.png', data: options.image });
  for (const [name, xml] of Object.entries(options.packageXmlParts ?? {})) entries.push({ name, data: enc.encode(xml) });
  return writeZip(entries);
}

const basicStyles = `<w:styles ${WORD_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style></w:styles>`;

const basicTextStyles: RepairTemplate = {
  id: 'basic-text-styles',
  description: 'Osnovni tekst, Normal stil, docDefaults, font, velicina, prored i poravnanje.',
  requiredEntries: ['word/document.xml', 'word/styles.xml'],
  requiredMarkers: { 'word/document.xml': ['Akademski tekst'], 'word/styles.xml': ['w:docDefaults', 'w:styleId="Normal"', 'w:spacing', 'w:jc'] },
  build: () => packageDoc({ documentXml: documentXml(paragraph('Akademski tekst za osnovnu provjeru.')), stylesXml: basicStyles }),
};

const headingsNumbering: RepairTemplate = {
  id: 'headings-numbering',
  description: 'Heading1 i Heading2 odlomci s postojecim viserazinskim numeriranjem.',
  requiredEntries: ['word/document.xml', 'word/styles.xml', 'word/numbering.xml'],
  requiredMarkers: { 'word/document.xml': ['Heading1', 'Heading2'], 'word/styles.xml': ['Heading1', 'Heading2'], 'word/numbering.xml': ['w:abstractNum', 'w:num'] },
  build: () => packageDoc({
    documentXml: documentXml(`${paragraph('Uvod', 'Heading1')}${paragraph('Metodologija', 'Heading2')}`),
    stylesXml: `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
    numberingXml: `<w:numbering ${WORD_NS}><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
  }),
};

const titlePageSections: RepairTemplate = {
  id: 'title-page-sections',
  description: 'Naslovnica kao prva sekcija i glavni dio rada kao druga sekcija.',
  requiredEntries: ['word/document.xml', 'word/styles.xml'],
  requiredMarkers: { 'word/document.xml': ['Naslov rada', 'w:sectPr', 'w:pgNumType', 'w:titlePg'] },
  build: () => packageDoc({
    documentXml: `<w:document ${WORD_NS}><w:body>${paragraph('Naslov rada')}<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="lowerRoman"/><w:titlePg/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p>${paragraph('Uvod', 'Heading1')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:body></w:document>`,
  }),
};

const footnotesLegalCitations: RepairTemplate = {
  id: 'footnotes-legal-citations',
  description: 'Superscript oznaka, footnoteReference, FootnoteText stil i tekst fusnote.',
  requiredEntries: ['word/document.xml', 'word/styles.xml', 'word/footnotes.xml'],
  requiredMarkers: { 'word/document.xml': ['w:footnoteReference', 'Zakon'], 'word/styles.xml': ['FootnoteText'], 'word/footnotes.xml': ['ibid.', 'w:id="1"'] },
  build: () => packageDoc({
    documentXml: documentXml(`<w:p><w:r><w:t>Zakon </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`),
    stylesXml: `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Footnote Text"/><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`,
    footnotesXml: `<w:footnotes ${WORD_NS}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:t>ibid., str. 5.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
  }),
};

const bibliographyCitations: RepairTemplate = {
  id: 'bibliography-citations',
  description: 'Tekstualni citat i odabrani bibliografski zapis u odjeljku Literatura.',
  requiredEntries: ['word/document.xml', 'word/styles.xml'],
  requiredMarkers: { 'word/document.xml': ['(Horvat, 2022)', 'Literatura', 'Horvat, I. (2022)'] },
  build: () => packageDoc({ documentXml: documentXml(`${paragraph('Tekst (Horvat, 2022).')}${paragraph('Literatura', 'Heading1')}${paragraph('Horvat, I. (2022). Naslov rada.')}`) }),
};

const tablesImages: RepairTemplate = {
  id: 'tables-images',
  description: 'Tablica s redovima i slika u drawing/blip strukturi, uz binarni media entry.',
  requiredEntries: ['word/document.xml', 'word/styles.xml', 'word/media/image1.png'],
  requiredMarkers: { 'word/document.xml': ['w:tbl', 'w:drawing', 'r:embed="rId3"'], 'word/media/image1.png': [] },
  build: () => packageDoc({
    documentXml: documentXml(`<w:tbl ${WORD_NS}><w:tblPr/><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Vrijednost</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId3"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`),
    image: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
  }),
};

const fieldsToc: RepairTemplate = {
  id: 'fields-toc',
  description: 'Rucni sadrzaj i zivo TOC polje s postavkom updateFields.',
  requiredEntries: ['word/document.xml', 'word/styles.xml', 'word/settings.xml'],
  requiredMarkers: { 'word/document.xml': ['Sadrzaj', 'w:fldChar', 'TOC'], 'word/settings.xml': ['w:updateFields'] },
  build: () => packageDoc({
    documentXml: documentXml(`${paragraph('Sadrzaj', 'Heading1')}<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \h \z </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Uvod........ 1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>${paragraph('Uvod', 'Heading1')}`),
    settingsXml: `<w:settings ${WORD_NS}><w:updateFields w:val="true"/></w:settings>`,
  }),
};

const linksDoi: RepairTemplate = {
  id: 'links-doi',
  description: 'Neobradeni DOI i postojeca vanjska poveznica s hyperlink relacijom.',
  requiredEntries: ['word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'],
  requiredMarkers: { 'word/document.xml': ['doi:10.1234/abc', 'w:hyperlink'], 'word/_rels/document.xml.rels': ['hyperlink', 'https://example.org'] },
  build: () => packageDoc({
    documentXml: documentXml(`${paragraph('doi:10.1234/abc')}<w:p><w:hyperlink r:id="rId4"><w:r><w:t>https://example.org</w:t></w:r></w:hyperlink></w:p>`),
    documentRelsXml: `<Relationships ${REL_NS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org" TargetMode="External"/></Relationships>`,
  }),
};

export const REPAIR_TEMPLATES: readonly RepairTemplate[] = [
  basicTextStyles,
  headingsNumbering,
  titlePageSections,
  footnotesLegalCitations,
  bibliographyCitations,
  tablesImages,
  fieldsToc,
  linksDoi,
];

export async function buildRepairTemplate(id: RepairTemplateId): Promise<Uint8Array> {
  const template = REPAIR_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Nepoznat repair predlozak: ${id}`);
  return template.build();
}
