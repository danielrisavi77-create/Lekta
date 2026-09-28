// src/fingerprint/extract-from-docx.ts
//
// RE-18: otisak za naplatni gate MORA doci iz STVARNO uploadanih bajtova, ne iz klijentske meta
// (inace jedan potroseni slot popravlja BILO KOJI drugi dokument iste vrste rada, replayem stare
// meta uz zamijenjen file). Regex-based ekstrakcija (kao xml-patch.ts), namjerno BEZ punog
// DOMParsera: dovoljna je gruba ali deterministicna ekstrakcija naslova H1/H2 iz document.xml,
// ne puna analiza kao analyze-docx.ts. `title`/`author` se namjerno NE pokusavaju izvuci s
// naslovnice (title-page varijante su prebrojne za pouzdan regex, vidi title-page-templates);
// computeFingerprint vec ima fallback na prvi H1 kad je title prazan.

import type { FingerprintInput, HeadingInput } from './fingerprint.ts';

const HEADING_STYLE_RE = /^(?:heading|naslov)\s*([1-9])$/i;

// LINEARNI SKENER UMJESTO REGEXA NAD SADRZAJEM (T84, R-01).
//
// Prva izvedba koristila je regexe oblika `<w:x\b[^>]*...` i `<w:x...>[\s\S]*?</w:x>` nad
// document.xml i styles.xml koje salje korisnik. Oni su kvadratni kad tag nema zatvaranje: za svaki
// pocetak `<w:style ` bez `>` motor ponovno skenira ostatak niza. Izmjereno 28. 9. 2026. (Node):
// `'<w:style '` x 20000 (176 KB) trajalo je 7,2 s, a svako udvostrucenje ulaza ucetverostrucilo je
// vrijeme; styles.xml smije do 64 MB raspakirano, a otisak se racuna PRIJE svake kvote popravka.
//
// Skener ispod ima ISTU semantiku kao regexi koje zamjenjuje (test ih drzi kao orakl i usporeduje
// na fixturama i generiranom XML-u), ali svaki pokazivac ide samo naprijed: `>` i zatvarajuci tag
// traze se jednom i pamte za sljedece pocetke, pa je ukupni rad linearan u duljini ulaza.
//
// ISTA semantika znaci i iste neobicnosti: regex ne prati navodnike, pa `>` unutar vrijednosti
// zavrsava tag odlomka i `<w:t>`. Iznimka je stil: tamo `w:styleId="([^"]*)"` smije prijeci `>`, pa
// tag stila zavrsava tek iza zatvarajuceg navodnika (styleTagMatcher). Opce pracenje navodnika bi
// promijenilo otisak postojecih dokumenata i odvezalo vec placene slotove.

/**
 * Brojac rada, samo za test linearnosti: pregledani znakovi plus jedan korak po upitu i po
 * iteraciji petlje nad pojavama, pa se broji i petlja koja ne pretrazuje (npr. ponavljanje nad vec
 * nadjenim pojavama). Deterministicki dokaz da rad raste linearno s ulazom, neovisno o brzini
 * stroja. Produkcija ga ne postavlja (null).
 */
let brojac: { znakova: number } | null = null;

/** `s.indexOf(needle, from)` koji brojacu pribraja pregledani raspon. */
function trazi(s: string, needle: string, from: number): number {
  const i = s.indexOf(needle, from);
  if (brojac) brojac.znakova += Math.max(0, (i === -1 ? s.length : i + needle.length) - Math.max(0, from));
  return i;
}

/** `s.slice(a, b)` koji brojacu pribraja duljinu kopije. */
function isjecak(s: string, a: number, b: number): string {
  if (brojac) brojac.znakova += Math.max(0, b - a);
  return s.slice(a, b);
}

/** Je li znak na `i` "word" znak u smislu regexa `\b` (ASCII slovo, znamenka ili `_`). */
function isWordChar(s: string, i: number): boolean {
  if (i >= s.length) return false;
  const c = s.charCodeAt(i);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/** Pamti prvu pojavu `needle` na ili iza pozicije; pozicije upita ne smiju padati. */
function forwardFinder(s: string, needle: string): (from: number) => number {
  let cached = -2;
  return (from: number) => {
    if (brojac) brojac.znakova += 1;
    if (cached === -1) return -1;
    if (cached >= from) return cached;
    cached = trazi(s, needle, from);
    return cached;
  };
}

/** Pocetci `<name` iza kojih ne slijedi word znak (regex `<name\b`), redom. */
function* tagStarts(s: string, name: string): Generator<number> {
  const open = `<${name}`;
  let i = trazi(s, open, 0);
  while (i !== -1) {
    if (!isWordChar(s, i + open.length)) yield i;
    i = trazi(s, open, i + 1);
  }
}

/**
 * Vrijednost atributa kao regex `[^>]*attr="([^"]*)"` iza pocetka taga `start`, prije prvog `>`
 * (`region`): pohlepni `[^>]*` bira ZADNJU pojavu `attr="` ciji zatvarajuci `"` postoji (vrijednost
 * smije prijeci `>`, kao `[^"]*` u regexu). Vise pocetaka bez `>` izmedju dijeli isti `region`, pa
 * se pojave i njihovi navodnici racunaju jednom po regionu: rad ostaje linearan.
 */
function attrLookup(s: string, attr: string): (start: number, region: number) => string | null {
  const needle = `${attr}="`;
  let cachedRegion = -1;
  let occurrences: number[] = [];
  const closes = new Map<number, number>();
  return (start, region) => {
    if (region !== cachedRegion) {
      cachedRegion = region;
      occurrences = [];
      closes.clear();
      const segment = isjecak(s, start, region);
      let i = trazi(segment, needle, 0);
      while (i !== -1) {
        occurrences.push(start + i);
        i = trazi(segment, needle, i + 1);
      }
    }
    for (let k = occurrences.length - 1; k >= 0 && occurrences[k] > start; k--) {
      if (brojac) brojac.znakova += 1;
      const valueStart = occurrences[k] + needle.length;
      let close = closes.get(k);
      if (close === undefined) { close = trazi(s, '"', valueStart); closes.set(k, close); }
      if (close !== -1) return isjecak(s, valueStart, close);
    }
    return null;
  };
}

/**
 * Prva vrijednost `attr` u tagu `<tagName ...>` unutar `block`, semantika
 * `block.match(/<tagName\b[^>]*attr="([^"]*)"/)`.
 */
function firstTagAttr(block: string, tagName: string, attr: string): string | null {
  const nextGt = forwardFinder(block, '>');
  const lookup = attrLookup(block, attr);
  for (const start of tagStarts(block, tagName)) {
    const gt = nextGt(start);
    const value = lookup(start, gt === -1 ? block.length : gt);
    if (value !== null) return value;
  }
  return null;
}

/** Pogodak taga: odabrana vrijednost, indeks `>` koji zavrsava tag i je li tag samozatvarajuci. */
type TagMatch<T> = { picked: T; tagEnd: number; selfClosing: boolean };

/**
 * Tag bez uvjeta, kao `<name\b[^>]*\/>|<name\b[^>]*>`: zavrsava PRVIM `>` (regex ne prati
 * navodnike), samozatvarajuci je kad je znak prije njega `/` iza imena.
 */
function plainTag(s: string, name: string): (start: number, gt: number) => TagMatch<true> {
  return (start, gt) => ({
    picked: true,
    tagEnd: gt,
    selfClosing: gt - 1 > start + name.length && s.charCodeAt(gt - 1) === 47 /* '/' */,
  });
}

/**
 * Tag stila kao `<w:style\b[^>]*w:styleId="([^"]*)"[^>]*\/>|<w:style\b[^>]*w:styleId="([^"]*)"[^>]*>`
 * uz `[\s\S]*?</w:style>` iza druge alternative. Kraj taga NIJE prvi `>` iza pocetka: vrijednost
 * `[^"]*` smije prijeci `>`, pa tag zavrsava prvim `>` iza zatvarajuceg navodnika ODABRANE pojave
 * (Codex R1 na #230: `w:styleId="Custom>Id"/>` je samozatvarajuci stil, ne otvoreni).
 *
 * Pohlepni `[^>]*` prvo proba ZADNJU pojavu prije prvog `>`, a prva alternativa iscrpi sve pojave
 * prije druge. Zato se po regionu (pocetci bez `>` izmedju) jednom izracuna zadnja pojava koja
 * zadovoljava prvu i zadnja koja zadovoljava drugu alternativu; pocetak ih koristi ako su iza njega.
 * Pojave, navodnici i `>` traze se forward finderima, pa je rad linearan.
 */
function styleTagMatcher(s: string): (start: number, gt: number) => TagMatch<string> | null {
  const needle = 'w:styleId="';
  const nextOcc = forwardFinder(s, needle);
  const nextQuote = forwardFinder(s, '"');
  const nextGt = forwardFinder(s, '>');
  let lastClose: number | null = null;
  type Pojava = { occ: number; valueStart: number; quote: number; tagEnd: number };
  let cachedRegion = -1;
  let self: Pojava | null = null;
  let open: Pojava | null = null;
  return (start, gt) => {
    if (gt !== cachedRegion) {
      cachedRegion = gt;
      self = null;
      open = null;
      let i = nextOcc(start);
      while (i !== -1 && i < gt) {
        const valueStart = i + needle.length;
        const quote = nextQuote(valueStart);
        if (quote === -1) break; // ni kasnije pojave nemaju zatvarajuci navodnik
        const tagEnd = nextGt(quote + 1);
        if (tagEnd === -1) break; // ni kasnije pojave nemaju `>` iza navodnika
        const p = { occ: i, valueStart, quote, tagEnd };
        if (s.charCodeAt(tagEnd - 1) === 47 /* '/' */) self = p;
        if (lastClose === null) {
          lastClose = s.lastIndexOf('</w:style>');
          if (brojac) brojac.znakova += s.length;
        }
        if (lastClose > tagEnd) open = p;
        i = nextOcc(i + 1);
      }
    }
    const win: Pojava | null = self !== null && self.occ > start ? self : open !== null && open.occ > start ? open : null;
    if (win === null) return null;
    return { picked: isjecak(s, win.valueStart, win.quote), tagEnd: win.tagEnd, selfClosing: win === self };
  };
}

/**
 * Blokovi elementa kao regex `<name\b...\/>|<name\b...>[\s\S]*?<\/name>` s `g`. `match` odlucuje
 * gdje tag zavrsava i je li samozatvarajuci (null znaci da regex na tom pocetku ne uspijeva).
 * Samozatvarajuci tag je blok za sebe, inace blok ide do PRVOG `</name>` iza taga. Pocetak bez
 * `>`, bez zatvaranja ili bez uvjeta se preskace i pretraga nastavlja od sljedeceg pocetka, kao u
 * regexu; nakon bloka nastavlja od njegova kraja.
 */
function* elementBlocks<T>(
  s: string,
  name: string,
  match: (start: number, gt: number) => TagMatch<T> | null,
): Generator<{ start: number; end: number; picked: T }> {
  const nextGt = forwardFinder(s, '>');
  const nextClose = forwardFinder(s, `</${name}>`);
  const closeLen = name.length + 3;
  let resumeAt = 0;
  for (const start of tagStarts(s, name)) {
    if (start < resumeAt) continue;
    const gt = nextGt(start);
    if (gt === -1) return;
    const m = match(start, gt);
    if (m === null) continue;
    if (m.selfClosing) {
      resumeAt = m.tagEnd + 1;
      yield { start, end: resumeAt, picked: m.picked };
      continue;
    }
    const close = nextClose(m.tagEnd + 1);
    if (close === -1) continue;
    resumeAt = close + closeLen;
    yield { start, end: resumeAt, picked: m.picked };
  }
}

/**
 * styleId -> razina naslova (1-9), iz styles.xml. Stil moze biti prepoznat po doslovnom styleId-u
 * ("Heading1"/"Naslov1") ili po lokaliziranom w:name (isti par kriterija kao RE-08 u xml-patch.ts).
 * Samozatvarajuci stil je blok za sebe (RE-24 obrazac): ne "guta" sljedeci stil.
 */
function headingLevelsByStyleId(stylesXml: string): Map<string, number> {
  const byId = new Map<string, number>();
  // Regex je trazio `w:styleId="..."` u samom tagu: bez njega na tom pocetku ne uspijeva (null),
  // a prazna vrijednost JEST pogodak koji se tek onda preskace.
  for (const { start, end, picked: styleId } of elementBlocks(stylesXml, 'w:style', styleTagMatcher(stylesXml))) {
    if (!styleId) continue;
    const idLevel = HEADING_STYLE_RE.exec(styleId);
    if (idLevel) { byId.set(styleId, Number(idLevel[1])); continue; }
    const name = firstTagAttr(isjecak(stylesXml, start, end), 'w:name', 'w:val');
    const nameLevel = name !== null ? HEADING_STYLE_RE.exec(name) : null;
    if (nameLevel) byId.set(styleId, Number(nameLevel[1]));
  }
  return byId;
}

/**
 * Tekst odlomka: konkatenacija svih <w:t> unutar bloka (bez formatiranja/runova), semantika
 * `matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)`.
 */
function paragraphText(block: string): string {
  const parts: string[] = [];
  const nextGt = forwardFinder(block, '>');
  const nextLt = forwardFinder(block, '<');
  let resumeAt = 0;
  for (const start of tagStarts(block, 'w:t')) {
    if (start < resumeAt) continue;
    const gt = nextGt(start);
    if (gt === -1) break;
    const lt = nextLt(gt + 1);
    if (lt === -1 || !block.startsWith('</w:t>', lt)) continue;
    parts.push(isjecak(block, gt + 1, lt));
    resumeAt = lt + 6;
  }
  return parts.join('').trim();
}

/**
 * Izvuci naslove H1/H2 I "naslovni" pogodak iz stvarnih bajtova (document.xml + styles.xml).
 * Namjerno gruba ekstrakcija: dovoljno je da je deterministicki vezana za pravi sadrzaj (isti
 * dokument uvijek daje isti rezultat), ne savrsena detekcija svake lokalizacije/predloska.
 * Samozatvarajuca alternativa (`<w:p/>`) MORA doci prije uparene iz istog razloga kao gore
 * (P-B obrazac).
 *
 * VAZNO (otkriveno empirijski na pravim fixturama): computeFingerprint/fingerprintMatch
 * kombiniraju title (jaki match) i heading-sekvencu+author (slabiji match, ali author=null OVDJE
 * cini tu granu strukturno mrtvom). Hrvatski diplomski/zavrsni radovi gotovo UVIJEK dijele
 * IDENTICNO prvo poglavlje ("Sažetak"/"Uvod"), pa naivan "prvi H1 kao naslov" fallback
 * (computeFingerprint-ov default) kolabira DVA POSVE RAZLICITA rada u isti otisak. Zato se ovdje
 * naslov NE prepusta tom fallbacku: bira se najduzi odlomak PRIJE prvog naslova (naslovnica-zona,
 * gdje realan naslov rada obicno zivi kao najduza fraza), sto je puno rjede generickо nego
 * naziv prvog poglavlja.
 *
 * `mjera` postavlja samo test linearnosti: u nju se pribraja broj pregledanih znakova.
 */
export function extractFingerprintInputFromDocx(
  documentXml: string,
  stylesXml: string,
  mjera?: { znakova: number },
): FingerprintInput {
  brojac = mjera ?? null;
  try {
    const levels = headingLevelsByStyleId(stylesXml);
    const headings: HeadingInput[] = [];
    let titleGuess = '';
    let sawFirstHeading = false;
    for (const { start, end } of elementBlocks(documentXml, 'w:p', plainTag(documentXml, 'w:p'))) {
      const block = isjecak(documentXml, start, end);
      const pStyle = firstTagAttr(block, 'w:pStyle', 'w:val');
      const level = pStyle !== null ? levels.get(pStyle) : undefined;
      if (level && level <= 2) {
        sawFirstHeading = true;
        const text = paragraphText(block);
        if (text) headings.push({ level, text });
        continue;
      }
      if (sawFirstHeading) continue; // naslovnica-zona je zavrsila prvim naslovom
      const text = paragraphText(block);
      if (text.length > titleGuess.length) titleGuess = text;
    }
    return { title: titleGuess || null, author: null, headings };
  } finally {
    brojac = null;
  }
}
