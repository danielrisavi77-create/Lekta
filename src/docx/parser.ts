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
import { attr, els, first, direct } from '../utils/helpers';

interface ZipEntry {
  name: string;
  method: number;
  comp: number;
  uncomp: number;
  local: number;
}

/** Cita ZIP/DOCX arhivu iz ArrayBuffera; vraca pojedine dijelove kao bajtove ili tekst. */
export class ZipReader {
  view: DataView;
  bytes: Uint8Array;
  entries: Map<string, ZipEntry>;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.entries = new Map();
    this.parse();
  }

  parse() {
    let eocd = -1;
    for (let i = this.bytes.length - 22; i >= Math.max(0, this.bytes.length - 65557); i--) {
      if (this.view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Datoteka nije valjana ZIP/DOCX arhiva.');
    const count = this.view.getUint16(eocd + 10, true), offset = this.view.getUint32(eocd + 16, true);
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

  async data(name: string): Promise<Uint8Array | null> {
    const e = this.entries.get(name);
    if (!e) return null;
    const p = e.local;
    if (this.view.getUint32(p, true) !== 0x04034b50) throw new Error('Oštećen lokalni zapis u DOCX datoteci.');
    const nameLen = this.view.getUint16(p + 26, true), extraLen = this.view.getUint16(p + 28, true), start = p + 30 + nameLen + extraLen, compressed = this.bytes.slice(start, start + e.comp);
    if (e.method === 0) return compressed;
    if (e.method === 8) {
      if (!('DecompressionStream' in window)) throw new Error('Ovaj preglednik ne podržava lokalno raspakiravanje DOCX datoteka. Otvori aplikaciju u novijem Chromeu, Edgeu ili Firefoxu.');
      let ds;
      try { ds = new (window as any).DecompressionStream('deflate-raw'); } catch (err) { throw new Error('Preglednik ne podržava deflate-raw raspakiravanje. Upotrijebi noviji Chrome ili Edge.'); }
      const out = await new Response(new Blob([compressed]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(out);
    }
    throw new Error(`Nepodržana ZIP kompresija (${e.method}).`);
  }

  async text(name: string): Promise<string> {
    const d = await this.data(name);
    return d ? new TextDecoder('utf-8').decode(d) : '';
  }
}

/** Parsiraj XML string u dokument; baci gresku ako ima parsererror cvor. */
export function parseXml(s: string, label = 'XML'): Document {
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
  if (sz && attr(sz, 'w:val') != null) out.size = Number(attr(sz, 'w:val')) / 2;
  if (b) out.bold = !['0', 'false', 'off'].includes(String(attr(b, 'w:val') || '1').toLowerCase());
  if (i) out.italic = !['0', 'false', 'off'].includes(String(attr(i, 'w:val') || '1').toLowerCase());
  return out;
}

/** Procitaj paragraph svojstva: prored, poravnanje, outline razina, stil, numeriranje. */
export function readPPr(pPr: any): any {
  if (!pPr) return {};
  const sp = direct(pPr, 'w:spacing'), jc = direct(pPr, 'w:jc'), ol = direct(pPr, 'w:outlineLvl'), ps = direct(pPr, 'w:pStyle');
  let line = null;
  if (sp && attr(sp, 'w:line')) { const v = Number(attr(sp, 'w:line')), rule = attr(sp, 'w:lineRule') || 'auto'; line = rule === 'auto' ? v / 240 : v / 20; }
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
  let m = n.match(/(?:heading|naslov)\s*([1-9])/i);
  if (m) return Number(m[1]);
  if (Number.isFinite(pProps.outline)) return pProps.outline + 1;
  return null;
}

/** Inspekcija oznaka fusnota (w:footnoteReference) u tijelu dokumenta. */
export function inspectFootnoteMarkers(doc: any, styleData: any): any[] {const out=[];for(const [pi,p] of els(doc,'w:p').entries()){const runs=els(p,'w:r');for(let i=0;i<runs.length;i++){const ref=first(runs[i],'w:footnoteReference');if(!ref)continue;const id=Number(attr(ref,'w:id'));if(id<1)continue;const prev=runs.slice(0,i).map(paragraphText).join('').replace(/\s+$/,''),next=runs.slice(i+1).map(paragraphText).join('').replace(/^\s+/,'');const rPr=direct(runs[i],'w:rPr'),rStyleId=attr(direct(rPr,'w:rStyle'),'w:val'),rs=styleData.resolve(rStyleId),rp=merge(styleData.defaultR,rs.r,readRPr(rPr));out.push({id,paragraph:pi+1,before:prev.slice(-1),after:next.slice(0,1),italic:rp.italic===true})}}return out}
