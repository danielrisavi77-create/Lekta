/**
 * Minimalni .docx generator za sinteticke golden fixture (CLAUDE.md golden harness).
 * Gradi valjan OOXML .docx s pohranjenim (stored, bez kompresije) ZIP zapisima koje
 * cita ZipReader u src/main.ts (method 0 vraca bajtove izravno, bez DecompressionStream).
 *
 * Namjena: kontrolirani ulazi za provjeru da auditi (font, velicina, prored, margine,
 * sadrzaj, sekcije) ispravno okidaju. NIJE pravi studentski rad i nije izvor pravila.
 */

const TWIPS_PER_CM = 567; // src/main.ts dijeli twips s 567 za cm

export interface ParaSpec {
  text: string;
  font?: string; // w:rFonts w:ascii
  sizePt?: number; // tipografske tocke (w:sz je pola-tocke)
  bold?: boolean;
  italic?: boolean;
  jc?: 'both' | 'left' | 'center' | 'right'; // poravnanje
  spacing15?: boolean; // true => prored 1,5 (w:line 360 auto)
  spacingLine?: number; // w:line vrijednost (240-tine): 276 => 1,15; ima prednost pred spacing15
  before?: number; // razmak PRIJE odlomka u tockama (w:spacing w:before, 20-tine tocke)
  after?: number; // razmak POSLIJE odlomka u tockama (w:spacing w:after, 20-tine tocke)
  styleId?: string; // npr. "Heading1" za naslov
  empty?: true; // emitira potpuno childless <w:p/> (Word bare Enter), zanemaruje sva ostala polja
  raw?: string; // escape hatch: doslovni XML jednog odlomka (bookmark, prijelom stranice, sectPr...), emitira se bez izmjene
}

/** Fusnota s oblikovanjem (podskup ParaSpec-a): tekst + font/velicina/prored/razmaci/poravnanje.
 *  Emitira se istim `paraXml`-om kao odlomak tijela, pa je oblik dosljedan i testabilan. */
export interface FootnoteSpec {
  text: string;
  font?: string;
  sizePt?: number;
  jc?: 'both' | 'left' | 'center' | 'right';
  spacingLine?: number;
  before?: number;
  after?: number;
}

/** Podnožje sa (zadanim) brojem stranice: word/footer1.xml + veza u document.xml.rels.
 *  Emitira se SAMO kad je `spec.footer` zadan, pa je izlaz za postojece specove BAJT-IDENTICAN.
 *  Parser (analyze-docx) cita footer preko w:footerReference -> relMap -> partPageInfo (PAGE + w:jc). */
export interface FooterSpec {
  page?: boolean; // PAGE polje u podnožju (default true); false = podnožje bez broja
  align?: 'left' | 'center' | 'right'; // poravnanje odlomka podnožja (w:jc), za provjeru položaja broja
}

export interface DocSpec {
  paragraphs: ParaSpec[];
  /** Opcionalni stilovi za testove koji moraju imati Normal backstop. */
  stylesXml?: string;
  pageCm?: { w: number; h: number }; // default A4 21 x 29,7
  marginsCm?: { top: number; right: number; bottom: number; left: number };
  footnotes?: (string | FootnoteSpec)[]; // fusnote (string = goli tekst, ili FootnoteSpec s oblikom); word/footnotes.xml (id 1..N)
  /** Biljeske na KRAJU dokumenta (word/endnotes.xml). Word ih tretira odvojeno od fusnota:
   *  dokument koji ih koristi nema nijednu `w:footnote`, pa je do 2026-08-20 analiza javljala
   *  "Nije pronadjena nijedna Word fusnota" iako biljeske postoje. */
  endnotes?: (string | FootnoteSpec)[];
  footer?: FooterSpec; // podnožje s brojem stranice na ZAVRŠNOJ sekciji (dokument-level sectPr)
  /**
   * Emitira `word/settings.xml`. OPT-IN, pa je izlaz za postojece specove BAJT-IDENTICAN.
   *
   * Zasto postoji: `field-integrity-fixer` na kraju zahvata trazi `word/settings.xml` da upise
   * `w:updateFields`, a bez njega vraca `no-target` za CIJELI zahtjev, ukljucujuci polja koja je
   * vec uspjesno oznacio. Word taj dio pise u svaki dokument, pa ga stvarni radovi uvijek imaju
   * (provjereno: `fer-diplomski-puna-struktura.docx` ima, ovaj graditelj nije imao).
   *
   * IZMJERENO 2026-08-31: bez njega je `field-integrity-fixer` na generiranom dokumentu bio
   * nedostizan, sto je 400 celija matrice pokrivenosti drzalo bez dokaza.
   */
  settings?: true;
  pageNumberStart?: number; // w:pgNumType w:start na završnoj sekciji (npr. glavni tekst numeriran od 1)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paraXml(p: ParaSpec): string {
  // Escape hatch prvo: doslovni XML jednog odlomka, bez ikakve obrade (bookmarkovi,
  // prijelom stranice, ugnjezdeni sectPr...), koristi se za negative/protected fixture.
  if (p.raw !== undefined) return p.raw;
  // Potpuno childless odlomak (Word bare Enter): NIKAKAV drugi field na ovom
  // specu se ne primjenjuje, ni pPr ni rPr ni tekst.
  if (p.empty) return '<w:p/>';

  const rpr: string[] = [];
  if (p.font) rpr.push(`<w:rFonts w:ascii="${esc(p.font)}" w:hAnsi="${esc(p.font)}"/>`);
  if (p.sizePt) rpr.push(`<w:sz w:val="${Math.round(p.sizePt * 2)}"/>`);
  if (p.bold) rpr.push('<w:b/>');
  if (p.italic) rpr.push('<w:i/>');
  const rPr = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';

  const ppr: string[] = [];
  if (p.styleId) ppr.push(`<w:pStyle w:val="${esc(p.styleId)}"/>`);
  // Jedan <w:spacing> element nosi before/after (20-tine tocke) i line. Atributi se dodaju samo
  // kad su zadani, pa je izlaz za postojece specove (bez before/after) BAJT-IDENTICAN.
  const sp: string[] = [];
  if (p.before != null) sp.push(`w:before="${Math.round(p.before * 20)}"`);
  if (p.after != null) sp.push(`w:after="${Math.round(p.after * 20)}"`);
  if (p.spacingLine) sp.push(`w:line="${p.spacingLine}"`, 'w:lineRule="auto"');
  else if (p.spacing15) sp.push('w:line="360"', 'w:lineRule="auto"');
  if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`);
  if (p.jc) ppr.push(`<w:jc w:val="${p.jc}"/>`);
  const pPr = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';

  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

/**
 * Pravo Word TOC polje (w:fldChar begin + w:instrText TOC + spremljeni rezultat + end).
 *
 * Uskladjen sinteticki rad mora ga IMATI, jer je do 2026-08-20 bodove za sadrzaj davala labava
 * detekcija: rijec "TOC" bilo gdje u sirovom XML-u ILI odlomak ciji je cijeli tekst tocno
 * "Sadrzaj". Goli naslov bez ijedne stavke tako je nosio punih 5 bodova.
 */
export const TOC_FIELD_PARA: ParaSpec = {
  text: '',
  raw:
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t xml:space="preserve">Uvod&#9;1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
};

const FOOTER_RID = 'rId100'; // veza document.xml.rels -> word/footer1.xml
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function sectPrXml(spec: DocSpec): string {
  const page = spec.pageCm ?? { w: 21.0, h: 29.7 };
  const m = spec.marginsCm ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  const tw = (cm: number) => Math.round(cm * TWIPS_PER_CM);
  // Redoslijed po OOXML shemi: footerReference, pgSz, pgMar, pgNumType. xmlns:r deklariran LOKALNO
  // na footerReference (root document.xml nema xmlns:r) pa je izlaz bez footera BAJT-IDENTICAN.
  const footerRef = spec.footer ? `<w:footerReference w:type="default" r:id="${FOOTER_RID}" xmlns:r="${REL_NS}"/>` : '';
  const pgNum = spec.pageNumberStart != null ? `<w:pgNumType w:start="${spec.pageNumberStart}"/>` : '';
  return (
    `<w:sectPr>` +
    footerRef +
    `<w:pgSz w:w="${tw(page.w)}" w:h="${tw(page.h)}"/>` +
    `<w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}"/>` +
    pgNum +
    `</w:sectPr>`
  );
}

/** word/footer1.xml: jedan odlomak s (opcionalnim) PAGE poljem i poravnanjem; parser cita PAGE + w:jc. */
function footerXml(f: FooterSpec): string {
  const jc = f.align ? `<w:pPr><w:jc w:val="${f.align}"/></w:pPr>` : '';
  const pageField = f.page === false ? '' :
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p>${jc}${pageField}</w:p></w:ftr>`
  );
}

/** word/_rels/document.xml.rels s vezom na footer1.xml (parser relMap: Id -> Target). */
const DOCUMENT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="${FOOTER_RID}" Type="${REL_NS}/footer" Target="footer1.xml"/>` +
  `</Relationships>`;

export function documentXml(spec: DocSpec): string {
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
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>` +
  `</w:styles>`;

function contentTypesXml(hasFootnotes: boolean, hasFooter = false, hasEndnotes = false, hasSettings = false): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    (hasSettings
      ? `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`
      : '') +
    (hasFootnotes
      ? `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`
      : '') +
    (hasEndnotes
      ? `<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>`
      : '') +
    (hasFooter
      ? `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
      : '') +
    `</Types>`
  );
}

/** word/footnotes.xml s fusnotama id 1..N (parser cita ovaj dio izravno). Svaka fusnota se
 *  renderira istim `paraXml`-om kao odlomak tijela; goli string je ekvivalent `{text}` i daje
 *  BAJT-IDENTICAN izlaz kao prije (bez pPr/rPr), a FootnoteSpec dodaje oblik (font, velicina,
 *  razmaci) za provjere oblikovanja/razmaka fusnota. */
function footnotesXml(notes: (string | FootnoteSpec)[]): string {
  const body = notes
    .map((n, i) => {
      const spec: ParaSpec = typeof n === 'string' ? { text: n } : { ...n };
      return `<w:footnote w:id="${i + 1}">${paraXml(spec)}</w:footnote>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:footnotes>`
  );
}

/** word/endnotes.xml s biljeskama id 1..N. Isti oblik kao footnotesXml; Wordovi separatori
 *  (id 0 i -1) se ne emitiraju, kao ni u footnotesXml. */
function endnotesXml(notes: (string | FootnoteSpec)[]): string {
  const body = notes
    .map((n, i) => {
      const spec: ParaSpec = typeof n === 'string' ? { text: n } : { ...n };
      return `<w:endnote w:id="${i + 1}">${paraXml(spec)}</w:endnote>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:endnotes>`
  );
}

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

// --- CRC32 ---
const CRC_TABLE = (() => {
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

export interface ZipFileSpec { name: string; data: Uint8Array }

/** Sastavi ZIP s pohranjenim (nekompresiranim) zapisima koje ZipReader cita (method 0).
 *  Exportan za sigurnosne testove (zip-hardening, intake-gate) koji grade i ne-docx arhive. */
export function zipStore(files: ZipFileSpec[]): Uint8Array {
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
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // comp size
    lv.setUint32(22, size, true); // uncomp size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    lh.set(nameBytes, 30);
    locals.push(lh, f.data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, 0, true); // time
    cv.setUint16(14, 0x21, true); // date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); // comp
    cv.setUint32(24, size, true); // uncomp
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // int attr
    cv.setUint32(38, 0, true); // ext attr
    cv.setUint32(42, offset, true); // local header offset
    ch.set(nameBytes, 46);
    centrals.push(ch);

    offset += lh.length + f.data.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); // entries this disk
  ev.setUint16(10, files.length, true); // entries total
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

/** Izgradi .docx (Uint8Array) iz specifikacije dokumenta.
 *  `extraFiles` (aditivno, default prazno) dodaje proizvoljne zapise u arhivu; sluzi
 *  sigurnosnim testovima (vbaProject.bin, docProps/app.xml, patoloski footnotes.xml).
 *  Zapis iz extraFiles s istim imenom NADJACAVA standardni dio (zadnji u mapi pobjedjuje
 *  u ZipReader.entries), pa test moze podmetnuti vlastiti footnotes.xml. */
export function buildDocx(spec: DocSpec, extraFiles: ZipFileSpec[] = []): Uint8Array {
  const enc = new TextEncoder();
  const hasFootnotes = !!spec.footnotes?.length;
  const hasEndnotes = !!spec.endnotes?.length;
  const hasFooter = !!spec.footer;
  const hasSettings = spec.settings === true;
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml(hasFootnotes, hasFooter, hasEndnotes, hasSettings)) },
    { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'word/document.xml', data: enc.encode(documentXml(spec)) },
    { name: 'word/styles.xml', data: enc.encode(spec.stylesXml ?? STYLES_XML) },
  ];
  /**
   * Minimalan `word/settings.xml`. Word ga pise u svaki dokument, a `field-integrity-fixer` ga
   * TRAZI: bez njega vraca `no-target` za cijeli zahtjev, i to NAKON sto je polja vec oznacio.
   */
  if (hasSettings) {
    files.push({
      name: 'word/settings.xml',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
      ),
    });
  }
  if (hasFootnotes) files.push({ name: 'word/footnotes.xml', data: enc.encode(footnotesXml(spec.footnotes!)) });
  if (hasEndnotes) files.push({ name: 'word/endnotes.xml', data: enc.encode(endnotesXml(spec.endnotes!)) });
  if (hasFooter) {
    files.push({ name: 'word/footer1.xml', data: enc.encode(footerXml(spec.footer!)) });
    files.push({ name: 'word/_rels/document.xml.rels', data: enc.encode(DOCUMENT_RELS) });
  }
  return zipStore([...files, ...extraFiles]);
}

/** Pomocno: .docx kao File objekt (analyzeDocx ocekuje file.arrayBuffer() i file.name). */
export function buildDocxFile(spec: DocSpec, name = 'sinteticki.docx', extraFiles: ZipFileSpec[] = []): File {
  const bytes = buildDocx(spec, extraFiles);
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
