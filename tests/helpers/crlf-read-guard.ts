/**
 * Straza T92: test koji cita tekstualnu datoteku iz repozitorija i nad njom trazi `\n`, a CR ne
 * normalizira, prolazi na Linux CI-ju i pada na Windows checkoutu (CRLF). Ista klasa greske dosla je
 * tri puta; zadnja je `tests/agent-control-plane-schema-contract.test.ts` iz #243 (regex `\nas \$\$\n`
 * nad schema.sql), popravljena u #245.
 *
 * Gard radi nad izvorom bez komentara (`stripComments`), pa oznaka u komentaru nista ne oslobadja.
 * Za (a) i (c) prazni se i tekst stringova; izrazi `${...}` u template literalima ostaju kod.
 *
 * (a) citanje teksta: poziv `readFile(...)` ili `readFileSync(...)` cije argumente (do kraja naredbe)
 *     prati kodiranje `utf8`/`utf-8`. Binarno citanje (Buffer) se ne broji: bajtovi se usporeduju
 *     sirovi. Ne broji se citanje omotano u `JSON.parse(` (JSON podnosi `\r`) ni citanje cija putanja
 *     ima privremenu mapu kao identifikator ili komponentu (`tmp`, `temp`, `tmpDir`, `tmpdir()`,
 *     `mkdtemp`), jer tu datoteku test pise sam; `src/templates` nije privremena mapa.
 * (b) trazenje `\n` koje CRLF ne pogodi. U regex literalu: `\n` ispred kojeg stoji nesto sto ne moze
 *     progutati `\r`. Sigurni prefiksi su pocetak uzorka ili grupe, `|`, `^`, `\r?`, klasa s `\r`,
 *     ponovljeni `.`, `\s`, `[\s\S]` ili `[^\n]`, te neobavezni `\n?`. Iznimka je `split(/.../)`: tamo
 *     je svaki `\n` bez `\r?` osjetljiv, jer svakom retku ostavi `\r`. U string literalu predanom metodi
 *     `includes`, `indexOf`, `lastIndexOf`, `startsWith`, `endsWith`, `toContain` ili `toMatch`: `\n`
 *     koji nije na pocetku niza (`indexOf('\nfunction')` pogodi i `\r\n`); u `split`: svaki `\n`.
 * (c) normalizacija vezana uz vrijednost koja se pretrazuje: oznaka u istoj naredbi kao citanje
 *     (`readFileSync(...).replace(/\r\n/g, '\n')`), u desnoj strani dodjele iz koje nastaje
 *     pretrazivana kopija (`const lf = x.replace(...)` pa trazenje nad `lf`), ili u lancu izmedju
 *     imena i trazenja (`x.replace(/\r\n/g, '\n').split('\n')`). Kasniji `x.replace(...)` ne mijenja
 *     `x` i ne oslobadja trazenje nad `x` (R1a na #252). Oznake su `.replace(/\r\n?/g`,
 *     `.replace(/\r\n/g`, `.replace(/\r/g`, `.replaceAll('\r\n'`, `.replaceAll('\r', '')`,
 *     `.split('\r\n').join(`, `.split(/\r?\n/)` i omotac `normalizeLf(`. `readTextLf(...)` nije
 *     citanje u smislu (a), jer sam normalizira.
 *
 * Nalaz je datoteka s barem jednim citanjem (a) bez (c) nad kojim se trazi (b): u istoj naredbi, ili
 * nad imenom na koje je citanje vezano (dodjela, strelica, funkcija koja citanje vraca) i njegovim
 * nenormaliziranim aliasima, unutar dosega bloka.
 *
 * Svjesne granice, svaka zabiljezena testom u `tests/crlf-read-guard.test.ts` ("poznata granica"):
 * - destrukturiranje (`const { s } = { s: readFileSync(...) }`) ne stvara vezanje (R1b na #252);
 * - dodjela u `beforeAll` vrijedi samo do kraja tog bloka, pa se trazenje u `it` ne poveze (R1c);
 * - granica izmedju datoteka: helper koji cita, a test koji trazi, ne vide jedan drugog (R1d);
 *   ugovor `readTextLf` stiti njegov vlastiti test;
 * - niz spremljen u lokalnu konstantu pa predan `includes(needle)` se ne vidi (R3);
 * - `$` uz zastavicu `m` se ne trazi; skeniraju se `*.test.ts` i `tests/helpers/**`, ne Playwright
 *   `*.spec.ts` (R7).
 * Lazni nalazi idu u allowlistu s nepraznim obrazlozenjem, a svaki novi nalaz pada.
 *
 * Detektori su regex literali, ne nizovi slozeni u RegExp, iz istog razloga kao i ostale straze u
 * `tests/helpers/`: escape kroz slaganje zna nestati i gard tada ne grize nista.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface ScannedSource {
  /** Putanja relativna na korijen repozitorija, s `/`. */
  path: string;
  source: string;
}

/** Jedno tekstno citanje: polozaj poziva u izvoru bez komentara i tekst prvog argumenta. */
export interface TextRead {
  index: number;
  pathArg: string;
}

/** Poziv citanja s kodiranjem utf8 do kraja naredbe; grupa 1 su argumenti. */
const CITANJE_TEKSTA = /\breadFile(?:Sync)?\s*\(([^;]*?['"]utf-?8['"])/g;
/** Privremena mapa kao identifikator ili komponenta putanje, ne podniz (`templates` nije `temp`). */
const PRIVREMENA_PUTANJA = /(?<![\w])(?:tmp|temp)(?:dir|root|path)?(?![\w])|\btmpdir\s*\(|\bmkdtemp(?:Sync)?\b/i;
/** Citanje omotano u `JSON.parse(`. */
const JSON_OMOTAC = /JSON\.parse\(\s*$/;

/** Regex literal u izvoru (priblizno: izmedju `/` koje ne prethodi identifikator ni zagrada). */
const REGEX_LITERAL = /(?<![\w)\]$])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/[dgimsuyv]*/g;
/** Regex literal je argument `split(`. */
const SPLIT_PRIJE = /\.split\(\s*$/;

/** Zamjena za dio uzorka koji smije progutati `\r` ispred `\n`. */
const GUTA_CR = '\u0001';
/** `\r?\n`, `\r*\n`, `\r+\n`, `\r\n`: svjesno CR-a. */
const CR_PA_LF = /\\r[?*+]?\\n/g;
/** Negirana klasa koja iskljucuje `\r`, npr. `[^\r\n]`: ne guta CR, a njen `\r\n` nije `\r?\n`. */
const NEGIRANA_KLASA_S_CR = /\[\^(?:\\.|[^\]\\])*\\r(?:\\.|[^\]\\])*\]/g;
/** Neutralna zamjena za klasu koja ne guta CR. */
const NE_GUTA_CR = '\u0002';
/** Pozitivna klasa koja sadrzi `\r`, npr. `[\r\n]+`. */
const POZITIVNA_KLASA_S_CR = /\[(?!\^)(?:\\.|[^\]\\])*\\r(?:\\.|[^\]\\])*\][*+?]?\??/g;
/**
 * Ponovljeni dio koji pogadja i `\r`: `.`, `\s`, `\S`, `\W`, `\D`, klasa s `\s`/`\S` (npr. `[\s\S]`)
 * i negirana klasa koja ne iskljucuje `\r` (npr. `[^\n]`). Ispred `\n` takav dio pojede `\r`.
 */
const GUTAC_CR =
  /(?:\.|\\[sSWD]|\[\^(?:(?!\\r)(?:\\.|[^\]\\]))*\]|\[(?!\^)(?:\\.|[^\]\\])*\\[sS](?:\\.|[^\]\\])*\])(?:[*+]|\{\d+,\d*\})\??/g;
/** `\n?` ili `\n*`: neobavezan, pa nepogodak ne obara uzorak. */
const NEOBAVEZNI_LF = /\\n(?:[?*]|\{0,\d*\})\??/g;
/** `\n` u preostalom uzorku. */
const LF = /\\n/g;
/**
 * Prefiks iza kojeg `\n` smije stajati: pocetak, `(`, `(?:`, `(?=`, `(?!`, `|`, `^`, gutac CR-a ili
 * grupa koja zavrsava gutacem (`([\s\S]*?)\n`).
 */
const SIGURAN_PREFIKS = /(?:^|[\u0001(|^]|\u0001\)|\(\?<?[:=!])$/;

/** Metoda koja trazi po sadrzaju; `split` je uvijek osjetljiv jer svakom retku ostavi `\r`. */
const TRAZENJE_STRINGOM =
  /\.(split|includes|indexOf|lastIndexOf|startsWith|endsWith|toContain|toMatch)\(\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g;

/** Oznake normalizacije koje se pozivaju kao metoda nad procitanim tekstom. */
const NORMALIZACIJA_METODOM: readonly RegExp[] = [
  /\.replace\(\s*\/\\r\\n\??\/g/g,
  /\.replace\(\s*\/\\r\/g/g,
  /\.replaceAll\(\s*(['"`])\\r\\n\1/g,
  /\.replaceAll\(\s*(['"`])\\r\1\s*,\s*(['"`])\2/g,
  /\.split\(\s*(['"`])\\r\\n\1\s*\)\s*\.join\(/g,
  /\.split\(\s*\/\\r\?\\n\//g,
];
/**
 * Korijen prijamnika metode: ime, opcionalno s pozivom `ime(...)`, pa lanac `.metoda(...)` do kraja
 * (`SRC.slice(0, i).split` daje `SRC`). Zagrade do tri razine.
 */
const PRIJAMNIK =
  /(\w+)\s*(?:\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*)?(?:\??\.\s*\w+\s*(?:\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*)?(?:\[[^\]]*\]\s*)?)*$/;
/** Citanje dodijeljeno imenu: `const x = `, `const read = (p): string => `, `x = `. */
const DODJELA =
  /(?:\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=|(?<![=!<>])\b(\w+)\s*=)\s*(?:(?:async\s*)?\([^()]*\)\s*(?::\s*[\w<>[\]|]+\s*)?=>\s*)?(?:`\$\{\s*)?(?:await\s+)?$/;
/** Citanje vraceno iz funkcije: `return readFileSync(...)`. */
const POVRAT = /\breturn\s+(?:await\s+)?$/;
/** Deklaracija funkcije ili strelice s tijelom; ime je u grupi 1 ili 2. */
const FUNKCIJA = /\bfunction\s+(\w+)\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^()]*\)[^=;{]*=>\s*\{/g;
/** Znak ili rijec iza kojih `/` otvara regex, ne dijeljenje. */
const REGEX_MOZE_POCETI = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|of|in|void|yield|await))\s*$/;

/** Sadrzaj stringa koji (a) i (c) trebaju vidjeti: kodiranje i escape prijeloma. */
const ZADRZANI_STRING = /^(?:utf-?8|(?:\\r)?(?:\\n)?)$/i;

/**
 * Izvor bez komentara, iste duljine (komentar postaje razmaci, prijelomi ostaju), da indeksi i retci
 * ostanu usporedivi. Stringovi, template literali i regex literali se preskacu, pa `//` u URL-u ili
 * `/*` u regexu ne otvara komentar.
 */
export function stripComments(src: string): string {
  return scrub(src, false, false);
}

/**
 * Kao `stripComments`, ali i sadrzaj stringova postaje razmaci (osim kodiranja i `\r`/`\n` escapea).
 * Na tome rade (a) i (c), da `"readFileSync(x, 'utf8')"` ili `'readTextLf('` u stringu ne budu ni
 * citanje ni normalizacija.
 */
export function blankStrings(src: string): string {
  return scrub(src, true, false);
}

/** Samo struktura: bez komentara, stringova i regex literala, da `{` u `/\{/` ne pomakne doseg. */
function structureOnly(src: string): string {
  return scrub(src, true, true);
}

function scrub(src: string, prazniStringove: boolean, prazniRegexe: boolean): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '`') {
      // Template: staticni dijelovi su string, a `${...}` je kod i obraduje se rekurzivno (R1e na #252).
      let j = i + 1;
      let staticni = '';
      out += '`';
      const ispisiStaticni = (): void => {
        out += prazniStringove && !ZADRZANI_STRING.test(staticni) ? staticni.replace(/[^\n]/g, ' ') : staticni;
        staticni = '';
      };
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { staticni += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          ispisiStaticni();
          const kraj = interpolationEnd(src, j + 2);
          out += '${' + scrub(src.slice(j + 2, kraj), prazniStringove, prazniRegexe) + src.slice(kraj, kraj + 1);
          j = kraj + 1;
          continue;
        }
        staticni += src[j];
        j++;
      }
      ispisiStaticni();
      out += src.slice(j, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const sadrzaj = src.slice(i + 1, j);
      out += prazniStringove && !ZADRZANI_STRING.test(sadrzaj)
        ? c + sadrzaj.replace(/[^\n]/g, ' ') + src.slice(j, j + 1)
        : src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '/' && REGEX_MOZE_POCETI.test(out.slice(-24))) {
      let j = i + 1;
      let klasa = false;
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') klasa = true;
        else if (ch === ']') klasa = false;
        else if (ch === '/' && !klasa) break;
        j++;
      }
      out += prazniRegexe ? '/' + ' '.repeat(Math.max(0, j - i - 1)) + src.slice(j, j + 1) : src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Polozaj `}` koja zatvara interpolaciju `${` otvorenu ispred `from`; stringovi unutra se preskacu. */
function interpolationEnd(src: string, from: number): number {
  let dubina = 0;
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      for (j++; j < src.length && src[j] !== c; j++) if (src[j] === '\\') j++;
    } else if (c === '{') {
      dubina++;
    } else if (c === '}') {
      if (dubina === 0) return j;
      dubina--;
    }
  }
  return src.length;
}

/** Tijelo regexa trazi `\n` koji CRLF sadrzaj ne pogodi (ispred `\n` stoji nesto sto nije `\r`). */
export function regexSeeksBareLf(body: string): boolean {
  const t = body
    .replace(NEGIRANA_KLASA_S_CR, NE_GUTA_CR)
    .replace(POZITIVNA_KLASA_S_CR, GUTA_CR)
    .replace(CR_PA_LF, GUTA_CR)
    .replace(GUTAC_CR, GUTA_CR)
    .replace(NEOBAVEZNI_LF, GUTA_CR);
  for (const m of t.matchAll(LF)) {
    if (!SIGURAN_PREFIKS.test(t.slice(0, m.index))) return true;
  }
  return false;
}

/** Regex predan `split`: svaki `\n` bez `\r?` ostavi `\r` na kraju retka. */
export function splitRegexSeeksBareLf(body: string): boolean {
  return body.replace(POZITIVNA_KLASA_S_CR, GUTA_CR).replace(CR_PA_LF, GUTA_CR).includes('\\n');
}

/** String trazen metodom `method` pada nad CRLF sadrzajem. */
export function stringSeeksBareLf(method: string, literal: string): boolean {
  if (method === 'split') return literal.replace(/\\r\\n/g, '').includes('\\n');
  return literal.slice(literal.startsWith('\\n') ? 2 : 0).includes('\\n');
}

interface Pogled {
  prazan: string;
  struktura: string;
}
/** Jednoclana memorija: `readNormalized` se zove po citanju, a pogledi su po datoteci. */
let zadnji: (Pogled & { code: string }) | undefined;
function pogled(code: string): Pogled {
  if (zadnji?.code !== code) {
    zadnji = { code, prazan: blankStrings(code), struktura: structureOnly(code) };
  }
  return zadnji;
}

/** Sadrzi li izraz oznaku normalizacije (c). `search` krece od pocetka, pa zastavica `g` ne smeta. */
function hasNormalization(izraz: string): boolean {
  return NORMALIZACIJA_METODOM.some((re) => izraz.search(re) >= 0) || /\bnormalizeLf\s*\(/.test(izraz);
}

/** Kraj bloka koji sadrzi polozaj `from`: prva `}` koja zatvara vise nego sto se otvorilo. */
function scopeEnd(struktura: string, from: number): number {
  let dubina = 0;
  for (let i = from; i < struktura.length; i++) {
    const c = struktura[i];
    if (c === '{') dubina++;
    else if (c === '}' && --dubina < 0) return i;
  }
  return struktura.length;
}

/** (a) Tekstna citanja iz repozitorija u izvoru bez komentara; stringovi se ne citaju kao kod. */
export function textReads(code: string): TextRead[] {
  const out: TextRead[] = [];
  for (const m of pogled(code).prazan.matchAll(CITANJE_TEKSTA)) {
    const index = m.index ?? 0;
    const pathArg = code.slice(index, index + m[0].length).split(',')[0];
    if (PRIVREMENA_PUTANJA.test(pathArg)) continue;
    if (JSON_OMOTAC.test(code.slice(Math.max(0, index - 24), index))) continue;
    out.push({ index, pathArg });
  }
  return out;
}

/**
 * Jedno osjetljivo trazenje (b): polozaj, ime nad kojim se trazi (ako se da procitati) i je li lanac
 * izmedju imena i trazenja vec normaliziran (`sql.replace(/\r\n/g, '\n').split('\n')`).
 */
export interface BareLfSearch {
  index: number;
  subject: string | undefined;
  normalizedChain: boolean;
}

/** `expect(x)` ili `expect(x).not` neposredno ispred metode; grupa 1 je `x`. */
const EXPECT_PREDMET = /\bexpect\(\s*(\w+)[^()]*(?:\([^()]*\))?[^()]*\)\s*(?:\.\s*not\s*)?$/;
/** Regex predan metodi teksta: `x.match(`, `x.split(`, `x.replace(` i slicno. */
const METODA_S_REGEXOM = /\.\s*(?:match|matchAll|search|replace|replaceAll|split)\(\s*$/;
/** Regex nad kojim se zove `.exec(x)` ili `.test(x)`; grupa 1 je `x`. */
const EXEC_PREDMET = /^\s*\.\s*(?:exec|test)\(\s*(\w+)/;
/** Metoda `expect`a koja prima regex: `.toMatch(`. */
const TOMATCH_PRIJE = /\.\s*toMatch\(\s*$/;

/** Ime nad kojim se zove metoda koja zavrsava tocno ispred `end`, i je li lanac do nje normaliziran. */
function subjectBefore(code: string, end: number): { subject: string | undefined; normalizedChain: boolean } {
  const prije = code.slice(Math.max(0, end - 200), end);
  const m = EXPECT_PREDMET.exec(prije) ?? PRIJAMNIK.exec(prije);
  return { subject: m?.[1], normalizedChain: m !== null && hasNormalization(m[0]) };
}

/** (b) Sva trazenja `\n` koja CRLF sadrzaj ne pogodi, s imenom nad kojim se trazi. */
export function bareLfSearches(code: string): BareLfSearch[] {
  const out: BareLfSearch[] = [];
  for (const m of code.matchAll(REGEX_LITERAL)) {
    const index = m.index ?? 0;
    const prije = code.slice(Math.max(0, index - 200), index);
    if (!(SPLIT_PRIJE.test(prije) ? splitRegexSeeksBareLf(m[1]) : regexSeeksBareLf(m[1]))) continue;
    const metoda = METODA_S_REGEXOM.exec(prije);
    const exec = EXEC_PREDMET.exec(code.slice(index + m[0].length, index + m[0].length + 80));
    const toMatch = TOMATCH_PRIJE.exec(prije);
    let predmet: { subject: string | undefined; normalizedChain: boolean } = { subject: undefined, normalizedChain: false };
    if (metoda) predmet = subjectBefore(prije, metoda.index);
    else if (toMatch) predmet = subjectBefore(prije, toMatch.index);
    else if (exec) predmet = { subject: exec[1], normalizedChain: false };
    out.push({ index, ...predmet });
  }
  for (const m of code.matchAll(TRAZENJE_STRINGOM)) {
    if (stringSeeksBareLf(m[1], m[3])) out.push({ index: m.index ?? 0, ...subjectBefore(code, m.index ?? 0) });
  }
  return out;
}

/** (b) na razini datoteke: postoji li ikoje osjetljivo trazenje. */
export function seeksBareLf(code: string): boolean {
  return bareLfSearches(code).length > 0;
}

/** Kraj naredbe koja sadrzi polozaj `from`: prvi `;` iza njega (priblizno). */
function statementEnd(code: string, from: number): number {
  const end = code.indexOf(';', from);
  return end < 0 ? code.length : end;
}

/**
 * Ime na koje je citanje vezano: `const x = readFileSync(...)`, strelica `const read = (p) =>
 * readFileSync(...)`, ili funkcija koja citanje vraca (`return readFileSync(...)`).
 */
export function readName(code: string, read: TextRead): string | undefined {
  return readBinding(code, read)?.name;
}

/** Vezanje imena: ime i polozaj deklaracije, od kojeg vrijedi do kraja svog bloka. */
interface Binding {
  name: string;
  from: number;
  to: number;
}

function readBinding(code: string, read: TextRead): Binding | undefined {
  const { prazan, struktura } = pogled(code);
  const pocetak = Math.max(0, read.index - 200);
  const prije = prazan.slice(pocetak, read.index);
  const dodjela = DODJELA.exec(prije);
  const ime = dodjela?.[1] ?? dodjela?.[2];
  if (ime) {
    const at = pocetak + (dodjela?.index ?? 0);
    return { name: ime, from: at, to: scopeEnd(struktura, at) };
  }
  if (!POVRAT.test(prije)) return undefined;
  let funkcija: RegExpMatchArray | undefined;
  for (const m of prazan.slice(0, read.index).matchAll(FUNKCIJA)) funkcija = m;
  const name = funkcija?.[1] ?? funkcija?.[2];
  if (!name || funkcija?.index === undefined) return undefined;
  return { name, from: funkcija.index, to: scopeEnd(struktura, funkcija.index) };
}

/**
 * (c) Je li ovo citanje normalizirano: oznaka je u istoj naredbi kao citanje
 * (`readFileSync(...).replace(/\r\n/g, '\n')`, `normalizeLf(readFileSync(...))`). Kasniji
 * `x.replace(...)` ne mijenja `x`, pa ne oslobadja citanje (R1a na #252); kopija `const lf =
 * x.replace(...)` je zasebno, normalizirano vezanje i ne prati se dalje.
 */
export function readNormalized(code: string, read: TextRead): boolean {
  const { prazan } = pogled(code);
  return hasNormalization(prazan.slice(read.index, statementEnd(prazan, read.index)));
}

/** Dodjela imenu; grupa 1 je ime, grupa 2 desna strana do kraja naredbe. */
const DODJELA_S_DESNOM = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=([^;]*)/g;
/** Identifikator na desnoj strani dodjele. */
const IDENTIFIKATOR = /\b[A-Za-z_$][\w$]*\b/g;

/**
 * Nenormalizirano vezanje i sva nenormalizirana vezanja izvedena iz njega (`const rest =
 * CI.slice(...)`, `const src = X.map((r) => sourceOf(r))`): izvedeno je ako desna strana spominje
 * vezano ime unutar njegovog dosega i sama ne normalizira.
 */
function withAliases(code: string, korijen: Binding): Binding[] {
  const { prazan, struktura } = pogled(code);
  const vezanja = [korijen];
  const dodjele = [...prazan.matchAll(DODJELA_S_DESNOM)]
    .filter((m) => !hasNormalization(m[2]))
    .map((m) => ({
      name: m[1],
      at: m.index ?? 0,
      spominje: new Set(m[2].match(IDENTIFIKATOR) ?? []),
    }));
  for (let promjena = true; promjena;) {
    promjena = false;
    for (const d of dodjele) {
      if (vezanja.some((v) => v.name === d.name && v.from === d.at)) continue;
      if (vezanja.some((v) => d.spominje.has(v.name) && d.at >= v.from && d.at <= v.to)) {
        vezanja.push({ name: d.name, from: d.at, to: scopeEnd(struktura, d.at) });
        promjena = true;
      }
    }
  }
  return vezanja;
}

/**
 * Trazi li se nad ovim citanjem `\n` koji CRLF ne pogodi: u istoj naredbi, ili nad vezanim imenom
 * (i aliasom) unutar njegovog dosega. Ista imena u drugim blokovima se ne mijesaju.
 */
export function readSearchedForBareLf(code: string, read: TextRead, searches: readonly BareLfSearch[]): boolean {
  const kraj = statementEnd(code, read.index);
  if (searches.some((s) => s.index >= read.index && s.index <= kraj)) return true;
  const vezanje = readBinding(code, read);
  if (vezanje === undefined) return false;
  const vezanja = withAliases(code, vezanje);
  return searches.some((s) => !s.normalizedChain && s.subject !== undefined &&
    vezanja.some((v) => v.name === s.subject && s.index >= v.from && s.index <= v.to));
}

export interface CrlfDetectors {
  textReads: (code: string) => TextRead[];
  bareLfSearches: (code: string) => BareLfSearch[];
  readNormalized: (code: string, read: TextRead) => boolean;
}

export const CRLF_DETECTORS: CrlfDetectors = { textReads, bareLfSearches, readNormalized };

/** Putanje datoteka s barem jednim citanjem (a) bez normalizacije (c) nad kojim se trazi (b), sortirane. */
export function crlfReadProblems(files: readonly ScannedSource[], detectors: CrlfDetectors = CRLF_DETECTORS): string[] {
  return files
    .filter((f) => {
      const code = stripComments(f.source);
      const searches = detectors.bareLfSearches(code);
      if (searches.length === 0) return false;
      return detectors.textReads(code).some((r) => !detectors.readNormalized(code, r) && readSearchedForBareLf(code, r, searches));
    })
    .map((f) => f.path)
    .sort();
}

/**
 * Zateceni nalazi na 6a8be012 (T92, 2026-10-03), s obrazlozenjem po datoteci. Novi nalaz pada, unos
 * bez obrazlozenja pada, a unos koji vise nije nalaz takodjer pada, da se allowlista ne pretvori u
 * trajnu rupu.
 */
export const CRLF_READ_ALLOWLIST: Readonly<Record<string, string>> = {
  'tests/agent-workflow-cli.test.ts':
    'split po \\n ide nad usage.jsonl koji pise sam CLI u privremenom stablu; JSON.parse ionako podnosi \\r',
  'tests/agent-workflow.test.ts': 'split po \\n samo broji retke AGENTS.md (najvise 120); broj je isti uz CRLF',
  'tests/check-fixer-map.test.ts': 'split po \\n samo broji retke do pogotka; broj je isti uz CRLF',
  'tests/deploy-runtime-parity.test.ts':
    'STVARAN latentan kvar: /\\n {2}[a-z][\\w-]*:\\n/ uz CRLF ne nade sljedeci job, pa blok dist-gate seze do kraja ' +
    'check.yml; tvrdnje i dalje prolaze ali gledaju siri blok. Popravak je zaseban zadatak',
  'tests/release-env-documented.test.ts':
    'split po \\n pa po retku regexi bez sidra na kraj retka (required:\\s*true, requiresEnv); \\r na kraju ne smeta',
  'tests/repair-local-client-inert.test.ts':
    'split po \\n pa join po \\n vraca isti izvor; \\r ostaje na svom retku, a ubaceni redak je sinteticki',
};

/**
 * Presuda nad nalazima: novi nalaz izvan allowliste, unos bez obrazlozenja i unos allowliste koji vise
 * nije nalaz. Prazno znaci zeleno.
 */
export function crlfGuardVerdict(
  problems: readonly string[],
  allowlist: Readonly<Record<string, string>> = CRLF_READ_ALLOWLIST,
): string[] {
  const nalazi = new Set(problems);
  return [
    ...problems.filter((p) => !(p in allowlist)).map((p) => `novi nalaz bez normalizacije CR: ${p}`),
    ...Object.entries(allowlist).filter(([, razlog]) => razlog.trim() === '').map(([p]) => `unos allowliste bez obrazlozenja: ${p}`),
    ...Object.keys(allowlist).filter((p) => !nalazi.has(p)).map((p) => `unos allowliste vise nije nalaz, ukloni ga: ${p}`),
  ];
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__snapshots__') walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/**
 * Datoteke koje gard skenira ispod `root`: `tests/**\/*.test.ts` i sve `.ts` pod `tests/helpers/`.
 * Izvor se cita s normaliziranim CR-om, jer je i sam skener test nad datotekama iz repozitorija.
 */
export function collectScannedSources(root: string): ScannedSource[] {
  const svi: string[] = [];
  walk(join(root, 'tests'), svi);
  const helpers = join(root, 'tests', 'helpers') + sep;
  return svi
    .filter((full) => full.endsWith('.test.ts') || (full.startsWith(helpers) && full.endsWith('.ts')))
    .map((full) => ({
      path: relative(root, full).split(sep).join('/'),
      source: readFileSync(full, 'utf8').replace(/\r\n?/g, '\n'),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
