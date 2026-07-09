/**
 * Heuristicki parser slobodno zalijepljene literature (bulk mode citatnog alata).
 *
 * WAZNO (posteno): parsiranje proizvoljne reference u polja je nepouzdano po prirodi. Ovaj
 * parser je NAMJERNO konzervativan: izvlaci samo ono sto se moze s razumnom sigurnoscu
 * (godina, DOI, URL, stranice, prvi autor, gruba podjela autor/naslov), a dvojbena polja
 * ostavlja prazna. Rezultat je UVIJEK za ljudski pregled i ispravak (obavezan review korak u
 * UI-u), nikad slijepo objaviti. Cist, bez DOM-a, bez mreze, testabilan.
 */
import type { CitationInput, SourceType } from '../tools/citation';

export interface ParsedReference {
  type: SourceType;
  fields: Partial<CitationInput>;
  /** true kad je izvuceno malo (samo naslov/autor), znak da unos treba vise rucne dorade. */
  lowConfidence: boolean;
}

// Godina 1900-2099, moze imati sufiks (2020a). Ne hvata dio duljeg broja.
const YEAR_RE = /(?:^|[^\d])((?:19|20)\d{2})[a-z]?(?![\d])/;

/** Razlomi zalijepljeni tekst u pojedinacne reference: prazan redak dijeli ako postoji, inace redak. */
export function splitReferences(text: string): string[] {
  const t = (text || '').replace(/\r/g, '').trim();
  if (!t) return [];
  const parts = /\n[ \t]*\n/.test(t) ? t.split(/\n[ \t]*\n+/) : t.split(/\n+/);
  return parts.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function stripMarker(s: string): string {
  return s.replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.)]|[-–•*])\s+/, '').trim();
}

// Podijeli na prvu recenicu (tocka + razmak), ali NE na inicijalu ("I. Ivic"): trazi da znak
// prije tocke nije samostalno veliko slovo.
function firstSentence(s: string): [string, string] {
  const re = /([^\s][^.]*?[^\s.])\.\s+/;
  const m = s.match(re);
  if (m && m.index !== undefined) {
    const head = s.slice(0, m.index + m[1].length);
    const tail = s.slice(m.index + m[0].length);
    // odbij ako "recenica" zavrsava samo velikim slovom (inicijal)
    if (!/(?:^|\s)[\p{Lu}]$/u.test(head)) return [head.trim(), tail.trim()];
  }
  const dot = s.search(/\.\s/);
  if (dot >= 0) return [s.slice(0, dot).trim(), s.slice(dot + 2).trim()];
  return [s.replace(/\.\s*$/, '').trim(), ''];
}

// Normaliziraj popis autora u ";"-odvojen oblik koji ocekuje parseAuthors (citation.ts).
// Pasted liste koriste "&"/"and", a APA "Prezime, I., Prezime, J." (zarez i dijeli i spaja).
function normalizeAuthors(a: string): string {
  let s = a.replace(/\s*&\s*/g, '; ').replace(/\s+and\s+/gi, '; ');
  // APA jedinice "Prezime, I. I." (prezime, pa inicijali s tockama) -> razdvoji ako ih je vise
  const units = s.match(/[\p{Lu}][\p{L}'’.\- ]*?,\s*(?:[\p{Lu}]\.[ ]?)+/gu);
  if (units && units.length > 1) {
    return units.map((u) => u.replace(/[;,]\s*$/, '').trim()).join('; ');
  }
  return s.replace(/\s*;\s*/g, '; ').trim();
}

function guessType(low: string, f: Partial<CitationInput>): SourceType {
  if (/\bzavršni rad\b|\bdiplomski rad\b|\bdoktorsk|\bdisertacij|\bthesis\b|\bmagistarski\b|\bzavrsni rad\b/.test(low)) return 'zavrsni';
  if (/narodne novine|\bnn\b|\bzakon\b|pravilnik\b|\buredb|\bsl\. list|\bod luk/.test(low)) return 'propis';
  if (f.doi || (f.volume && f.issue) || /\bvol\.|\bbr\.\s*\d|časopis|\bstr\.\s*\d|\bpp\.\s*\d/.test(low)) return 'clanak';
  if (/\bu:\s|\bin:\s|\(ur\.\)|\(eds?\.\)|\(ed\.\)|urednik/.test(low)) return 'poglavlje';
  if (f.url) return 'mrezni';
  return 'knjiga';
}

export function parseReference(raw: string): ParsedReference {
  const original = stripMarker((raw || '').replace(/\s+/g, ' ').trim());
  const fields: Partial<CitationInput> = {};
  if (!original) return { type: 'knjiga', fields, lowConfidence: true };

  const s = original;

  const doi = s.match(/10\.\d{4,9}\/[^\s,;]+/);
  if (doi) fields.doi = doi[0].replace(/[.,;]+$/, '');
  const url = s.match(/https?:\/\/[^\s,;]+/);
  if (url && !/doi\.org/i.test(url[0])) fields.url = url[0].replace(/[.,;)]+$/, '');

  const ym = s.match(YEAR_RE);
  const year = ym ? ym[1] : '';
  if (year) fields.year = year;

  let remainder = '';
  if (ym && (ym.index ?? 0) <= 80) {
    const yStart = s.indexOf(year);
    const authors = s.slice(0, yStart).replace(/[\s.,(]+$/, '').trim();
    const after = s.slice(yStart + year.length).replace(/^[a-z]?\)?[.,]?\s*/, '');
    if (authors) fields.authors = normalizeAuthors(authors);
    const [title, rest] = firstSentence(after);
    if (title) fields.title = title;
    remainder = rest;
  } else {
    const [lead, rest] = firstSentence(s);
    const [title, rest2] = firstSentence(rest);
    if (lead) fields.authors = normalizeAuthors(lead);
    if (title) fields.title = title;
    remainder = rest2;
  }

  // Makni DOI/URL iz ostatka da ne procure u casopis/mjesto/izdavac (npr. "https:" kao mjesto).
  remainder = remainder
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b10\.\d{4,9}\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Clanak uzorak: "Casopis, 28(3), 45-67"
  const art = remainder.match(/^([^,]+?),\s*(\d+)\s*\((\d+)\)/);
  if (art) {
    fields.container = art[1].trim();
    fields.volume = art[2];
    fields.issue = art[3];
  }

  // Stranice: "pp. 145-170" / "str. 145-170" / ": 145-170" / goli raspon
  const pg =
    remainder.match(/(?:pp?\.?|str\.?|:)\s*(\d+\s*[-–]\s*\d+)/i) || remainder.match(/(\b\d+\s*[-–]\s*\d+\b)/);
  if (pg) fields.pages = pg[1].replace(/\s+/g, '');

  // Knjiga uzorak: "Mjesto: Izdavac" (ako nije clanak)
  if (!fields.container) {
    const pub = remainder.match(/([^,:.]+):\s*([^.,]+)/);
    if (pub) {
      fields.place = pub[1].trim();
      fields.publisher = pub[2].trim();
    }
  }

  if (fields.title) fields.title = fields.title.replace(/[.,]+$/, '').trim();
  if (fields.authors) fields.authors = fields.authors.replace(/[,;]+$/, '').trim();

  const type = guessType(original.toLowerCase(), fields);
  const filled = Object.values(fields).filter(Boolean).length;
  return { type, fields, lowConfidence: filled <= 2 };
}
