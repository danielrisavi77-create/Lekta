/**
 * Heuristicki parser slobodno zalijepljene literature (bulk mode citatnog alata).
 *
 * WAZNO (posteno): parsiranje proizvoljne reference u polja je nepouzdano po prirodi. Ovaj
 * parser je NAMJERNO konzervativan: izvlaci samo ono sto se moze s razumnom sigurnoscu
 * (godina, DOI, URL, stranice, prvi autor, gruba podjela autor/naslov), a dvojbena polja
 * ostavlja prazna. Rezultat je UVIJEK za ljudski pregled i ispravak (obavezan review korak u
 * UI-u), nikad slijepo objaviti. Cist, bez DOM-a, bez mreze, testabilan.
 *
 * Ciljani formati: APA (stariji "Mjesto: Izdavac" i APA7 bez mjesta), hrvatski autor-godina
 * s veznikom "i"/"te", poglavlje u zborniku ("U: urednici (ur.), Knjiga (str. X-Y). Mjesto:
 * Izdavac") i propis ("Naziv. Narodne novine, 42/18"). Sto je izvan toga -> lowConfidence.
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

// Ujednaci veznike (& / and / und / et / hrv "i" / "te") u zarez. Koristi se i za autore i za urednike.
function normalizeConnectors(a: string): string {
  return a
    .replace(/\s*&\s*/g, ', ')
    .replace(/\s+(?:and|und|et)\s+/gi, ', ')
    .replace(/\s+(?:i|te)\s+/g, ', ');
}

// Normaliziraj popis autora u ";"-odvojen oblik koji ocekuje parseAuthors (citation.ts).
// Kljucno: rekonstruira samo kad prepozna >=2 "Prezime, Inicijali." jedinice (APA); inace
// zadrzi ulaz (npr. korporativni autor "Naklada X" ili "Prezime, Ime" bez inicijala).
function normalizeAuthors(a: string): string {
  const s = normalizeConnectors(a);
  // Jedinica = "Prezime(i), Inicijali s tockom". Prezime moze biti viserjecno/spojnica/dijakritika.
  // Inicijali MORAJU imati tocku (razlikuje "Ivanec, D." od punog imena "Ivanec, David").
  const units = s.match(/\p{Lu}[\p{L}'’.\-]*(?:\s+[\p{L}'’.\-]+)*,\s*(?:\p{Lu}\.\s*)+/gu);
  if (units && units.length > 1) {
    return units.map((u) => u.replace(/[,;\s]+$/, '').trim()).join('; ');
  }
  return s.replace(/\s*;\s*/g, '; ').replace(/,\s*,/g, ',').trim();
}

function guessType(low: string, f: Partial<CitationInput>): SourceType {
  if (/\bzavršni rad\b|\bdiplomski rad\b|\bdoktorsk|\bdisertacij|\bthesis\b|\bmagistarski\b|\bzavrsni rad\b/.test(low)) return 'zavrsni';
  if (/narodne novine|\bnn\b|\bzakon\b|pravilnik\b|\buredb|\bsl\. list|\bod luk/.test(low)) return 'propis';
  // Poglavlje PRIJE clanka: "U:/In:" ili "(ur.)/(eds.)" inace "(str. X-Y)" pogresno vodi na clanak.
  if (/\bu:\s|\bin:\s|\(ur\.?\)|\(prir\.?\)|\(eds?\.?\)|\(ed\.?\)|urednik|priredio/.test(low)) return 'poglavlje';
  if (f.doi || (f.volume && f.issue) || /\bvol\.|\bbr\.\s*\d|časopis|\bstr\.\s*\d|\bpp\.\s*\d/.test(low)) return 'clanak';
  if (f.url) return 'mrezni';
  return 'knjiga';
}

// Poglavlje u zborniku: "U: <urednici> (ur.), <Knjiga> (str. X-Y). Mjesto: Izdavac".
function parseChapter(rem: string, fields: Partial<CitationInput>): void {
  const m = rem.match(/^(?:u|in)\s*:?\s*(.+?)\s*\((?:ur|prir|eds?|ed)\.?\)\s*,?\s*(.*)$/is);
  if (!m) return;
  fields.editor = normalizeConnectors(m[1].trim()).replace(/[.,\s]+$/, '').trim();
  let tail = m[2].trim();
  const pg = tail.match(/\(\s*(?:str\.?|pp?\.?)\s*(\d+\s*[-–]\s*\d+)\s*\)/i);
  if (pg) { fields.pages = pg[1].replace(/\s+/g, ''); tail = tail.replace(pg[0], ' ').replace(/\s{2,}/g, ' ').trim(); }
  const cont = tail.match(/^([^(.]+)/);
  if (cont) fields.container = cont[1].replace(/[\s,]+$/, '').trim();
  const pub = tail.match(/([^:.()]+):\s*([^.]+)/);
  if (pub) {
    fields.place = pub[1].replace(/^[\s,]+|[\s,]+$/g, '').trim();
    fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim();
  }
}

// Propis: "Naziv propisa. Narodne novine, 42/18" -> naziv=title, NN=container, broj=issue.
function parsePropis(original: string, fields: Partial<CitationInput>): void {
  const nn = original.match(/(.+?)[.,]?\s*(?:narodne novine|\bnn\b)\.?\s*,?\s*(\d+\/\d+)/i);
  if (!nn) return;
  const title = nn[1].replace(/\(\d{4}[a-z]?\)\.?/g, '').replace(/[.,\s]+$/, '').trim();
  if (title) fields.title = title;
  fields.container = 'Narodne novine';
  fields.issue = nn[2];
  delete fields.authors;
}

// --- Vancouver / ICMJE (numericki biomedicinski stil) ------------------------
// "Prezime XY, Prezime2 Z. Naslov. Casopis. Godina;Vol(Broj):Str." (clanak)
// "... Naslov. Mjesto: Izdavac; Godina." (knjiga)   "... [zavrsni rad]. ..." (teza)
// Autori nemaju zareze ni tocke pa je struktura pravilnija od APA-e kad se prepozna.
function looksLikeVancouver(s: string): boolean {
  return /\b(?:19|20)\d{2}\s*;\s*\d/.test(s)                          // Godina;Vol (clanak)
      || /;\s*(?:19|20)\d{2}\.?\s*$/.test(s)                          // ...; Godina.  (knjiga/teza)
      || /\[(?:zavr[sš]ni|diplomski|doktorski|magistarski)\s+rad\]/i.test(s);
}

// "Đorđević V" -> "Đorđević, V."; "Zarkan AH" -> "Zarkan, A. H."; "Van Goethem M" -> "Van Goethem, M."
// Kljucno: zbijene inicijale ("AH") sirimo u razmaknute ("A. H.") jer initials() dijeli po razmaku.
function vancouverName(p: string): string | null {
  const tokens = p.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let suffix = '';
  while (tokens.length > 1 && /^(?:Jr|Sr|II|III|IV)\.?$/.test(tokens[tokens.length - 1])) {
    suffix = tokens.pop()!.replace(/\.$/, '');
  }
  const initTok = tokens[tokens.length - 1];
  if (tokens.length >= 2 && /^[\p{Lu}]{1,4}\.?$/u.test(initTok)) {
    const surname = tokens.slice(0, -1).join(' ') + (suffix ? ` ${suffix}` : '');
    const inits = initTok.replace(/\./g, '').split('').map((c) => `${c}.`).join(' ');
    return `${surname}, ${inits}`;
  }
  return suffix ? `${p} ${suffix}` : p; // korporativni/nepoznato: doslovno
}

function parseVancouverAuthors(seg: string): string {
  const names: string[] = [];
  for (const part of seg.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean)) {
    if (/^(?:et\s+al\.?|i\s+sur\.?|and\s+others)$/i.test(part)) continue; // "et al." / "i sur."
    if (/^(?:ur|urednici?|eds?|ed|prir)\.?$/i.test(part)) continue;        // urednik marker
    const n = vancouverName(part);
    if (n) names.push(n);
  }
  return names.join('; ');
}

function parseVancouver(input: string, fields: Partial<CitationInput>): SourceType {
  const raw = input.replace(/\s+/g, ' ').trim().replace(/\.\s*$/, '');
  let rest = raw;
  const am = raw.match(/^(.+?)\.\s+(.*)$/); // autori do prve tocke (nemaju internih ". ")
  if (am) {
    const authors = parseVancouverAuthors(am[1]);
    if (authors) fields.authors = authors;
    rest = am[2];
  }

  // Clanak: "... Casopis. Godina;Vol(Broj):Str"
  const cm = rest.match(/((?:19|20)\d{2})\s*;\s*(\d+)(?:\s*\(([^)]+)\))?(?::\s*([\dA-Za-z\-–]+))?/);
  if (cm && cm.index !== undefined) {
    fields.year = cm[1];
    fields.volume = cm[2];
    if (cm[3]) fields.issue = cm[3];
    if (cm[4]) fields.pages = cm[4].replace(/–/g, '-');
    const head = rest.slice(0, cm.index).replace(/[.\s;]+$/, '').trim(); // "Naslov. Casopis"
    const li = head.lastIndexOf('. ');
    if (li >= 0) { fields.title = head.slice(0, li).trim(); fields.container = head.slice(li + 2).trim(); }
    else if (head) fields.title = head;
    return 'clanak';
  }

  // Knjiga/teza: "Naslov[ marker]. Mjesto: Izdavac; Godina"
  const ym = rest.match(/;\s*((?:19|20)\d{2})\b/);
  if (ym) fields.year = ym[1];
  let body = rest.replace(/;\s*(?:19|20)\d{2}\s*$/, '').replace(/\s+\./g, '.').trim();
  const th = body.match(/\[([^\]]+)\]/);
  const isThesis = !!(th && /\brad\b|thesis|disertacij/i.test(th[1]));
  if (th) body = body.replace(th[0], '').replace(/\s{2,}/g, ' ').trim();
  const pub = body.match(/^(.*?)\.\s*([^.]+?):\s*([^.]+?)$/);
  if (pub) {
    fields.title = pub[1].replace(/[.\s]+$/, '').trim();
    const place = pub[2].trim(), publisher = pub[3].trim();
    if (isThesis) fields.institution = [place, publisher].filter(Boolean).join(', ');
    else { fields.place = place; fields.publisher = publisher; }
  } else if (body) {
    fields.title = body.replace(/[.\s]+$/, '').trim();
  }
  return isThesis ? 'zavrsni' : 'knjiga';
}

export function parseReference(raw: string): ParsedReference {
  const original = stripMarker((raw || '').replace(/\s+/g, ' ').trim());
  const fields: Partial<CitationInput> = {};
  if (!original) return { type: 'knjiga', fields, lowConfidence: true };

  if (looksLikeVancouver(original)) {
    const type = parseVancouver(original, fields);
    const vdoi = original.match(/10\.\d{4,9}\/[^\s,;]+/);
    if (vdoi) fields.doi = vdoi[0].replace(/[.,;]+$/, '');
    if (fields.title) fields.title = fields.title.replace(/[.,]+$/, '').trim();
    const filled = Object.values(fields).filter(Boolean).length;
    return { type, fields, lowConfidence: filled <= 2 };
  }

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
    // NE gutaj tocku zadnjeg inicijala ("Ivanec, D. (2012)"); makni samo razmak i otvorenu zagradu.
    const authors = s.slice(0, yStart).replace(/[\s(]+$/, '').replace(/,+$/, '').trim();
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
    .replace(/preuzeto s|dostupno (?:na|s)|retrieved from|available at/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/^(?:u|in)\s*:/i.test(remainder) || /\((?:ur|prir|eds?|ed)\.?\)/i.test(remainder)) {
    parseChapter(remainder, fields);
  } else {
    let rem = remainder;
    // Stranice "str./pp. 145-170" (ukloni iz ostatka da ne procure u izdavaca).
    const pg = rem.match(/(?:pp?\.?|str\.?)\s*(\d+\s*[-–]\s*\d+)/i);
    if (pg) { fields.pages = pg[1].replace(/\s+/g, ''); rem = rem.replace(pg[0], ' ').replace(/\s{2,}/g, ' ').trim(); }

    // Clanak: "Casopis, 28(3), 45-67" ili "Casopis, 5, 1-10".
    let matched = false;
    const m1 = rem.match(/^(.+?),\s*(\d+)\s*\((\d+)\)(?:,\s*(\d+\s*[-–]\s*\d+))?/);
    if (m1) {
      fields.container = m1[1].trim();
      fields.volume = m1[2];
      fields.issue = m1[3];
      if (m1[4] && !fields.pages) fields.pages = m1[4].replace(/\s+/g, '');
      matched = true;
    } else {
      const m2 = rem.match(/^(.+?),\s*(\d+),\s*(\d+\s*[-–]\s*\d+)/);
      if (m2) {
        fields.container = m2[1].trim();
        fields.volume = m2[2];
        if (!fields.pages) fields.pages = m2[3].replace(/\s+/g, '');
        matched = true;
      }
    }
    if (!fields.pages) {
      const bp = rem.match(/:\s*(\d+\s*[-–]\s*\d+)/) || rem.match(/\b(\d+\s*[-–]\s*\d+)\b/);
      if (bp) fields.pages = bp[1].replace(/\s+/g, '');
    }

    // Knjiga: "Mjesto: Izdavac" (mjesto smije imati zarez "Cambridge, MA"; izdavac tocke "W. H. Freeman").
    if (!matched && !fields.container) {
      const pub = rem.match(/([^:.]+?):\s*(.+?)[.]?\s*$/);
      if (pub) {
        fields.place = pub[1].replace(/^[\s,]+|[\s,]+$/g, '').trim();
        fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim();
      } else if (rem && !fields.url && !fields.doi) {
        // APA7 bez mjesta: "Naklada Slap."
        const only = rem.replace(/[.,\s]+$/, '').trim();
        if (only && !/\d/.test(only) && only.length <= 60) fields.publisher = only;
      }
    }
  }

  if (fields.title) fields.title = fields.title.replace(/[.,]+$/, '').trim();
  if (fields.authors) {
    fields.authors = fields.authors
      .replace(/[,;]+\s*$/, '')
      .replace(/(?<=\p{Ll})\.$/u, '') // makni tocku iza rijeci (korporativni autor), ne iza inicijala
      .trim();
  }

  const type = guessType(original.toLowerCase(), fields);
  if (type === 'propis') parsePropis(original, fields);
  // Zavrsni/doktorski: ustanova je "institution", ne izdavac ("Filozofski fakultet, ...").
  if (type === 'zavrsni' && !fields.institution && fields.publisher) {
    fields.institution = [fields.place, fields.publisher].filter(Boolean).join(', ');
    delete fields.publisher;
    delete fields.place;
  }

  const filled = Object.values(fields).filter(Boolean).length;
  return { type, fields, lowConfidence: filled <= 2 };
}
