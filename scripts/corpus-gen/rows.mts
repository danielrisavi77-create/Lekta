/**
 * REDCI SINTETICKOG KORPUSA: (jedinica x vrsta rada x razina studija).
 *
 * Odluka vlasnika 2026-09-06: svaki fakultet dobiva vlastiti rad za zavrsni, diplomski i seminarski,
 * pri cemu seminarski postoji i za diplomsku i za poslijediplomsku razinu.
 *
 * Rutiranje ide PRAVIM putem proizvoda, ne precacem: vidljivi programi jedinice -> predstavnicki
 * program za trazenu razinu -> `eligibleDefinitionsFor` -> `resolveDefinition` -> `composeAnalysisProfile`.
 * Zato ovaj popis usput MJERI rutiranje: redak koji zavrsi bez profila nije kvar generatora nego
 * cinjenica o podacima, i tako se i biljezi (`fallbackFamily`), nikad se ne popunjava izmisljenim pravilom.
 *
 * Rupa koju popis mora IZGOVORITI, ne sakriti: registar ima sedam vrsta rada i nema poslijediplomski
 * seminar. `seminar` nudi 11 profila u 10 jedinica, a programi s "poslijediplom" rutiraju se u
 * `specialist`. Poslijediplomski seminar zato pada na laki obiteljski baseline, dakle na ista pravila
 * kao prijediplomski, uz drugu naslovnicu i program.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allUnits } from '../../src/catalog/catalog-loader';
import { VERIFIED_PROFILE_REGISTRY } from '../../src/profiles/profile-registry';
import {
  visibleProgramsForUnit,
  eligibleDefinitionsFor,
  resolveDefinition,
} from '../../src/ui/work-selection';
import { composeAnalysisProfile } from '../../src/profiles/compose-profile';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

/** Razine studija; nisu vrsta rada nego kontekst naslovnice i programa. */
export const STUDY_LEVELS = ['prijediplomski', 'diplomski', 'poslijediplomski'] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

/**
 * Zadani opseg u rijecima kad profil NE propisuje svoj.
 *
 * Pokrivenost je tanka i to je izmjereno: `wordMin` ima 3 od 149 zavrsnih profila i nijedan od 11
 * seminarskih. Zato zadana vrijednost postoji, ali manifest uvijek biljezi je li opseg dosao iz
 * pravila ili iz ove tablice (`wordTargetSource`), da se pretpostavka ne cita kao fakultetsko pravilo.
 */
export const ZADANI_OPSEG: Record<string, number> = {
  seminar: 3000,
  final: 5500,
  graduate: 11000,
  specialist: 10000,
  doctoral: 20000,
  article: 5000,
  project: 5000,
};

/** Vrste rada koje svaka jedinica dobiva, s razinom na kojoj se pisu. */
const OBVEZNE_KOMBINACIJE: ReadonlyArray<{ workType: string; level: StudyLevel }> = [
  { workType: 'final', level: 'prijediplomski' },
  { workType: 'graduate', level: 'diplomski' },
  { workType: 'seminar', level: 'prijediplomski' },
  { workType: 'seminar', level: 'diplomski' },
  { workType: 'seminar', level: 'poslijediplomski' },
];

/** Vrste rada koje se dodaju SAMO ako ih jedinica stvarno nudi. */
const UVJETNE_KOMBINACIJE: ReadonlyArray<{ workType: string; level: StudyLevel }> = [
  { workType: 'specialist', level: 'poslijediplomski' },
  { workType: 'doctoral', level: 'poslijediplomski' },
  { workType: 'article', level: 'diplomski' },
  { workType: 'project', level: 'diplomski' },
];

/**
 * Uzorci imena programa po razini.
 *
 * Redoslijed provjere je kljucan iz istog razloga kao u `LEVEL_DEFAULT_RULES`: "Prijediplomski"
 * SADRZI substring "diplomski", pa se prijediplomski mora iskljuciti prije nego se prizna diplomski.
 */
const PRIJEDIPLOMSKI = /prijediplomski|preddiplomski|prvostupni/i;
const POSLIJEDIPLOMSKI = /poslijediplom|doktor|specijalist/i;
const DIPLOMSKI = /diplomski|integrirani/i;

export interface CorpusRow {
  id: string;
  unitId: string;
  unitName: string;
  family: string;
  workType: string;
  level: StudyLevel;
  program: string;
  /** Je li program stvarno te razine, ili je uzet kao zamjena jer jedinica takav ne nudi. */
  programSource: 'level-match' | 'fallback';
  routedProfileId: string | null;
  /**
   * Odabrana varijanta profila, kad je jedinica nudi vise.
   *
   * Zasto uopce postoji: `resolveDefinition` vraca profil bez varijante, a kad ga nema, nista. To je
   * tocno ponasanje SUCELJA (student mora odabrati), ali za korpus znaci da bi redak s dva valjana
   * kandidata ispao kao "nema fakultetskog pravila". Izmjereno 2026-09-06: takav je jedan redak od
   * 444 (`fpzg--final--prijediplomski`, kandidati `text` i `av`). Bira se PRVI po abecedi, jer izbor
   * mora biti ponovljiv, i biljezi se, jer nije nas nego fakultetov.
   */
  variant: string | null;
  /** Obitelj po kojoj se slaze baseline kad rutiranje ne nadje profil. */
  fallbackFamily: string | null;
  wordTarget: number;
  wordTargetSource: 'rule' | 'default';
}

type HeavyEntry = { rules?: Record<string, unknown> };
type Heavy = Record<string, HeavyEntry>;

let heavyCache: Heavy | null = null;
function heavyRules(): Heavy {
  if (!heavyCache) {
    heavyCache = JSON.parse(
      readFileSync(join(ROOT, 'data', 'profiles', 'verified-profiles-heavy.json'), 'utf8'),
    ) as Heavy;
  }
  return heavyCache;
}

/** Predstavnicki program jedinice za trazenu razinu; kad ga nema, uzima se prvi vidljivi. */
function programForLevel(
  programs: string[],
  level: StudyLevel,
): { program: string; source: CorpusRow['programSource'] } {
  const match =
    level === 'prijediplomski'
      ? programs.find((p) => PRIJEDIPLOMSKI.test(p))
      : level === 'poslijediplomski'
        ? programs.find((p) => POSLIJEDIPLOMSKI.test(p))
        : programs.find((p) => DIPLOMSKI.test(p) && !PRIJEDIPLOMSKI.test(p));
  if (match) return { program: match, source: 'level-match' };
  return { program: programs[0], source: 'fallback' };
}

type Kandidat = { id: string; variant?: string };

/**
 * Odabir varijante kad profil bez varijante ne postoji.
 *
 * Sucelje ovdje trazi od studenta da odabere; korpus mora odabrati sam, i to ponovljivo. Redoslijed
 * nije proizvoljan nego izveden iz onoga sto gradimo: dokument je TEKST, pa se uzima varijanta koja
 * propisuje tekstualni rad.
 *
 * Izmjereno na jedinom takvom retku (`fpzg--final--prijediplomski`, 1 od 444): `tekst` varijanta nosi
 * opseg 5000 do 6000 rijeci i sest obveznih dijelova, a `av` varijanta nijedno od toga, jer opisuje
 * audiovizualni rad. Izbor po abecedi bi uzeo `av` i mjerio tekstualni dokument prema pravilima koja
 * za njega ne vrijede.
 */
function pickVariant(kandidati: Kandidat[]): Kandidat | null {
  if (!kandidati.length) return null;
  const tekstualna = kandidati.find((d) => /tekst|text|pis/i.test(`${d.variant ?? ''} ${d.id}`));
  if (tekstualna) return tekstualna;
  return [...kandidati].sort((a, b) => a.id.localeCompare(b.id, 'en'))[0];
}

/** Ciljani opseg iz pravila profila, po istom receptu kao `derivePlanFor` u conformance matrici. */
function wordTargetFrom(
  rules: Record<string, unknown>,
  workType: string,
): { words: number; source: CorpusRow['wordTargetSource'] } {
  const min = typeof rules.wordMin === 'number' ? rules.wordMin : null;
  const max = typeof rules.wordMax === 'number' ? rules.wordMax : null;
  if (min === null) return { words: ZADANI_OPSEG[workType] ?? 5000, source: 'default' };
  let words = Math.round(min * 1.05);
  if (max && words > max) words = Math.floor(max * 0.9);
  return { words, source: 'rule' };
}

/** Slozena pravila retka: isti lanac koji analiza stvarno cita. */
export function composedRulesFor(row: CorpusRow): Record<string, unknown> {
  const entry = row.routedProfileId ? heavyRules()[row.routedProfileId] : undefined;
  const rules = entry?.rules ?? {};
  return composeAnalysisProfile({
    definition: row.routedProfileId ? { id: row.routedProfileId, rules } : null,
    department: null,
    family: row.family,
    unitId: row.unitId,
    workType: row.workType,
    citationStyle: String(rules.recommendedCitation || 'fpzg'),
    override: null,
  }) as Record<string, unknown>;
}

/**
 * Pravila koja generator stvarno cita pri gradnji dokumenta.
 *
 * Izvod, ne cijeli profil: manifest mora biti citljiv i usporediv, a slozeni profil nosi desetke
 * kljuceva koje generator nikad ne pogleda. Dijele ga skripta koja pece manifest i gard koji ga
 * provjerava, pa se ne mogu raziici.
 */
export const DIGEST_KEYS = [
  'font',
  'size',
  'spacing',
  'margins',
  'paperSizes',
  'requireA4',
  'justify',
  'requireToc',
  'requirePageNumbers',
  'requiredSections',
  'recommendedCitation',
  'documentLanguage',
] as const;

export function rulesDigestFor(row: CorpusRow): Record<string, unknown> {
  const r = composedRulesFor(row);
  const out: Record<string, unknown> = {};
  for (const k of DIGEST_KEYS) if (r[k] !== undefined) out[k] = r[k];
  return out;
}

/** Svi redci korpusa, poredani stabilno po id-u. */
export function enumerateRows(): CorpusRow[] {
  const registry = VERIFIED_PROFILE_REGISTRY;
  const rows: CorpusRow[] = [];
  for (const unit of allUnits()) {
    const programs = visibleProgramsForUnit(registry, unit);
    const offered = new Set<string>(
      registry.filter((d) => d.unitId === unit.id).flatMap((d) => d.workTypes ?? []),
    );
    const kombinacije = [
      ...OBVEZNE_KOMBINACIJE,
      ...UVJETNE_KOMBINACIJE.filter((k) => offered.has(k.workType)),
    ];
    for (const { workType, level } of kombinacije) {
      const { program, source } = programForLevel(programs, level);
      const kandidati = eligibleDefinitionsFor(registry, unit.id, program, workType);
      const routed = resolveDefinition(kandidati, '') ?? pickVariant(kandidati);
      const rulesForTarget = routed ? ((heavyRules()[routed.id]?.rules ?? {}) as Record<string, unknown>) : {};
      const { words, source: wordSource } = wordTargetFrom(rulesForTarget, workType);
      const family = String((unit as { family?: string }).family ?? 'mixed');
      rows.push({
        id: `${unit.id}--${workType}--${level}`,
        unitId: unit.id,
        unitName: String((unit as { name?: string }).name ?? unit.id),
        family,
        workType,
        level,
        program,
        programSource: source,
        routedProfileId: routed ? routed.id : null,
        variant: routed ? ((routed as { variant?: string }).variant ?? null) : null,
        fallbackFamily: routed ? null : family,
        wordTarget: words,
        wordTargetSource: wordSource,
      });
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
