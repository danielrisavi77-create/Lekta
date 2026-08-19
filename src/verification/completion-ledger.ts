/**
 * Completion ledger: JEDAN redak po (profil, vrsta rada), sest ortogonalnih osi, jedna izvedena
 * javna tvrdnja. P0-3 u docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 * Zasto postoji: danas devet generiranih izvjestaja opisuje isti sustav iz razlicitih kuteva
 * (`scored-coverage`, `faculty-matrix`, `repair-coverage`, `repair-real-corpus`, dosjei,
 * citatni dosjei, `institutional-coverage-matrix`, `repair-recipe`, `real-corpus-backlog`).
 * Nijedan sam ne odgovara na jedino pitanje koje kupca zanima: "je li MOJ studij, MOJA vrsta
 * rada, dokazano pokrivena i do koje razine". Brojka "1752 od 1752 opcija mapirano" zvuci kao
 * 100% gotovo, a znaci samo da svaka PONUDJENA opcija ima fixer; ovdje postaje jedna celija
 * jedne osi i vise ne moze glumiti dovrsenost.
 *
 * Ledger NISTA ne mjeri sam: on SPAJA vec generirane, drift-gardirane artefakte i iz njih izvodi
 * tvrdnju. Ako neki ulaz zastari, past ce njegov vlastiti gard, ne ovaj.
 *
 * Sto ledger NE radi: ne pretpostavlja. Nepoznato je `missing` ili `unknown`, nikad `generic`.
 * Danas nijedan redak ne moze imati `program: 'official'`, jer sinkronizacija sa sluzbenim
 * Upisnikom jos ne postoji (faza P1); postojeci zapisi o programima izvedeni su iz stranica
 * fakulteta, pa su posteno `derived`.
 */
import type { WorkType } from '../profiles/profile-schema';

/** Odakle znamo da program postoji: `official` = sluzbeni Upisnik (jos nedostupno, faza P1). */
export type ProgramAxis = 'official' | 'derived' | 'missing' | 'unsupported';
/** Stanje bodovanih pravila profila. */
export type RulesAxis = 'verified' | 'bulk-pending' | 'advisory-only' | 'none';
/** Doseg automatskog popravka za taj profil. */
export type RepairAxis = 'faculty-specific' | 'universal-hygiene' | 'manual-only';
/** Najjaci dokaz da popravak stvarno radi na dokumentu. */
export type ProofAxis = 'real-docx-pass' | 'synthetic-pass' | 'review' | 'not-run';
/** Vjernost pomocnog sadrzaja (naslovnica, citatni spec, izjava). */
export type AssetAxis = 'exact-official' | 'exact-derived' | 'reused' | 'generic' | 'unknown';
/** Razina javne tvrdnje; vidi CLAIM_LADDER. */
export type ClaimLevel = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Ljestvica tvrdnji. Namjerno je vodjena osima RULES -> REPAIR -> PROOF, a NE osi programa:
 * "program nije evidentiran" ne znaci da je profil los, nego da nasa nacionalna matrica ima
 * rupu. Ta rupa blokira GLOBALNU tvrdnju ("svaki rad u Hrvatskoj"), sto ledger biljezi zasebno
 * kroz `programGap` i `nationalClaimBlockers`, a ne kroz degradaciju svakog pojedinog profila.
 */
export const CLAIM_LADDER: Record<ClaimLevel, string> = {
  A: 'provjereno i popravljano prema sluzbenim uputama, dokazano na stvarnom radu',
  B: 'provjerava i popravlja prema sluzbenim uputama (dokazano na generiranom dokumentu)',
  C: 'ima sluzbena pravila i automatski popravak, ali popravak jos nije dokazan na dokumentu',
  D: 'provjerava prema sluzbenim uputama; automatski popravak pokriva samo opcu higijenu dokumenta',
  E: 'nema bodovanih pravila iz sluzbenog izvora',
};

export interface LedgerRow {
  profileId: string | null;
  unitId: string | null;
  workType: WorkType | null;
  /** Id-jevi programa iz institucijske matrice koji ocekuju ovaj profil. */
  programIds: string[];
  program: ProgramAxis;
  rules: RulesAxis;
  repair: RepairAxis;
  proof: ProofAxis;
  assets: AssetAxis;
  claim: ClaimLevel;
  /**
   * Doslovna formulacija koju smijemo pokazati za ovaj redak, prepisana iz CLAIM_LADDER.
   * Zivi u artefaktu NAMJERNO: generator javne stranice tako mora PREPISATI tvrdnju iz ledgera
   * umjesto da je sroci sam. Copy koji nastane u generatoru ne prolazi kroz nijednu os i upravo
   * je tako nastala tvrdnja "potpuno pokriveno" za profile kojima popravak nije ni pokrenut.
   */
  claimLabel: string;
  /** Pojedinacni statusi pomocnih sadrzaja; `assets` je njihov najslabiji clan. */
  assetDetail: { titlePage: AssetAxis; citation: AssetAxis; declaration: AssetAxis };
  /** Mjerljive potkrepe za osi (brojevi, ne prosudba). */
  evidence: {
    scoredMachineCheckable: number;
    scoredTotal: number;
    bulkPending: number;
    offeredRepairOptions: number;
    facultySpecificRepairOptions: number;
    realDocxSamples: number;
  };
  /** Zasto redak nije na visoj razini; prazno samo za A. */
  blockedReasons: string[];
}

export interface LedgerSummary {
  rowCount: number;
  profileCount: number;
  byProgram: Record<ProgramAxis, number>;
  byRules: Record<RulesAxis, number>;
  byRepair: Record<RepairAxis, number>;
  byProof: Record<ProofAxis, number>;
  /**
   * `assets` je NAJSLABIJI clan svoje tri podosi, pa dok je `data/declarations/declarations.json`
   * prazan, cijela os pada na `generic` za svaki redak. Bez razlaganja bi to sakrilo da su
   * naslovnice zapravo dobro pokrivene, a da rupa lezi iskljucivo u izjavama.
   */
  byAssets: Record<AssetAxis, number>;
  byTitlePage: Record<AssetAxis, number>;
  byCitation: Record<AssetAxis, number>;
  byDeclaration: Record<AssetAxis, number>;
  byClaim: Record<ClaimLevel, number>;
  /** Redci bez evidentiranog programa: blokiraju nacionalnu tvrdnju. */
  programGaps: number;
  /** Programi iz institucijske matrice koji nemaju nijedan profil. */
  programsWithoutProfile: string[];
  /** Ako nije prazno, tvrdnja "svaki akademski rad u Hrvatskoj" je NO-GO. */
  nationalClaimBlockers: string[];
}

export interface CompletionLedger {
  schemaVersion: number;
  rows: LedgerRow[];
  summary: LedgerSummary;
}

// --- oblici ulaznih artefakata (samo polja koja ledger stvarno cita) ---

export interface MatrixProfileInput {
  profileId: string;
  workTypes: string[];
  offeredOptionCount: number;
  realDocxSampleCount: number;
  automaticTests: { realCorpus: string; syntheticClosedLoop: string };
}
export interface MatrixFacultyInput {
  unitId: string;
  profiles: MatrixProfileInput[];
}
export interface CoverageCellInput {
  profileId: string;
  scoredMachineCheckable: number;
  scoredTotal: number;
}
export interface WorklistRowInput {
  profileId: string;
  bulk: number;
}
export interface RepairRowInput {
  profileId: string;
  recommended: boolean;
}
/** Zapis iz `data/programs/program-registry.json` (P1-1). */
export interface ProgramInput {
  id: string;
  componentId: string;
  name: string;
  expectedWorkTypes?: string[];
  expectedProfileIds: string[];
  unsupportedReason?: string | null;
  provenance: { kind: string };
}

/**
 * `pending-port` znaci "jos nismo stigli" i zato NE oslobadja od obveze: takav program i dalje
 * treba profil. Ostali razlozi znace da profil nikad nece ni trebati.
 */
const OUT_OF_SCOPE_REASONS = new Set(['external-institution', 'no-written-thesis', 'program-discontinued']);
export interface TitleTemplateInput {
  unitId: string;
  level: string | null;
  provenance: { status: string };
}
export interface CitationSpecInput {
  facultyId: string;
}
export interface DeclarationInput {
  unitId: string;
  level: string | null;
  provenance: { status: string };
}

/** Profil iz REGISTRA (autoritativan popis); ledger se vodi po njemu, ne po izvjestajima. */
export interface RegistryProfileInput {
  id: string;
  unitId?: string | null;
  workTypes?: string[];
}

export interface LedgerInputs {
  /**
   * Autoritativan popis profila. Ledger se NE smije voditi po `faculties` (fakultetskoj matrici):
   * ona pokriva 407 verificiranih profila, ali NE i 3 katedarska profila iz
   * `data/profiles/legal-departments.json`, koji ipak nose po 6 bodovanih pravila i uredan
   * coverage redak. Da je matrica bila pokretac, ledger bi tiho izgubio tri profila - tocno onaj
   * obrazac zbog kojeg ledger uopce postoji.
   */
  registryProfiles: RegistryProfileInput[];
  faculties: MatrixFacultyInput[];
  coverageCells: CoverageCellInput[];
  worklistRows: WorklistRowInput[];
  repairRows: RepairRowInput[];
  programs: ProgramInput[];
  titleTemplates: TitleTemplateInput[];
  citationSpecs: CitationSpecInput[];
  declarations: DeclarationInput[];
}

const ASSET_ORDER: AssetAxis[] = ['exact-official', 'exact-derived', 'reused', 'generic', 'unknown'];

/** Najslabiji clan (najdalje u ASSET_ORDER) odredjuje zbirnu ocjenu pomocnog sadrzaja. */
function weakestAsset(values: AssetAxis[]): AssetAxis {
  let worst: AssetAxis = 'exact-official';
  for (const v of values) {
    if (ASSET_ORDER.indexOf(v) > ASSET_ORDER.indexOf(worst)) worst = v;
  }
  return worst;
}

function titlePageAsset(
  unitId: string | null,
  workType: string | null,
  byUnit: Map<string, TitleTemplateInput[]>,
): AssetAxis {
  const templates = unitId == null ? [] : (byUnit.get(unitId) ?? []);
  if (!templates.length) return 'generic';
  // Tocan pogodak: predlozak te jedinice i te razine (ili predlozak bez razine, koji vrijedi za sve).
  const exact = templates.filter((t) => t.level === workType || t.level == null);
  if (exact.length) {
    return exact.some((t) => t.provenance.status === 'official') ? 'exact-official' : 'exact-derived';
  }
  // Predlozak jedinice postoji, ali za drugu vrstu rada: koristan, ali NIJE obecanje tocnosti.
  return 'reused';
}

/**
 * Izvodi razinu tvrdnje i, sto je vaznije, popis razloga zasto nije visa. Razlozi su dio ugovora:
 * bez njih se ledger cita kao ocjena, a treba se citati kao dokazni trag.
 */
function deriveClaim(
  rules: RulesAxis,
  repair: RepairAxis,
  proof: ProofAxis,
): { claim: ClaimLevel; blockedReasons: string[] } {
  const reasons: string[] = [];

  if (rules === 'none') return { claim: 'E', blockedReasons: ['nema staging pravila za profil'] };
  if (rules === 'advisory-only') {
    return { claim: 'E', blockedReasons: ['pravila postoje, ali nijedno nije bodovano (izvor ili verifikacija nedostaju)'] };
  }

  if (repair !== 'faculty-specific') {
    reasons.push(
      repair === 'manual-only'
        ? 'nijedna repair opcija nije ponudjena za ovaj profil'
        : 'ponudjen je samo popravak opce higijene, bez fakultetskog zahtjeva',
    );
    return { claim: 'D', blockedReasons: reasons };
  }

  if (rules === 'bulk-pending') reasons.push('dio bodovanih pravila jos ceka pojedinacni ljudski audit');

  if (proof === 'real-docx-pass' && !reasons.length) return { claim: 'A', blockedReasons: [] };
  if (proof === 'synthetic-pass' && !reasons.length) {
    return { claim: 'B', blockedReasons: ['nema dokaza na stvarnom studentskom radu'] };
  }

  if (proof === 'review') reasons.push('stvarni dokument je popravljen, ali ishod jos trazi rucni pregled');
  else if (proof === 'not-run') reasons.push('popravak nije izveden ni na jednom dokumentu (ni sintetickom)');
  else if (proof === 'real-docx-pass' || proof === 'synthetic-pass') {
    reasons.push('dokaz postoji, ali pravila jos nisu potpuno ljudski potvrdjena');
  }
  return { claim: 'C', blockedReasons: reasons };
}

function emptyCount<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** Gradi ledger iz vec generiranih artefakata. Cista funkcija: bez fs, bez mreze, bez vremena. */
export function buildCompletionLedger(inputs: LedgerInputs): CompletionLedger {
  const coverageByProfile = new Map(inputs.coverageCells.map((c) => [c.profileId, c]));
  const bulkByProfile = new Map(inputs.worklistRows.map((r) => [r.profileId, r.bulk]));

  const repairByProfile = new Map<string, { total: number; facultySpecific: number }>();
  for (const row of inputs.repairRows) {
    const acc = repairByProfile.get(row.profileId) ?? { total: 0, facultySpecific: 0 };
    acc.total += 1;
    if (row.recommended === false) acc.facultySpecific += 1;
    repairByProfile.set(row.profileId, acc);
  }

  const programsByProfile = new Map<string, ProgramInput[]>();
  for (const program of inputs.programs) {
    for (const profileId of program.expectedProfileIds ?? []) {
      const acc = programsByProfile.get(profileId) ?? [];
      acc.push(program);
      programsByProfile.set(profileId, acc);
    }
  }

  const titlesByUnit = new Map<string, TitleTemplateInput[]>();
  for (const t of inputs.titleTemplates) {
    const acc = titlesByUnit.get(t.unitId) ?? [];
    acc.push(t);
    titlesByUnit.set(t.unitId, acc);
  }

  const citationUnits = new Set(inputs.citationSpecs.map((s) => s.facultyId));
  const declarationsByUnit = new Map<string, DeclarationInput[]>();
  for (const d of inputs.declarations) {
    const acc = declarationsByUnit.get(d.unitId) ?? [];
    acc.push(d);
    declarationsByUnit.set(d.unitId, acc);
  }

  // Podaci iz fakultetske matrice, kljucani po profilu; profil kojeg matrica ne pokriva prolazi
  // dalje s nultim dokazom i izricitim razlogom, a ne nestaje iz ledgera.
  const matrixByProfile = new Map<string, { unitId: string; profile: MatrixProfileInput }>();
  for (const faculty of inputs.faculties) {
    for (const p of faculty.profiles) matrixByProfile.set(p.profileId, { unitId: faculty.unitId, profile: p });
  }

  const rows: LedgerRow[] = [];

  {
    for (const registryProfile of inputs.registryProfiles) {
      const matrix = matrixByProfile.get(registryProfile.id);
      const faculty = { unitId: matrix?.unitId ?? registryProfile.unitId ?? null };
      const profile: MatrixProfileInput = matrix?.profile ?? {
        profileId: registryProfile.id,
        workTypes: registryProfile.workTypes ?? [],
        offeredOptionCount: 0,
        realDocxSampleCount: 0,
        automaticTests: { realCorpus: 'not-run', syntheticClosedLoop: 'not-run' },
      };
      const cover = coverageByProfile.get(profile.profileId);
      const bulk = bulkByProfile.get(profile.profileId) ?? 0;
      const repairCounts = repairByProfile.get(profile.profileId) ?? { total: 0, facultySpecific: 0 };
      const programs = programsByProfile.get(profile.profileId) ?? [];

      const rules: RulesAxis =
        cover == null ? 'none' : cover.scoredTotal === 0 ? 'advisory-only' : bulk > 0 ? 'bulk-pending' : 'verified';

      const repair: RepairAxis =
        repairCounts.total === 0
          ? 'manual-only'
          : repairCounts.facultySpecific > 0
            ? 'faculty-specific'
            : 'universal-hygiene';

      const proof: ProofAxis =
        profile.automaticTests.syntheticClosedLoop === 'pass'
          ? 'synthetic-pass'
          : profile.automaticTests.realCorpus === 'pass'
            ? 'real-docx-pass'
            : profile.automaticTests.realCorpus === 'review'
              ? 'review'
              : 'not-run';

      // `official` smije doci ISKLJUCIVO iz sluzbenog Upisnika; zapis sa stranice fakulteta je
      // vjerodostojan, ali nije nacionalni registar, pa ostaje `derived`.
      const program: ProgramAxis = !programs.length
        ? 'missing'
        : programs.some((p) => p.provenance.kind === 'upisnik')
          ? 'official'
          : programs.every((p) => p.unsupportedReason != null && OUT_OF_SCOPE_REASONS.has(p.unsupportedReason))
            ? 'unsupported'
            : 'derived';

      for (const workType of profile.workTypes.length ? profile.workTypes : [null]) {
        const titlePage = titlePageAsset(faculty.unitId, workType, titlesByUnit);
        // Granularnost je danas FAKULTETSKA: verificiran spec vrijedi za cijelu jedinicu, ne za
        // pojedini studij ni vrstu rada. To je i dalje sluzbeni izvor, pa `exact-official` nije
        // pretjerivanje; P6-2 vezuje spec na profil, pa ce tada profil pokriven samo fakultetskim
        // zadanim specom pasti na `reused` i razlika ce postati mjerljiva.
        const citation: AssetAxis =
          faculty.unitId != null && citationUnits.has(faculty.unitId) ? 'exact-official' : 'generic';
        const declarationRecords =
          faculty.unitId == null ? [] : (declarationsByUnit.get(faculty.unitId) ?? []);
        const declaration: AssetAxis = declarationRecords.length
          ? declarationRecords.some((d) => d.provenance.status === 'official')
            ? 'exact-official'
            : 'exact-derived'
          : 'generic';

        const { claim, blockedReasons } = deriveClaim(rules, repair, proof);
        if (!matrix) {
          blockedReasons.push('profil nije u fakultetskoj matrici, pa za njega nema automatskih testova');
        }
        if (faculty.unitId == null) {
          blockedReasons.push('profil nema jedinicu u registru, pa se pomocni sadrzaji ne mogu vezati');
        }

        rows.push({
          profileId: profile.profileId,
          unitId: faculty.unitId,
          workType: workType as WorkType | null,
          programIds: programs.map((p) => p.id),
          program,
          rules,
          repair,
          proof,
          assets: weakestAsset([titlePage, citation, declaration]),
          claim,
          claimLabel: CLAIM_LADDER[claim],
          assetDetail: { titlePage, citation, declaration },
          evidence: {
            scoredMachineCheckable: cover?.scoredMachineCheckable ?? 0,
            scoredTotal: cover?.scoredTotal ?? 0,
            bulkPending: bulk,
            offeredRepairOptions: profile.offeredOptionCount,
            facultySpecificRepairOptions: repairCounts.facultySpecific,
            realDocxSamples: profile.realDocxSampleCount,
          },
          blockedReasons,
        });
      }
    }
  }

  /**
   * Evidentiran program koji NEMA nijedan profil takodjer dobiva redak. Bez toga bi postojao samo
   * u sazetku, pa ga nijedan prikaz po retku (ni UI ni CI izvjestaj) ne bi vidio - a to je tocno
   * ona rupa koju repozitorij vec sam biljezi praznim `expectedProfileIds`.
   */
  for (const program of inputs.programs) {
    if ((program.expectedProfileIds ?? []).length) continue;
    for (const workType of program.expectedWorkTypes?.length ? program.expectedWorkTypes : [null]) {
      rows.push({
        profileId: null,
        unitId: program.componentId,
        workType: workType as WorkType | null,
        programIds: [program.id],
        program:
          program.provenance.kind === 'upisnik'
            ? 'official'
            : program.unsupportedReason != null && OUT_OF_SCOPE_REASONS.has(program.unsupportedReason)
              ? 'unsupported'
              : 'derived',
        rules: 'none',
        repair: 'manual-only',
        proof: 'not-run',
        assets: 'unknown',
        claim: 'E',
        claimLabel: CLAIM_LADDER.E,
        assetDetail: { titlePage: 'unknown', citation: 'unknown', declaration: 'unknown' },
        evidence: {
          scoredMachineCheckable: 0,
          scoredTotal: 0,
          bulkPending: 0,
          offeredRepairOptions: 0,
          facultySpecificRepairOptions: 0,
          realDocxSamples: 0,
        },
        blockedReasons: [`program "${program.name}" je evidentiran, ali nema nijedan profil`],
      });
    }
  }

  rows.sort((a, b) => {
    const byProfile = String(a.profileId).localeCompare(String(b.profileId));
    return byProfile !== 0 ? byProfile : String(a.workType).localeCompare(String(b.workType));
  });

  const programsWithoutProfile = inputs.programs
    .filter((p) => !(p.expectedProfileIds ?? []).length)
    .map((p) => `${p.componentId}: ${p.name}`)
    .sort();

  const summary: LedgerSummary = {
    rowCount: rows.length,
    profileCount: new Set(rows.map((r) => r.profileId).filter((id) => id != null)).size,
    byProgram: emptyCount(['official', 'derived', 'missing', 'unsupported'] as const),
    byRules: emptyCount(['verified', 'bulk-pending', 'advisory-only', 'none'] as const),
    byRepair: emptyCount(['faculty-specific', 'universal-hygiene', 'manual-only'] as const),
    byProof: emptyCount(['real-docx-pass', 'synthetic-pass', 'review', 'not-run'] as const),
    byAssets: emptyCount(ASSET_ORDER),
    byTitlePage: emptyCount(ASSET_ORDER),
    byCitation: emptyCount(ASSET_ORDER),
    byDeclaration: emptyCount(ASSET_ORDER),
    byClaim: emptyCount(['A', 'B', 'C', 'D', 'E'] as const),
    programGaps: 0,
    programsWithoutProfile,
    nationalClaimBlockers: [],
  };
  for (const row of rows) {
    summary.byProgram[row.program] += 1;
    summary.byRules[row.rules] += 1;
    summary.byRepair[row.repair] += 1;
    summary.byProof[row.proof] += 1;
    summary.byAssets[row.assets] += 1;
    summary.byTitlePage[row.assetDetail.titlePage] += 1;
    summary.byCitation[row.assetDetail.citation] += 1;
    summary.byDeclaration[row.assetDetail.declaration] += 1;
    summary.byClaim[row.claim] += 1;
    if (row.program === 'missing') summary.programGaps += 1;
  }

  if (summary.programGaps) {
    summary.nationalClaimBlockers.push(
      `${summary.programGaps} redaka nema evidentiran studijski program (sluzbeni Upisnik jos nije sinkroniziran)`,
    );
  }
  if (programsWithoutProfile.length) {
    summary.nationalClaimBlockers.push(
      `${programsWithoutProfile.length} evidentiranih programa nema nijedan profil: ${programsWithoutProfile.join('; ')}`,
    );
  }
  const unproven = summary.byClaim.C + summary.byClaim.D + summary.byClaim.E;
  if (unproven) {
    summary.nationalClaimBlockers.push(
      `${unproven} redaka nije na razini A ili B (popravak nije dokazan na dokumentu)`,
    );
  }

  return { schemaVersion: 1, rows, summary };
}
