/**
 * Straza T92: test koji cita tekstualnu datoteku iz repozitorija i nad njom trazi `\n`, a CR ne
 * normalizira, prolazi na Linux CI-ju i pada na Windows checkoutu (CRLF). Ista klasa greske dosla je
 * tri puta; zadnja je `tests/agent-control-plane-schema-contract.test.ts` iz #243 (regex `\nas \$\$\n`
 * nad schema.sql), popravljena u #245.
 *
 * Heuristika je NAMJERNO gruba i radi na razini datoteke, jer staticki ne prati tok podataka:
 *
 * (a) citanje teksta: poziv `readFile(...)` ili `readFileSync(...)` cije argumente (do kraja naredbe)
 *     prati kodiranje `utf8`/`utf-8`. Binarno citanje (Buffer) se ne broji: bajtovi se usporeduju
 *     sirovi. Citanje cija putanja spominje `tmp`/`temp` se ne broji, jer je to datoteka koju je test
 *     sam napisao s poznatim zavrsecima redaka.
 * (b) trazenje `\n` koje CRLF ne pogodi: u regex literalu `\n` ispred kojeg stoji nesto sto ne moze
 *     progutati `\r` (siguran je pocetak uzorka ili grupe, `|`, `^`, `\r?`, klasa s `\r`, ponovljeni
 *     `.`, `\s`, `[\s\S]` ili `[^\n]`, te neobavezni `\n?`); u string literalu predanom metodi
 *     `includes`, `indexOf`, `lastIndexOf`, `startsWith`, `endsWith`, `toContain` ili `toMatch` `\n`
 *     koji nije na pocetku niza (`indexOf('\nfunction')` pogodi i `\r\n`); svaki `split` po `\n`,
 *     jer svakom retku ostavi `\r`.
 * (c) normalizacija: bilo gdje u datoteci `readTextLf(`, `normalizeLf(`, `.replace(/\r\n?/g`,
 *     `.replace(/\r\n/g`, `.replace(/\r/g`, `.replaceAll('\r\n'`, `.split('\r\n').join(` ili
 *     `split(/\r?\n/)`.
 *
 * Nalaz je datoteka s (a) i (b) bez (c). Poznata ogranicenja: datoteka koja normalizira jedno citanje
 * a drugo ne, prolazi; `$` uz zastavicu `m` (CR ostaje ispred kraja retka) se ne trazi; (b) moze biti
 * nad sadrzajem koji nije procitan s diska. Lazni nalazi idu u allowlistu s obrazlozenjem, a svaki
 * novi nalaz pada.
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

/** Poziv citanja s kodiranjem utf8 do kraja naredbe; grupa 1 su argumenti. */
const CITANJE_TEKSTA = /\breadFile(?:Sync)?\s*\(([^;]*?['"]utf-?8['"])/g;
/** Putanja datoteke koju je test sam napisao u privremenu mapu. */
const PRIVREMENA_PUTANJA = /te?mp/i;

/** Regex literal u izvoru (priblizno: izmedju `/` koje ne prethodi identifikator ni zagrada). */
const REGEX_LITERAL = /(?<![\w)\]$])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/[dgimsuyv]*/g;

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

/** Oznake normalizacije CR-a (c). */
const NORMALIZACIJA: readonly RegExp[] = [
  /\breadTextLf\s*\(/,
  /\bnormalizeLf\s*\(/,
  /\.replace\(\s*\/\\r\\n\??\/g/,
  /\.replace\(\s*\/\\r\/g/,
  /\.replaceAll\(\s*(['"`])\\r\\n\1/,
  /\.split\(\s*(['"`])\\r\\n\1\s*\)\s*\.join\(/,
  /\bsplit\(\s*\/\\r\?\\n\//,
];

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

/** String trazen metodom `method` pada nad CRLF sadrzajem. */
export function stringSeeksBareLf(method: string, literal: string): boolean {
  if (method === 'split') return literal.replace(/\\r\\n/g, '').includes('\\n');
  return literal.slice(literal.startsWith('\\n') ? 2 : 0).includes('\\n');
}

/** (a) Datoteka cita tekst s diska iz putanje koja nije privremena. */
export function readsRepoText(source: string): boolean {
  for (const m of source.matchAll(CITANJE_TEKSTA)) {
    const putanja = m[1].split(',')[0];
    if (!PRIVREMENA_PUTANJA.test(putanja)) return true;
  }
  return false;
}

/** (b) Datoteka trazi `\n` na nacin koji CRLF sadrzaj ne pogodi. */
export function seeksBareLf(source: string): boolean {
  for (const m of source.matchAll(REGEX_LITERAL)) {
    if (regexSeeksBareLf(m[1])) return true;
  }
  for (const m of source.matchAll(TRAZENJE_STRINGOM)) {
    if (stringSeeksBareLf(m[1], m[3])) return true;
  }
  return false;
}

/** (c) Datoteka negdje normalizira CR. */
export function normalizesCr(source: string): boolean {
  return NORMALIZACIJA.some((re) => re.test(source));
}

export interface CrlfDetectors {
  readsRepoText: (source: string) => boolean;
  seeksBareLf: (source: string) => boolean;
  normalizesCr: (source: string) => boolean;
}

export const CRLF_DETECTORS: CrlfDetectors = { readsRepoText, seeksBareLf, normalizesCr };

/** Putanje datoteka s nalazom (a) i (b) bez (c), sortirane. */
export function crlfReadProblems(files: readonly ScannedSource[], detectors: CrlfDetectors = CRLF_DETECTORS): string[] {
  return files
    .filter((f) => detectors.readsRepoText(f.source) && detectors.seeksBareLf(f.source) && !detectors.normalizesCr(f.source))
    .map((f) => f.path)
    .sort();
}

/**
 * Zateceni nalazi na 88407f5f (T92, 2026-10-03), s obrazlozenjem po datoteci. Novi nalaz pada, a
 * unos koji vise nije nalaz takodjer pada, da se allowlista ne pretvori u trajnu rupu.
 */
export const CRLF_READ_ALLOWLIST: Readonly<Record<string, string>> = {
  'tests/agent-workflow-cli.test.ts':
    'split po \\n ide nad usage.jsonl koji pise sam CLI u privremenom stablu; JSON.parse ionako podnosi \\r',
  'tests/check-fixer-map.test.ts': 'split po \\n samo broji retke do pogotka; broj je isti uz CRLF',
  'tests/deploy-runtime-parity.test.ts':
    'STVARAN latentan kvar: /\\n {2}[a-z][\\w-]*:\\n/ uz CRLF ne nade sljedeci job, pa blok dist-gate seze do kraja ' +
    'check.yml; tvrdnje i dalje prolaze ali gledaju siri blok. Popravak je zaseban zadatak',
  'tests/npm-script-targets.test.ts': 'split po \\n ide nad izlazom `git ls-files`, ne nad datotekom; git ispisuje LF',
  'tests/release-env-documented.test.ts':
    'split po \\n pa po retku regexi bez sidra na kraj retka (required:\\s*true, requiresEnv); \\r na kraju ne smeta',
  'tests/repair-local-client-inert.test.ts':
    'split po \\n pa join po \\n vraca isti izvor; \\r ostaje na svom retku, a ubaceni redak je sinteticki',
  'tests/skill-feedback.test.ts': 'split po \\n samo za prvi redak koji se provjerava regexom s pocetka (^## ...); \\r na kraju ne smeta',
};

/**
 * Presuda nad nalazima: novi nalaz izvan allowliste i unos allowliste koji vise nije nalaz. Prazno
 * znaci zeleno.
 */
export function crlfGuardVerdict(
  problems: readonly string[],
  allowlist: Readonly<Record<string, string>> = CRLF_READ_ALLOWLIST,
): string[] {
  const nalazi = new Set(problems);
  return [
    ...problems.filter((p) => !(p in allowlist)).map((p) => `novi nalaz bez normalizacije CR: ${p}`),
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
