/**
 * Cista, DOM-free jezgra detekcije profila iz teksta dokumenta (BL-P0-05-8). Izvucena iz app.ts
 * (detectDocxContext) da bude jedinicno testabilna i da detekcija POKUSAVA sve institucije kataloga,
 * ne samo unizg. NE ulazi u analyzeDocx ni golden-entry (golden koristi fiksne profile), pa je bez
 * golden rizika: ovo je iskljucivo pred-popunjavanje UI izbornika, uvijek ispravljivo.
 */
import { normalize } from '../utils/helpers';

export interface DetectUnit {
  id: string;
  name: string;
  programs?: string[];
  institutionId?: string;
  institutionName?: string;
}

export interface DetectedContext {
  institutionId: string | null;
  institutionName: string | null;
  unitId: string;
  unitName: string;
  program: string | null;
  workType: string | null;
}

// Vrsta rada iz normaliziranog teksta (bez dijakritike, bez razmaka). Redoslijed je specificnost:
// doktorski/disertacija prije diplomskog, itd.
// SKLONIDBA, ne doslovan oblik. `normalize` mice razmake, pa je "diplomski rad" -> "diplomskirad",
// ali naslovnice gotovo uvijek pisu u genitivu: "u svrhu izrade diplomskog rada" -> "diplomskograda".
// Stari uzorak `diplomskirad` takav tekst NIJE hvatao. Izmjereno na stvarnom korpusu: od 198 radova
// bez profila vrsta rada je bila prepoznata na 14, a jedinica na 89.
const WORK_TYPE_RULES: [string, RegExp][] = [
  ['doctoral', /doktorsk|disertacij/],
  ['specialist', /specijalistick/],
  ['graduate', /diplomsk\w{0,3}rad/],
  ['final', /zavrsn\w{0,3}rad/],
  ['seminar', /seminarsk\w{0,3}rad/],
];

/**
 * SKLONIDBA NASLOVNICE. Naslovnica gotovo nikad ne pise naziv u nominativu: "na Fakultetu
 * politickih znanosti", "Filozofskog fakulteta u Rijeci", "studij Politologije". Doslovna
 * usporedba s katalogom takav tekst promasuje, a `normalize` uz to slijepi rijeci pa se padez ne
 * moze skinuti po rijeci. Zato ovdje zivi vlastita, RIJEC-PO-RIJEC normalizacija.
 *
 * Nije stemmer opce namjene i ne pokusava biti: pokriva imenicke i pridjevske nastavke koji se
 * pojavljuju u nazivima ustanova i studija, i nista vise.
 */
const CASE_ENDINGS = [
  'ovima', 'evima', 'ijama', 'ima', 'ama', 'oga', 'ome', 'omu', 'ega', 'emu',
  // `oj` je zenski pridjev u dativu i lokativu ("Muzickoj akademiji", "Zagrebackoj skoli").
  // Bez njega su cetiri jedinice bile neprepoznatljive u najcescoj recenici naslovnice
  // ("Rad obranjen NA Muzickoj akademiji"): muza, zsem, umas, mapu. Promaklo je jer je raniji
  // pokus lokativ tvorio samo muskim obrascem (`-om`), pa ta klasa nikad nije ni nastala.
  'oj', 'ih', 'im', 'og', 'om', 'em', 'um', 'ju', 'a', 'e', 'i', 'o', 'u',
];

/** Najkraci korijen koji jos nosi znacenje; ispod toga se razliciti nazivi pocinju spajati. */
const MIN_STEM = 4;

/** Rijeci teksta bez dijakritike i interpunkcije, ali S OCUVANIM granicama rijeci. */
export function detectWords(raw: string): string[] {
  return String(raw || '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Korijeni jedne rijeci: osnovni (bez padeznog nastavka) i, kad je primjenjiva, varijanta bez
 * glasovne promjene. Sibilarizacija je razlog: "Rijeka" u lokativu daje "Rijeci", pa se `k` mijenja
 * u `c` i puko skidanje nastavka ta dva oblika NE spaja. Isto vrijedi za g/z i h/s.
 */
function stemVariants(word: string): string[] {
  let stem = word;
  for (const end of CASE_ENDINGS) {
    if (word.length - end.length >= MIN_STEM && word.endsWith(end)) {
      stem = word.slice(0, word.length - end.length);
      break;
    }
  }
  const out = [stem];
  const last = stem.slice(-1);
  if (last === 'c') out.push(stem.slice(0, -1) + 'k');
  else if (last === 'z') out.push(stem.slice(0, -1) + 'g');
  else if (last === 's') out.push(stem.slice(0, -1) + 'h');
  return out;
}

/** Podudaraju li se dvije rijeci do padeza (dijele barem jedan korijen). */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const va = stemVariants(a);
  const vb = stemVariants(b);
  return va.some((x) => vb.includes(x));
}

/**
 * Pojavljuje li se naziv (niz rijeci) u tekstu kao SUSJEDAN niz, do padeza. Susjednost je namjerna:
 * bez nje bi "Filozofski fakultet u Rijeci" pogadjao svaki tekst koji negdje spominje "filozofski"
 * i negdje "fakultet".
 */
function phraseOccurs(textWords: string[], nameWords: string[]): boolean {
  if (!nameWords.length || nameWords.length > textWords.length) return false;
  for (let i = 0; i + nameWords.length <= textWords.length; i++) {
    let ok = true;
    for (let j = 0; j < nameWords.length; j++) {
      if (!wordsMatch(textWords[i + j], nameWords[j])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Heuristicki pogodi (institucija, fakultet, studij, vrsta rada) iz teksta dokumenta preko SVIH
 * jedinica kataloga. Longest-match po normaliziranom nazivu jedinice (guard duljine 6, cuva najduzi
 * pogodak) da kratki/genericki nazivi ne daju lazni pozitiv. Vraca null ako nista ne prepozna
 * (nikad ne baca, nikad ne blokira analizu).
 */
/**
 * Razina studija iz naziva ili teksta. "Preddiplomski" i "prijediplomski" su ISTA razina zapisana
 * dvama pravopisnim oblicima; bez toga bi naslovnica koja pise jedan oblik promasila katalog koji
 * nosi drugi.
 */
const LEVEL_BUCKETS: Array<[string, RegExp]> = [
  ['doktorski', /^doktorsk/],
  ['specijalisticki', /^specijalistick/],
  ['preddiplomski', /^(pred|prije)diplomsk/],
  ['diplomski', /^diplomsk/],
];

function levelOf(words: string[]): string | null {
  for (const w of words) {
    for (const [bucket, re] of LEVEL_BUCKETS) {
      if (re.test(w)) return bucket;
    }
  }
  return null;
}

/**
 * RAZLIKOVNI dio naziva studija: ono iza rijeci "studij". Katalog nosi pune sluzbene nazive
 * ("Prijediplomski studij Politologija"), a stari kod je preskakao SVAKI naziv koji sadrzi rijec
 * "studij". Izmjereno: to je 513 od 726 programa (71%), a za 82 od 134 jedinice preskocilo je
 * SVAKI program, pa te jedinice nikad nisu mogle dati pouzdanu detekciju.
 *
 * Naziv bez rijeci "studij" (npr. "Master of European Studies") ostaje cijel.
 */
const LEVEL_QUALIFIER = /^(sveucilisn|strucn|pred|prije|diplomsk|doktorsk|specijalistick|zdruzen|interdisciplinarn|integriran)/;

function programCore(name: string): string[] {
  const w = detectWords(name);
  const i = w.findIndex((x) => x === 'studij' || x === 'studija' || x === 'studiji');
  // Rezanje SAMO kad je ono ispred doista oznaka razine. Bez tog uvjeta "Odjel za hispanistiku i
  // iberske studije (diplomski rad, Zadar)" ostaje bez jezgre: rijec "studije" ondje je dio naziva
  // polja, a ne oznaka razine, pa bi jezgra postala "diplomski rad zadar" i pogadjala svaki odjel.
  if (i < 0) return w;
  const before = w.slice(0, i);
  if (before.length && !before.every((x) => LEVEL_QUALIFIER.test(x))) return w;
  return w.slice(i + 1);
}

export function detectContextFromText(units: DetectUnit[], rawText: string): DetectedContext | null {
  const n = normalize(rawText || '');
  if (!n) return null;
  const textWords = detectWords(rawText);
  let unit: DetectUnit | null = null;
  let best = 0;
  for (const u of units) {
    const key = normalize(u.name);
    if (key.length < 6 || key.length <= best) continue;
    // Prvo doslovno (brzo i nepromijenjeno ponasanje), pa tek onda do padeza.
    if (n.includes(key) || phraseOccurs(textWords, detectWords(u.name))) {
      unit = u;
      best = key.length;
    }
  }
  if (!unit) return null;
  let workType: string | null = null;
  for (const [wt, re] of WORK_TYPE_RULES) {
    if (re.test(n)) { workType = wt; break; }
  }
  // Studij se bira po RAZLIKOVNOM dijelu naziva, uz razinu kao razrjesitelja. Dva studija istog
  // imena razlikuje samo razina ("Prijediplomski studij Politologija" i "Diplomski studij
  // Politologija"), pa bez nje izbor ovisi o poretku u katalogu.
  const textLevel = levelOf(textWords);
  let program: string | null = null;
  let pbest = -1;
  const unitWords = detectWords(unit.name);
  for (const p of unit.programs || []) {
    if (/^Opći/.test(p)) continue; // krovni profil nije studij koji se moze prepoznati iz teksta
    const core = programCore(p);
    const key = core.join('');
    if (key.length < 5) continue;
    // Naziv cija je razlikovna jezgra samo IME FAKULTETA ("Diplomski studiji Akademije likovnih
    // umjetnosti") ne govori nista o studiju: pogodio bi svaku naslovnicu te ustanove i pobijedio
    // konkretan studij. Izmjereno: takvi nazivi davali su 85 krivih pogodaka na 668 programa.
    if (phraseOccurs(unitWords, core)) continue;
    if (!phraseOccurs(textWords, core)) continue;
    const pw = detectWords(p);
    const levelMatch = textLevel && levelOf(pw) === textLevel ? 1 : 0;
    // "Strucni" i "Sveucilisni" studij istog imena razlikuje SAMO ta rijec, pa je ona dio odluke.
    const kindWord = pw.find((x) => /^(strucn|sveucilisn)/.test(x));
    const kindMatch = kindWord && textWords.some((x) => wordsMatch(x, kindWord)) ? 1 : 0;
    const score = levelMatch * 1000 + kindMatch * 500 + key.length;
    if (score > pbest) {
      program = p;
      pbest = score;
    }
  }
  return {
    institutionId: unit.institutionId ?? null,
    institutionName: unit.institutionName ?? null,
    unitId: unit.id,
    unitName: unit.name,
    program,
    workType,
  };
}

/**
 * Treba li potvrda profila prije analize: verificiran (scored, fakultetski specifican) profil koji
 * korisnik nije svjesno potvrdio (nije mijenjao izbornike, nema spremljenih preferenci, nije bilo
 * detekcije iz dokumenta). Sprjecava da netaknuti default (npr. FPZG) tiho zabodova tudji rad.
 */
export function needsProfileConfirmation(statusKey: string, confirmed: boolean): boolean {
  return statusKey === 'verified' && !confirmed;
}

/**
 * Je li automatska detekcija dovoljno pouzdana da se profil smatra korisnicki potvrdjenim BEZ
 * eksplicitne radnje. Samo kad je studij (program) stvarno prepoznat iz teksta dokumenta: kad
 * detekcija pogodi ustanovu/fakultet ali ne i program, izbornik studija ostaje na proizvoljnom
 * (alfabetski prvom) fallbacku iz populatePrograms, pa taj slucaj NE smije tiho ugasiti
 * needsProfileConfirmation gate za verificirane profile (AUDIT_MASTER.md, poglavlje 7).
 */
export function isConfidentDetection(ctx: DetectedContext | null): boolean {
  return !!ctx?.program;
}
