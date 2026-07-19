/**
 * Uvoz strukturirane literature iz upravitelja referenci (Zotero, Mendeley, EndNote...):
 * BibTeX (.bib), RIS (.ris) i CSL-JSON (.json) -> Lektin kanonski CitationInput.
 *
 * ZASTO poseban modul (a ne parse-reference.ts): ovi formati su STRUKTURIRANI, pa se polja
 * mapiraju DETERMINISTICKI (bez heuristike nad slobodnim tekstom). Rezultat je pouzdaniji od
 * bulk-paste puta; svejedno ide u ISTU editabilnu bulk-karticu (obavezan ljudski pregled), pa
 * korisnik vidi i dopuni prije generiranja. Cist, bez DOM-a, bez mreze, potpuno testabilan.
 *
 * Diferencijator: uvezenu referencu Lekta zatim renderira u TOCNOM stilu fakulteta
 * (formatForFaculty), sto Zotero/Mendeley ne znaju za hrvatska sveucilista.
 */
import type { CitationInput, SourceType } from '../tools/citation';

export interface ImportedRef {
  fields: Partial<CitationInput>;
  type: SourceType;
  /** Format iz kojeg je izvučeno ('bibtex' | 'ris' | 'csl'), za dijagnostiku/UI. */
  source: 'bibtex' | 'ris' | 'csl';
}

export type ImportFormat = 'bibtex' | 'ris' | 'csl' | 'auto';

// Zastita: ne obradjuj patoloski velike izvoze u jednom potezu (UI dodatno cuva velicinu datoteke).
const MAX_ENTRIES = 5000;

// --- Zajednicko: tipovi izvora ------------------------------------------------

// CSL-JSON 'type' -> SourceType. Prati isti duh kao CROSSREF_TYPE_MAP (citat-page.ts):
// nepoznato pada na 'knjiga' (najsira, najmanje pogresna pretpostavka; korisnik ionako potvrdjuje).
const CSL_TYPE: Record<string, SourceType> = {
  'article-journal': 'clanak',
  'article-magazine': 'clanak',
  'article-newspaper': 'clanak',
  article: 'clanak',
  'paper-conference': 'poglavlje',
  chapter: 'poglavlje',
  'book-chapter': 'poglavlje',
  book: 'knjiga',
  monograph: 'knjiga',
  thesis: 'zavrsni',
  webpage: 'mrezni',
  'post-weblog': 'mrezni',
  post: 'mrezni',
  dataset: 'mrezni',
  legislation: 'propis',
  bill: 'propis',
  legal_case: 'propis',
  'legal-case': 'propis',
};

// BibTeX entry type (lowercase) -> SourceType.
const BIBTEX_TYPE: Record<string, SourceType> = {
  article: 'clanak',
  book: 'knjiga',
  booklet: 'knjiga',
  proceedings: 'knjiga',
  manual: 'knjiga',
  incollection: 'poglavlje',
  inbook: 'poglavlje',
  inproceedings: 'poglavlje',
  conference: 'poglavlje',
  phdthesis: 'zavrsni',
  mastersthesis: 'zavrsni',
  thesis: 'zavrsni',
  online: 'mrezni',
  electronic: 'mrezni',
  www: 'mrezni',
  webpage: 'mrezni',
  misc: 'mrezni',
};

// RIS TY -> SourceType.
const RIS_TYPE: Record<string, SourceType> = {
  JOUR: 'clanak',
  MGZN: 'clanak',
  NEWS: 'clanak',
  BOOK: 'knjiga',
  EDBOOK: 'knjiga',
  CHAP: 'poglavlje',
  CONF: 'poglavlje',
  CPAPER: 'poglavlje',
  THES: 'zavrsni',
  ELEC: 'mrezni',
  WEB: 'mrezni',
  ICOMM: 'mrezni',
  STAT: 'propis',
  LEGAL: 'propis',
  BILL: 'propis',
  CASE: 'propis',
};

// --- LaTeX dekodiranje (BibTeX vrijednosti) -----------------------------------

// Akcenti kao \v{c}, \'{c}, \"{o}: mapiraj naredbu+slovo u znak. Fokus hrvatski (č/ć/đ/š/ž),
// uz ceste zapadnoeuropske akcente. Sto nije u mapi -> zadrzi golo slovo (bolje nego naredba).
const ACCENT: Record<string, Record<string, string>> = {
  v: { c: 'č', C: 'Č', s: 'š', S: 'Š', z: 'ž', Z: 'Ž', d: 'ď', t: 'ť', n: 'ň', r: 'ř', e: 'ě' },
  "'": { c: 'ć', C: 'Ć', a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
  '"': { a: 'ä', o: 'ö', u: 'ü', e: 'ë', i: 'ï', A: 'Ä', O: 'Ö', U: 'Ü' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', O: 'Ô' },
  '~': { n: 'ñ', a: 'ã', o: 'õ', N: 'Ñ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş' },
  '=': { a: 'ā', e: 'ē', o: 'ō', u: 'ū', i: 'ī' },
  '.': { z: 'ż', Z: 'Ż', e: 'ė' },
  H: { o: 'ő', u: 'ű' },
  u: { a: 'ă', g: 'ğ', G: 'Ğ' },
};

// Samostalne naredbe (bez baznog slova): \dj -> đ itd.
const STANDALONE: Record<string, string> = {
  '\\dj': 'đ', '\\DJ': 'Đ', '\\o': 'ø', '\\O': 'Ø', '\\l': 'ł', '\\L': 'Ł',
  '\\ss': 'ß', '\\ae': 'æ', '\\AE': 'Æ', '\\oe': 'œ', '\\OE': 'Œ', '\\aa': 'å', '\\AA': 'Å',
};

export function decodeLatex(raw: string): string {
  let s = raw;
  // Akcentne naredbe: \v{c}, \v c, \'{c}, \'c, \"o ... (bazno slovo u zagradi ili odmah iza).
  s = s.replace(/\\([v'`"^~c=.Hu])\s*\{?\s*([A-Za-z])\}?/g, (m, cmd: string, letter: string) => {
    const map = ACCENT[cmd];
    return (map && map[letter]) || letter;
  });
  // Samostalne posebne naredbe (\dj, \o, \ss...); dulje prije kracih da \DJ ne padne na \D.
  for (const [cmd, ch] of Object.entries(STANDALONE)) {
    s = s.replace(new RegExp(cmd.replace(/\\/g, '\\\\') + '(\\{\\})?(?![A-Za-z])', 'g'), ch);
  }
  // Escapeani znakovi i preostala tipografija.
  s = s.replace(/\\([&%_$#{}])/g, '$1').replace(/[{}]/g, '').replace(/~/g, ' ').replace(/\\,/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// --- Autori: u ";"-odvojen oblik koji parseAuthors (citation.ts) ocekuje ------

/** CSL/Crossref author objekt {family, given, literal} -> "Prezime, Ime" (ili doslovno za ustanovu). */
function cslNames(list: unknown): string {
  if (!Array.isArray(list)) return '';
  return list
    .map((a: any) => {
      const literal = String(a?.literal || '').trim();
      if (literal) return literal;
      const family = String(a?.family || '').trim();
      const given = String(a?.given || '').trim();
      if (!family && !given) return '';
      return given ? `${family}, ${given}` : family;
    })
    .filter(Boolean)
    .join('; ');
}

/** BibTeX/RIS popis imena (vec razdvojen) -> normaliziran "; " spoj. parseAuthors zna i
 *  "Prezime, Ime" i "Ime Prezime", pa ne diramo unutarnji poredak, samo cistimo. */
function joinNames(names: string[]): string {
  return names.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
}

function year4(raw: string): string {
  const m = String(raw || '').match(/(1[0-9]|20)\d{2}/);
  return m ? m[0] : '';
}

function normPages(raw: string): string {
  return String(raw || '').replace(/\s*--\s*/g, '-').replace(/\s*[-–—]\s*/g, '-').trim();
}

// --- CSL-JSON -----------------------------------------------------------------

function mapCsl(item: any): ImportedRef {
  const type = CSL_TYPE[String(item?.type || '').toLowerCase()] || 'knjiga';
  const fields: Partial<CitationInput> = {};
  const authors = cslNames(item?.author);
  if (authors) fields.authors = authors;
  const editor = cslNames(item?.editor);
  if (editor) fields.editor = editor;
  const set = (k: Exclude<keyof CitationInput, 'type'>, v: unknown) => {
    const s = (Array.isArray(v) ? v[0] : v);
    const str = s == null ? '' : String(s).trim();
    if (str) fields[k] = str;
  };
  set('title', item?.title);
  set('container', item?.['container-title']);
  set('publisher', item?.publisher);
  set('place', item?.['publisher-place']);
  set('volume', item?.volume);
  set('issue', item?.issue);
  set('doi', item?.DOI ?? item?.doi);
  set('url', item?.URL ?? item?.url);
  set('institution', item?.institution);
  const pages = item?.page ?? item?.pages;
  if (pages) fields.pages = normPages(String(pages));
  const yParts = item?.issued?.['date-parts']?.[0];
  const y = (Array.isArray(yParts) && yParts[0]) || item?.issued?.year || '';
  if (y) fields.year = year4(String(y));
  const accessed = item?.accessed?.['date-parts']?.[0];
  if (Array.isArray(accessed) && accessed.length) fields.accessed = accessed.join('. ') + '.';
  return { fields, type, source: 'csl' };
}

function parseCsl(text: string): ImportedRef[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
  return arr.slice(0, MAX_ENTRIES).map(mapCsl).filter((r) => Object.keys(r.fields).length > 0);
}

// --- BibTeX -------------------------------------------------------------------

// Procitaj balansiranu {...} vrijednost od pozicije otvorene viticaste zagrade; vrati [value, indexNakon].
function readBraced(s: string, open: number): [string, number] {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return [s.slice(open + 1, i), i + 1]; }
  }
  return [s.slice(open + 1), s.length];
}

function parseBibtexFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const n = body.length;
  while (i < n) {
    // Ime polja do '='.
    const eq = body.indexOf('=', i);
    if (eq < 0) break;
    const name = body.slice(i, eq).replace(/^[\s,]+/, '').trim().toLowerCase();
    let j = eq + 1;
    while (j < n && /\s/.test(body[j])) j++;
    let value = '';
    if (body[j] === '{') { const [v, next] = readBraced(body, j); value = v; j = next; }
    else if (body[j] === '"') {
      const end = body.indexOf('"', j + 1);
      value = end < 0 ? body.slice(j + 1) : body.slice(j + 1, end);
      j = end < 0 ? n : end + 1;
    } else {
      // Goli token (broj ili @string makro): do zareza/kraja. Makroi se ne razrjesavaju.
      const rest = body.slice(j);
      const m = rest.match(/^[^,]*/);
      value = (m ? m[0] : '').trim();
      j += (m ? m[0].length : 0);
    }
    if (name) out[name] = decodeLatex(value);
    // Preskoci do iza sljedeceg zareza.
    const comma = body.indexOf(',', j);
    i = comma < 0 ? n : comma + 1;
  }
  return out;
}

function mapBibtex(entryType: string, f: Record<string, string>): ImportedRef {
  const type = BIBTEX_TYPE[entryType] || 'knjiga';
  const fields: Partial<CitationInput> = {};
  if (f.author) fields.authors = joinNames(f.author.split(/\s+and\s+/i));
  if (f.editor) fields.editor = joinNames(f.editor.split(/\s+and\s+/i));
  if (f.title) fields.title = f.title;
  // Casopis vs zbornik/knjiga po tipu izvora.
  const container = f.journal || f.journaltitle || f.booktitle || f.series;
  if (container) fields.container = container;
  if (f.year) fields.year = year4(f.year || f.date);
  else if (f.date) fields.year = year4(f.date);
  if (f.publisher) fields.publisher = f.publisher;
  if (f.address || f.location) fields.place = f.address || f.location;
  if (f.volume) fields.volume = f.volume;
  if (f.number || f.issue) fields.issue = f.number || f.issue;
  if (f.pages) fields.pages = normPages(f.pages);
  if (f.doi) fields.doi = f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (f.url) fields.url = f.url;
  if (f.school || f.institution) fields.institution = f.school || f.institution;
  if (f.urldate) fields.accessed = f.urldate;
  return { fields, type, source: 'bibtex' };
}

function parseBibtex(text: string): ImportedRef[] {
  const out: ImportedRef[] = [];
  const re = /@(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < MAX_ENTRIES) {
    const entryType = m[1].toLowerCase();
    if (entryType === 'comment' || entryType === 'string' || entryType === 'preamble') continue;
    const [body] = readBraced(text, re.lastIndex - 1);
    // Prvi zarez odvaja citekey od polja; bez zareza (nevaljan unos) preskoci.
    const firstComma = body.indexOf(',');
    if (firstComma < 0) continue;
    const f = parseBibtexFields(body.slice(firstComma + 1));
    const ref = mapBibtex(entryType, f);
    if (Object.keys(ref.fields).length > 0) out.push(ref);
    re.lastIndex = re.lastIndex - 1 + body.length + 2; // preskoci preko procitanog tijela
  }
  return out;
}

// --- RIS -----------------------------------------------------------------------

function mapRis(tags: Record<string, string[]>): ImportedRef {
  const first = (k: string) => (tags[k] && tags[k][0]) || '';
  const type = RIS_TYPE[(first('TY') || '').toUpperCase()] || 'knjiga';
  const fields: Partial<CitationInput> = {};
  const authors = [...(tags.AU || []), ...(tags.A1 || [])];
  if (authors.length) fields.authors = joinNames(authors);
  const editors = [...(tags.ED || []), ...(tags.A2 || [])];
  if (editors.length) fields.editor = joinNames(editors);
  const title = first('TI') || first('T1') || first('BT');
  if (title) fields.title = title;
  const container = first('T2') || first('JO') || first('JF') || first('J2');
  if (container) fields.container = container;
  const year = year4(first('PY') || first('Y1') || first('DA'));
  if (year) fields.year = year;
  if (first('PB')) fields.publisher = first('PB');
  const place = first('CY') || first('AD') || first('PP');
  if (place) fields.place = place;
  if (first('VL')) fields.volume = first('VL');
  if (first('IS') || first('CP')) fields.issue = first('IS') || first('CP');
  const sp = first('SP'), ep = first('EP');
  if (sp || ep) fields.pages = normPages([sp, ep].filter(Boolean).join('-'));
  if (first('DO')) fields.doi = first('DO').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const url = first('UR') || first('L1') || first('L2');
  if (url) fields.url = url;
  return { fields, type, source: 'ris' };
}

function parseRis(text: string): ImportedRef[] {
  const out: ImportedRef[] = [];
  let cur: Record<string, string[]> | null = null;
  let lastTag = '';
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (m) {
      const tag = m[1], val = m[2].trim();
      if (tag === 'TY') { cur = {}; }
      if (tag === 'ER') {
        if (cur && Object.keys(cur).length) {
          const ref = mapRis(cur);
          if (Object.keys(ref.fields).length && out.length < MAX_ENTRIES) out.push(ref);
        }
        cur = null; lastTag = '';
        continue;
      }
      if (!cur) cur = {};
      (cur[tag] ||= []).push(val);
      lastTag = tag;
    } else if (cur && lastTag && line.trim()) {
      // Nastavak viserednog polja (npr. sazetak); pripoji zadnjem tagu.
      const arr = cur[lastTag];
      if (arr && arr.length) arr[arr.length - 1] += ' ' + line.trim();
    }
  }
  // RIS bez zavrsnog ER (nestandardno): spasi zadnji zapis.
  if (cur && Object.keys(cur).length && out.length < MAX_ENTRIES) {
    const ref = mapRis(cur);
    if (Object.keys(ref.fields).length) out.push(ref);
  }
  return out;
}

// --- Detekcija formata + javni ulaz -------------------------------------------

export function detectFormat(text: string): 'bibtex' | 'ris' | 'csl' | null {
  const t = (text || '').replace(/^﻿/, '').trimStart();
  if (!t) return null;
  if (/^[[{]/.test(t)) return 'csl';
  if (/@\w+\s*\{/.test(t)) return 'bibtex';
  if (/^TY\s{1,2}-\s/m.test(t)) return 'ris';
  return null;
}

/** Glavni ulaz: tekst datoteke (.bib/.ris/.json) -> niz ImportedRef za bulk tok.
 *  Nevaljan/prazan ulaz vraca [] (nikad ne baca). */
export function parseReferenceFile(text: string, hint: ImportFormat = 'auto'): ImportedRef[] {
  const clean = (text || '').replace(/^﻿/, '');
  const fmt = hint === 'auto' ? detectFormat(clean) : hint;
  if (fmt === 'csl') return parseCsl(clean);
  if (fmt === 'bibtex') return parseBibtex(clean);
  if (fmt === 'ris') return parseRis(clean);
  return [];
}
