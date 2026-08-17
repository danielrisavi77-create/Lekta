/**
 * OOXML/DOCX parser izvucen iz monolita (src/main.ts), korak 2 porta enginea.
 *
 * Framework-agnosticno: cita .docx (ZIP) i OOXML XML cvorove, bez UI-ja i globalnog
 * stanja. Tijela funkcija prepisana su 1:1 iz monolita, dodani su samo tipovi, pa golden
 * snapshoti ostaju nepromijenjeni. Tipovi OOXML cvorova su labavi (`any`) jer je ovo
 * granica prema monolitu (CLAUDE.md dopusta `any` na granici dok traje split); XML
 * pomocnici (attr/els/first/direct) dolaze iz utils/helpers.
 *
 * Okruzenje: ZipReader koristi `DecompressionStream('deflate-raw')` (preglednik) ili
 * cita pohranjene (method 0) zapise izravno; parseXml koristi globalni DOMParser
 * (u testu podmetnut @xmldom/xmldom, vidi tests/setup/xml-dom.ts).
 */
import { DOCX_MAX_ZIP_ENTRIES, DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY } from '../repair/docx-budget';
import { attr, els, first, direct } from '../utils/helpers.ts';

interface ZipEntry {
  name: string;
  method: number;
  comp: number;
  uncomp: number;
  local: number;
}

/**
 * Gornja granica dekomprimiranog sadrzaja PO ZAPISU (obrana od dekompresijske bombe).
 * Realan diplomski `document.xml` je nekoliko MB, pa 200 MB daje velik zazor bez laznih
 * odbijanja, a zaustavlja mali .docx koji deflate omjerom (~1000:1) cilja gigabajte.
 */
export const MAX_DECOMPRESSED_BYTES = DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY;

/**
 * Gornja granica broja zapisa u arhivi. Realan .docx ima 10-40 zapisa, doktorat prepun
 * slika 200-300 (svaka slika je zapis); 512 daje visestruki zazor, a napadacki zipovi
 * deklariraju do 65535 (EOCD count je uint16) da napusu central-directory obradu.
 */
export const MAX_ZIP_ENTRIES = DOCX_MAX_ZIP_ENTRIES;

/**
 * Sigurnosna granica broja odlomaka za jeftini regex pre-scan XML dijelova PRIJE DOM
 * parsiranja. Ista vrijednost kao MAX_ANALYZE_PARAGRAPHS u analyze-docx.ts (tamo lokalna
 * konstanta da se engine import graf ne dira); ovdje exportana za intake sloj (UI).
 */
export const MAX_SCAN_PARAGRAPHS = 300000;

/** Greska kad zapis premasi sigurnosnu granicu dekompresije (razlikovanje od korupcije). */
export class ZipLimitError extends Error {}

/** DecompressionStream iz globalnog opsega (preglednik ili Node 18+); null izvan oba. */
function getDecompressionStream(): any {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return g && g.DecompressionStream ? g.DecompressionStream : null;
}

/**
 * Raspakiraj deflate-raw uz TVRDI cap na izlaz: cita stream u komadima i prekida cim
 * ukupno premasi `maxBytes`, pa lazljiva bomba (mala deklarirana velicina, golem stvarni
 * izlaz) ne moze alocirati vise od granice. Vraca spojene bajtove.
 */
async function inflateWithCap(compressed: Uint8Array, maxBytes: number, ds: any): Promise<Uint8Array> {
  const reader = new Blob([compressed as any]).stream().pipeThrough(ds).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const res = await reader.read();
    if (res.done) break;
    const chunk = res.value as Uint8Array;
    total += chunk.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* prekid nakon prekoracenja */ }
      throw new ZipLimitError(
        `Dekomprimirani sadrzaj premasuje sigurnosnu granicu (${Math.round(maxBytes / 1024 / 1024)} MB). Datoteka je odbijena kao moguca dekompresijska bomba.`,
      );
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.byteLength; }
  return out;
}

/** Cita ZIP/DOCX arhivu iz ArrayBuffera; vraca pojedine dijelove kao bajtove ili tekst. */
export class ZipReader {
  view: DataView;
  bytes: Uint8Array;
  entries: Map<string, ZipEntry>;
  maxBytes: number;
  // Agregatni cross-entry cap: zbroj SVIH dekomprimiranih bajtova ove arhive ne smije
  // premasiti 2x per-entry budzet. Legitimna analiza cita document.xml (dominira) + stilove,
  // temu, fusnote, rels i zaglavlja, ukupno daleko ispod 2x; bomba od stotina zapisa pada
  // s teoretskih N x maxBytes na 2x. Ponovljena citanja istog zapisa dvostruko se broje
  // (prihvatljivo uz 2x zazor; partPageCache u analyzeDocx ionako sprjecava ponavljanja).
  usedBytes = 0;
  aggregateMax: number;

  constructor(buffer: ArrayBuffer, opts: { maxDecompressedBytes?: number } = {}) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.entries = new Map();
    this.maxBytes = opts.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES;
    this.aggregateMax = this.maxBytes * 2;
    this.parse();
  }

  parse() {
    let eocd = -1;
    for (let i = this.bytes.length - 22; i >= Math.max(0, this.bytes.length - 65557); i--) {
      if (this.view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Datoteka nije valjana ZIP/DOCX arhiva.');
    const count = this.view.getUint16(eocd + 10, true), offset = this.view.getUint32(eocd + 16, true);
    if (count > MAX_ZIP_ENTRIES) {
      throw new ZipLimitError(
        `DOCX arhiva sadrži previše zapisa i premašuje sigurnosnu granicu (${MAX_ZIP_ENTRIES} zapisa). Datoteka je odbijena.`,
      );
    }
    let p = offset;
    for (let i = 0; i < count; i++) {
      if (this.view.getUint32(p, true) !== 0x02014b50) break;
      const method = this.view.getUint16(p + 10, true), comp = this.view.getUint32(p + 20, true), uncomp = this.view.getUint32(p + 24, true), nameLen = this.view.getUint16(p + 28, true), extraLen = this.view.getUint16(p + 30, true), commentLen = this.view.getUint16(p + 32, true), local = this.view.getUint32(p + 42, true);
      const name = new TextDecoder().decode(this.bytes.slice(p + 46, p + 46 + nameLen));
      this.entries.set(name, { name, method, comp, uncomp, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  names(): string[] { return [...this.entries.keys()]; }

  /**
   * Zbroj DEKLARIRANIH dekomprimiranih velicina svih zapisa, iz central directoryja.
   *
   * Jeftino (bez ijedne dekompresije) i dostupno odmah nakon `parse()`. Sluzi `docxCapability`
   * da JOS PRIJE analize zna hoce li popravak moci progutati paket, umjesto da korisnik to sazna
   * tek nakon privole i slanja na server. Deklarirana velicina moze lagati (bomba deklarira malo),
   * ali za ovu namjenu je dovoljna: streaming capovi u `data()` i zip-codecu hvataju lazljivca.
   */
  declaredUncompressedTotal(): number {
    let total = 0;
    for (const e of this.entries.values()) total += e.uncomp;
    return total;
  }

  /** Broj zapisa u arhivi (nakon `parse()`). */
  entryCount(): number { return this.entries.size; }

  async data(name: string): Promise<Uint8Array | null> {
    const e = this.entries.get(name);
    if (!e) return null;
    const p = e.local;
    if (this.view.getUint32(p, true) !== 0x04034b50) throw new Error('Oštećen lokalni zapis u DOCX datoteci.');
    // Efektivni cap za OVAJ zapis: per-entry granica, dodatno stegnuta preostalim agregatnim
    // budzetom (2x per-entry preko cijele arhive), da zbroj mnogo "urednih" zapisa ne moze
    // napuhati memoriju iako je svaki pojedinacno ispod granice.
    const cap = Math.min(this.maxBytes, this.aggregateMax - this.usedBytes);
    // Jeftin pred-filtar: deklarirana nekomprimirana velicina iznad granice = odbij odmah.
    // Lazljivu bombu (mali uncomp, golem stvarni izlaz) hvata streaming cap ispod.
    if (e.uncomp > cap) {
      throw new ZipLimitError(
        `Deklarirana velicina zapisa premasuje sigurnosnu granicu (${Math.round(cap / 1024 / 1024)} MB). Datoteka je odbijena kao moguca dekompresijska bomba.`,
      );
    }
    const nameLen = this.view.getUint16(p + 26, true), extraLen = this.view.getUint16(p + 28, true), start = p + 30 + nameLen + extraLen, compressed = this.bytes.slice(start, start + e.comp);
    if (e.method === 0) {
      if (compressed.byteLength > cap) throw new ZipLimitError('Zapis premasuje sigurnosnu granicu.');
      this.usedBytes += compressed.byteLength;
      return compressed;
    }
    if (e.method === 8) {
      const DS = getDecompressionStream();
      if (!DS) throw new Error('Ovaj preglednik ne podržava lokalno raspakiravanje DOCX datoteka. Otvori aplikaciju u novijem Chromeu, Edgeu ili Firefoxu.');
      let ds;
      try { ds = new DS('deflate-raw'); } catch (err) { throw new Error('Preglednik ne podržava deflate-raw raspakiravanje. Upotrijebi noviji Chrome ili Edge.'); }
      const out = await inflateWithCap(compressed, cap, ds);
      this.usedBytes += out.byteLength;
      return out;
    }
    throw new Error(`Nepodržana ZIP kompresija (${e.method}).`);
  }

  async text(name: string): Promise<string> {
    const d = await this.data(name);
    return d ? new TextDecoder('utf-8').decode(d) : '';
  }
}

/** Parsiraj XML string u dokument; baci gresku ako ima parsererror cvor.
 *  Odbija dokumente s DTD-om (`<!DOCTYPE`): preglednicki DOMParser ne siri vanjske entitete,
 *  ali interni ugnijezdeni entiteti (billion laughs) su nepotreban rizik u .docx dijelovima
 *  koje Word nikad ne pise, pa ih odbacujemo prije parsiranja (defense-in-depth). */
export function parseXml(s: string, label = 'XML'): Document {
  if (/<!DOCTYPE/i.test(s)) throw new Error(`${label} sadrži DTD deklaraciju i odbijen je iz sigurnosnih razloga.`);
  const x = new DOMParser().parseFromString(s, 'application/xml');
  if (first(x as any, 'parsererror')) throw new Error(`${label} nije moguće pročitati.`);
  return x;
}

/** Procitaj run (znakovna) svojstva: font, velicina, bold, italic. */
export function readRPr(rPr: any): any {
  if (!rPr) return {};
  const out: any = {}, fonts = direct(rPr, 'w:rFonts'), sz = direct(rPr, 'w:sz'), b = direct(rPr, 'w:b'), i = direct(rPr, 'w:i');
  const font = attr(fonts, 'w:ascii') || attr(fonts, 'w:hAnsi') || attr(fonts, 'w:cs');
  if (font) out.font = font;
  // Dokument u zadanoj Wordovoj temi (npr. Calibri) nema eksplicitni w:ascii, samo
  // w:asciiTheme (minorHAnsi/majorHAnsi). Zapamti temu da je analyzeDocx razrijesi iz
  // theme1.xml; bez toga font ostaje null i provjera fonta lazno prolazi. Vidi AUD-04.
  else { const ft = attr(fonts, 'w:asciiTheme') || attr(fonts, 'w:hAnsiTheme') || attr(fonts, 'w:cstheme'); if (ft) out.fontTheme = ft; }
  if (sz && attr(sz, 'w:val') != null) out.size = Number(attr(sz, 'w:val')) / 2;
  if (b) out.bold = !['0', 'false', 'off'].includes(String(attr(b, 'w:val') || '1').toLowerCase());
  if (i) out.italic = !['0', 'false', 'off'].includes(String(attr(i, 'w:val') || '1').toLowerCase());
  // Znakovni stilovi za vjeran prikaz (faksimil): podcrtavanje, verzal (w:caps), kapitalke,
  // precrtano, boja. Toggle svojstva slijede istu logiku kao b/i (prisutnost = ukljuceno, val 0/off
  // = iskljuceno). Aditivno: analiza (font/velicina/prored) ih ne cita, samo preview ih propusta.
  const u = direct(rPr, 'w:u'), caps = direct(rPr, 'w:caps'), smallCaps = direct(rPr, 'w:smallCaps'), strike = direct(rPr, 'w:strike'), color = direct(rPr, 'w:color'), vertAlign = direct(rPr, 'w:vertAlign');
  const toggle = (el: any) => !['0', 'false', 'off'].includes(String(attr(el, 'w:val') || '1').toLowerCase());
  if (u && String(attr(u, 'w:val') || 'single').toLowerCase() !== 'none') out.underline = true;
  if (caps) out.caps = toggle(caps);
  if (smallCaps) out.smallCaps = toggle(smallCaps);
  if (strike) out.strike = toggle(strike);
  if (color) { const cv = attr(color, 'w:val'); if (cv && String(cv).toLowerCase() !== 'auto') out.color = '#' + cv; }
  if (vertAlign) {
    const value = String(attr(vertAlign, 'w:val') || '').toLowerCase();
    if (value === 'superscript' || value === 'subscript') out.vertAlign = value;
  }
  return out;
}

/** Procitaj paragraph svojstva: prored, poravnanje, outline razina, stil, numeriranje. */
export function readPPr(pPr: any): any {
  if (!pPr) return {};
  const sp = direct(pPr, 'w:spacing'), jc = direct(pPr, 'w:jc'), ol = direct(pPr, 'w:outlineLvl'), ps = direct(pPr, 'w:pStyle');
  let line = null;
  // Samo lineRule='auto' kodira prored kao visekratnik (240-tine). 'exact'/'atLeast' su
  // apsolutne tocke (20-tine) i NISU usporedivi s profilnim omjerom (npr. 1.5), pa ih
  // ostavljamo null (prored "nije pouzdano ocitljiv") umjesto laznog pada. Vidi AUD-01.
  if (sp && attr(sp, 'w:line')) { const v = Number(attr(sp, 'w:line')), rule = attr(sp, 'w:lineRule') || 'auto'; if (rule === 'auto') line = v / 240; }
  return { styleId: attr(ps, 'w:val') || null, line, lineRule: attr(sp, 'w:lineRule') || null, before: sp && attr(sp, 'w:before') ? Number(attr(sp, 'w:before')) / 20 : null, after: sp && attr(sp, 'w:after') ? Number(attr(sp, 'w:after')) / 20 : null, align: attr(jc, 'w:val') || null, outline: ol ? Number(attr(ol, 'w:val')) : null, num: !!direct(pPr, 'w:numPr') };
}

/** Spoji vise objekata preskacuci falsy (kaskada stilova). */
export function merge(...objs: any[]): any { return Object.assign({}, ...objs.filter(Boolean)); }

/** Izgradi rjesavac kaskade stilova iz styles.xml. */
export function parseStyles(xml: any): any {
  const styles = new Map<string, any>();
  let defaultR: any = {}, defaultP: any = {}, defaultParagraphStyleId: string | null = null;
  const dd = first(xml, 'w:docDefaults');
  if (dd) { defaultR = readRPr(first(first(dd, 'w:rPrDefault'), 'w:rPr')); defaultP = readPPr(first(first(dd, 'w:pPrDefault'), 'w:pPr')); }
  for (const s of els(xml, 'w:style')) {
    const id = attr(s, 'w:styleId');
    if (!id) continue;
    const styleType = attr(s, 'w:type') || '';
    if (styleType === 'paragraph' && attr(s, 'w:default') === '1') defaultParagraphStyleId = id;
    styles.set(id, { id, name: attr(direct(s, 'w:name'), 'w:val') || id, basedOn: attr(direct(s, 'w:basedOn'), 'w:val') || null, type: attr(s, 'w:type') || '', r: readRPr(direct(s, 'w:rPr')), p: readPPr(direct(s, 'w:pPr')) });
  }
  const cache = new Map<string, any>();
  function resolve(id: string | null, seen = new Set<string>()): any {
    if (!id || !styles.has(id)) return { r: {}, p: {}, name: id || '' };
    if (cache.has(id)) return cache.get(id);
    if (seen.has(id)) return { r: {}, p: {}, name: id };
    seen.add(id);
    const s = styles.get(id), b = resolve(s.basedOn, seen), o = { r: merge(b.r, s.r), p: merge(b.p, s.p), name: s.name, id };
    cache.set(id, o);
    return o;
  }
  return { styles, resolve, defaultR, defaultP, defaultParagraphStyleId };
}

/** Razrijesi tema-fontove iz word/theme/theme1.xml: minor (tijelo) i major (naslovi) latin
 *  typeface. asciiTheme='minorHAnsi' -> minor; 'majorHAnsi' -> major. Vraca null ako teme nema
 *  ili je neispravna, pa se ponasanje vraca na "font nije eksplicitan". */
export function parseThemeFonts(xmlText: string | null | undefined): { minor: string | null; major: string | null } | null {
  if (!xmlText) return null;
  let x: any;
  try { x = parseXml(xmlText, 'Word tema'); } catch { return null; }
  const scheme = first(x, 'a:fontScheme');
  if (!scheme) return null;
  const latin = (node: any) => { const f = node ? first(node, 'a:latin') : null; return f ? (attr(f, 'typeface') || null) : null; };
  return { minor: latin(first(scheme, 'a:minorFont')), major: latin(first(scheme, 'a:majorFont')) };
}

/** Izvuci tekst odlomka (tabovi, prijelomi, nbsp). */
export function paragraphText(p: any): string {
  let out = '';
  for (const n of p.getElementsByTagName('*')) {
    if (n.nodeName === 'w:t' || n.localName === 't') out += n.textContent;
    else if (n.nodeName === 'w:tab' || n.localName === 'tab') out += '\t';
    else if (n.nodeName === 'w:br' || n.localName === 'br') out += '\n';
  }
  return out.replace(/\u00a0/g, ' ');
}

/** Odredi razinu naslova iz imena stila ili outline razine. */
export function headingLevel(styleName: any, pProps: any): number | null {
  const n = String(styleName || '');
  // [1-9] uz negativni lookahead: "Heading 10" (viseznamenkasti custom stil) se NE cita kao
  // razina 1, nego pada na pouzdaniji outlineLvl. Word ugradjeni naslovi su 1-9.
  let m = n.match(/(?:heading|naslov)\s*([1-9])(?![0-9])/i);
  if (m) return Number(m[1]);
  // OOXML w:outlineLvl val 0-8 su razine 1-9; val 9 znaci "Body Text" (bez outline razine),
  // pa se NE smije tumaciti kao naslov razine 10 (onecistio bi hijerarhiju i broj naslova). AUD-06.
  if (Number.isFinite(pProps.outline) && pProps.outline >= 0 && pProps.outline <= 8) return pProps.outline + 1;
  return null;
}

/** Inspekcija oznaka fusnota (w:footnoteReference) u tijelu dokumenta.
 *  Granicni znakovi (znak prije/poslije markera) racunaju se u O(n) po odlomku: tekst po
 *  runu se predizracuna jednom, "znak prije" iz akumulatora zadnjeg ne-praznog znaka, a
 *  "znak poslije" iz unaprijed izracunatog polja prvog ne-praznog znaka. Prije je svaki
 *  marker re-serijalizirao SVE ostale runove (O(n^2), meta za freeze na dokumentu s mnogo
 *  fusnota u jednom odlomku). Ponasanje je identicno (golden to dokazuje). */
export function inspectFootnoteMarkers(doc: any, styleData: any): any[] {
  const out: any[] = [];
  for (const [pi, p] of els(doc, 'w:p').entries()) {
    const runs = els(p, 'w:r');
    const runText = runs.map((r) => paragraphText(r));
    // firstNonWsFrom[j] = prvi ne-prazni znak u spoju runova j..kraj (ekvivalent ltrim + prvi znak)
    const firstNonWsFrom: string[] = new Array(runs.length + 1);
    firstNonWsFrom[runs.length] = '';
    for (let j = runs.length - 1; j >= 0; j--) {
      const m = runText[j].match(/\S/);
      firstNonWsFrom[j] = m ? m[0] : firstNonWsFrom[j + 1];
    }
    let lastNonWsBefore = ''; // zadnji ne-prazni znak u runovima prije trenutnog (ekvivalent rtrim + zadnji znak)
    for (let i = 0; i < runs.length; i++) {
      const ref = first(runs[i], 'w:footnoteReference');
      if (ref) {
        const id = Number(attr(ref, 'w:id'));
        if (id >= 1) {
          const rPr = direct(runs[i], 'w:rPr'),
            rStyleId = attr(direct(rPr, 'w:rStyle'), 'w:val'),
            rs = styleData.resolve(rStyleId),
            rp = merge(styleData.defaultR, rs.r, readRPr(rPr));
          out.push({ id, paragraph: pi + 1, before: lastNonWsBefore, after: firstNonWsFrom[i + 1], italic: rp.italic === true });
        }
      }
      const trimmed = runText[i].replace(/\s+$/, '');
      if (trimmed) lastNonWsBefore = trimmed.slice(-1);
    }
  }
  return out;
}
