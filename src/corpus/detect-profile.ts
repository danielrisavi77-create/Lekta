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

export interface DetectedCorpusProfile {
  profileId: string;
  unitId: string;
  workType: string;
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

export function detectWorkType(front: string): string | null {
  for (const [re, workType] of WORK_TYPE_PATTERNS) if (re.test(front)) return workType;
  if (COURSEWORK_HINT.test(front)) return 'seminar';
  return null;
}

export function detectUnit(front: string): string | null {
  return UNIT_PATTERNS.find(([re]) => re.test(front))?.[1] ?? null;
}

export function detectCorpusProfile(front: string, registry: readonly RegistryProfileLike[]): DetectedCorpusProfile | null {
  const unitId = detectUnit(front);
  const workType = detectWorkType(front);
  if (!unitId || !workType) return null;
  const match = registry.find((p) => p.unitId === unitId && (p.workTypes ?? []).includes(workType));
  return match ? { profileId: match.id, unitId, workType } : null;
}
