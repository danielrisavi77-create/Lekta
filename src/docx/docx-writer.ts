/**
 * Produkcijski .docx writer za generatore (naslovnica, izjava, literatura).
 *
 * Gradi valjan OOXML .docx sa pohranjenim (stored, metoda 0) ZIP zapisima koje
 * ZipReader iz src/docx/parser.ts cita izravno, bez DecompressionStream, pa
 * round-trip radi i u testu i u pregledniku. Plumbing (zip/crc/OOXML dijelovi)
 * adaptiran je iz tests/helpers/docx-builder.ts u tipizirani produkcijski kod,
 * bez podrske za fusnote (generatori je ne trebaju).
 *
 * Mapperi (titlePageDoc, statementDoc, bibliographyDoc) preslikavaju POSTOJECE
 * modele alata (src/tools/*) u genericki raspored: ne izmisljaju fakultetske
 * predloske, tocan oblik i dalje se provjerava prema uputama studija.
 */
import type { TitlePageModel, TitleRole } from '../tools/title-page';
import type { TitlePageTemplate } from '../title-pages/template-schema';
import type { StatementModel } from '../tools/statement';

const TWIPS_PER_CM = 567; // parser (readPPr/sectPr logika) racuna cm preko 567 twipa
const TWIPS_PER_PT = 20; // 1 tipografska tocka = 20 twipa (w:before/w:after)

/** Specifikacija jednog odlomka (jedan run po odlomku, dovoljno za generatore). */
export interface ParaSpec {
  text: string;
  font?: string; // w:rFonts w:ascii + w:hAnsi
  sizePt?: number; // tipografske tocke (w:sz je pola-tocke)
  bold?: boolean; // w:b
  italic?: boolean; // w:i
  caps?: boolean; // w:caps, prikaz verzalom (tekst ostaje netaknut; predlosci naslovnice)
  jc?: 'both' | 'left' | 'center' | 'right'; // w:jc poravnanje
  spacingLine?: number; // w:line u 240-tinama (240 jednostruki, 360 prored 1,5), lineRule auto
  spacingBeforePt?: number; // w:spacing w:before, u tockama
  spacingAfterPt?: number; // w:spacing w:after, u tockama
  pageBreakBefore?: boolean; // w:pageBreakBefore, odlomak pocinje na novoj stranici
  indentHangingCm?: number; // visece uvlacenje: w:ind w:left + w:hanging (bibliografske jedinice)
  styleId?: string; // w:pStyle, npr. "Heading1"
}

/** Specifikacija cijelog dokumenta. */
export interface DocSpec {
  paragraphs: ParaSpec[];
  pageCm?: { w: number; h: number }; // default A4, 21 x 29,7
  marginsCm?: { top: number; right: number; bottom: number; left: number }; // default 2,5
}

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function esc(s: string): string {
  // Ukloni znakove nevaljane u XML 1.0 (kontrolni, osim taba/LF/CR); cesti su pri
  // copy/paste iz PDF-a i inace bi dali neispravan .docx koji Word odbija otvoriti.
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function twipsFromCm(cm: number): number {
  return Math.round(cm * TWIPS_PER_CM);
}

function twipsFromPt(pt: number): number {
  return Math.round(pt * TWIPS_PER_PT);
}

/** w:spacing element (before/after/line), ili prazan string ako nista nije zadano. */
function spacingXml(p: ParaSpec): string {
  const attrs: string[] = [];
  if (p.spacingBeforePt !== undefined) attrs.push(`w:before="${twipsFromPt(p.spacingBeforePt)}"`);
  if (p.spacingAfterPt !== undefined) attrs.push(`w:after="${twipsFromPt(p.spacingAfterPt)}"`);
  if (p.spacingLine !== undefined) attrs.push(`w:line="${p.spacingLine}" w:lineRule="auto"`);
  return attrs.length ? `<w:spacing ${attrs.join(' ')}/>` : '';
}

function paraXml(p: ParaSpec): string {
  // rPr redoslijed po OOXML shemi: rFonts, b, i, caps, sz.
  const rpr: string[] = [];
  if (p.font) rpr.push(`<w:rFonts w:ascii="${esc(p.font)}" w:hAnsi="${esc(p.font)}"/>`);
  if (p.bold) rpr.push('<w:b/>');
  if (p.italic) rpr.push('<w:i/>');
  if (p.caps) rpr.push('<w:caps/>');
  if (p.sizePt) rpr.push(`<w:sz w:val="${Math.round(p.sizePt * 2)}"/>`);
  const rPr = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';

  // pPr redoslijed po OOXML shemi: pStyle, pageBreakBefore, spacing, ind, jc.
  const ppr: string[] = [];
  if (p.styleId) ppr.push(`<w:pStyle w:val="${esc(p.styleId)}"/>`);
  if (p.pageBreakBefore) ppr.push('<w:pageBreakBefore/>');
  const spacing = spacingXml(p);
  if (spacing) ppr.push(spacing);
  if (p.indentHangingCm !== undefined) {
    const tw = twipsFromCm(p.indentHangingCm);
    ppr.push(`<w:ind w:left="${tw}" w:hanging="${tw}"/>`);
  }
  if (p.jc) ppr.push(`<w:jc w:val="${p.jc}"/>`);
  const pPr = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';

  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

function sectPrXml(spec: DocSpec): string {
  const page = spec.pageCm ?? { w: 21.0, h: 29.7 };
  const m = spec.marginsCm ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  return (
    `<w:sectPr>` +
    `<w:pgSz w:w="${twipsFromCm(page.w)}" w:h="${twipsFromCm(page.h)}"/>` +
    `<w:pgMar w:top="${twipsFromCm(m.top)}" w:right="${twipsFromCm(m.right)}" ` +
    `w:bottom="${twipsFromCm(m.bottom)}" w:left="${twipsFromCm(m.left)}"/>` +
    `</w:sectPr>`
  );
}

/** word/document.xml iz specifikacije dokumenta. */
function documentXml(spec: DocSpec): string {
  const body = spec.paragraphs.map(paraXml).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}${sectPrXml(spec)}</w:body></w:document>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>` +
  `</w:rPr></w:rPrDefault></w:docDefaults>` +
  `</w:styles>`;

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

// Relacija document.xml -> styles.xml. BEZ nje Word i LibreOffice tiho ignoriraju
// styles.xml, pa docDefaults (Times New Roman 12) ne vrijede i tekst se otvara u
// programskom defaultu (Calibri 11). Mora postojati zaseban dio word/_rels/document.xml.rels.
const DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// --- ZIP (stored, bez kompresije) ---

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Sastavi ZIP s pohranjenim (metoda 0) zapisima; ZipReader ih cita bez raspakiravanja.
 *  Izvezen i za docx-rewriter (ponovno slaganje postojece arhive nakon izmjene). */
export function zipStore(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // potrebna verzija
    lv.setUint16(6, 0, true); // zastavice
    lv.setUint16(8, 0, true); // metoda 0 = stored
    lv.setUint16(10, 0, true); // vrijeme izmjene
    lv.setUint16(12, 0x21, true); // datum izmjene (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // komprimirana velicina
    lv.setUint32(22, size, true); // nekomprimirana velicina
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // duljina extra polja
    lh.set(nameBytes, 30);
    locals.push(lh, f.data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // verzija autora
    cv.setUint16(6, 20, true); // potrebna verzija
    cv.setUint16(8, 0, true); // zastavice
    cv.setUint16(10, 0, true); // metoda
    cv.setUint16(12, 0, true); // vrijeme
    cv.setUint16(14, 0x21, true); // datum
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); // komprimirana
    cv.setUint32(24, size, true); // nekomprimirana
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // komentar
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // interni atributi
    cv.setUint32(38, 0, true); // eksterni atributi
    cv.setUint32(42, offset, true); // offset lokalnog zaglavlja
    ch.set(nameBytes, 46);
    centrals.push(ch);

    offset += lh.length + f.data.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); // zapisa na ovom disku
  ev.setUint16(10, files.length, true); // zapisa ukupno
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Izgradi .docx kao bajtove iz specifikacije dokumenta. */
export function buildDocxBytes(spec: DocSpec): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const files: ZipFile[] = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: enc.encode(RELS_XML) },
    { name: 'word/document.xml', data: enc.encode(documentXml(spec)) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOCUMENT_RELS_XML) },
    { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
  ];
  return zipStore(files);
}

/** Izgradi .docx kao Blob (za preuzimanje iz preglednika). */
export function docxBlob(spec: DocSpec): Blob {
  return new Blob([buildDocxBytes(spec)], { type: DOCX_MIME });
}

// --- Mapperi: modeli alata -> DocSpec (genericki raspored, ne fakultetski predlozak) ---

/** Vertikalni razmak izmedju logickih skupina naslovnice, u tockama (umjesto praznih odlomaka). */
const TITLE_GROUP_GAP_PT = 120;

/** Logicke skupine naslovnice, istim redoslijedom kao titlePageText. */
const TITLE_GROUPS: TitleRole[][] = [
  ['university', 'faculty', 'study', 'course'],
  ['author', 'studentId', 'title', 'subtitle', 'worktype'],
  ['mentor', 'comentor'],
  ['placeyear'],
];

/** Tipografija po ulozi retka naslovnice (sve je centrirano; naslov vece i bold). */
function titleRoleStyle(role: TitleRole): Pick<ParaSpec, 'sizePt' | 'bold' | 'italic'> {
  switch (role) {
    case 'university':
    case 'faculty':
      return { sizePt: 14 };
    case 'title':
      return { sizePt: 20, bold: true };
    case 'subtitle':
      return { sizePt: 14, italic: true };
    default:
      return { sizePt: 12 };
  }
}

/**
 * Naslovnica: centrirani raspored po uzoru na titlePageText (ustanova gore, naslov
 * u sredini vece i bold, autor/mentor/mjesto i godina dolje). Razmak izmedju skupina
 * ide preko spacingBeforePt na prvom retku skupine, ne praznim odlomcima.
 *
 * S predloskom fakulteta (data/title-pages): tipografija po retku dolazi iz
 * model.lines[].style (font je vec razrijesen u jezgri, ukljucivo defaultFont),
 * skupine iz line.group, margine iz template.marginsCm. Grana bez predloska je
 * doslovno stara logika (regresijski blok u tests/docx-writer.test.ts).
 * Ogranicenje v1: logotip/slike nisu podrzani (writer nema media parts ni w:drawing);
 * predlosci koji propisuju logotip nose to kao napomenu u UI-u.
 */
export function titlePageDoc(model: TitlePageModel, template?: TitlePageTemplate): DocSpec {
  if (template) {
    const paragraphs: ParaSpec[] = [];
    let prevGroup: number | undefined;
    model.lines.forEach((line, i) => {
      const s = line.style ?? {};
      const para: ParaSpec = { text: line.text, jc: s.align ?? 'center', sizePt: s.sizePt ?? 12 };
      if (s.font) para.font = s.font;
      if (s.bold) para.bold = true;
      if (s.italic) para.italic = true;
      if (s.uppercase) para.caps = true;
      if (i > 0 && line.group !== prevGroup) para.spacingBeforePt = TITLE_GROUP_GAP_PT;
      prevGroup = line.group;
      paragraphs.push(para);
    });
    return template.marginsCm ? { paragraphs, marginsCm: template.marginsCm } : { paragraphs };
  }

  const paragraphs: ParaSpec[] = [];
  let hasPrevGroup = false;
  for (const roles of TITLE_GROUPS) {
    const lines = model.lines.filter((l) => roles.includes(l.role));
    if (!lines.length) continue;
    lines.forEach((line, i) => {
      const para: ParaSpec = { text: line.text, jc: 'center', ...titleRoleStyle(line.role) };
      if (i === 0 && hasPrevGroup) para.spacingBeforePt = TITLE_GROUP_GAP_PT;
      paragraphs.push(para);
    });
    hasPrevGroup = true;
  }
  return { paragraphs };
}

/** Vidljiva potpisna linija (podvlake), desno poravnata. */
const SIGNATURE_LINE = '_______________________';

/**
 * Izjava: naslov centriran bold, tijelo justificirano, mjesto i datum lijevo,
 * potpisna linija i ime desno.
 */
export function statementDoc(model: StatementModel): DocSpec {
  const paragraphs: ParaSpec[] = [
    { text: model.heading, jc: 'center', bold: true, sizePt: 14, spacingAfterPt: 24 },
    { text: model.body, jc: 'both', spacingLine: 360, spacingAfterPt: 36 },
  ];
  if (model.placeDate) {
    paragraphs.push({ text: model.placeDate, jc: 'left', spacingAfterPt: 36 });
  }
  // Potpisni blok (linija + ime) izostaje kad nema ni mjesta/datuma ni imena, isto kao
  // web pregled u izjava-page.ts (foot se renderira samo uz placeDate || signatureName).
  if (model.placeDate || model.signatureName) {
    paragraphs.push({ text: SIGNATURE_LINE, jc: 'right', spacingBeforePt: 24 });
    if (model.signatureName) {
      paragraphs.push({ text: model.signatureName, jc: 'right' });
    }
    if (model.identifiers) {
      paragraphs.push({ text: model.identifiers, jc: 'right' });
    }
  }
  return { paragraphs };
}

/** Visece uvlacenje bibliografske jedinice, u cm. */
const BIB_HANGING_CM = 1.25;

/**
 * Popis literature: naslov pa jedinice, svaka jedinica svoj odlomak s visecim
 * uvlacenjem 1,25 cm. Prazne jedinice se preskacu.
 */
export function bibliographyDoc(entries: string[], naslov = 'Literatura'): DocSpec {
  const paragraphs: ParaSpec[] = [
    { text: naslov, bold: true, sizePt: 14, spacingAfterPt: 12 },
  ];
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) continue;
    paragraphs.push({ text, indentHangingCm: BIB_HANGING_CM, spacingAfterPt: 6 });
  }
  return { paragraphs };
}
