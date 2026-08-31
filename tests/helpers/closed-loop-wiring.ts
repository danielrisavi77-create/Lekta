/**
 * OZICENJE DOKAZA PO OSI, izdvojeno iz `scripts/run-closed-loop.mts` 2026-08-31.
 *
 * Razlog seljenja je izmjeren, nije stilski. Gard nize je stajao kao kod na vrhu skripte, pa
 * se izvodio SAMO kad covjek rucno pokrene `npm run closed-loop`. CI posao koji se ZOVE
 * `closed-loop` (`.github/workflows/repair-slow.yml`) pokrece `npm run test:slow`, a taj
 * config (`vitest.slow.config.ts`) ukljucuje iskljucivo `tests/repair-closed-loop*.test.ts`
 * i skriptu nikad ne dotakne. Gard dakle nije bio u nijednom gateu, i uz to nije imao
 * mutaciju, sto ga po tvrdom pravilu ovog repozitorija ne cini gardom.
 *
 * Ovdje je cista funkcija s parametrima, pa ju test moze pozvati nad STVARNIM mapama (dokaz
 * da ozicenje vrijedi) i nad PODMETNUTIMA (dokaz da gard grize). Isti obrazac kao
 * `computeDemotedAdvisory`, koji skup prima samo za testove.
 */
import { APPLIED_AXIS_FIXER } from './coverage-cells';

/**
 * Mjerljiv signal osi: koliko je njezinih nalaza jos u dokumentu.
 *
 * Sluzi da `applied` bude MJEREN, a ne samoiskaz fixera. Changelog dokazuje samo "neki fixer s tim
 * id-em vratio je `applied: true`", a `apply-fixers` taj zapis gura na temelju zastavice, bez
 * usporedbe bajtova. Najjasniji protuprimjer je `final-document-inspector-fixer`, koji `changed`
 * postavlja iz sest neovisnih grana (revizije, `updateFields`, rsid-ovi, customXml, metapodaci),
 * pa bi os `revision-metadata` mogla dobiti dokaz uz NULA uklonjenih rsid-ova.
 *
 * `undefined` znaci da analiza za tu os ne nudi brojku. Takva os ostaje na slabijem, changelog
 * pravilu i to se ovdje IMENUJE umjesto da se presuti.
 */
export const AXIS_SIGNAL: Record<string, ((result: AnalysisLike) => number) | undefined> = {
  'empty-paragraphs': (r) => Number(r?.details?.measurements?.structure?.emptyParagraphs ?? 0),
  'croatian-typography': (r) => Number(r?.details?.typographyStructure?.summary?.total ?? 0),
  /**
   * Broji PREOSTALI POSAO, ne broj nalaza.
   *
   * IZMJERENO 2026-08-31: popravak ne uklanja nalaz nego mu mijenja stanje
   * (`status: plain-text -> hyperlink-ok`, `safeOperations: 1 -> 0`), pa je ukupan broj nalaza
   * NEPROMIJENJEN i os bi lazno ispala neprimijenjena. Signal je zato broj nalaza koji jos imaju
   * sto popraviti.
   */
  'link-doi': (r) => (r?.details?.linkDoiStructure?.occurrences ?? []).filter((o) => (o?.safeOperations ?? []).length > 0).length,
  'required-section': (r) => (r?.details?.requiredSectionsStructure?.candidates ?? []).filter((c) => !c.present).length,
  /**
   * Osi BEZ mjerljivog signala. Moraju stajati izricito, s `undefined`, jer ih provjera nize
   * zahtijeva; izostavljena os bi tiho pala na slabije changelog pravilo.
   *
   * Prva izvedba je imala samo `revision-metadata` i tvrdila da je time sve imenovano, a
   * `element-caption` i `field-integrity` su bez ijednog spomena padali na to pravilo.
   */
  'revision-metadata': undefined, // analiza ne broji `w:rsid*`
  'element-caption': undefined, // dokaz dolazi iz prolaza preporuka, ne iz brojke u analizi
  'field-integrity': undefined, // upisuje `w:dirty="true"`; nijedna brojka se time ne mijenja
};

export type AnalysisLike = {
  details?: {
    measurements?: { structure?: { emptyParagraphs?: unknown } };
    typographyStructure?: { summary?: { total?: unknown } };
    linkDoiStructure?: { occurrences?: Array<{ safeOperations?: unknown[] }> };
    requiredSectionsStructure?: { candidates?: Array<{ present?: boolean }> };
  };
};

/**
 * `required-section` je ovdje iz DRUGOG razloga nego ostale cetiri, i to treba znati.
 *
 * Ostale nemaju bodovanu provjeru. `required-section` je IMA (`structure.sections.profile`, max 7),
 * ali ju popravak ne moze zatvoriti, pa bi kao bodovana os trajno davala `partial`.
 *
 * IZMJERENO 2026-08-30 na fpzg-politologija-diplomski:
 *   prije popravka   2/7   nedostaje 5 dijelova
 *   poslije          4/7   nedostaju 3 (izjava o autorstvu, zakljucak, literatura)
 *
 * Uzrok nije fixer nego RASKORAK izmedju provjere i kandidata: provjera boduje pet obveznih
 * dijelova, a `requiredSectionsStructure` ih kao kandidate za umetanje nudi samo dva
 * (`abstract`, `keywords-en`). Preostala tri popravak nikad ne vidi, pa je 4/7 strop.
 *
 * Dok taj raskorak stoji, os nosi jacinu `applied` (fixer dokazano mijenja dokument), ne
 * `resolved`. Kad se kandidati prosire na svih pet, os se vraca u `AXIS_CHECK_ID`.
 */
export const STRUCTURAL_WITHOUT_SCORED_CHECK = new Set([
  'empty-paragraphs',
  'croatian-typography',
  'link-doi',
  'revision-metadata',
  'required-section',
  // `element-caption` opisuje STANJE dokumenta (tablica s rucno prepisanim natpisom), a dokaz
  // za nju dolazi iz prolaza PREPORUKA, ne iz bodovane provjere. Da ostane u presudi, svaki bi
  // profil trajno bio `partial`, sto je konstantan pomak a ne mjerenje.
  'element-caption',
  // `field-integrity-fixer` upisuje `w:dirty="true"`, uputu Wordu da polje osvjezi pri
  // otvaranju. Nijedna bodovana provjera se time ne prevrne, jer polje i prije i poslije
  // postoji i ima status `ok`; dokaz je dakle `applied`, ne `resolved`.
  'field-integrity',
]);

/**
 * Nijedna os ne smije TIHO pasti na slabije pravilo.
 *
 * Bez ove provjere je dovoljno dodati os u skup i zaboraviti signal, pa ona zauvijek nosi dokaz
 * koji znaci samo "fixer se javio". Tocno se to i dogodilo s `element-caption` i `field-integrity`.
 * Izostavljanje je od sada greska pri pokretanju, a ne tiha degradacija.
 */
export function assertAxisEvidenceWiring(
  axes: Iterable<string> = STRUCTURAL_WITHOUT_SCORED_CHECK,
  axisSignal: Record<string, unknown> = AXIS_SIGNAL,
  appliedAxisFixer: Record<string, string | undefined> = APPLIED_AXIS_FIXER,
): void {
  for (const axis of axes) {
    if (!(axis in axisSignal)) {
      throw new Error(`Os '${axis}' nema unos u AXIS_SIGNAL. Dodaj mjerljiv signal ili izricit 'undefined' uz obrazlozenje.`);
    }
    /**
     * I DRUGA mapa, jer je prva izvedba ovog garda provjeravala samo `AXIS_SIGNAL` i time promasila
     * bas os zbog koje je nastala: `element-caption` je bio u skupu ali bez unosa u
     * `APPLIED_AXIS_FIXER`, pa je `changedFixerIds.has(undefined)` uvijek bio `false` i os nikad
     * nije mogla zaraditi dokaz. Gard koji provjerava jedno polje pored onoga koje se koristi nije
     * gard.
     */
    if (!appliedAxisFixer[axis]) {
      throw new Error(`Os '${axis}' nema fixer u APPLIED_AXIS_FIXER, pa nikad ne moze zaraditi dokaz 'applied'.`);
    }
  }
}
