/**
 * CELIJE POKRIVENOSTI: (profil x fixer), svaka s dokazom ili s razlogom zasto ga nema.
 *
 * Zasto postoji: `faculty-matrix.json` je do 2026-08-29 brojao SAMO profilne osi (font, velicina,
 * prored, poravnanje, margine, format papira). Za FPZG je to 59 celija kroz 13 profila, i sve iz
 * istih sest dimenzija. Istovremeno je mjerenje 74 stvarna FPZG rada
 * (`docs/generated/repair-real-corpus.local.json`) pokazalo 192 nerijesene ciljane provjere, od
 * kojih 175 na fixerima kojih u matrici NEMA (heading-style, section-surgery, field-integrity,
 * consistency, bibliography-repair, citation-bibliography-sync, required-section, croatian-
 * typography, link-doi, toc-field, final-document-inspector). Matrica je time izvjestavala o
 * dimenziji na kojoj proizvod ne pada, a sutjela o onoj na kojoj pada.
 *
 * UGOVOR (iz F2.4 specifikacije, tocka 7): svaka celija ima TOCNO JEDAN od dva statusa. Nikad
 * prazno, nikad treci status. "Nije primjenjivo" NAMJERNO nije status nego RAZLOG uz
 * `nepokriveno`: treci status bi postao izlaz za nuzdu kojim se matrica isprazni a broj ostane
 * lijep, sto je obrazac na kojem je ovaj projekt vec izgorio.
 */
import { resolveProfile } from '../../src/analysis/golden-entry';
import { draftRuleEntriesFor } from '../../src/profiles/drafts-runtime';
import { FIXER_IDS, type FixerId } from '../../src/repair/apply-fixers';
import type { RepairCoverageMatrix } from './repair-coverage';
import type { RealCorpusReport } from '../real-corpus/harness';
import type { CorpusTrack } from '../real-corpus/corpus-track';

/** Redak `docs/generated/closed-loop.json` (`npm run closed-loop`). */
export interface ClosedLoopRow {
  profileId: string;
  outcome: string;
  violated: string[];
  axesResolved: string[];
  /**
   * Osi koje je popravak DIRAO, ali im nijedna bodovana provjera ne moze potvrditi rjesenje.
   *
   * Postoji zato sto `axisResolved` vraca `true` cim je `max === 0`: da su te osi ostale u
   * `axesResolved`, svaka bi se na svakom profilu javila kao rijesena i matrica bi dobila
   * 407 x 3 = 1221 celiju laznog dokaza.
   */
  axesApplied?: string[];
  /**
   * Fixeri koji su TRAJNE preporuke i koje je zaseban prolaz dokazano primijenio.
   *
   * `element-caption-fixer` i `table-figure-rescue-fixer` nemaju svoje pravilo ni u jednom od 407
   * profila, pa se nude kao preporuka (`violated: false`). Glavni prolaz ih zato ne moze dokazati:
   * `buildAllRepairableItems` ih bez `includeNonViolated` uopce ne gradi, a
   * `buildDefaultRepairRequests` ih ne bi ni poslao. Bez ovog polja im je 814 celija (2 x 407) bilo
   * strukturno nedostizno.
   */
  recommendationsApplied?: string[];
  axesRemaining: string[];
  regressions: number;
  textPreserved: boolean;
}

export interface ClosedLoopReport {
  rows: ClosedLoopRow[];
}

/**
 * Jacina dokaza. Razlika je stvarna, pa se imenuje umjesto da se stopi u jedan broj:
 *
 * - `resolved` provjera je PRIJE padala i POSLIJE popravka prolazi (closed-loop mjeri bas to).
 * - `applied`  fixer je promijenio dokument bez regresije, ali artefakt ne kaze je li se ijedna
 *              provjera zbog toga prevrnula. `repair-real-corpus.json` nosi `changedFixerIds` po
 *              dokumentu, a rijesenost samo zbirno (`targetedResolvedCount`), pa se po fixeru
 *              jaci zakljucak ne moze izvesti bez laganja.
 */
export type EvidenceStrength = 'resolved' | 'applied';

export interface CellEvidence {
  kind: 'closed-loop' | 'real' | 'generated';
  strength: EvidenceStrength;
  /** Traka korpusa za dokaz iz dokumenta; `converted` ovdje ne moze doci (vidi corpus-track.ts). */
  track?: CorpusTrack;
  artifactId: string;
  checkIds?: string[];
}

/**
 * Razlozi su ZATVOREN popis, ne slobodan tekst: samo tako se moze traziti da broj celija bez
 * dokaza pada, a da se razlog ne prepise u nesto blaze.
 */
export type UncoveredReason =
  /** Nijedno pravilo profila ne gadja taj fixer; nema sto popraviti dok se pravilo ne doda. */
  | 'profil-ne-propisuje-os'
  /** Univerzalna higijena: vrijedi za svaki dokument, ali dokaza jos nema. Zatvara se generatorom. */
  | 'univerzalna-higijena-bez-dokaza'
  /** Profil os propisuje, closed-loop ju je pokusao popraviti i nije uspio. Stvaran jaz motora. */
  | 'closed-loop-nije-rijesio'
  /** Profil os propisuje, ali je nijedno mjerenje jos nije dotaklo. */
  | 'nema-dokaza'
  /**
   * Fixer ne moze dobiti dokaz ni na jednom dokumentu, jer mu je zadani odabir prazan PO
   * KONSTRUKCIJI. To NIJE rupa u mjerenju nego svojstvo alata, pa se imenuje umjesto da trajno
   * stoji kao dug koji se nikad ne moze zatvoriti.
   */
  | 'ceka-ljudski-odabir';

export type CoverageCell =
  | { profileId: string; fixerId: FixerId; status: 'pokriveno'; evidence: CellEvidence }
  | { profileId: string; fixerId: FixerId; status: 'nepokriveno'; reason: UncoveredReason };

export interface CoverageCellReport {
  cells: CoverageCell[];
  summary: {
    cellCount: number;
    coveredCount: number;
    uncoveredCount: number;
    /** Dokaz jacine `resolved`; jedina brojka koja tvrdi da se provjera doista prevrnula. */
    resolvedCount: number;
    byReason: Record<UncoveredReason, number>;
  };
}

/**
 * Fixeri koje uopce moze ponuditi PROFILNA grana popravka (`buildRepairableItems`).
 *
 * Izvodi se iz same matrice, ne iz rucnog popisa: fixer koji se ni na jednom od 407 profila ne
 * pojavljuje kao redak je univerzalna higijena i ne smije dobiti razlog `profil-ne-propisuje-os`,
 * jer profil to nikad i ne propisuje, a fixer svejedno vrijedi za svaki dokument.
 */
export function profileGatedFixers(matrix: RepairCoverageMatrix): Set<string> {
  return new Set(matrix.rows.map((row) => row.fixerId));
}

/**
 * Fixer -> os generatora koja ga pokrece. Obrat `APPLIED_AXIS_FIXER` i `RESOLVED_AXIS_FIXER`.
 *
 * Sluzi za ISTINITU dijagnozu nepokrivene celije. `loop.violated` je pouzdan signal jer generator
 * krsi os SAMO kad ju profil propisuje: `toc-field` se dodaje iskljucivo uz `requireToc === true`
 * (83 profila od 407). Bez ovoga je preostalih 325 celija `toc-field-fixera` nosilo dijagnozu
 * "univerzalna higijena bez dokaza", a tocna je "profil ne propisuje os": ti profili sadrzaj uopce
 * ne trazе, pa se nema sto ni dokazivati.
 */
const AXIS_BY_FIXER: Record<string, string> = {
  'final-document-inspector-fixer': 'revision-metadata',
  'toc-field-fixer': 'toc-field',
  'heading-style-fixer': 'heading-style',
  'empty-paragraph-fixer': 'empty-paragraphs',
  'croatian-typography-fixer': 'croatian-typography',
  'link-doi-fixer': 'link-doi',
  'required-section-fixer': 'required-section',
};

/**
 * Fixer -> uvjet profila bez kojeg se UOPCE ne nudi.
 *
 * Predikati ZRCALE uvjete iz `src/ui/repair-items.ts`; nisu procjena. Redom:
 *   paragraph-spacing     `profile?.checkParagraphSpacingZero !== true` -> return []
 *   page-numbering        `profile?.checkPageNumberStartAtIntro !== true` -> return []
 *   footnote-spacing      `profile?.checkFootnoteParagraphSpacingZero !== true` -> return []
 *   footnote-typography   ni `footnoteFont[0]` ni pozitivan `footnoteSize` -> return []
 *   heading-format        `!profile?.headingRules` -> return []
 *   heading-case          nijedna razina nema `uppercase === true` -> return []
 *
 * Zasto: celija za profil koji os NE propisuje nije rupa u dokazu nego tocna tvrdnja, isto kao kod
 * `toc-field`. Izmjereno 2026-08-31: `checkParagraphSpacingZero` ima 4 profila od 407,
 * `checkPageNumberStartAtIntro` 4, `checkFootnoteParagraphSpacingZero` 4, `headingRules` 21,
 * `uppercase` 12, `footnoteFont/Size` 50. Bez ovoga je oko 2.100 celija tvrdilo da im nedostaje
 * dokaz, a njihovim profilima se nema sto ni dokazivati.
 *
 * Ne ide kroz `loop.violated` kao `toc-field`, jer generator te osi uopce ne krsi, pa bi signal
 * uvijek bio prazan i dijagnoza bi bila tocna iz krivog razloga.
 */
const PROFILE_GATE: Record<string, (profile: Record<string, unknown>) => boolean> = {
  'paragraph-spacing-fixer': (p) => p?.checkParagraphSpacingZero === true,
  'page-numbering-fixer': (p) => p?.checkPageNumberStartAtIntro === true,
  'footnote-spacing-fixer': (p) => p?.checkFootnoteParagraphSpacingZero === true,
  'footnote-typography-fixer': (p) => {
    const fonts = p?.footnoteFont;
    const size = Number(p?.footnoteSize);
    return (Array.isArray(fonts) && typeof fonts[0] === 'string') || (Number.isFinite(size) && size > 0);
  },
  'heading-format-fixer': (p) => Boolean(p?.headingRules) && typeof p.headingRules === 'object',
  'heading-case-fixer': (p) => {
    const levels = (p?.headingRules as { levels?: Record<string, { uppercase?: unknown }> } | undefined)?.levels;
    if (!levels || typeof levels !== 'object') return false;
    return Object.values(levels).some((level) => level?.uppercase === true);
  },
};

/**
 * Fixeri koji ne mogu dobiti dokaz ni na jednom dokumentu, jer im je zadani odabir prazan PO
 * KONSTRUKCIJI, a Lekta ne smije pogadjati koji je oblik tocan.
 *
 * IZMJERENO na 116 stvarnih dokumenata: `consistency-fixer` je ponudjen 110 puta i promijenio 0.
 * Svaki njegov odabir se gradi s tvrdim `selected: false`. Nijedna os generatora to ne mijenja, pa
 * bi celija koja o njemu tvrdi "nedostaje dokaz" bila trajno neispunjiva tvrdnja.
 */
/**
 * Fixer -> `checkId` asistiranog pravila bez kojeg radi TVRDI `return []`.
 *
 * Ovi se, za razliku od `element-caption` i `table-figure-rescue`, NE nude ni kao preporuka: bez
 * unosa s izvorom, stranicom i doslovnim citatom graditelj odmah izlazi. Za profil bez tog unosa
 * celija dakle nije rupa u dokazu nego tocna tvrdnja.
 *
 * IZMJERENO 2026-08-31 nad `draftRuleEntriesFor` za svih 407 profila, uz uvjet koji graditelji
 * doista traze (status `verified` ili `advisory`, plus `sourceId`, `sourcePage` i `quote`):
 *
 *   bibliography-rules            22
 *   citation-sync-rules           21
 *   section-surgery-rules         22
 *   legal-footnote-repair-rules    0
 *
 * `checkId`-jevi su izvuceni iz koda (`grep "checkId === "`), ne prepisani po sjecanju: prvi
 * pokusaj je koristio `legal-footnote-rules`, imena koje u kodu ne postoji, i dao lazno tocnu nulu.
 */
const ASSISTED_RULE_GATE: Record<string, string> = {
  'bibliography-repair-fixer': 'bibliography-rules',
  'citation-bibliography-sync-fixer': 'citation-sync-rules',
  'section-surgery-fixer': 'section-surgery-rules',
  'legal-footnote-repair-fixer': 'legal-footnote-repair-rules',
};

/** Isti uvjet koji graditelji u `src/ui/repair-items.ts` primjenjuju na `profile.ruleEntries`. */
function hasAssistedRule(profileId: string, checkId: string): boolean {
  const entries = (draftRuleEntriesFor(profileId) ?? []) as Array<Record<string, unknown>>;
  return entries.some(
    (entry) =>
      entry?.checkId === checkId &&
      (entry?.status === 'verified' || entry?.status === 'advisory') &&
      Boolean(entry?.sourceId) &&
      Boolean(entry?.sourcePage) &&
      Boolean(entry?.quote),
  );
}

const UNDECIDABLE_FIXERS: ReadonlySet<string> = new Set(['consistency-fixer']);

/** Gradi celije za sve profile iz matrice, po jedna za svaki registriran fixer. */
/**
 * Univerzalna os generatora -> fixer koji ju zatvara.
 *
 * Samo osi BEZ bodovane provjere (`STRUCTURAL_WITHOUT_SCORED_CHECK` u `scripts/run-closed-loop.mts`).
 * Osi s bodovanom provjerom (`toc-field`, `heading-style`) idu kroz `axesResolved` i nose jaci dokaz.
 */
export const APPLIED_AXIS_FIXER: Record<string, string> = {
  // `final-document-inspector-fixer` uklanja `w:rsid*`. Bez ovog unosa izvod iz changeloga ne
  // zna kojeg fixera traziti, pa os `revision-metadata` ostaje bez ijednog dokaza.
  'revision-metadata': 'final-document-inspector-fixer',
  'empty-paragraphs': 'empty-paragraph-fixer',
  'croatian-typography': 'croatian-typography-fixer',
  'link-doi': 'link-doi-fixer',
  /**
   * `required-section` je ovdje iz DRUGOG razloga nego gornje tri.
   *
   * One nemaju bodovanu provjeru. Ona ju IMA (`structure.sections.profile`, max 7), ali ju popravak
   * ne moze zatvoriti: provjera boduje pet obveznih dijelova, a analiza kao kandidate za umetanje
   * nudi samo dva. Izmjereno 2026-08-30: 2/7 -> 4/7, strop. Dok taj raskorak stoji, os nosi
   * `applied`; kad se kandidati prosire na svih pet, seli u `RESOLVED_AXIS_FIXER`.
   */
  'required-section': 'required-section-fixer',
};

/**
 * Univerzalna os S bodovanom provjerom -> fixer koji ju zatvara.
 *
 * Zasto postoji odvojeno od `loopCovered`: taj put uparuje `axesResolved` s `checkId`-jevima iz
 * REDAKA MATRICE, a matrica ima redak samo ondje gdje profil propisuje pravilo. Univerzalni fixer
 * takvih redaka nema, pa mu je `checkIds` prazan i dokaz propada iako je os stvarno rijesena.
 *
 * IZMJERENO 2026-08-30: closed-loop rjesava `heading-style` na svih 407 profila, a matrica je
 * `heading-style-fixer` svejedno vodila kao `univerzalna-higijena-bez-dokaza` na svih 407.
 *
 * Jacina je `resolved`, ne `applied`: iza ovih osi stoji bodovana provjera koja se doista prevrnula
 * (`toc.present` max 5, `structure.heading.word-styles` max 4).
 */
const RESOLVED_AXIS_FIXER: Record<string, string> = {
  'toc-field': 'toc-field-fixer',
  'heading-style': 'heading-style-fixer',
};

export function buildCoverageCells(
  matrix: RepairCoverageMatrix,
  closedLoop: ClosedLoopReport,
  corpus: RealCorpusReport,
): CoverageCellReport {
  const gated = profileGatedFixers(matrix);
  const loopByProfile = new Map(closedLoop.rows.map((row) => [row.profileId, row]));
  const cells: CoverageCell[] = [];

  for (const profile of matrix.profiles) {
    const profileId = profile.profileId;
    const rows = matrix.rows.filter((row) => row.profileId === profileId);
    const loop = loopByProfile.get(profileId);
    const resolvedAxes = new Set(loop?.axesResolved ?? []);
    // Pravila profila trebaju samo za dijagnozu NEPOKRIVENE celije, pa se citaju jednom po profilu.
    const resolved = resolveProfile(profileId) as Record<string, unknown> | null;
    const resolvedUniversalFixers = new Set(
      [...resolvedAxes].map((axis) => RESOLVED_AXIS_FIXER[axis]).filter((id): id is string => Boolean(id)),
    );
    const appliedFixers = new Set(
      (loop?.axesApplied ?? []).map((axis) => APPLIED_AXIS_FIXER[axis]).filter((id): id is string => Boolean(id)),
    );
    const samples = corpus.results.filter((result) => result.profileId === profileId);

    for (const fixerId of FIXER_IDS) {
      const fixerRows = rows.filter((row) => row.fixerId === fixerId);
      const checkIds = [...new Set(fixerRows.map((row) => row.checkId))].sort();

      // 1) Najjaci dokaz: closed-loop je os prekrsio i popravkom ju vratio u prolaz.
      const loopCovered = checkIds.filter((checkId) => resolvedAxes.has(checkId));
      if (loopCovered.length) {
        cells.push({
          profileId,
          fixerId,
          status: 'pokriveno',
          evidence: {
            kind: 'closed-loop',
            strength: 'resolved',
            artifactId: `closed-loop:${profileId}`,
            checkIds: loopCovered,
          },
        });
        continue;
      }

      // 1a) Univerzalna os s bodovanom provjerom: matrica za nju nema redaka, pa se dokaz mora
      //     pripisati po OSI, a ne po `checkId`-jevima iz redaka.
      if (resolvedUniversalFixers.has(fixerId)) {
        cells.push({
          profileId,
          fixerId,
          status: 'pokriveno',
          evidence: {
            kind: 'closed-loop',
            strength: 'resolved',
            artifactId: `closed-loop:${profileId}`,
            checkIds: [],
          },
        });
        continue;
      }

      // 1b) Closed-loop je os prekrsio i fixer ju je DIRAO, ali nijedna bodovana provjera ne moze
      //     potvrditi rjesenje. Slabija jacina, i to se imenuje umjesto da se izjednaci s `resolved`.
      if (appliedFixers.has(fixerId)) {
        cells.push({
          profileId,
          fixerId,
          status: 'pokriveno',
          evidence: {
            kind: 'closed-loop',
            strength: 'applied',
            artifactId: `closed-loop:${profileId}`,
            checkIds: [],
          },
        });
        continue;
      }

      // 1c) Preporuka koju je korisnik mogao oznaciti, i koja je u zasebnom prolazu dokazano
      //     promijenila dokument. Jacina je `applied`: iza preporuke po definiciji ne stoji bodovana
      //     provjera, jer preporuka ne smije pomicati ocjenu.
      if ((loop?.recommendationsApplied ?? []).includes(fixerId)) {
        cells.push({
          profileId,
          fixerId,
          status: 'pokriveno',
          evidence: {
            kind: 'closed-loop',
            strength: 'applied',
            artifactId: `closed-loop:${profileId}`,
            checkIds: [],
          },
        });
        continue;
      }

      // 2) Slabiji dokaz: fixer je na stvarnom radu promijenio dokument bez regresije.
      const sample = samples.find(
        (result) => (result.changedFixerIds ?? []).includes(fixerId) && result.passRegressionCount === 0,
      );
      if (sample) {
        cells.push({
          profileId,
          fixerId,
          status: 'pokriveno',
          evidence: {
            kind: 'real',
            strength: 'applied',
            track: 'real',
            artifactId: sample.documentId,
            checkIds: checkIds.length ? checkIds : undefined,
          },
        });
        continue;
      }

      cells.push({
        profileId,
        fixerId,
        status: 'nepokriveno',
        reason: uncoveredReason(fixerRows.length, gated.has(fixerId), loop, fixerId, resolved, profileId),
      });
    }
  }

  return { cells, summary: summarize(cells) };
}

function uncoveredReason(
  ruleCount: number,
  isGated: boolean,
  loop: ClosedLoopRow | undefined,
  fixerId: string,
  profile: Record<string, unknown> | null,
  profileId: string,
): UncoveredReason {
  // Alat kojem je zadani odabir prazan po konstrukciji: nijedna os ga ne moze dokazati.
  if (UNDECIDABLE_FIXERS.has(fixerId)) return 'ceka-ljudski-odabir';
  // Profil koji os ne propisuje: fixer se za njega uopce ne nudi, pa se nema sto dokazivati.
  const gate = PROFILE_GATE[fixerId];
  if (gate && profile && !gate(profile)) return 'profil-ne-propisuje-os';
  // Asistirano pravilo bez kojeg graditelj radi tvrdi `return []`: bez njega se fixer ne nudi
  // ni kao preporuka, pa se za taj profil nema sto dokazivati.
  const ruleCheckId = ASSISTED_RULE_GATE[fixerId];
  if (ruleCheckId && profileId && !hasAssistedRule(profileId, ruleCheckId)) return 'profil-ne-propisuje-os';
  // Os koju generator NIJE prekrsio za ovaj profil nije "bez dokaza" nego neprimjenjiva: generator
  // krsi samo ono sto profil propisuje. Bez ove grane je 325 celija `toc-field-fixera` (407 minus
  // 83 profila s `requireToc`) nosilo krivu dijagnozu.
  const axis = AXIS_BY_FIXER[fixerId];
  if (axis && loop && !loop.violated.includes(axis)) return 'profil-ne-propisuje-os';
  if (ruleCount === 0) return isGated ? 'profil-ne-propisuje-os' : 'univerzalna-higijena-bez-dokaza';
  // Profil os propisuje. Je li ju closed-loop pokusao i nije uspio, ili ju nikad nije dotaknuo?
  if (loop && loop.axesRemaining.length > 0) return 'closed-loop-nije-rijesio';
  return 'nema-dokaza';
}

function summarize(cells: CoverageCell[]): CoverageCellReport['summary'] {
  const byReason: Record<UncoveredReason, number> = {
    'profil-ne-propisuje-os': 0,
    'univerzalna-higijena-bez-dokaza': 0,
    'closed-loop-nije-rijesio': 0,
    'nema-dokaza': 0,
    'ceka-ljudski-odabir': 0,
  };
  let covered = 0;
  let resolved = 0;
  for (const cell of cells) {
    if (cell.status === 'pokriveno') {
      covered += 1;
      if (cell.evidence.strength === 'resolved') resolved += 1;
    } else {
      byReason[cell.reason] += 1;
    }
  }
  return {
    cellCount: cells.length,
    coveredCount: covered,
    uncoveredCount: cells.length - covered,
    resolvedCount: resolved,
    byReason,
  };
}
