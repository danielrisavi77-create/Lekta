// Tipizirana, testabilna jezgra tipografske lekture hrvatskog teksta (bez DOM-a, bez mreze).
// Deterministicke provjere nad nizom odlomaka: razmaci, interpunkcija, crtice, navodnici,
// cirilicni homoglifi, decimalni separator, visestruke tocke i razmaci uz zagrade.
// Ne mijenja tekst; samo prijavljuje nalaze s isjeckom okoline i prijedlogom ispravka.
//
// Napomene o dosegu:
//  - Provjere 4 (navodnici) i 6 (decimalni separator) su globalne: gledaju cijeli dokument
//    i prijavljuju se na prvom odlomku gdje se mijesanje stvarno ocituje.
//  - Za provjere 6 i 7 URL segmenti se izuzimaju (maskiraju), da poveznice poput
//    http://example.com/v1.2 ili putanje s ".." ne stvaraju lazne nalaze.
//  - Em (U+2014) i en (U+2013) crtica se u kodu navode iskljucivo kao unicode escape,
//    u skladu s pravopisnom konvencijom projekta (bez tih crtica u autorskom tekstu).

export interface TypoFinding {
  paragraphIndex: number;
  kind: string;
  excerpt: string;
  suggestion: string;
}

// Nazivi provjera (kind): stabilni hrvatski identifikatori.
export const KIND_DVOSTRUKI_RAZMAK = 'dvostruki-razmak';
export const KIND_RAZMAK_PRIJE_INTERPUNKCIJE = 'razmak-prije-interpunkcije';
export const KIND_EM_EN_CRTICA = 'em-en-crtica';
export const KIND_NAVODNICI_NEDOSLJEDNI = 'navodnici-nedosljedni';
export const KIND_HOMOGLIF_CIRILICA = 'homoglif-cirilica';
export const KIND_DECIMALNI_SEPARATOR = 'decimalni-separator';
export const KIND_VISESTRUKE_TOCKE = 'visestruke-tocke';
export const KIND_RAZMAK_UZ_ZAGRADU = 'razmak-nakon-otvorene-zagrade';

// Hrvatski nazivi za prikaz (bocna lista Oznacenog pregleda, rezultat u app.ts): JEDAN izvor
// istine da app.ts i preview-anchors.ts ne odrzavaju dvije nezavisne mape koje se mogu razici
// (isti obrazac kao ruleEntries/effectiveRules, vidi CLAUDE.md Option A). em-en-crtica naziv
// mora odgovarati stvarnom suggestion tekstu iznad (zarez/dvotocka/zagrade, NE spojnica).
export const KIND_LABELS_HR: Record<string, string> = {
  [KIND_DVOSTRUKI_RAZMAK]: 'Dvostruki razmak',
  [KIND_RAZMAK_PRIJE_INTERPUNKCIJE]: 'Razmak prije interpunkcije',
  [KIND_EM_EN_CRTICA]: 'Crtica umjesto zareza, dvotočke ili zagrada',
  [KIND_NAVODNICI_NEDOSLJEDNI]: 'Nedosljedni navodnici',
  [KIND_HOMOGLIF_CIRILICA]: 'Ćirilični homoglif u latiničnoj riječi',
  [KIND_DECIMALNI_SEPARATOR]: 'Nedosljedan decimalni separator',
  [KIND_VISESTRUKE_TOCKE]: 'Dvostruke točke',
  [KIND_RAZMAK_UZ_ZAGRADU]: 'Razmak uz zagradu',
};

const EXCERPT_RADIUS = 25;
const EXCERPT_MAX = 60;

/** Kratki isjecak okoline nalaza, do priblizno 60 znakova. */
function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  let ex = text.slice(start, end).trim();
  if (ex.length > EXCERPT_MAX) ex = ex.slice(0, EXCERPT_MAX).trimEnd();
  return ex;
}

/** Zamijeni URL segmente razmacima iste duljine, da indeksi ostalih nalaza ostanu tocni. */
function maskUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, (m) => ' '.repeat(m.length));
}

/**
 * Maska za brojevne provjere: uz URL-ove izuzima datume (2.7.2026.), viseclane oznake
 * odjeljaka (1.2.3) i tisucice s tockom (10.000), koji nisu decimalni zapisi.
 * Godine (2020) i nabrajanja s razmakom (1. 2. 3.) ionako ne odgovaraju uzorku
 * broj-separator-broj pa ih nije potrebno posebno maskirati.
 */
function maskForNumberChecks(text: string): string {
  const spaces = (m: string) => ' '.repeat(m.length);
  let out = maskUrls(text);
  out = out.replace(/\b\d+(?:\.\d+){2,}\b/g, spaces);
  out = out.replace(/\b\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}\b/g, spaces);
  out = out.replace(/\b\d{1,3}(?:\.\d{3})+\b(?!\d)/g, spaces);
  return out;
}

// Pomocna struktura za globalne provjere mijesanja dvaju stilova.
interface StyleHit {
  paragraphIndex: number;
  index: number;
  length: number;
  style: 'a' | 'b';
}

/** Prva pojava na kojoj su oba stila vidjena: tocka gdje se mijesanje ocituje. */
function firstMixPoint(hits: StyleHit[]): StyleHit | null {
  let seenA = false;
  let seenB = false;
  for (const h of hits) {
    if (h.style === 'a') {
      if (seenB) return h;
      seenA = true;
    } else {
      if (seenA) return h;
      seenB = true;
    }
  }
  return null;
}

// 1. Dva ili vise uzastopnih razmaka (ukljucen i nelomljivi razmak U+00A0). Preskace raspone
// odmah uz zagradu: checkRazmakUzZagradu vec prijavljuje tu istu prazninu (i precizniji je
// prijedlog, "ukloni razmak" umjesto "svedi na jedan"), pa bi inace ista greska dobila dva
// medjusobno neusaglasena prijedloga ispravka za gotovo isti raspon.
function checkDvostrukiRazmak(p: string, pi: number, out: TypoFinding[]): void {
  const re = /[ \u00A0]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (p[start - 1] === '(' || p[end] === ')') continue;
    out.push({
      paragraphIndex: pi,
      kind: KIND_DVOSTRUKI_RAZMAK,
      excerpt: excerptAt(p, m.index, m[0].length),
      suggestion: 'zamijeni višestruke razmake jednim razmakom',
    });
  }
}

// 2. Razmak prije , . ; : ! ? (ne prije crtica ni zagrada; trotocka s razmakom se tolerira).
function checkRazmakPrijeInterpunkcije(p: string, pi: number, out: TypoFinding[]): void {
  const re = /[ \u00A0]+(?:[,;:!?]|\.(?!\.))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    out.push({
      paragraphIndex: pi,
      kind: KIND_RAZMAK_PRIJE_INTERPUNKCIJE,
      excerpt: excerptAt(p, m.index, m[0].length),
      suggestion: 'ukloni razmak prije interpunkcijskog znaka',
    });
  }
}

// 3. Em (U+2014) ili en (U+2013) crtica; projektna preferenca je zarez, dvotocka ili zagrade.
function checkEmEnCrtica(p: string, pi: number, out: TypoFinding[]): void {
  const re = /[\u2013\u2014]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const naziv = m[0] === '\u2014' ? 'em crticu (U+2014)' : 'en crticu (U+2013)';
    out.push({
      paragraphIndex: pi,
      kind: KIND_EM_EN_CRTICA,
      excerpt: excerptAt(p, m.index, 1),
      suggestion: `zamijeni ${naziv} zarezom, dvotočkom ili zagradama`,
    });
  }
}

// 5. Cirilicna slova unutar inace latinicne rijeci (homoglifi, cest artefakt copy-pastea).
//    Cisto cirilicna rijec (npr. stvarni citat) se ne prijavljuje.
function checkHomoglifCirilica(p: string, pi: number, out: TypoFinding[]): void {
  const wordRe = /[A-Za-zÀ-ɏЀ-ӿ]+/g;
  const latin = /[A-Za-zÀ-ɏ]/;
  const cyr = /[Ѐ-ӿ]/;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(p)) !== null) {
    const word = m[0];
    if (latin.test(word) && cyr.test(word)) {
      const cyrChars = Array.from(new Set(word.match(/[Ѐ-ӿ]/g) || []));
      out.push({
        paragraphIndex: pi,
        kind: KIND_HOMOGLIF_CIRILICA,
        excerpt: excerptAt(p, m.index, word.length),
        suggestion: `zamijeni ćirilične znakove (${cyrChars.join(', ')}) latiničnim slovima, vjerojatan artefakt kopiranja`,
      });
    }
  }
}

// 7. Tocno dvije tocke: nisu trotocka (...) ni trotocka s tockom recenice (....).
//    URL segmenti su maskirani da putanje poput a..b ne stvaraju lazne nalaze.
function checkVisestrukeTocke(p: string, pi: number, out: TypoFinding[]): void {
  const masked = maskUrls(p);
  const re = /\.{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    if (m[0].length === 2) {
      out.push({
        paragraphIndex: pi,
        kind: KIND_VISESTRUKE_TOCKE,
        excerpt: excerptAt(p, m.index, m[0].length),
        suggestion: 'zamijeni dvostruku točku jednom točkom ili trotočkom',
      });
    }
  }
}

// 8. Razmak neposredno nakon otvorene ili prije zatvorene zagrade: "( tekst" ili "tekst )".
function checkRazmakUzZagradu(p: string, pi: number, out: TypoFinding[]): void {
  const re = /\([ \u00A0]+|[ \u00A0]+\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    out.push({
      paragraphIndex: pi,
      kind: KIND_RAZMAK_UZ_ZAGRADU,
      excerpt: excerptAt(p, m.index, m[0].length),
      suggestion: 'ukloni razmak neposredno uz zagradu',
    });
  }
}

// 4. Globalno: mijesanje ravnih (U+0022) i hrvatskih (U+201E, U+201C, U+201D) navodnika
//    u istom dokumentu. Prijava na prvom odlomku gdje se mijesanje ocituje.
function checkNavodnici(paragraphs: string[], out: TypoFinding[]): void {
  const hits: StyleHit[] = [];
  const re = /["„“”]/g;
  paragraphs.forEach((p, pi) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      hits.push({
        paragraphIndex: pi,
        index: m.index,
        length: 1,
        style: m[0] === '"' ? 'a' : 'b',
      });
    }
  });
  const mix = firstMixPoint(hits);
  if (mix) {
    out.push({
      paragraphIndex: mix.paragraphIndex,
      kind: KIND_NAVODNICI_NEDOSLJEDNI,
      excerpt: excerptAt(paragraphs[mix.paragraphIndex], mix.index, mix.length),
      suggestion:
        'ujednači navodnike u cijelom dokumentu, preporuka su hrvatski navodnici („ i “)',
    });
  }
}

// 6. Globalno: mijesanje decimalne tocke (3.14) i decimalnog zareza (3,14) kroz dokument.
//    Izuzeti su URL-ovi, datumi, oznake odjeljaka i tisucice s tockom (vidi maskForNumberChecks).
function checkDecimalniSeparator(paragraphs: string[], out: TypoFinding[]): void {
  const hits: StyleHit[] = [];
  const re = /\d+([.,])\d+/g;
  paragraphs.forEach((p, pi) => {
    const masked = maskForNumberChecks(p);
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      hits.push({
        paragraphIndex: pi,
        index: m.index,
        length: m[0].length,
        style: m[1] === '.' ? 'a' : 'b',
      });
    }
  });
  const mix = firstMixPoint(hits);
  if (mix) {
    out.push({
      paragraphIndex: mix.paragraphIndex,
      kind: KIND_DECIMALNI_SEPARATOR,
      excerpt: excerptAt(paragraphs[mix.paragraphIndex], mix.index, mix.length),
      suggestion:
        'ujednači decimalni separator u cijelom dokumentu, hrvatski standard je decimalni zarez (npr. 3,14)',
    });
  }
}

/** Pokrece sve provjere nad odlomcima; nalazi su sortirani po indeksu odlomka. */
export function typoLint(paragraphs: string[]): TypoFinding[] {
  const findings: TypoFinding[] = [];

  paragraphs.forEach((p, pi) => {
    checkDvostrukiRazmak(p, pi, findings);
    checkRazmakPrijeInterpunkcije(p, pi, findings);
    checkEmEnCrtica(p, pi, findings);
    checkHomoglifCirilica(p, pi, findings);
    checkVisestrukeTocke(p, pi, findings);
    checkRazmakUzZagradu(p, pi, findings);
  });

  checkNavodnici(paragraphs, findings);
  checkDecimalniSeparator(paragraphs, findings);

  // Stabilno sortiranje: globalni nalazi sjedaju na svoj odlomak, lokalni redoslijed ostaje.
  findings.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return findings;
}

/** Sazetak nalaza: ukupan broj i raspodjela po vrsti provjere. */
export function typoLintSummary(findings: TypoFinding[]): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  }
  return { total: findings.length, byKind };
}
