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
import type { CitationInput, SourceType } from '../tools/citation.ts';

export interface ParsedReference {
  type: SourceType;
  fields: Partial<CitationInput>;
  /** true kad je izvuceno malo (samo naslov/autor), znak da unos treba vise rucne dorade. */
  lowConfidence: boolean;
}

/** Stil ulaznog popisa. 'auto' = prepoznaj po obliku; ostalo forsira granu (rucni izbor u UI-u). */
export type BulkStyle = 'auto' | 'apa' | 'vancouver' | 'ieee' | 'chicago';

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
  // [n]/(n) mogu biti zalijepljeni bez razmaka (elsevier-vancouver "[1]Prezime"); numericki "1."/"-" traze razmak.
  return s.replace(/^\s*(?:\[\d+\]|\(\d+\))\s*/, '').replace(/^\s*(?:\d+[.)]|[-–•*])\s+/, '').trim();
}

// Podijeli na prvu recenicu (tocka + razmak), ali NE na inicijalu ("I. Ivic"): trazi da znak
// prije tocke nije samostalno veliko slovo.
function firstSentence(s: string): [string, string] {
  // Terminator recenice je . ? ili ! (naslovi cesto zavrsavaju upitnikom: "Is Medieval History Relevant?").
  // Lijeni *? je O(n^2) na ulazu bez terminatora; realna referenca je nekoliko stotina znakova, pa
  // regex skenira samo prvih SCAN_CAP znakova (AUD-10, self-DoS). Preko toga pada na linearni fallback nize.
  const SCAN_CAP = 4000;
  const scan = s.length > SCAN_CAP ? s.slice(0, SCAN_CAP) : s;
  const re = /([^\s][^.?!]*?[^\s.?!])([.?!])\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scan))) {
    const head = s.slice(0, m.index + m[1].length);
    const after = s.charAt(m.index + m[0].length);
    if (/(?:^|\s)[\p{Lu}]$/u.test(head)) continue;                    // inicijal ("I. Ivic")
    if (/\d$/.test(head) && after && !/\p{Lu}/u.test(after)) continue; // redni broj/raspon ("11. stoljeca", "1990. – 2020")
    if (/(?:^|\s)(?:sv|bl|dr|prof|mr|sci|fra|don|st|god|str|op|cit|cf|usp|itd|npr|tzv|prev)$/i.test(head)) continue; // hrv/lat kratice ("sv. Dominike", "prev.")
    if ((head.match(/\(/g) || []).length > (head.match(/\)/g) || []).length) continue; // tocka unutar otvorene zagrade "(prev. A. Cvitanovic)"
    const keep = m[2] === '.' ? head : head + m[2]; // sacuvaj ?/! (dio naslova), ali ne tocku
    return [keep.trim(), s.slice(m.index + m[0].length).trim()];
  }
  const t = s.match(/([.?!])\s/);
  if (t && t.index !== undefined) {
    const keep = t[1] === '.' ? s.slice(0, t.index) : s.slice(0, t.index + 1);
    return [keep.trim(), s.slice(t.index + 2).trim()];
  }
  return [s.replace(/\.\s*$/, '').trim(), ''];  // ostavi zavrsni ?/! (dio naslova)
}

// Podijeli na prvu ". " koja NIJE iza inicijala (jedno veliko slovo) ni iza veznika "i"/"and".
// Robusnije od firstSentence za Chicago autore s vise inicijala ("Petz, B., V. Kolesaric i D. Ivanec").
function splitAtSentence(s: string): [string, string] {
  const re = /([.?!])\s+/g; // terminator . ? ! (naslov moze zavrsiti upitnikom: "What Is History?")
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const head = s.slice(0, m.index);
    if (/(?:^|[\s.])[\p{Lu}]$/u.test(head) || /\b(?:i|and)$/i.test(head)) continue;
    const keep = m[1] === '.' ? head : head + m[1]; // sacuvaj ?/!
    return [keep.trim(), s.slice(m.index + m[0].length).trim()];
  }
  return [s.replace(/\.\s*$/, '').trim(), ''];
}

// Makni oznaku izdanja koja stoji IZMEDU naslova i mjesta ("Naslov. 13th ed. Mjesto", "2nd rev. ed.",
// "Second edition", "Rev. ed."). Strip samo kad iza slijedi veliko slovo (mjesto/izdavac) ili kraj,
// da se ne dira sredina naslova. Broj ILI rijec-izdanja + opcionalni "rev./and/exp." + "ed"/"edition".
function stripEdition(s: string): string {
  return s.replace(
    /[.,]\s+(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|rev(?:ised)?|abr(?:idged)?|exp(?:anded)?|enl(?:arged)?|new)\.?(?:\s+(?:rev|and|exp|enl|abr)\.?)*\s+(?:ed|edition|izd|izdanje)\.?(?=\s+\p{Lu}|\s*$)/giu,
    '.',
  );
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
  // Korporativni/institucionalni autor (nema inicijala "X."): ne cijepaj po "i"/"and"/"&" (dio naziva:
  // "Hrvatska akademija znanosti i umjetnosti", "Naklada Jesenski i Turk"). APA osoba UVIJEK ima inicijal.
  if (!/\p{Lu}\./u.test(a)) return a.replace(/\s+/g, ' ').replace(/[.,;\s]+$/, '').trim();
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
// Konferencijski zbornik cesto nema urednika: "U: <Zbornik> (str. X-Y). Mjesto: Izdavac".
function parseChapter(rem: string, fields: Partial<CitationInput>): void {
  let tail: string;
  const m = rem.match(/^(?:u|in)\s*:?\s*(.+?)\s*\((?:ur|prir|eds?|ed)\.?\)\s*,?\s*(.*)$/is);
  if (m) {
    fields.editor = normalizeConnectors(m[1].trim()).replace(/[.,\s]+$/, '').trim();
    tail = m[2].trim();
  } else {
    const m2 = rem.match(/^(?:u|in)\s*:?\s*(.*)$/is);
    if (!m2) return;
    tail = m2[1].trim();
  }
  // Stranice u zagradi: marker "str."/"pp." smije imati prefiks izdanja ("(2. izd., str. 112-140)",
  // "(3rd ed., pp. 200-231)") i raspon smije biti rimski ("(str. xi-xiv)").
  const pg = tail.match(/\((?:[^)]*?,\s*)?(?:str\.?|pp?\.?)\s*([\divxlcdm]+(?:\s*[-–]\s*[\divxlcdm]+)?)\s*\)/i); // raspon ILI jedna stranica ("str. 45")
  if (pg) { fields.pages = pg[1].replace(/\s+/g, ''); tail = tail.replace(pg[0], ' ').replace(/\s{2,}/g, ' ').trim(); }
  const cont = tail.match(/^([^(.]+)/);
  if (cont) fields.container = cont[1].replace(/[\s,]+$/, '').trim();
  // "Mjesto: Izdavac" IZA container-tocke (preskace podnaslovnu dvotocku u nazivu zbornika "Kognicija: temeljni
  // procesi"). Mjesto smije imati tocku u kratici ("St. Louis", "Washington, D.C."), izdavac inicijal ("L. Erlbaum").
  const pub = tail.match(/\.\s+([^:]+?):\s*(.+?)\.?\s*$/);
  if (pub) {
    fields.place = pub[1].replace(/^[\s,]+|[\s,]+$/g, '').trim();
    fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim();
  } else {
    // APA7 poglavlje bez mjesta: "... Zbornik (str. X-Y). Izdavac."
    const only = tail.match(/\.\s+([^.:]+?)\.?\s*$/);
    if (only && !/\d/.test(only[1]) && only[1].trim().length <= 60) fields.publisher = only[1].trim();
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
  // Inicijali: zbijeni ("AH"), tockom ("A.H."), ili crticom spojeni s malim slovom nakon crtice
  // (Wade-Giles / istocnoazijska romanizacija "Lee H-C", "Jao T-i", "J.-P."): sve = inicijali, ne prezime.
  // Malo slovo dopusteno SAMO odmah iza crtice (inace "Van Gogh" -> "Gogh" ne smije proci kao inicijali).
  if (tokens.length >= 2 && /^\p{Lu}\.?(?:-?\p{Lu}\.?|-\p{Ll}\.?){0,3}$/u.test(initTok)) {
    const surname = tokens.slice(0, -1).join(' ') + (suffix ? ` ${suffix}` : '');
    const inits = initTok.replace(/[.\-]/g, '').toUpperCase().split('').map((c) => `${c}.`).join(' ');
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

// Poglavlje/rad u zborniku (Vancouver): "Naslov. In: [Urednik, editor. ]Zbornik. Mjesto: Izdavac; Godina. p. Str."
function parseVancouverChapter(rest: string, fields: Partial<CitationInput>): boolean {
  const im = rest.match(/^(.*?)([.?!])\s+(?:in|u)\s*:\s*(.*)$/is); // naslov moze zavrsiti . ? ili !
  if (!im) return false;
  fields.title = (im[2] === '.' ? im[1] : im[1] + im[2]).replace(/[.\s]+$/, '').trim();
  let body = im[3].trim();
  const pg = body.match(/\bpp?\.\s*([\divxlcdm]+(?:\s*[-–]\s*[\divxlcdm]+)?)/i); // "p."/"pp." + raspon ILI jedna stranica ("p. 205")
  if (pg) { fields.pages = pg[1].replace(/\s+/g, '').replace(/–/g, '-'); body = body.replace(pg[0], ' ').replace(/\s{2,}/g, ' ').trim(); }
  const ym = body.match(/;\s*((?:19|20)\d{2})\b/);
  if (ym) fields.year = ym[1];
  const edm = body.match(/^(.*?),\s*editors?\.\s*/i); // "I. Urednik, editor(s)."
  if (edm) { fields.editor = edm[1].replace(/[.,\s]+$/, '').trim(); body = body.slice(edm[0].length).trim(); }
  body = body.replace(/;\s*(?:19|20)\d{2}[.\s]*$/, '').replace(/\b\d+\s*p\.?\s*$/i, '').replace(/[.\s]+$/, '').trim(); // makni "; Godina." i "NNNN p." (ukupno stranica)
  body = body.replace(/\.\s*\d+(?:st|nd|rd|th)?\s*(?:rev\.?\s*)?ed\.?\s*$/i, '').replace(/[.\s]+$/, '').trim(); // makni izdanje "3rd ed."
  // "Zbornik. Mjesto: Izdavac"; naslov non-greedy da "St. Louis" ne procuri, mjesto smije imati tocku.
  const pub = body.match(/^(.+?)\.\s+([^:]+?):\s*(.+)$/);
  if (pub) {
    fields.container = pub[1].replace(/[.\s]+$/, '').trim();
    fields.place = pub[2].trim();
    fields.publisher = pub[3].replace(/[.\s]+$/, '').trim();
  } else if (body) {
    fields.container = body.replace(/[.\s]+$/, '').trim();
  }
  return true;
}

function parseVancouver(input: string, fields: Partial<CitationInput>): SourceType {
  const raw = input.replace(/\s+/g, ' ').trim().replace(/\.\s*$/, '');
  let rest = raw;
  const am = raw.match(/^(.+?)\.\s+(.*)$/); // autori do prve tocke (nemaju internih ". ")
  if (am) {
    // "Prezime AB, ..., editors." = urednicka knjiga: osobe su UREDNICI, ne autori (autor prazan).
    const edm = am[1].match(/^(.*?),?\s*editors?$/i);
    if (edm) { const e = parseVancouverAuthors(edm[1]); if (e) fields.editor = e; }
    else { const authors = parseVancouverAuthors(am[1]); if (authors) fields.authors = authors; }
    rest = am[2];
  }
  // Makni Hrcak/PubMed sum: "[Internet]", "[pristupljeno ...]", "[cited ...]" (lomi Godina;Vol koordinatu).
  // NE dira "[zavrsni rad]"/"[diplomski rad]" marker (treba za detekciju teze).
  rest = rest.replace(/\[\s*(?:internet|online|pristupljeno[^\]]*|cited[^\]]*|updated[^\]]*)\s*\]/gi, ' ')
    .replace(/\b(?:available from|preuzeto s(?:a)?|dostupno na|retrieved from)\s*:?\s*/gi, ' ') // "Available from:"/"Preuzeto s"
    .replace(/\s+([.;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const vdoi = rest.match(/10\.\d{4,9}\/[^\s,;]+/); if (vdoi) fields.doi = vdoi[0].replace(/[.,;]+$/, '');
  // Makni DOI/URL da ne procuri u naslov/casopis/izdavaca (elsevier-vancouver ih lijepi na kraj).
  rest = rest.replace(/https?:\/\/\S+/g, ' ').replace(/\bdoi:\s*\S+/gi, ' ').replace(/10\.\d{4,9}\/\S+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Poglavlje u zborniku (ima "In:"/"U:") ide prije clanka/knjige.
  if (/(?:^|\.\s)(?:in|u)\s*:\s/i.test(rest) && parseVancouverChapter(rest, fields)) return 'poglavlje';

  // Clanak: ICMJE "Casopis. God;Vol(Broj):Str" ILI elsevier bez volumena "Casopis God:Str".
  const cm = rest.match(/((?:19|20)\d{2})\s*;\s*(\d+)\.?(?:\s*\(([^)]+)\))?(?::\s*([\dA-Za-z\-–]+))?|((?:19|20)\d{2})\s*:\s*(\d[\dA-Za-z\-–]*)/); // "64.(3)"; "2009:27-47"
  if (cm && cm.index !== undefined) {
    fields.year = cm[1] || cm[5];
    if (cm[2]) fields.volume = cm[2];
    if (cm[3]) fields.issue = cm[3];
    const pg = cm[4] || cm[6];
    if (pg) fields.pages = pg.replace(/–/g, '-');
    const head = rest.slice(0, cm.index).replace(/[.\s;]+$/, '').trim(); // "Naslov. Casopis"
    // Granica naslov/casopis je zadnji terminator (. ? !); naslov smije zavrsiti upitnikom ("... Relevant? Zbornik").
    const sm = head.match(/^(.*[.?!])\s+(.+)$/);
    if (sm) { fields.title = sm[1].replace(/\.$/, '').trim(); fields.container = sm[2].trim(); }
    else if (head) fields.title = head;
    return 'clanak';
  }

  // Knjiga/teza: "Naslov[ marker]. Mjesto: Izdavac; Godina[. NNNN p.]"  (elsevier moze glue-ati golu godinu: "Naslov Godina")
  const ym = rest.match(/;\s*((?:19|20)\d{2})\b/);
  if (ym) fields.year = ym[1];
  // Skini "; Godina" i sve iza (ukupan broj stranica "1120 p.", biljeske); zatim golu elsevier godinu.
  let body = rest.replace(/;\s*(?:19|20)\d{2}\b[\s\S]*$/, '').replace(/\.\s*\d+\s*p\.?\s*$/i, '').replace(/\s+\./g, '.').trim();
  if (!fields.year) { const by = body.match(/[\s.]((?:19|20)\d{2})\.?\s*$/); if (by) { fields.year = by[1]; body = body.slice(0, by.index).trim(); } }
  // Izdanje IZMEDU naslova i mjesta ("Naslov. 13th ed. Mjesto: ...", "2nd rev. ed.", "Second edition"):
  // makni ga da ne procuri u mjesto (koje sad smije imati tocku). Strip samo kad slijedi veliko slovo/kraj.
  body = stripEdition(body).replace(/[.\s]+$/, '').trim();
  const th = body.match(/\[([^\]]+)\]/);
  const isThesis = !!(th && /\brad\b|thesis|disertacij/i.test(th[1]));
  if (th) body = body.replace(th[0], '').replace(/\s{2,}/g, ' ').trim();
  // "Naslov. Mjesto: Izdavac"; naslov non-greedy da kratica "St. Louis"/"Washington, D.C." ne procuri u naslov,
  // mjesto smije imati tocku, izdavac inicijal ("W. H. Freeman").
  const pub = body.match(/^(.+?)\.\s+([^:]+?):\s*(.+)$/);
  if (pub) {
    fields.title = pub[1].replace(/[.\s]+$/, '').trim();
    const place = pub[2].trim(), publisher = pub[3].replace(/[.\s]+$/, '').trim();
    if (isThesis) fields.institution = [place, publisher].filter(Boolean).join(', ');
    else { fields.place = place; fields.publisher = publisher; }
  } else if (isThesis && body.includes('. ')) {
    // teza bez "Mjesto:" (samo ustanova): "Naslov. Ustanova"
    const dot = body.indexOf('. ');
    fields.title = body.slice(0, dot).trim();
    fields.institution = body.slice(dot + 2).replace(/[.,\s]+$/, '').trim();
  } else {
    // Knjiga bez mjesta: "Naslov. Izdavac" (moderni oblik izostavlja grad). Izdavac je kratki
    // zavrsni segment bez znamenki; inace cijeli body je naslov.
    const pubNoPlace = !isThesis && body.match(/^(.+)\.\s+([^.:]+?)\.?\s*$/);
    if (pubNoPlace && !/\d/.test(pubNoPlace[2]) && pubNoPlace[2].trim().length <= 40) {
      fields.title = pubNoPlace[1].replace(/[.\s]+$/, '').trim();
      fields.publisher = pubNoPlace[2].trim();
    } else if (body) {
      fields.title = body.replace(/[.\s]+$/, '').trim();
    }
  }
  return isThesis ? 'zavrsni' : 'knjiga';
}

// --- IEEE (numericki tehnicki: inicijali PRIJE prezimena, naslov u navodnicima) -------------
// "F. M. Prezime, "Naslov," Casopis, vol. V, no. N, pp. P, Godina."  (clanak)
// "... in Proc. Konf., Grad, Godina, pp. P."  (konferencija)
function looksLikeIeee(s: string): boolean {
  if (/\((?:19|20)\d{2}\)\s*:\s*\d/.test(s)) return false; // "(2019): 45" je Chicago clanak, ne IEEE
  const hasQuote = /["“][^"”]{3,}["”]/.test(s);
  const hasCoord = /\bvol\.\s*\d|\bno\.\s*\d|\bpp?\.\s*\d/i.test(s);
  return hasQuote && (hasCoord || /\bin\s+proc\b/i.test(s) || /,\s*(?:19|20)\d{2}\.?\s*$/.test(s));
}

// "J. Smith" -> "Smith, J."; "A. B. Author" -> "Author, A. B."; "J. van der Berg" -> "van der Berg, J."
function ieeeName(p: string): string {
  const tokens = p.trim().split(/\s+/).filter(Boolean);
  const inits: string[] = [];
  let i = 0;
  while (i < tokens.length && /^[\p{Lu}]\.?$/u.test(tokens[i])) { inits.push(`${tokens[i].replace(/\.$/, '')}.`); i++; }
  const surname = tokens.slice(i).join(' ');
  if (!surname) return p.trim();
  return inits.length ? `${surname}, ${inits.join(' ')}` : surname;
}

function parseIeeeAuthors(seg: string): string {
  const cleaned = seg.replace(/\s*,?\s+(?:and|i)\s+/gi, ', ').replace(/\bet\s+al\.?/gi, ''); // hrv "i" i "and"
  const names: string[] = [];
  for (const part of cleaned.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean)) {
    const n = ieeeName(part);
    if (n) names.push(n);
  }
  return names.join('; ');
}

function parseIeee(input: string, fields: Partial<CitationInput>): SourceType {
  const raw = input.replace(/\s+/g, ' ').trim();
  const doi = raw.match(/10\.\d{4,9}\/[^\s,;]+/);
  if (doi) fields.doi = doi[0].replace(/[.,;]+$/, '');
  const qm = raw.match(/["“]([^"”]+)["”]/);
  if (!qm || qm.index === undefined) {
    // IEEE knjiga/monografija bez navodnika: "Init Surname[, ... and Init Surname], Naslov. Mjesto: Izdavac, Godina."
    const rawNoRef = raw.replace(/10\.\d{4,9}\/\S+/g, ' ').replace(/https?:\/\/\S+/g, ' ');
    const ye = rawNoRef.match(/\b((?:19|20)\d{2})\b/g); if (ye) fields.year = ye[ye.length - 1];
    // Vodece "Init. Surname" jedinice su autori; prvi chunk bez inicijala je naslov.
    // Dopusti plemicke cestice malim slovom izmedu inicijala i prezimena ("J. van der Berg", "L. de Vries").
    const isAuthor = (c: string) => /^(?:and\s+|i\s+)?(?:\p{Lu}\.\s*)+(?:(?:van|von|de|der|den|del|di|da|du|la|le|el|al|bin|ibn)\s+)*\p{Lu}[\p{L}'’\-]+/u.test(c.trim());
    const chunks = raw.split(/,\s*/);
    let i = 0;
    while (i < chunks.length && i < 8 && isAuthor(chunks[i])) i++;
    const authorRegion = chunks.slice(0, i).join(', '); // parseIeeeAuthors normalizira "and"/"i" (inace "Metev and V. P. Veiko")
    // "Ime[, Ime2], Ed(s)., Naslov" = urednicka monografija: osobe su UREDNICI, ne autori.
    const edited = i < chunks.length && /^Eds?\.?$/i.test(chunks[i].trim());
    if (edited) i++;
    if (authorRegion) { if (edited) fields.editor = parseIeeeAuthors(authorRegion); else fields.authors = parseIeeeAuthors(authorRegion); }
    let rest = chunks.slice(i).join(', ')
      .replace(/,?\s*doi:\s*\S+/gi, ' ').replace(/10\.\d{4,9}\/\S+/g, ' ').replace(/https?:\/\/\S+/g, ' ')
      .replace(/\[online\]\.?/gi, ' ').replace(/\bavailable\s*:?\s*/gi, ' ')     // "[Online]. Available: URL"
      .replace(/^Eds?\.,?\s*/i, '')                                              // rezervni: "Ed., Naslov" bez autora
      .replace(/,\s*(?:19|20)\d{2}\.?\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    // Oznaka sveska "vol. N" nije dio naslova (viseknjizna monografija "..., vol. 1. Mjesto: Izdavac").
    const volb = rest.match(/,?\s*vol\.\s*(\d+)/i); if (volb) { fields.volume = volb[1]; rest = rest.replace(volb[0], '').replace(/\s{2,}/g, ' ').trim(); }
    rest = stripEdition(rest); // "..., 5th ed. Mjesto", "..., Rev. ed. Mjesto" -> makni izdanje da ne razbije naslov/mjesto
    const pub = rest.match(/^(.+?)\.\s+([^:]+?):\s*(.+)$/); // "Naslov. Mjesto: Izdavac"; naslov non-greedy da "St. Louis" ne procuri (mjesto smije imati tocku/zarez)
    if (pub) {
      fields.title = pub[1].replace(/[.\s]+$/, '').trim();
      fields.place = pub[2].trim();
      // izdavac bez repa ", God"/", pp. X"/", vol. X" (elsevier/IEEE lijepe koordinate iza izdavaca)
      fields.publisher = pub[3].replace(/,\s*(?:(?:19|20)\d{2}|pp?\.\s*\d|vol\.\s*\d).*$/i, '').replace(/[.,\s]+$/, '').trim();
    }
    else {
      // Knjiga bez mjesta: "Naslov. Izdavac" (izdavac kratki zavrsni segment bez znamenki).
      const pubNoPlace = rest.match(/^(.+)\.\s+([^.:]+?)\.?\s*$/);
      if (pubNoPlace && !/\d/.test(pubNoPlace[2]) && pubNoPlace[2].trim().length <= 40) {
        fields.title = pubNoPlace[1].replace(/[.\s]+$/, '').trim();
        fields.publisher = pubNoPlace[2].trim();
      } else if (rest) fields.title = rest.replace(/[.,\s]+$/, '').trim();
    }
    return 'knjiga';
  }
  fields.title = qm[1].replace(/[.,]+$/, '').trim();
  const before = raw.slice(0, qm.index).replace(/[\s,]+$/, '').trim();
  if (before) fields.authors = parseIeeeAuthors(before);
  const tail = raw.slice(qm.index + qm[0].length).replace(/^[\s,.]+/, '').trim();
  // Godina bez DOI/URL suma (DOI "10.1080/...2018..." ima laznu godinu).
  const ye = tail.replace(/10\.\d{4,9}\/\S+/g, ' ').replace(/https?:\/\/\S+/g, ' ').match(/\b((?:19|20)\d{2})\b/g);
  if (ye) fields.year = ye[ye.length - 1];
  const vol = tail.match(/\bvol\.\s*(\d+)/i); if (vol) fields.volume = vol[1];
  const no = tail.match(/\b(?:no|br)\.\s*(\d+)/i); if (no) fields.issue = no[1];
  const pp = tail.match(/\b(?:pp?|str)\.\s*(\d+(?:\s*[-–]\s*\d+)?)/i); if (pp) fields.pages = pp[1].replace(/\s+/g, ''); // "pp." i hrv "str."
  // Zadrzi zavrsnu tocku (kratica casopisa "IEEE Trans. Med. Imag."), makni samo zarez/razmak.
  const splitSrc = (t: string) => t.split(/,\s*(?:vol\.|no\.|br\.|pp?\.|str\.|(?:19|20)\d{2}\b)/i)[0].replace(/[,\s]+$/, '').trim();
  if (/^in\s+/i.test(tail)) {
    // Poglavlje/zbornik: "in <Zbornik>[, <Urednik>, Ed(s).] <Mjesto>: <Izdavac>, God, pp."  ILI konf. "in <Proc>, <Grad>, God, pp."
    let body = tail.replace(/^in\s+/i, '').trim();
    // Odsijeci od prve koordinate: mjesec+godina ("Jun. 2016"), gola godina, pp./str./vol./no.
    // pp./str. LOWERCASE (bez /i) da veliki inicijal urednika ", P." ne prode kao "pp."
    body = body.split(/,\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(?:19|20)\d{2}|(?:19|20)\d{2}\b|pp?\.|str\.|vol\.|no\.)/)[0].replace(/[,.\s]+$/, '').trim();
    let container = body, tailPub = '';
    const edm = body.match(/^(.+?),\s*(.+?),\s*Eds?\.\s*(.*)$/i); // "<Zbornik>, <Urednik>, Ed. <Mjesto>: <Izdavac>"
    const colon = body.match(/^(.+?),\s*([^,]*:\s*.+)$/);         // "<Zbornik>, <Mjesto>: <Izdavac>"
    if (edm) { container = edm[1].trim(); fields.editor = edm[2].replace(/[.,\s]+$/, '').trim(); tailPub = edm[3].trim(); }
    else if (colon) { container = colon[1].trim(); tailPub = colon[2].trim(); }
    else if (/\(.*\)/.test(body)) {
      // konferencija s akronimom u zagradi: naziv (s internim zarezima) ide do ")", grad je iza "), "
      const m = body.match(/^(.*\))\s*,\s*(.+)$/);
      if (m) { container = m[1].trim(); tailPub = m[2].trim(); } else container = body;
    }
    else { const cm2 = body.match(/^(.+?),\s*(.*)$/); if (cm2) { container = cm2[1].trim(); tailPub = cm2[2].trim(); } } // "Proc. Konf, Grad"
    fields.container = container.replace(/[.,\s]+$/, '').trim();
    if (tailPub) {
      const pm = tailPub.match(/^([^:]+):\s*(.+)$/); // "Mjesto: Izdavac" ILI goli grad
      if (pm) { fields.place = pm[1].trim(); fields.publisher = pm[2].replace(/[.,\s]+$/, '').trim(); }
      else fields.place = tailPub.replace(/[.,\s]+$/, '').trim();
    }
    return 'poglavlje';
  }
  // Casopis/zbornik: makni DOI/URL rep pa uzmi do prve koordinate; NE izmisljaj container iz golog datuma (monografija).
  const cleanTail = tail.replace(/,?\s*doi:\s*\S+/gi, ' ').replace(/10\.\d{4,9}\/\S+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const src = splitSrc(cleanTail); // splitSrc vec makne zavrsni zarez/razmak, ali ZADRZI tocku (kratica casopisa "IEEE Trans. Med. Imag.")
  const srcCore = src.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\b/gi, ' ').replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/[.,\s]+/g, '');
  if (src && srcCore) fields.container = src;
  return 'clanak';
}

// --- Chicago / fusnota (humanistika, pravo) --------------------------------------------------
// biblio knjiga: "Prezime, Ime. Naslov. Mjesto: Izdavac, godina."
// biblio clanak: "Prezime, Ime. "Naslov." Casopis vol, no. N (godina): str."
// fusnota:       "Ime Prezime, Naslov (Mjesto: Izdavac, godina), str."
function looksLikeChicago(s: string): boolean {
  return /,\s*(?:19|20)\d{2}\.?\s*$/.test(s)                        // "..., 2020." (biblio knjiga)
      || /\((?:19|20)\d{2}\)\s*:\s*\d/.test(s)                       // "(2019): 45" (biblio clanak)
      || /\([^)]*:\s*[^)]*,\s*(?:19|20)\d{2}\)/.test(s);             // "(Mjesto: Izdavac, godina)" fusnota
}

function invertNatural(name: string): string {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (t.length < 2) return name.trim();
  return `${t[t.length - 1]}, ${t.slice(0, -1).join(' ')}`;
}

// Prvi autor je vec obrnut ("Prezime, Ime"), ostali su prirodni ("Ime Prezime"); veznik "i"/"and".
// Kljuc: prvi autor nosi INTERNI zarez ("Prezime, Ime") pa se ne smije naivno dijeliti po zarezu.
function chicagoAuthorsInverted(seg: string): string {
  // Multi = ima veznik ILI "Prezime, I. Prezime2" uzorak; inace je jedan autor "Prezime, Ime".
  const multi = /\s+(?:i|and)\s+/i.test(seg) || /,\s*\p{Lu}\.\s/u.test(seg);
  const parts = normalizeConnectors(seg).trim().split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
  if (!multi || parts.length < 2) return normalizeConnectors(seg).trim();
  const out = [`${parts[0]}, ${parts[1]}`];               // prvi: "Prezime, Ime/Inicijali" (2 tokena)
  for (const p of parts.slice(2)) out.push(invertNatural(p)); // ostali: "Ime Prezime" -> "Prezime, Ime"
  return out.join('; ');
}

// "Ime Prezime, Ime2 Prezime2" -> "Prezime, Ime; Prezime2, Ime2" (fusnota: prirodni redoslijed).
function chicagoAuthorsNatural(seg: string): string {
  return seg.replace(/\s*,?\s+(?:i|and)\s+/gi, ', ').split(/\s*,\s*/).filter(Boolean)
    .map((c) => invertNatural(c)).join('; ');
}

function parseChicago(input: string, fields: Partial<CitationInput>): SourceType {
  const raw = input.replace(/\s+/g, ' ').trim();
  const doi = raw.match(/10\.\d{4,9}\/[^\s,;]+/); if (doi) fields.doi = doi[0].replace(/[.,;]+$/, '');
  const url = raw.match(/https?:\/\/[^\s,;]+/); if (url && !/doi\.org/i.test(url[0])) fields.url = url[0].replace(/[.,;)]+$/, '');

  // FUSNOTA: "Ime Prezime, Naslov (Mjesto: Izdavac, godina), str."
  const fn = raw.match(/^(.+?),\s*(.+?)\s*\(([^):]+):\s*([^),]+),\s*((?:19|20)\d{2})\)\s*,?\s*(\d+(?:\s*[-–]\s*\d+)?)?/);
  if (fn) {
    fields.authors = chicagoAuthorsNatural(fn[1]);
    fields.title = fn[2].replace(/[.,]+$/, '').trim();
    fields.place = fn[3].trim();
    fields.publisher = fn[4].trim();
    fields.year = fn[5];
    if (fn[6]) fields.pages = fn[6].replace(/\s+/g, '');
    return 'knjiga';
  }

  // Reprint "..., 1986 (1941)": godina IZDANJA (1986) prije izvornika u zagradi; inace "(YYYY)" clanak, pa ", YYYY".
  const ymEnd = raw.match(/,\s*((?:19|20)\d{2})\s*\((?:19|20)\d{2}\)/) || raw.match(/\(((?:19|20)\d{2})\)/) || raw.match(/,\s*((?:19|20)\d{2})(?:[.,]|\s*$)/);
  if (ymEnd) fields.year = ymEnd[1];

  // biblio clanak/poglavlje s navodnicima
  const qm = raw.match(/["“]([^"”]+)["”]/);
  if (qm && qm.index !== undefined) {
    fields.title = qm[1].replace(/[.,]+$/, '').trim();
    const before = raw.slice(0, qm.index).replace(/[\s.]+$/, '').trim();
    if (before) fields.authors = chicagoAuthorsInverted(before);
    const tail = raw.slice(qm.index + qm[0].length).replace(/^[\s.]+/, '').trim();
    // "Casopis 12, no. 3 (2019): 45-67"
    const am = tail.match(/^(.+?)\s+(\d+)\.?(?:,\s*(?:no\.|br\.)\s*(\d+))?\s*\((?:19|20)\d{2}\)\s*:\s*(\d+(?:\s*[-–]\s*\d+)?)/i); // "64., br. 3"
    if (am) {
      fields.container = am[1].replace(/[.,\s]+$/, '').trim();
      fields.volume = am[2];
      if (am[3]) fields.issue = am[3];
      fields.pages = am[4].replace(/\s+/g, '');
      return 'clanak';
    }
    // poglavlje u zborniku: "u: [Urednik (ur.), ]Knjiga, Mjesto: Izdavac, godina. str. X-Y" (urednik opcionalan)
    if (/^u\s*:?\s|^in\s+/i.test(tail)) {
      const em = tail.match(/^(?:u|in)\s*:?\s*(.+?)\s*\((?:ur|prir|eds?|ed)\.?\)\s*,?\s*(.*)$/i);
      let t: string;
      if (em) { fields.editor = normalizeConnectors(em[1]).replace(/[.,\s]+$/, '').trim(); t = em[2]; }
      else { const m2 = tail.match(/^(?:u|in)\s*:?\s*(.*)$/i); t = m2 ? m2[1] : ''; }
      // Chicago cesto navodi gole stranice poglavlja ("..., Zbornik, 45-78. Mjesto: Izdavac"), bez "str."/"pp.".
      // NE mutiraj t (container uzima ^[^,]+ pa mu treba prvi zarez; pub trazi "Mjesto: Izdavac" neovisno).
      const pg = t.match(/(?:str\.?|pp?\.?)\s*([\divxlcdm]+\s*[-–]\s*[\divxlcdm]+)/i) || t.match(/,\s*([\divxlcdm]+\s*[-–]\s*[\divxlcdm]+)(?=[.,\s]|$)/i); // arapski ILI rimski raspon ("xi-xxviii")
      if (pg) fields.pages = pg[1].replace(/\s+/g, '');
      // engleski CMOS "edited by X[, Y, and Z]," ili kratica "ed. X," - uzmi popis urednika, izbaci iz t
      // (lookahead granicu da ne proguta stranice; "ed." tocka inace stvara laznu ". " granicu za mjesto).
      if (!fields.editor) {
        const eb = t.match(/\bedited by\s+(.+?)(?=,\s*[\divxlcdm]+\s*[-–]|\.\s|$)/i) || t.match(/\beds?\.\s+(.+?)(?=,\s*[\divxlcdm]+\s*[-–]|\.\s|$)/i);
        if (eb) { fields.editor = eb[1].replace(/[.,\s]+$/, '').trim(); t = t.replace(eb[0], ' ').replace(/\s*,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim(); }
      }
      const cont = t.match(/^([^,]+)/); if (cont) fields.container = cont[1].replace(/[.\s]+$/, '').trim();
      // "Mjesto: Izdavac" IZA containera. Sidreno na ". " (iza golih stranica/urednika) pa mjesto smije imati
      // tocku ("Cambridge, MA", "New York") i izdavac inicijal/zarez ("W. W. Norton", "Harvard University Press").
      const rest = cont ? t.slice(cont[0].length) : t;
      const pub = rest.match(/\.\s+([^:]+?):\s*(.+?)(?:,\s*(?:19|20)\d{2}|\.?\s*$)/)
        || rest.match(/(?:^|,)\s*([^:.]+?):\s*(.+?)(?:,\s*(?:19|20)\d{2}|\.?\s*$)/); // rezervni: mjesto bez prethodne ". "
      if (pub) { fields.place = pub[1].replace(/^[\s,]+/, '').trim(); fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim(); }
      return 'poglavlje';
    }
    return 'clanak';
  }

  // biblio knjiga: "Prezime, Ime. Naslov. Mjesto: Izdavac, godina."
  // Jedan autor ("Milas, G.") -> zavrsava na prvoj ". " (i iza inicijala); vise autora
  // (veznik "i"/"and") -> splitAtSentence preskace inicijale do zadnjeg prezimena.
  // Multi-autor SAMO kad je "and"/"i" dio popisa imena (", and Prezime" Oxford, ili "i D. Prezime"),
  // ne kad je "and"/"i" u naslovu/izdavacu ("Collapse and Revival", "Simon and Schuster").
  const multi = /,\s+(?:and|i)\s+\p{Lu}/u.test(raw) || /\s+(?:and|i)\s+\p{Lu}\.\s/u.test(raw);
  const naive = (x: string): [string, string] => { const d = x.search(/\.\s/); return d >= 0 ? [x.slice(0, d).trim(), x.slice(d + 2).trim()] : [x.replace(/\.\s*$/, '').trim(), '']; };
  const split = multi ? splitAtSentence : naive;
  const [authorPart, afterAuthor] = split(raw);
  // Naslov UVIJEK preko splitAtSentence: preskace inicijale u naslovu ("Studije o A. G. Matosu").
  const [titlePart, afterTitle] = splitAtSentence(afterAuthor);
  if (authorPart) fields.authors = chicagoAuthorsInverted(authorPart);
  if (titlePart) fields.title = titlePart.replace(/[.,]+$/, '').trim();
  // "Mjesto: Izdavac, godina". Mjesto smije imati tocku u kratici ("Washington, D.C.", "Princeton, N.J."),
  // izdavac zarez/inicijal ("Harcourt, Brace and Company", "W. W. Norton"); godina je zadnji ", NNNN".
  const pub = stripEdition(afterTitle || '').match(/^([^:]+?):\s*(.+?),\s*(?:19|20)\d{2}\b/);
  if (pub) { fields.place = pub[1].trim(); fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim(); }
  return 'knjiga';
}

function parseApa(original: string, fields: Partial<CitationInput>): SourceType {
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
    .replace(/\(\s*(?:izvornik(?:\s+\w+)*\s+objavljen|original(?:ly)?\s+(?:work\s+)?published|orig\.?\s*publ)[^)]*\)/gi, '') // APA reprint: "(Izvornik objavljen 1900)"
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
    const m1 = rem.match(/^(.+?),\s*(\d+)\.?\s*\((\d+)\)(?:,\s*(\d+(?:\s*[-–]\s*\d+)?))?/); // "64. (3)"; stranice raspon ILI jedna ("108(3), 45")
    if (m1) {
      fields.container = m1[1].trim();
      fields.volume = m1[2];
      fields.issue = m1[3];
      if (m1[4] && !fields.pages) fields.pages = m1[4].replace(/\s+/g, '');
      matched = true;
    } else {
      const m2 = rem.match(/^(.+?),\s*(\d+),\s*(\d+(?:\s*[-–]\s*\d+)?)(?=[.,\s]|$)/); // "Nature, 171, 737-738" ILI jedna stranica "Nature, 171, 737"
      if (m2) {
        fields.container = m2[1].trim();
        fields.volume = m2[2];
        if (!fields.pages) fields.pages = m2[3].replace(/\s+/g, '');
        matched = true;
      }
    }
    if (!fields.pages) {
      const bp = rem.match(/:\s*(\d+\s*[-–]\s*\d+)/) || rem.match(/\b(\d+\s*[-–]\s*\d+)\b/) || rem.match(/,\s*(e\d+)\b/i); // raspon ILI eLocator ("e0231234")
      if (bp) fields.pages = bp[1].replace(/\s+/g, '');
    }

    // APA konferencija/poglavlje bez volumena: "... Naslov. Zbornik, str." -> Zbornik = container.
    // Zbornik SMIJE imati podnaslovnu dvotocku ("Proc. of ... Conference: Subtitle, 1-7"); zavrsni
    // raspon stranica je pravi cuvar (knjiga "Mjesto: Izdavac." nema zavrsni raspon stranica).
    if (!matched && !fields.container && fields.pages) {
      const cc = rem.match(/^(.+?),\s*\d+\s*[-–]\s*\d+\.?\s*$/);
      if (cc) { fields.container = cc[1].trim(); matched = true; }
    }

    // Knjiga: "Mjesto: Izdavac" (mjesto smije imati zarez "Cambridge, MA" i tocku u kratici "St. Louis, MO",
    // "Washington, D.C."; izdavac tocke "W. H. Freeman"). rem je vec bez naslova pa je sidrenje sigurno.
    if (!matched && !fields.container) {
      const pub = rem.match(/^([^:]+?):\s*(.+?)\.?\s*$/);
      if (pub) {
        fields.place = pub[1].replace(/^[\s,]+|[\s,]+$/g, '').trim();
        fields.publisher = pub[2].replace(/[.,\s]+$/, '').trim();
      } else if (rem) {
        // APA/APA7 bez mjesta: "Naklada Slap." / "CRC Press." (DOI/URL je vec skinut iz rem gore,
        // pa ostatak bez znamenki i razuman po duljini = izdavac). Skini eventualni "(, Ed.)" rep.
        const only = rem.replace(/\s*\([^)]*\bEds?\.?\)\s*/gi, ' ').replace(/[.,\s]+$/, '').trim();
        if (only && !/\d/.test(only) && only.length <= 60) fields.publisher = only;
      }
    }
  }

  const type = guessType(original.toLowerCase(), fields);
  if (type === 'propis') parsePropis(original, fields);
  // Zavrsni/doktorski: ustanova je "institution", ne izdavac ("Filozofski fakultet, ...").
  if (type === 'zavrsni' && !fields.institution && fields.publisher) {
    fields.institution = [fields.place, fields.publisher].filter(Boolean).join(', ')
      .replace(/\bneobjavljena?i?\s+/i, '')                                    // "Neobjavljeni ..."
      .replace(/\b(?:zavr[sš]ni|diplomski|doktorski|magistarski)\s+rad[.,]?\s*/i, '') // deskriptor vrste
      .replace(/^[\s,.]+/, '').trim();
    delete fields.publisher;
    delete fields.place;
  }
  return type;
}

export function parseReference(raw: string, style: BulkStyle = 'auto'): ParsedReference {
  const original = stripMarker((raw || '').replace(/\s+/g, ' ').trim());
  const fields: Partial<CitationInput> = {};
  if (!original) return { type: 'knjiga', fields, lowConfidence: true };

  // 'auto': prepoznaj po obliku (Vancouver i IEEE su nedvosmisleni pa idu prvi). Inace forsiraj granu.
  let type: SourceType;
  if (style === 'vancouver' || (style === 'auto' && looksLikeVancouver(original))) type = parseVancouver(original, fields);
  else if (style === 'ieee' || (style === 'auto' && looksLikeIeee(original))) type = parseIeee(original, fields);
  else if (style === 'chicago' || (style === 'auto' && looksLikeChicago(original))) type = parseChicago(original, fields);
  else type = parseApa(original, fields);

  // Zajednicko ciscenje (svi stilovi): naslov bez DOI/URL repa, uredničkog/prijevodnog/izdanjskog
  // parentetickog repa i zavrsne interpunkcije.
  if (fields.title) {
    fields.title = fields.title
      .replace(/[\s.,]*(?:https?:\/\/\S+|doi:\s*\S+|\b10\.\d{4,9}\/\S+).*$/i, '')                                    // "Naslov? https://doi.org/..." -> makni DOI/URL rep
      .replace(/\s*\([^)]*\b(?:Eds?|Urednici?|Ur|Prir)\.?\)\s*$/i, '')                                               // "(, Ed.)", "(J. Smith, Ed.)", "(I. Ivic, ur.)"
      .replace(/\s*\((?:prev|preveo|prevela|prijevod|trans|[\d.]+\s*izd|\d+(?:st|nd|rd|th)?\s*ed)\b[^)]*\)\s*$/i, '') // "(prev. ...)", "(3. izd.)", "(2nd ed.)"
      // Izdanje na kraju naslova: brojcano ("13th ed", "3. izd"), rijecno ("Second edition") ili opisno
      // ("Rev. ed.", "2nd rev. ed.", "Abr. ed."). Ne dira "Higher Education" (treba edition-rijec ili broj ispred).
      .replace(/[.,]?\s*(?:(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|rev(?:ised)?|abr(?:idged)?|exp(?:anded)?|enl(?:arged)?|new|internat(?:ional)?)\.?\s+)+(?:ed|edition|izd|izdanje)\.?\s*$/i, '')
      .replace(/[.,]+$/, '').trim();
  }
  if (fields.authors) {
    fields.authors = fields.authors
      .replace(/[,;]+\s*$/, '')
      .replace(/(?<=\p{Ll})\.$/u, '') // makni tocku iza rijeci (korporativni autor), ne iza inicijala
      .trim();
  }

  const filled = Object.values(fields).filter(Boolean).length;
  return { type, fields, lowConfidence: filled <= 2 };
}
