/**
 * Profil iz naslovnice STVARNOG rada pri ulazu u korpus (`scripts/corpus-ingest.mts`).
 *
 * IZDVOJENO IZ SKRIPTE 2026-09-05 da se moze testirati: skripta na vrhu modula poziva `await main()`, pa bi
 * je uvoz u test POKRENUO. Isti razlog zbog kojeg je `frontText` izdvojen 2026-08-24.
 *
 * Vraca `null` kad ustanova ili vrsta rada nisu prepoznati: pogadjanje bi dokumentu pripisalo tudja pravila,
 * pa bi mjerenje bilo besmisleno. Ovo NIJE detektor iz sucelja (`src/ui/profile-detect.ts`): ondje korisnik
 * potvrdjuje, ovdje nitko, pa je popis namjerno uzi i deterministicki.
 *
 * PRAVILA VRSTE RADA, redom (prvi pogodak vrijedi), izmjereno 2026-09-05 nad 195 radova iz Downloads:
 *
 *   1. doktorski / specijalisticki, kao i prije.
 *   2. "diplomski rad", "zavrsni rad", "seminarski rad" u NOMINATIVU, GENITIVU i LOKATIVU ("seminarskog rada",
 *      "o zavrsnom radu"), uz umetak do dvije rijeci ("zavrsni strucni rad"). Stara pravila su imala padeze
 *      samo za diplomski, pa je 14 seminara ("Naslov seminarskog rada") i 7 zavrsnih ostalo bez profila.
 *   3. "esej" -> `seminar`. Odluka 2026-09-05: esej je opci akademski rad kolegija, a profili koji nose
 *      `seminar` (npr. `fpzg-opci-akademski-rad`) su upravo profili opceg akademskog rada. 14 radova.
 *   4. Naslovnica spominje kolegij, predmet ili nositelja, a NIJEDNA fraza rada iz 1-2 se ne pojavljuje ->
 *      `seminar`. Rad kolegija bez rijeci "seminarski" na naslovnici. 13 radova.
 *
 *   NIKAD: gola rijec "diplomski" ili "preddiplomski" nije vrsta rada. Na 46 od 80 neprepoznatih naslovnica
 *   stoji "(pred)diplomski studij ..." kao IME PROGRAMA, a rad je seminar ili esej. Sirenje na golu rijec
 *   oznacilo bi ih kao diplomske radove i mjerilo po krivim pravilima. Gard: test s naslovnicom seminara
 *   koja imenuje diplomski studij.
 *
 * Nad 115 radova koje su stara pravila prepoznala nova pravila daju ISTU vrstu (izmjereno, 0 promjena).
 */

/** Odakle je vrsta rada procitana: naslovnica, prve stranice iza nje (izjava, sazetak) ili ime datoteke. */
export type WorkTypeSource = 'front' | 'lead' | 'file-name';

import { detectUnitFromCatalog } from './detect-unit';

export interface DetectedCorpusProfile {
  profileId: string;
  unitId: string;
  workType: string;
  source: WorkTypeSource;
}

export interface DetectOptions {
  /** Tekst prvih stranica (`leadText`), gleda se tek kad naslovnica ne imenuje vrstu. */
  extended?: string;
  /** Ime izvorne datoteke; zadnja rezerva, jer ga je dao covjek koji rad poznaje. */
  fileName?: string;
}

export interface RegistryProfileLike {
  id: string;
  unitId: string;
  workTypes?: string[];
}

export const UNIT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Fakultet politi[čc]kih znanosti/i, 'fpzg'], [/Pravni fakultet/i, 'pravo'],
  [/Ekonomski fakultet/i, 'efzg'], [/Filozofski fakultet/i, 'ffzg'],
  [/Fakultet elektrotehnike i ra[čc]unarstva/i, 'fer'], [/Fakultet strojarstva/i, 'fsb'],
  [/Medicinski fakultet/i, 'mef'], [/Prirodoslovno[- ]matemati[čc]ki/i, 'pmf'],
  [/Agronomski fakultet/i, 'agr'], [/Grafi[čc]ki fakultet/i, 'grf'],
  [/Kineziolo[šs]ki/i, 'kif'], [/Arhitektonski fakultet/i, 'arh'],
  [/Gra[đd]evinski fakultet/i, 'grad'], [/Tekstilno[- ]tehnolo[šs]ki/i, 'ttf'],
  [/[ŠS]umarski fakultet/i, 'sumfak'], [/Veterinarski fakultet/i, 'vef'],
  [/Farmaceutsko[- ]biokemijski/i, 'fbf'], [/U[čc]iteljski fakultet/i, 'ufzg'],
  [/Katoli[čc]ki bogoslovni/i, 'kbf'], [/Rudarsko[- ]geolo[šs]ko/i, 'rgnf'],
  [/Prehrambeno[- ]biotehnolo[šs]ki/i, 'pbf'], [/Fakultet kemijskog in[žz]enjerstva/i, 'fkit'],
  [/Geodetski fakultet/i, 'geof'], [/Fakultet hrvatskih studija|Hrvatski studiji/i, 'fhs'],
  [/Fakultet organizacije i informatike/i, 'foi'],
];

/**
 * Fraze koje IMENUJU rad (ne program): padezi i umetak do dvije rijeci. Pocetak rijeci se trazi izricito
 * (`(?:^|[^\p{L}])`, ne `\b`, jer je `\b` u JS-u ASCII pojam i pred dijakritikom pada): bez toga "diplomski rad"
 * pogadja unutar "prijediplomski rad" i zavrsni rad postaje diplomski.
 */
const THESIS_PHRASE = {
  graduate: /(?:^|[^\p{L}])diplomsk(?:i|og|om)\s+(?:\S+\s+){0,2}?rad(?:a|u)?(?![\p{L}])/iu,
  final: /(?:^|[^\p{L}])zavr[šs]n(?:i|og|om)\s+(?:\S+\s+){0,2}?rad(?:a|u)?(?![\p{L}])/iu,
  seminar: /(?:^|[^\p{L}])seminarsk(?:i|og|om)\s+(?:\S+\s+){0,2}?rad(?:a|u)?(?![\p{L}])/iu,
} as const;

export const WORK_TYPE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/doktorsk|disertacij/i, 'doctoral'],
  [/specijalisti[čc]k/i, 'specialist'],
  [THESIS_PHRASE.graduate, 'graduate'],
  [THESIS_PHRASE.final, 'final'],
  [THESIS_PHRASE.seminar, 'seminar'],
  [/\besej/i, 'seminar'],
];

/** Rad kolegija bez rijeci o vrsti: samo kad nijedna fraza rada ne stoji na naslovnici. */
const COURSEWORK_HINT = /kolegij|\bpredmet\b|nositelj/i;

/**
 * Vrsta rada iz imena datoteke: "ZOU_seminar_v4.docx", "Petak_diplomski.docx". Zadnja rezerva. "diplomski_studij"
 * u imenu je program, ne vrsta, pa se izuzima. Izmjereno 2026-09-05: nad 163 rada s vrstom s naslovnice ime
 * datoteke se ne slaze s njom u 1 slucaju, pa NIKAD nema prednost; kao rezerva vraca 7 od 32 rada.
 */
export function workTypeFromFileName(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (/doktor|disertac/.test(n)) return 'doctoral';
  if (/specijalist/.test(n)) return 'specialist';
  if (/diplomsk(?!i[_ .-]?studij)/.test(n)) return 'graduate';
  if (/zavr[šs]n|zavrsn/.test(n)) return 'final';
  if (/seminar|esej/.test(n)) return 'seminar';
  return null;
}

/** Fraze koje IMENUJU rad, za prve stranice iza naslovnice: samo doslovne fraze, bez eseja i kolegija. */
const LEAD_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/doktorsk|disertacij/i, 'doctoral'],
  [/specijalisti[čc]k/i, 'specialist'],
  [THESIS_PHRASE.graduate, 'graduate'],
  [THESIS_PHRASE.final, 'final'],
  [THESIS_PHRASE.seminar, 'seminar'],
];

export function detectWorkTypeWithSource(front: string, opts: DetectOptions = {}): { workType: string; source: WorkTypeSource } | null {
  for (const [re, workType] of WORK_TYPE_PATTERNS) if (re.test(front)) return { workType, source: 'front' };
  if (COURSEWORK_HINT.test(front)) return { workType: 'seminar', source: 'front' };
  // Rezerva 1: izjava o izvornosti ili sazetak odmah iza naslovnice ("Izjavljujem da sam ovaj diplomski rad ...").
  // Izmjereno 2026-09-05: nad 163 rada s vrstom s naslovnice prve stranice se NE kose ni s jednom; kao rezerva
  // vracaju 10 od 32 rada bez profila. Esej i kolegij se ovdje ne gledaju: preduboko u tekstu su previse labavi.
  if (opts.extended) {
    for (const [re, workType] of LEAD_PATTERNS) if (re.test(opts.extended)) return { workType, source: 'lead' };
  }
  // Rezerva 2: ime datoteke.
  if (opts.fileName) {
    const fromName = workTypeFromFileName(opts.fileName);
    if (fromName) return { workType: fromName, source: 'file-name' };
  }
  return null;
}

export function detectWorkType(front: string, opts: DetectOptions = {}): string | null {
  return detectWorkTypeWithSource(front, opts)?.workType ?? null;
}

/**
 * Ustanova: KATALOG prvi (svih 134 jedinice, s razrjesavanjem generickih imena po sveucilistu; `detect-unit.ts`),
 * rucni zagrebacki popis kao rezerva. Do 2026-09-05 postojao je samo popis od 25 imena, pa je 28 od 32 radova
 * s ustanova koje korpus nema prolazilo kao "bez ustanove". Nad 172 vec prepoznatih radova katalog daje ISTU
 * jedinicu za svaki (izmjereno pri uvodjenju).
 */
export function detectUnit(front: string): string | null {
  return detectUnitFromCatalog(front)?.unitId ?? UNIT_PATTERNS.find(([re]) => re.test(front))?.[1] ?? null;
}

export function detectCorpusProfile(
  front: string,
  registry: readonly RegistryProfileLike[],
  opts: DetectOptions = {},
): DetectedCorpusProfile | null {
  const unitId = detectUnit(front);
  const detected = detectWorkTypeWithSource(front, opts);
  if (!unitId || !detected) return null;
  const match = registry.find((p) => p.unitId === unitId && (p.workTypes ?? []).includes(detected.workType));
  return match ? { profileId: match.id, unitId, workType: detected.workType, source: detected.source } : null;
}
