/**
 * MUTACIJSKO TESTIRANJE VERIFIKACIJSKIH VRATA.
 *
 * Zasto postoji: svaki gard u ovom lancu tvrdi da nesto hvata, ali sama ta tvrdnja nije provjerena
 * nicim. Gard koji ne grize je gori od nikakvog, jer daje zeleno i zaustavlja daljnje traganje. Ovaj
 * test podmece POZNATE kvarove i trazi da ih gard prijavi. Ishod je jedna brojka koja zamjenjuje
 * rucni pregled: "N od N mutacija uhvaceno".
 *
 * Da to nije teorijski strah, izmjereno je vise puta u ovom projektu:
 *  - `paper-size` izvod je IGNORIRAO vrijednost i uvijek trazio A4, pa bi se tvrdnja `A3` "izvela"
 *    iz citata o A4; gard je izgledao zdravo dok se nije podmetnula kriva vrijednost.
 *  - `audit_scored_quotes` nije prijavio citat s pokrivanjem 0,21 (prag 0,85), jer ga je
 *    `has_scanned_pages` proglasio neprovjerivim. Drugi prolaz ISTIM alatom bi ga opet propustio.
 *  - `tests/rule-compiler.test.ts` godinu dana usporedjuje `clone(rules)` s `rules` nad registrom
 *    bez ijednog `ruleEntry`: prolazi vakuumski.
 *
 * PRAVILA OVOG TESTA:
 *  1. Mutira se SAMO u memoriji. Nijedna datoteka na disku se ne dira.
 *  2. Svaka mutacija ima i BASELINE tvrdnju: nemutiran ulaz mora biti cist. Bez toga mutacija koja
 *     "prolazi" moze prolaziti zato sto gard vristi na sve, a ne zato sto je pogodio.
 *  3. Mutacija imenuje STVARAN kvar koji imitira, ne izmisljen.
 */
import { describe, it, expect } from 'vitest';
import {
  SVA_STANJA, SVI_DOGADAJI, transition,
  type WizardEvent, type WizardState,
} from '../src/ui/wizard-machine';
import { countsAsRealDocxProof, type EvidenceManifest, type ProofMethod } from '../src/corpus/evidence-manifest';
import {
  DOCX_SHAPE_IDS,
  verifyRepairRoundTrip,
  verifyShapeClaims,
  type DocxShapeCounts,
} from '../src/corpus/docx-shapes';
import { aggregateByFixer, deadFixers, type DocumentMeasurement } from '../scripts/corpus-gen/net-core.mts';
import { uncoveredReason } from './helpers/coverage-cells';
import { verifyOutputProofs } from '../scripts/corpus-gen/mutations.mts';
import { classifyOutcome, comparisonIsVacuous, divergentRows, type ComparisonRow } from '../src/corpus/tool-comparison';
import { isSupported, renderDefectFragment, type DefectClass } from '../src/corpus/tool-feedback';
import { renderEvalCases, type EvalClass } from '../src/corpus/tool-evals';
import extractionIndex from '../data/tools/citation-specs/extractions/INDEX.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runVerificationGate, isRuleScored } from '../src/verification/verification-gate';
import { findScoredValueFindings, sameRuleValue } from '../src/verification/scored-value-binding';
import { buildExactEvidence } from '../src/ui/results/exact-evidence';
import { hasNaiveEntryGuard } from './helpers/entry-guard';
import { buildScoredValueDrift } from '../src/verification/scored-value-drift';
import { computeCoverageCell } from '../src/verification/coverage-report';
import { collectCompileDiagnostics, compileEffectiveRules } from '../src/profiles/rule-compiler';
import { computeBaseDemotedAdvisory, computeDemotedAdvisory } from '../src/profiles/advisory-demotion';
import { demotionProtectedBy } from '../src/profiles/advisory-levers';
import { DRAFT_PROFILE_IDS, draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { DEMOTABLE_CHECK_IDS } from '../src/profiles/advisory-levers';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { checkSourceHashes } from '../scripts/verify-source-hashes.mjs';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';
import { sidecarAdmitted } from './real-corpus/corpus-track';
import { assertAxisEvidenceWiring, AXIS_SIGNAL } from './helpers/closed-loop-wiring';
import { APPLIED_AXIS_FIXER } from './helpers/coverage-cells';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
const NOW = '2026-06-30';
/** Stvaran, snapshotiran izvor sa sha256 (isti koji koriste ostali verifikacijski testovi). */
const REAL_SOURCE_ID = 'pravo-upute-oblikovanje-2024';
const REAL_SOURCE = SOURCES.find((s) => s.id === REAL_SOURCE_ID)!;

/**
 * Profil na kojem se vjezba demotija zbog raskoraka.
 *
 * Do 2026-08-24 se uzimao iz artefakta, jer je izmisljen profil davao vakuumsku tvrdnju. Tog dana je
 * broj raskoraka pao na NULU (svih 37 presudjeno), pa artefakt vise nema nijedan profil i tvrdnja bi
 * se opet ispraznila, samo tise. Zato se raskorak sada PODMECE (`computeDemotedAdvisory` prima skup
 * za testove), a profil je stvaran i ima bodovanu tvrdnju za tu os - bez toga base i puna verzija
 * vracaju isto pa se zamjena base -> puna u generatoru ne bi vidjela.
 */
const DEMOTION_FIXTURE = (() => {
  for (const id of DRAFT_PROFILE_IDS) {
    const entries = draftRuleEntriesFor(id);
    if (!entries.length) continue;
    const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
    const axis = DEMOTABLE_CHECK_IDS.find(
      (checkId) => !base.includes(checkId) && entries.some((e) => e.checkId === checkId && isRuleScored(e)),
    );
    if (axis) return { id, axis };
  }
  throw new Error('Nema profila s bodovanom demotabilnom osi: tvrdnja o demotiji bi bila prazna.');
})();

/** Potpuno valjana bodovana tvrdnja. Sve mutacije kvare TOCNO JEDNU stvar na njoj. */
function goodEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    authority: 'general',
    sourceId: REAL_SOURCE_ID,
    sourcePage: 'odjeljak 4',
    quote: 'font: Times New Roman',
    status: 'verified',
    scored: true,
    lastVerified: '2026-06-29',
    modality: 'directive',
    scope: 'body',
    modalitySource: 'mechanical',
    ...over,
  };
}

function profileWith(entry: RuleEntry, rules: Record<string, unknown> = { font: ['Times New Roman'] }): ThesisProfile {
  return { id: 'mut-profil', rules, ruleEntries: [entry] } as ThesisProfile;
}

function gateCodes(profile: ThesisProfile, sources: SourceEntry[] = SOURCES): string[] {
  return runVerificationGate([profile], sources, { now: NOW }).map((e) => e.code);
}

/**
 * Jedna mutacija: sto kvari, koji stvaran kvar imitira, i kako se mjeri da je uhvacena.
 * `baseline` mora biti PRAZAN/false na nemutiranom ulazu, inace tvrdnja nije o mutaciji.
 */
interface Mutation {
  id: string;
  /** Os koju mutacija vjezba; sluzi tvrdnji da `readAxis` nije pokriven samo na jednoj osi. */
  axis?: string;
  imitates: string;
  caught: () => boolean;
  cleanBefore: () => boolean;
}

/** Potpisana metoda: dva neovisna orakula. Bez nje nijedan dokument nije dokaz, i to je namjerno. */
const PROOF_METHOD: ProofMethod = {
  signedBy: 'Daniel',
  signedAt: '2026-08-31T08:00:00.000Z',
  oracles: ['scripts/corpus-oracle.py (python-docx)', 'scripts/word-verify (Word COM)'],
};

/** Uredan manifest dokaza, uz podesiv trenutak zapisa ocekivanja (run je uvijek u 10:00). */
function manifestWithRecordedAt(recordedAt: string): EvidenceManifest {
  return {
    expected: {
      findings: [{ checkId: 'page.margins', expectFail: true }],
      recordedAt,
      recordedBy: 'Daniel',
    },
    visualReview: { reviewedAt: '2026-08-30T11:00:00.000Z', reviewedBy: 'Daniel', verdict: 'slaze-se' },
    runs: ['2026-08-30T10:00:00.000Z'],
  };
}

/** Zbroj `citedBackfilled` iz INDEX.json; `force` podmece vrijednost i vjezba mutaciju. */
function backfillTotal(force?: number): number {
  const rows = extractionIndex as unknown as Array<{ citedBackfilled?: number }>;
  return rows.reduce((a, r) => a + (force ?? r.citedBackfilled ?? 0), 0);
}

/**
 * DOKAZNA LUPA: nalaz + pravilo, za mutaciju mosta medju imenskim prostorima.
 * `checkId` na nalazu zivi u prostoru dimenzija, na pravilu u autorskom (`*-rules`).
 */
function evidenceFor(ruleCheckId: string, checkId: string, title: string, category: string): number {
  const issue = { severity: 'warning', category, title, detail: '', where: 'x' } as never;
  const check = { id: checkId, category, title, status: 'warn', earned: 0, max: 4, detail: '', issue, scored: true } as never;
  const entry = {
    ruleId: `mut--${ruleCheckId}`, checkId: ruleCheckId, sourceId: 's', status: 'verified',
    quote: 'Doslovan navod iz sluzbene upute.', sourcePage: 'str. 1',
    source: { id: 's', title: 'Upute', url: 'https://example.test/u.pdf' },
  } as never;
  return Object.keys(buildExactEvidence([check], [issue], [entry])).length;
}

const MUTATIONS: Mutation[] = [
  // --- sekcija 6 VERIFICATION_PIPELINE.md: bodovano pravilo ne smije lagati o izvoru -------------
  {
    id: 'gate/bez-sourcePage',
    imitates: 'pravilo koje boduje, a lokator u izvoru nikad nije potvrden (CLAUDE.md: sourcePage ostaje null, ne nagada se)',
    caught: () => gateCodes(profileWith(goodEntry({ sourcePage: null }))).includes('scored-no-page'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/bez-citata',
    imitates: 'bodovano pravilo bez doslovnog citata: tvrdnja koju nitko ne moze provjeriti',
    caught: () => gateCodes(profileWith(goodEntry({ quote: null }))).includes('scored-no-quote'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/izmisljen-izvor',
    imitates: 'sourceId koji ne postoji u registru (tipfeler ili izvor obrisan pod nogama)',
    caught: () => gateCodes(profileWith(goodEntry({ sourceId: 'ne-postoji-2026' }))).includes('orphan-source'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/scored-bez-uporista',
    imitates: 'rucno postavljen `scored: true` na pravilu koje ne zadovoljava izvedeni uvjet',
    caught: () =>
      gateCodes(profileWith(goodEntry({ status: 'draft' }))).includes('scored-not-derivable'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/neslužben-autoritet',
    imitates: 'bodovanje po uputi mentora (mentor-or-course nikad ne smije bodovati)',
    caught: () => gateCodes(profileWith(goodEntry({ authority: 'mentor-or-course' }))).includes('scored-authority'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/obvezujuce-bez-drugog-para-ociju',
    imitates: 'binding pravilo bez reviewedBy (sekcija 2: obvezujuce trazi drugi par ociju)',
    caught: () =>
      gateCodes(profileWith(goodEntry({ authority: 'binding', reviewedBy: null }))).includes('binding-no-review'),
    cleanBefore: () =>
      gateCodes(profileWith(goodEntry({ authority: 'binding', reviewedBy: 'Netko' }))).length === 0,
  },
  {
    id: 'gate/izvor-promijenjen-nakon-verifikacije',
    imitates: 'snapshot stabilnog izvora se promijenio nakon sto je pravilo verificirano protiv njega',
    caught: () =>
      gateCodes(profileWith(goodEntry({ verifiedHash: 'f'.repeat(64) }))).includes('source-hash-drift'),
    cleanBefore: () =>
      gateCodes(profileWith(goodEntry({ verifiedHash: REAL_SOURCE.snapshotHash }))).length === 0,
  },
  {
    id: 'gate/zastarjela-verifikacija',
    imitates: 'bodovano pravilo starije od roka valjanosti (sekcija 5: 24 mjeseca)',
    caught: () => gateCodes(profileWith(goodEntry({ lastVerified: '2020-01-01' }))).includes('stale'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/nepoznat-checkId',
    imitates: 'pravilo napisano nad checkId-em koji kompajler ne poznaje, pa tiho ne radi nista',
    caught: () =>
      collectCompileDiagnostics([profileWith(goodEntry({ checkId: 'izmisljena-os' }))]).length > 0,
    cleanBefore: () => collectCompileDiagnostics([profileWith(goodEntry())]).length === 0,
  },

  // --- vezanje bodovane vrijednosti na tvrdnju --------------------------------------------------
  {
    id: 'vezanje/motor-boduje-drugu-vrijednost',
    imitates: 'unizd-pomorski: izvor propisuje Merriweather, motor boduje Times New Roman',
    caught: () =>
      findScoredValueFindings(profileWith(goodEntry(), { font: ['Arial'] }), SOURCES).some(
        (f) => f.kind === 'drift',
      ),
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },
  // --- mehanizam mora OPALITI, ne samo postojati ------------------------------------------------
  {
    id: 'mehanizam/mrtav-kod-s-brojacem-na-nuli',
    imitates:
      'dovlacenje citata koje je citalo "[object Object]" i nista nije radilo, dok se nizvodna mjera popravljala iz drugog razloga',
    caught: () => backfillTotal(0) === 0,
    cleanBefore: () => backfillTotal() > 0,
  },
  // --- manifest dokaza: run bez ljudskog ocekivanja NIJE dokaz na stvarnom radu ----------------
  {
    id: 'dokaz/ocekivanje-zapisano-nakon-runa',
    imitates:
      'dokument koji je "prosao" na stvarnom radu, a ocekivanje je zapisano tek nakon runa, pa se s alatom nije moglo ni ne sloziti',
    caught: () => !countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T12:00:00.000Z'), PROOF_METHOD),
    cleanBefore: () => countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T09:00:00.000Z'), PROOF_METHOD),
  },
  {
    id: 'dokaz/pregled-bez-potpisa',
    imitates: 'razina A bez ijednog covjeka koji je dokument otvorio i potpisao da se slaze s onim sto alat javlja',
    caught: () => {
      const m = manifestWithRecordedAt('2026-08-30T09:00:00.000Z');
      return !countsAsRealDocxProof({ ...m, visualReview: { ...m.visualReview, reviewedBy: '' } }, PROOF_METHOD);
    },
    cleanBefore: () => countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T09:00:00.000Z'), PROOF_METHOD),
  },
  {
    id: 'vezanje/tvrdnja-se-ne-primjenjuje',
    imitates: 'pravo-*: verificirana tvrdnja postoji, a motor tu dimenziju uopce ne provjerava',
    caught: () =>
      findScoredValueFindings(profileWith(goodEntry(), {}), SOURCES).some((f) => f.kind === 'unapplied'),
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },
  {
    id: 'vezanje/bodovanje-bez-ijedne-tvrdnje',
    imitates: '14 profila koji boduju font/margine bez ijednog ruleEntry-ja',
    caught: () =>
      findScoredValueFindings({ id: 'p', rules: { font: ['Arial'] }, ruleEntries: [] } as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(),
      }).some((f) => f.kind === 'unbacked'),
    cleanBefore: () =>
      findScoredValueFindings({ id: 'p', rules: { font: ['Arial'] }, ruleEntries: [] } as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(['font']),
      }).length === 0,
  },
  {
    id: 'vezanje/skriveno-iza-zastavice',
    axis: 'font',
    imitates: 'razlika sakrivena time sto je dimenzija ugasena zastavicom, a vrijednost ostala kriva',
    // `.every()` je na praznom polju TRUE, pa bi ova tvrdnja prolazila i da gard ne vraca nista.
    // Zato se trazi OBOJE: uz ugasenu zastavicu nema nalaza, a uz upaljenu ga ima. Tek to dokazuje
    // da je razlika stvarno bila vidljiva pa je zastavica sakrila, a ne da gard sutu u oba slucaja.
    caught: () => {
      const off = findScoredValueFindings(
        profileWith(goodEntry(), { font: ['Arial'], checkFont: false }),
        SOURCES,
      );
      const on = findScoredValueFindings(profileWith(goodEntry(), { font: ['Arial'] }), SOURCES);
      return off.every((f) => f.kind !== 'drift') && on.some((f) => f.kind === 'drift');
    },
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },

  // --- D1: `readAxis` je bio vjezban SAMO na `font`, pa se 7 od 8 osi moglo tiho ugasiti --------
  {
    id: 'vezanje/paper-size-alias-nije-raskorak',
    axis: 'paper-size',
    imitates: 'tvrdnja `A4` daje `paperSizes`, zrcalo nosi `requireA4`: ista odredba, drukcije zapisana',
    caught: () =>
      // Ako `readAxis` prestane razrjesavati alias, ovo postaje lazan raskorak.
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A4' }), { requireA4: true }),
        SOURCES,
      ).length === 0,
    cleanBefore: () =>
      // Netrivijalno: ista postava s KRIVIM formatom mora dati raskorak, inace gard sutu u oba slucaja.
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { requireA4: true }),
        SOURCES,
      ).some((f) => f.kind === 'drift'),
  },
  {
    id: 'vezanje/paper-size-kriva-vrijednost',
    axis: 'paper-size',
    imitates: 'izvod koji IGNORIRA vrijednost i uvijek trazi A4 (stvaran kvar, vidi zaglavlje)',
    caught: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { paperSizes: ['A4'] }),
        SOURCES,
      ).some((f) => f.kind === 'drift' && f.checkId === 'paper-size'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { paperSizes: ['A3'] }),
        SOURCES,
      ).length === 0,
  },
  {
    id: 'vezanje/margins-minimum-mijenja-znacenje',
    axis: 'margins',
    imitates: 'forenzika-diplomski: "najmanje 2,5 cm" naspram "tocno 2,5 cm" je ista brojka, drugo pravilo',
    caught: () =>
      findScoredValueFindings(
        profileWith(
          goodEntry({ ruleId: 'r-m', checkId: 'margins', value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5, minimum: true } }),
          { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
        ),
        SOURCES,
      ).some((f) => f.kind === 'drift' && f.checkId === 'margins'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(
          goodEntry({ ruleId: 'r-m', checkId: 'margins', value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5, minimum: true } }),
          { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, marginsMinimum: true },
        ),
        SOURCES,
      ).length === 0,
  },
  {
    id: 'vezanje/justify-cita-par-zastavica-vrijednost',
    axis: 'justify',
    imitates: 'motor boduje justify samo uz `checkJustify !== false && profile.justify`',
    caught: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-j', checkId: 'justify', value: true }), { justify: true, checkJustify: false }),
        SOURCES,
      ).some((f) => f.kind === 'unapplied' && f.checkId === 'justify'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-j', checkId: 'justify', value: true }), { justify: true, checkJustify: true }),
        SOURCES,
      ).length === 0,
  },

  // --- D4: kodovi koje vrata emitiraju, a nijedna mutacija ih nije trazila -----------------------
  {
    id: 'gate/status-nije-verified',
    imitates: 'pravilo koje boduje iz statusa koji jos ceka ljudski pass (ai-confirmed)',
    caught: () => gateCodes(profileWith(goodEntry({ status: 'ai-confirmed' }))).includes('scored-not-verified'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/bez-lastVerified',
    imitates: 'bodovano pravilo bez datuma provjere: svjezina se ne moze ni izracunati',
    caught: () => gateCodes(profileWith(goodEntry({ lastVerified: null }))).includes('scored-no-lastverified'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/dopunski-izvor-promijenjen',
    imitates: 'kompozitno pravilo: DOPUNSKI sluzbeni izvor promijenjen nakon verifikacije',
    caught: () =>
      gateCodes(
        profileWith(
          goodEntry({
            additionalSources: [
              { sourceId: REAL_SOURCE_ID, sourcePage: 'str. 2', quote: 'x', verifiedHash: 'a'.repeat(64) },
            ],
          }),
        ),
      ).includes('scored-addsrc-drift'),
    cleanBefore: () =>
      gateCodes(
        profileWith(
          goodEntry({
            additionalSources: [
              { sourceId: REAL_SOURCE_ID, sourcePage: 'str. 2', quote: 'x', verifiedHash: REAL_SOURCE.snapshotHash },
            ],
          }),
        ),
      ).length === 0,
  },
  {
    id: 'gate/diagnostic-stize-do-vrata',
    imitates: 'nepoznat checkId mora postati GRESKA VRATA, ne samo dijagnostika kompajlera',
    caught: () => gateCodes(profileWith(goodEntry({ checkId: 'izmisljena-os' }))).includes('compiler-diagnostic'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },

  // --- coverage: potpisan razlog nadjacava izvedeno stanje ---------------------------------------
  {
    id: 'coverage/potpisan-razlog-se-ignorira',
    imitates: 'FER: izvor procitan i dokazano ne obvezuje, a matrica ga vodi kao zaostatak',
    caught: () =>
      computeCoverageCell(profileWith(goodEntry({ status: 'advisory', scored: false })), SOURCES, {
        'mut-profil': { state: 'advisory-by-decision' },
      }).state === 'advisory-by-decision',
    cleanBefore: () =>
      computeCoverageCell(profileWith(goodEntry({ status: 'advisory', scored: false })), SOURCES, {}).state ===
      'advisory-only',
  },

  // --- integritet snapshota ----------------------------------------------------------------------
  {
    id: 'snapshot/hash-ne-odgovara-datoteci',
    imitates: 'PDF na disku promijenjen, a registar i dalje tvrdi stari sha256',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotHash: '0'.repeat(64) }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'hash-mismatch'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },
  {
    id: 'snapshot/datoteka-nedostaje',
    imitates: 'registar upucuje na snapshot koji vise ne postoji na disku',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotPath: 'data/sources/ne/postoji.pdf' }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'missing-file'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },
  {
    id: 'snapshot/izvor-bez-hasha',
    imitates: 'izvor uveden bez sha256, pa se njegova nepromjenjivost ne moze dokazati',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotHash: null }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'no-hash'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },

  // --- demotija: ne smije se sama pobrisati ------------------------------------------------------
  {
    id: 'demotija/osnovni-izracun-ne-ovisi-o-raskoraku',
    imitates: 'gard koji preskace vec demotirane osi pa se u sljedecem krugu isprazni i kvar se vrati',
    /**
     * Prva izvedba je koristila izmisljen `mut-profil`, kojeg NEMA u `demotedByProfile`, pa su base i
     * puna verzija vracale isto i tvrdnja nije mjerila nista. Sada se uzima profil koji STVARNO ima
     * raskorak: base ga ne smije demotirati (ima bodovanu tvrdnju za tu os), puna verzija mora.
     * Zamjena base -> puna u generatoru time postaje vidljiva.
     */
    caught: () => {
      const { id, axis } = DEMOTION_FIXTURE;
      const entries = draftRuleEntriesFor(id);
      const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
      const full = computeDemotedAdvisory({ id }, entries, SOURCES, { [id]: [axis] });
      return !base.includes(axis) && full.includes(axis);
    },
    cleanBefore: () => {
      // Netrivijalnost: BEZ podmetnutog raskoraka puna verzija mora vratiti isto sto i base. Da to ne
      // stoji, gornja tvrdnja bi prolazila zato sto os pada iz nekog drugog razloga.
      const { id, axis } = DEMOTION_FIXTURE;
      const entries = draftRuleEntriesFor(id);
      const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
      const full = computeDemotedAdvisory({ id }, entries, SOURCES);
      return !base.includes(axis) && !full.includes(axis);
    },
  },
  // --- zastita od demotije: overlay katedre mora PROPISATI, ne samo spomenuti kljuc ----------------
  {
    id: 'poluge/gola-zastavica-ne-stiti',
    axis: 'font',
    imitates:
      'overlay katedre s golom zastavicom (`checkFont: true`, bez fonta) ponistava demotiju a ne ' +
      'propisuje nikakvu vrijednost, pa se dalje boduje bas ona vrijednost osnovnog profila koju ' +
      'tvrdnja s citatom opovrgava',
    caught: () => !demotionProtectedBy({ checkFont: true }).has('font'),
    // Netrivijalnost: zastita mora RADITI kad overlay stvarno nosi vrijednost, inace tvrdnja iznad
    // prolazi zato sto funkcija nikad nista ne stiti.
    cleanBefore: () => demotionProtectedBy({ font: ['Arial'] }).has('font'),
  },
  {
    id: 'poluge/ugasena-zastavica-ne-stiti',
    imitates:
      'overlay koji dimenziju GASI (`requireToc: false`) prije je stitio od demotije, pa je os ' +
      'ispadala iz advisoryDimensions i sucelje je nije oznacilo kao informativnu',
    caught: () => !demotionProtectedBy({ requireToc: false }).has('toc'),
    cleanBefore: () => demotionProtectedBy({ requireToc: true }).has('toc'),
  },
  {
    id: 'poluge/podprovjera-stiti-roditelja-stranice',
    imitates:
      'katedra propisuje polozaj broja stranice a ne i `requirePageNumbers`; otkad podprovjere vise ' +
      'o roditelju, nezasticena os bi joj tiho ugasila bas taj zahtjev (3 boda) uz nula poruka',
    caught: () => demotionProtectedBy({ pageNumberAlignment: 'right' }).has('page-numbers'),
    cleanBefore: () => !demotionProtectedBy({}).has('page-numbers'),
  },
  {
    id: 'poluge/podprovjera-stiti-roditelja-sadrzaj',
    imitates:
      'isti kvar na osi sadrzaja: `tocDetailedCheck` bez `requireToc` izgubio bi devet bodova ' +
      'podprovjera sadrzaja koje katedra izricito trazi',
    caught: () => demotionProtectedBy({ tocDetailedCheck: true }).has('toc'),
    cleanBefore: () => !demotionProtectedBy({}).has('toc'),
  },
  {
    id: 'vezanje/prazna-vrijednost-nije-bodovanje',
    axis: 'font',
    imitates:
      'profil s `font: []`: normalizeCheckFlags takvu provjeru GASI, a vezanje ju je citalo kao ' +
      'bodovanu, pa je prijavljivalo `unbacked` nad dimenzijom koju motor uopce ne gleda i time ' +
      'demotiralo os koja i tako nije bodovala',
    caught: () =>
      findScoredValueFindings({ id: 'mut-prazno', rules: { font: [] }, ruleEntries: [] } as unknown as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(),
      }).filter((f) => f.checkId === 'font').length === 0,
    cleanBefore: () =>
      findScoredValueFindings(
        { id: 'mut-puno', rules: { font: ['Times New Roman'] }, ruleEntries: [] } as unknown as ThesisProfile,
        SOURCES,
        { demotedCheckIds: new Set() },
      ).some((f) => f.checkId === 'font' && f.kind === 'unbacked'),
  },
  {
    id: 'kompajler/raspon-se-prosiruje-u-popis',
    axis: 'font-size',
    imitates:
      'tvrdnja `{min:10,max:12}` upisana u `eff.size` doslovno: motor cita `profile.size.some(...)` ' +
      'pa bi na objektu pukao cim `ruleEntries` postanu zivi, a usporedba je isti propis zapisan ' +
      'kao raspon prijavljivala kao raskorak i demotirala velicinu pisma (fbf-specijalisticki)',
    caught: () => {
      const eff = compileEffectiveRules({
        id: '_',
        rules: {},
        ruleEntries: [goodEntry({ checkId: 'font-size', value: { min: 10, max: 12 } as never })],
      } as unknown as ThesisProfile) as Record<string, unknown>;
      return Array.isArray(eff.size) && sameRuleValue(eff.size, [10, 11, 12]);
    },
    // Netrivijalnost u OBA smjera: obican popis prolazi netaknut, a raspon koji se ne smije
    // prosiriti (decimalna granica, prevelik raspon) ostaje kakav jest umjesto da se izmisli popis.
    cleanBefore: () => {
      const of = (value: unknown) =>
        (compileEffectiveRules({
          id: '_',
          rules: {},
          ruleEntries: [goodEntry({ checkId: 'font-size', value: value as never })],
        } as unknown as ThesisProfile) as Record<string, unknown>).size;
      return (
        sameRuleValue(of([11, 12]), [11, 12]) &&
        !Array.isArray(of({ min: 10.5, max: 12 })) &&
        !Array.isArray(of({ min: 1, max: 400 }))
      );
    },
  },
  // --- zid izmedju traka korpusa: `converted` nikad ne broji kao dokaz profila ----------------
  {
    id: 'korpus/converted-traka-ulazi-u-mjerenje',
    imitates:
      'docx nastao pretvorbom PDF-a udje u `discoverRealCorpus` i pocne brojati kao dokaz profila: ' +
      'matrica tada mjeri konverter (bez stilova, bez TOC polja, prored izveden iz razmaka linija), ' +
      'a ne studentov dokument, i to korelirano kroz cijeli skup pa izgleda puno i ne znaci nista',
    caught: () => !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'converted' }),
    // Netrivijalnost: isti sidecar bez trake i s dopustenom trakom MORA proci, inace bi zid
    // "hvatao" tako sto odbija sve, a mjerenje bi ostalo prazno umjesto pokvareno.
    cleanBefore: () =>
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'real' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'generated' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', synthetic: true }),
  },
  {
    id: 'korpus/authored-traka-ulazi-u-mjerenje',
    imitates:
      'dokument s NASOM prozom (traka `authored`) udje u `discoverRealCorpus` i pocne potkrepljivati ' +
      'tvrdnju "dokazano na stvarnom studentskom radu". Tekst je nas, ne studentov, pa tvrdnja postaje ' +
      'neistinita bez ijedne promjene ljestvice; uz to su sinteticke fixture izmjereno LAKSE (84,6 posto ' +
      'ciljanih provjera rijeseno naspram 39,8 posto na stvarnim radovima), pa bi ulazak proizvod ' +
      'prikazao dvostruko boljim nego jest. Drugi oblik istog kvara je kriva zastavica: sidecar koji ' +
      'kaze `synthetic: false` mora pasti na traci, inace jedan pojas nosi cijeli zid',
    caught: () =>
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored', synthetic: false }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored', synthetic: true }),
    // Netrivijalnost: dopustene trake i dalje prolaze, inace bi zid "hvatao" tako sto odbija sve.
    cleanBefore: () =>
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'real' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'generated' }),
  },
  {
    id: 'izvoz/kvar-bez-dokumenta-koji-ga-je-proizveo',
    imitates:
      'zapis o kvaru druge strane ostane u izvozu nakon sto ga mjerenje vise ne potkrepljuje, ili udje ' +
      'u njega bez ijednog dokumenta. Zeljezno pravilo ciljanog skilla glasi "nijedan kvar bez ' +
      'dokumenta koji ga je proizveo", a katalog koji nosi popravljene ili nikad izmjerene kvarove ' +
      'skuplji je od praznog: druga strana trosi vrijeme na kvar kojega nema, i pocinje sumnjati u ' +
      'ostale zapise. Zato se potkrepa RACUNA pri svakom izvozu, ne pamti uz zapis',
    caught: () => {
      const prazan: DefectClass = {
        id: 'bez-potkrepe',
        owner: 'katedra-lite',
        title: 'naslov',
        body: 'tijelo',
        output: 'izlaz',
        // Tvrdnja bez dokumenta: naredba postoji, ali nema nijednog dokumenta na kojem je izvedena.
        support: [{ kind: 'izravno', command: 'python3 nesto.py', documents: [] }],
      };
      const popravljen: DefectClass = {
        ...prazan,
        id: 'vise-nije-mjerljiv',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      // Mjerenje postoji, ali vise nema razilazenja: kvar je popravljen na drugoj strani.
      const bezRazilazenja: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 0, ishod: 'nitko' },
      ];
      const r = renderDefectFragment([prazan, popravljen], bezRazilazenja, 140);
      return (
        !isSupported(prazan, bezRazilazenja) &&
        !isSupported(popravljen, bezRazilazenja) &&
        r.numbers.length === 0 &&
        r.unsupported.length === 2
      );
    },
    // Netrivijalnost: zapis koji mjerenje POTKREPLJUJE mora izaci, inace bi gard praznio katalog.
    cleanBefore: () => {
      const potkrijepljen: DefectClass = {
        id: 'ima-potkrepu',
        owner: 'katedra-lite',
        title: 'naslov',
        body: 'tijelo',
        output: 'izlaz',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const izravni: DefectClass = {
        ...potkrijepljen,
        id: 'izmjeren-izravno',
        support: [{ kind: 'izravno', command: 'python3 nesto.py', documents: ['a.docx'] }],
      };
      const sRazilazenjem: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 20, ishod: 'samo-katedra' },
      ];
      const r = renderDefectFragment([potkrijepljen, izravni], sRazilazenjem, 140);
      return (
        isSupported(potkrijepljen, sRazilazenjem) &&
        isSupported(izravni, sRazilazenjem) &&
        r.numbers.length === 2 &&
        r.numbers[0] === 141 &&
        r.unsupported.length === 0
      );
    },
  },
  {
    id: 'eval/slucaj-nadzivi-kvar-koji-cuva',
    imitates:
      'eval slucaj ostane u skupu nakon sto je kvar koji cuva popravljen ili izbrisan iz kataloga. Takav ' +
      'slucaj i dalje PROLAZI, pa izgleda kao pokrice a ne cuva vise nista, i sljedeca regresija prodje ' +
      'ispod njega neopazeno. Isti razred kao gard s prepisanom vrijednoscu koji ostaje zelen dokazujuci ' +
      'nesto o mrtvom nizu; razlika je samo u tome sto ovaj zivi u TUDJEM repozitoriju, pa ga nas gate ' +
      'nikad vise ne bi vidio',
    caught: () => {
      const kvar: DefectClass = {
        id: 'k',
        owner: 'katedra-lite',
        title: 't',
        body: 'b',
        output: 'o',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const slucaj: EvalClass = {
        defectId: 'k',
        prompt: 'p',
        expected_output: 'e',
        expectations: ['x'],
        fixtures: ['a.docx'],
      };
      // Kvar popravljen na drugoj strani: mjerenje vise ne pokazuje razilazenje.
      const mirno: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 0, ishod: 'nitko' },
      ];
      const popravljen = renderEvalCases([slucaj], [kvar], mirno, 10);
      // Kvar izbrisan iz kataloga: slucaj vise nema sto cuvati.
      const bezKvara = renderEvalCases([slucaj], [], mirno, 10);
      return (
        popravljen.cases.length === 0 &&
        popravljen.skipped.length === 1 &&
        bezKvara.cases.length === 0 &&
        bezKvara.skipped.length === 1 &&
        popravljen.skipped[0].why !== bezKvara.skipped[0].why
      );
    },
    // Netrivijalnost: dok kvar postoji I mjerenje ga podupire, slucaj MORA izaci, s dokumentom.
    cleanBefore: () => {
      const kvar: DefectClass = {
        id: 'k',
        owner: 'katedra-lite',
        title: 't',
        body: 'b',
        output: 'o',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const slucaj: EvalClass = {
        defectId: 'k',
        prompt: 'p',
        expected_output: 'e',
        expectations: ['x'],
        fixtures: ['a.docx'],
      };
      const razilazenje: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 20, ishod: 'samo-katedra' },
      ];
      const r = renderEvalCases([slucaj], [kvar], razilazenje, 10);
      return (
        r.cases.length === 1 &&
        r.cases[0].id === 11 &&
        r.skipped.length === 0 &&
        r.fixtures.length === 1 &&
        (r.cases[0].files ?? []).length === 1
      );
    },
  },
  {
    id: 'usporedba/druga-strana-tiho-prestane-mjeriti',
    imitates:
      'usporedba dvaju alata prestane mjeriti a izgleda kao slaganje. Katedrini nalazi se izvlace iz ' +
      'polja njezina JSON izlaza (`pokrivenost.bez_izvora`, `pokrivenost.necitirani`); preimenovano ili ' +
      'premjesteno polje vraca 0, nikad gresku. Svi redci tada padnu na `nitko`, sto se cita kao "oba ' +
      'alata se slazu da je sve u redu", a znaci "jedna strana vise ne mjeri nista". Tocno taj razred ' +
      'je razlog zbog kojeg usporedba uopce postoji: vise prolaza istim alatom je slaganje, ne tocnost, ' +
      'pa usporedba koja tiho izgubi drugu stranu gubi jedino sto donosi',
    caught: () => {
      const r = (dokument: string, os: string, lekta: number, katedra: number | null): ComparisonRow => ({
        dokument,
        os,
        lekta,
        katedra,
        ishod: classifyOutcome(lekta, katedra),
      });
      // Katedrino izvlacenje promasi polje pa svugdje vrati 0; Lekta je na tim osima cista.
      const oslijepljena = [
        r('a.docx', 'citirano-bez-jedinice', 0, 0),
        r('a.docx', 'jedinica-necitirana', 0, 0),
        r('b.docx', 'citirano-bez-jedinice', 0, 0),
      ];
      // Razlikovanje od stvarnog izostanka odgovora: `null` daje vlastiti ishod, ne `nitko`.
      const bezOdgovora = [r('a.docx', 'fusnote', 0, null)];
      return (
        comparisonIsVacuous(oslijepljena) &&
        comparisonIsVacuous(bezOdgovora) &&
        oslijepljena.every((x) => x.ishod === 'nitko') &&
        bezOdgovora[0].ishod === 'katedra-nije-mjerila'
      );
    },
    // Netrivijalnost: usporedba u kojoj BILO KOJA strana nesto nadje nije vakuumska, inace bi gard
    // vristao na svaki prolaz i prestao razlikovati slijepo mjerenje od cistog dokumenta.
    cleanBefore: () => {
      const r = (lekta: number, katedra: number | null): ComparisonRow => ({
        dokument: 'a.docx',
        os: 'jedinica-necitirana',
        lekta,
        katedra,
        ishod: classifyOutcome(lekta, katedra),
      });
      const samoKatedra = [r(0, 18), r(0, 0)];
      const samoLekta = [r(1, 0), r(0, 0)];
      const oba = [r(1, 3)];
      return (
        !comparisonIsVacuous(samoKatedra) &&
        !comparisonIsVacuous(samoLekta) &&
        !comparisonIsVacuous(oba) &&
        divergentRows(samoKatedra).length === 1 &&
        divergentRows(samoLekta).length === 1 &&
        divergentRows(oba).length === 0
      );
    },
  },
  {
    id: 'mreza/fixer-se-ugasi-a-nitko-ne-primijeti',
    imitates:
      'fixer prestane raditi (zatrazen je, ali vise nista ne mijenja) i to nitko ne vidi, jer nijedan ' +
      'postojeci artefakt to ne mjeri: `closed-loop.json` je do 2026-09-09 spremao `requested` kao GOLI ' +
      'BROJ (od tada uz njega stoji i `fixersChanged`, ali `skippedReasons` i dalje odbacuje), ' +
      '`repair-real-corpus.json` ima `offeredFixerIds` bez ijednog citatelja, a ' +
      '`coverage-cells` klasificira staticki i nikad ne premjerava. Tocno taj razred je vec izmjeren: ' +
      '`empty-paragraph-fixer` je bio trajni no-op na svemu pisanom LibreOfficeom, i nasao ga je tek ' +
      'sinteticki korpus',
    caught: () => {
      const m = (dokument: string, zatrazeno: string[], promijenili: string[]): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno,
        promijenili,
        bezUcinka: zatrazeno.filter((f) => !promijenili.includes(f)).map((fixerId) => ({ fixerId, reason: 'no-target' })),
        cekaPotvrdu: [],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const ratchet = new Set(['poznato-mrtav']);
      const rows = aggregateByFixer([
        m('a.docx', ['poznato-mrtav', 'radi', 'ugasio-se'], ['radi']),
        m('b.docx', ['poznato-mrtav', 'radi', 'ugasio-se'], ['radi']),
      ]);
      const novi = deadFixers(rows).filter((f) => !ratchet.has(f));
      return novi.length === 1 && novi[0] === 'ugasio-se';
    },
    // Netrivijalnost: fixer koji radi BAREM na jednom dokumentu ne smije se prijaviti, inace bi mreza
    // "hvatala" tako sto vristi na svaki prolaz i prestala znaciti isto.
    cleanBefore: () => {
      const m = (dokument: string, promijenili: string[]): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['radi-ponekad'],
        promijenili,
        bezUcinka: promijenili.length ? [] : [{ fixerId: 'radi-ponekad', reason: 'already-ok' }],
        cekaPotvrdu: [],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([m('a.docx', []), m('b.docx', ['radi-ponekad'])]);
      return deadFixers(rows).length === 0;
    },
  },
  {
    id: 'mreza/zahtjev-bez-ijedne-mete-prolazi-kao-mrtav-fixer',
    imitates:
      'graditelj stavki posalje zahtjev BEZ IJEDNE METE, motor ga odbije s `invalid-params`, a to se ' +
      'procita kao "fixer je mrtav" pa se kvar trazi u fixeru umjesto u pozivu. Izmjereno 2026-09-08: ' +
      '`heading-style-fixer` je isao kao `violated: true` s praznim popisom meta na cetiri dokumenta ' +
      '(kandidat postoji, nijedan nije predodabran), pa je zadani odabir slao prazan zahtjev. Ostali ' +
      'razlozi opisuju ULAZ (`no-target`, `already-ok`, `unsupported-structure`, `stale-anchor`); ' +
      '`invalid-params` jedini opisuje POZIV, i zato je uvijek nas kvar',
    caught: () => {
      const m = (dokument: string, reason: string): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['gradi-prazan-zahtjev'],
        promijenili: [],
        bezUcinka: [{ fixerId: 'gradi-prazan-zahtjev', reason }],
        cekaPotvrdu: [],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([m('a.docx', 'invalid-params'), m('b.docx', 'invalid-params')]);
      const losZahtjev = rows.filter((f) => Number(f.reasons?.['invalid-params'] ?? 0) > 0);
      return losZahtjev.length === 1 && losZahtjev[0].fixerId === 'gradi-prazan-zahtjev';
    },
    // Netrivijalnost: razlozi koji opisuju DOKUMENT ne smiju okinuti ovaj gard, inace bi svaki
    // uredan `no-target` prolaz izgledao kao kvar poziva i tvrdnja bi prestala znaciti isto.
    cleanBefore: () => {
      const m = (dokument: string, reason: string): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['uredan-preskok'],
        promijenili: [],
        bezUcinka: [{ fixerId: 'uredan-preskok', reason }],
        cekaPotvrdu: [],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([
        m('a.docx', 'no-target'),
        m('b.docx', 'already-ok'),
        m('c.docx', 'unsupported-structure'),
        m('d.docx', 'stale-anchor'),
      ]);
      return rows.every((f) => Number(f.reasons?.['invalid-params'] ?? 0) === 0);
    },
  },
  {
    id: 'oblik/generator-tvrdi-oblik-koji-ne-proizvodi',
    imitates:
      'sidecar generiranog dokumenta tvrdi oblik (`shapes.claimed`) kojeg u paketu nema, ili mutaciju ' +
      'cijim je brojacem nula. Bez ove provjere je sinteticki korpus vakuumski: mjeri se ono sto smo ' +
      'namjeravali proizvesti, ne ono sto je alat doista spremio. Izmjereno pri izradi detektora: ' +
      'graditelj je tvrdio `naslov/tab-u-naslovu` a odlomak nije imao ni stil ni razmak iza broja, pa ' +
      'oblika nije bilo; obrnuto, rucna stavka sadrzaja je lazno nosila isti oblik na pet mjesta',
    caught: () => {
      const nula = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      const tvrdiNepostojeci = verifyShapeClaims(['naslov/tab-u-naslovu'], nula).missing.length > 0;
      const tipfeler = verifyShapeClaims(['naslov/tab-u-naslov'], nula).unknown.length > 0;
      const mrtavBrojac = verifyShapeClaims([], nula, { tabInHeading: 0 }, {
        tabInHeading: 'naslov/tab-u-naslovu',
      }).underDetected.length > 0;
      return tvrdiNepostojeci && tipfeler && mrtavBrojac;
    },
    // Netrivijalnost: ispunjena tvrdnja uz brojac koji paket potvrdjuje NE smije proizvesti nalaz,
    // inace bi gard "hvatao" tako sto prijavljuje svaki generirani dokument.
    cleanBefore: () => {
      const counts = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      counts['naslov/tab-u-naslovu'] = 4;
      const v = verifyShapeClaims(['naslov/tab-u-naslovu'], counts, { tabInHeading: 4 }, {
        tabInHeading: 'naslov/tab-u-naslovu',
      });
      return v.missing.length === 0 && v.unknown.length === 0 && v.underDetected.length === 0;
    },
  },
  {
    id: 'mutacija/forma-upisana-a-alat-ju-je-tiho-odbacio',
    imitates:
      'mutacija bodovane FORME (font, prored, format stranice) upise se u izvor, brojac javi da je ' +
      'radila, a LibreOffice ju pri spremanju tiho odbaci. Dokument tada izgleda kao da nosi kvar, a ' +
      'nosi ga samo nas izvor; mreza bi mjerila oblik koji u paketu ne postoji. Nije teorijski: ovaj ' +
      'katalog je isti kvar platio DVAPUT na `csOnlyFonts` (nedeklariran font, pa imenovan stil umjesto ' +
      'automatskog), i oba puta ga je uhvatio jedino dokaz nad IZLAZOM. Druga polovica je brojac 0, ' +
      'dakle mehanizam koji nije ni pokusao',
    caught: () => {
      // Brojac tvrdi da je font upisan, a `word/styles.xml` ga nema.
      const odbaceno = verifyOutputProofs({ wrongBodyFont: 1 }, {
        'word/styles.xml': '<w:styles><w:style w:styleId="BodyText"><w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr></w:style></w:styles>',
      });
      const mrtav = verifyOutputProofs({ wrongBodyFont: 0 }, {
        'word/styles.xml': '<w:styles><w:rFonts w:ascii="Comic Sans MS"/></w:styles>',
      });
      return (
        odbaceno.some((p) => p.startsWith('wrongBodyFont:') && p.includes('nema dokaza')) &&
        mrtav.some((p) => p.includes('mrtav mehanizam'))
      );
    },
    // Netrivijalnost: kad paket dokaz NOSI, gard suti. Bez ovoga bi "hvatao" i gard koji vristi uvijek.
    cleanBefore: () =>
      verifyOutputProofs({ wrongBodyFont: 1 }, {
        'word/styles.xml': '<w:styles><w:style w:styleId="BodyText"><w:rPr><w:rFonts w:ascii="Comic Sans MS"/></w:rPr></w:style></w:styles>',
      }).length === 0,
  },
  {
    id: 'matrica/demotirana-os-prijavljena-kao-rupa-u-dokazu',
    imitates:
      'celija dobije oznaku `nema-dokaza` iako proizvod tu os UOPCE NE BODUJE. Redci matrice pravila ' +
      'izvode se iz SIROVIH pravila profila, a engine boduje pravila nakon scored/advisory demotije, ' +
      'koja gasi barem jednu bodovanu dimenziju na 383 od 407 profila. Izmjereno 2026-09-09: 36 celija ' +
      '(`paper-size-fixer` 24, `font-fixer` 12) tvrdilo je da fakultet os propisuje a mjerenja nema, ' +
      'dok je istina bila da ju proizvod ne boduje, pa ju generator i ne krsi. Isti razred kao ' +
      'preimenovanje 78 celija 2026-08-31: broj nepokrivenih se ne mijenja, mijenja se sto o njima tvrdimo',
    caught: () => {
      // Profil kojemu je os demotirana: `paramsForCheck` za svaki njegov checkId vraca `null`.
      const demotiran = uncoveredReason(3, true, undefined, 'paper-size-fixer', { requireA4: false }, 'x', [
        'paper-size',
      ]);
      return demotiran === 'profil-ne-propisuje-os';
    },
    /**
     * Netrivijalnost: profil koji os DOISTA boduje mora zadrzati `nema-dokaza`, inace bi grana
     * pojela svaku stvarnu rupu i matrica bi se ispraznila u nesto lijepo a neistinito.
     */
    cleanBefore: () => {
      const stvarnaRupa = uncoveredReason(3, true, undefined, 'paper-size-fixer', { requireA4: true }, 'x', [
        'paper-size',
      ]);
      return stvarnaRupa === 'nema-dokaza';
    },
  },
  {
    id: 'petlja/os-prestane-krsiti-pa-pokrivenost-tiho-nestane',
    imitates:
      'os generatora prestane krsiti pravilo (netko promijeni uvjet, profil izgubi `headingRules`, ' +
      'ili se blok tiho preskoci). Ratchet closed-loopa to NE VIDI: os koja se ne krsi ne moze ni ' +
      'pasti, pa broj `pass` ostaje isti, a matrica pokrivenosti izgubi 42 celije (po 21 za ' +
      '`heading-format-fixer` i `heading-case-fixer`). Izmjereno 2026-09-09 pri uvodjenju te osi: ' +
      'prva izvedba je uz naslove dodavala i odlomke tijela, cime je udio praznih odlomaka pao ispod ' +
      'praga i `empty-paragraph-fixer` je nestao s 21 profila, a nijedan gard to nije prijavio',
    caught: () => {
      type Redak = { profileId: string; violated: string[]; axesResolved: string[] };
      const provjeri = (rows: Redak[]) => {
        const sPravilima = rows.filter((r) => r.violated.includes('heading-format'));
        if (sPravilima.length <= 15) return true; // os je nestala iz generatora
        return sPravilima.some((r) => !r.axesResolved.includes('heading-format'));
      };
      // Os je nestala: nijedan redak je vise ne krsi.
      const nestala = provjeri([
        { profileId: 'a', violated: ['font'], axesResolved: ['font'] },
        { profileId: 'b', violated: ['font'], axesResolved: ['font'] },
      ]);
      // Os se krsi, ali ju popravak vise ne zatvara.
      const nerijesena = provjeri(
        Array.from({ length: 21 }, (_, i) => ({
          profileId: `p${i}`,
          violated: ['heading-format'],
          axesResolved: i === 7 ? [] : ['heading-format'],
        })),
      );
      return nestala && nerijesena;
    },
    // Netrivijalnost: uredan izvjestaj (os prekrsena i zatvorena na svima) NE smije dati nalaz.
    cleanBefore: () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        profileId: `p${i}`,
        violated: ['heading-format'],
        axesResolved: ['heading-format'],
      }));
      const sPravilima = rows.filter((r) => r.violated.includes('heading-format'));
      return sPravilima.length > 15 && !sPravilima.some((r) => !r.axesResolved.includes('heading-format'));
    },
  },
  {
    id: 'petlja/uvjetna-os-tiho-prestane-pogadjati',
    imitates:
      'UVJETNA os generatora (krsi se samo kad profil nosi odredjenu zastavicu) prestane pogadjati, ' +
      'jer se zastavica preimenuje ili graditelj promijeni uvjet. Razred je opasniji od bezuvjetne ' +
      'osi upravo zato sto je populacija mala: `paragraph-spacing` se krsi na 4 od 407 profila, pa ' +
      'gubitak ne pomice nijednu zbirnu brojku. `pass` ostaje 372 (os koja se ne krsi ne moze ni ' +
      'pasti), a matrica tiho izgubi tri celije s dokazom `resolved` i jednu vrati s `resolved` na ' +
      '`applied`. Gard koji bi trazio veliku populaciju ovdje ne bi grizao, pa je prag izveden iz ' +
      'mjerenja',
    caught: () => {
      type Redak = { profileId: string; violated: string[]; axesResolved: string[] };
      const provjeri = (rows: Redak[]) => {
        const sPravilima = rows.filter((r) => r.violated.includes('paragraph-spacing'));
        if (sPravilima.length <= 2) return true; // uvjet je prestao pogadjati
        return sPravilima.some((r) => !r.axesResolved.includes('paragraph-spacing'));
      };
      // 1) Zastavica se preimenovala: nijedan redak vise ne krsi os.
      const nestala = provjeri([
        { profileId: 'a', violated: ['font'], axesResolved: ['font'] },
        { profileId: 'b', violated: ['font'], axesResolved: ['font'] },
      ]);
      // 2) Uvjet je prezivio samo na dva profila umjesto na cetiri: pad ispod praga se vidi.
      const osula = provjeri([
        { profileId: 'a', violated: ['paragraph-spacing'], axesResolved: ['paragraph-spacing'] },
        { profileId: 'b', violated: ['paragraph-spacing'], axesResolved: ['paragraph-spacing'] },
      ]);
      // 3) Os se krsi, ali ju popravak vise ne zatvara.
      const nerijesena = provjeri(
        Array.from({ length: 4 }, (_, i) => ({
          profileId: `p${i}`,
          violated: ['paragraph-spacing'],
          axesResolved: i === 2 ? [] : ['paragraph-spacing'],
        })),
      );
      return nestala && osula && nerijesena;
    },
    // Netrivijalnost: izmjereno stanje (cetiri profila, sva cetiri zatvorena) NE smije dati nalaz.
    cleanBefore: () => {
      const rows = Array.from({ length: 4 }, (_, i) => ({
        profileId: `p${i}`,
        violated: ['paragraph-spacing'],
        axesResolved: ['paragraph-spacing'],
      }));
      const sPravilima = rows.filter((r) => r.violated.includes('paragraph-spacing'));
      return sPravilima.length > 2 && !sPravilima.some((r) => !r.axesResolved.includes('paragraph-spacing'));
    },
  },
  {
    id: 'petlja/glavni-prolaz-zaboravi-tko-je-mijenjao',
    imitates:
      'glavni prolaz closed-loopa prestane biljeziti identitet fixera koji su promijenili dokument, ' +
      'ili ga zabiljezi i kad je isporuka odbijena. Prvo je zateceno stanje do 2026-09-09: `requested` ' +
      'je bio goli BROJ, pa fixer bez vlastite osi generatora nije mogao dokazati nista, ma koliko ' +
      'puta odradio posao (izmjereno: `section-surgery-fixer` je na devet FPZG profila upisivao unos ' +
      'u changelog dok mu je celija citala `nema-dokaza`). Drugo je vakuumsko zeleno iz vodica: uz ' +
      '`integrityFailure` `applyFixers` vraca ULAZNE bajtove i PRAZAN changelog, pa bi brojanje ' +
      'ZAHTJEVA umjesto changeloga pokrilo celije dokumentom koji nikad nije bio popravljen',
    caught: () => {
      type Ishod = { changelog: Array<{ fixerId?: string }>; integrityFailure: string | null };
      // Ista izvedba kao u `run-closed-loop.mts`: identitet iz CHANGELOGA, prazno uz pad integriteta.
      const izvedi = (out: Ishod): string[] =>
        out.integrityFailure
          ? []
          : [...new Set(out.changelog.map((e) => e.fixerId).filter((id): id is string => Boolean(id)))].sort();
      const gard = (redak: { outcome: string; fixersChanged: string[] }) =>
        redak.outcome === 'pass' && redak.fixersChanged.length === 0;

      // 1) Fixer je odradio posao, ali ga glavni prolaz nije zapisao.
      const zaboravljen = gard({ outcome: 'pass', fixersChanged: [] });
      // 2) Isporuka je odbijena, pa dokaza NEMA iako je zahtjev bio poslan.
      const odbijena = izvedi({ changelog: [], integrityFailure: 'zip' }).length === 0;
      // 3) Podmetnut changelog uz pad integriteta ne smije proizvesti dokaz.
      const laznidokaz =
        izvedi({ changelog: [{ fixerId: 'section-surgery-fixer' }], integrityFailure: 'zip' }).length === 0;
      return zaboravljen && odbijena && laznidokaz;
    },
    // Netrivijalnost: uredan prolaz (fixer promijenio dokument, integritet cist) NE smije dati nalaz.
    cleanBefore: () => {
      const uredan = { outcome: 'pass', fixersChanged: ['section-surgery-fixer'] };
      const izveden = [...new Set([{ fixerId: 'font-fixer' }, { fixerId: 'font-fixer' }].map((e) => e.fixerId))];
      return !(uredan.outcome === 'pass' && uredan.fixersChanged.length === 0) && izveden.length === 1;
    },
  },
  {
    id: 'oblik/popravak-izgubi-oblik-pakiranja-pri-ponovnom-pisanju',
    imitates:
      'popravak ponovno napise paket i usput ispusti oblik PAKIRANJA koji je ulaz nosio, na primjer ' +
      'direktorijske zapise u zipu (130 od 457 stvarnih radova) ili prazan `word/comments.xml` (135 ' +
      'od 457). U dokumentu se to ne vidi: tekst je isti, analiza prolazi, a paket vise nije onaj ' +
      'oblik na kojem je motor trebao biti dokazan. Druga polovica mutacije je vakuum: popravak koji ' +
      'nema sto raditi vrati ULAZNE bajtove, pa tvrdnja "oblici su prezivjeli" postane istinita nad ' +
      'netaknutim originalom i ne govori nista o pisacu paketa (isti razred kao odbijena isporuka ' +
      'kroz vrata integriteta, koja takodjer vraca ulaz)',
    caught: () => {
      const counts = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      counts['paket/comments-prazan'] = 1;
      counts['gdocs/potpis'] = 1;
      // Popravak je ispustio direktorijske zapise; ostala dva oblika su prezivjela, pa nalaz mora
      // biti IMENOVAN, a ne izveden iz toga da se broj oblika smanjio.
      const izgubljen = verifyRepairRoundTrip(
        ['zip/direktoriji', 'paket/comments-prazan', 'gdocs/potpis'],
        counts,
        { changed: true },
      );
      const vakuum = verifyRepairRoundTrip(['zip/direktoriji'], { ...counts, 'zip/direktoriji': 4 }, {
        changed: false,
      });
      return izgubljen.lost.join(',') === 'zip/direktoriji' && vakuum.vacuous;
    },
    // Netrivijalnost: paket koji je popravak stvarno promijenio a oblike zadrzao ne smije dati nalaz,
    // inace bi gard prijavljivao svaki popravak nad svakim paketom.
    cleanBefore: () => {
      const counts = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      counts['zip/direktoriji'] = 4;
      counts['paket/comments-prazan'] = 1;
      counts['gdocs/potpis'] = 1;
      const v = verifyRepairRoundTrip(
        ['zip/direktoriji', 'paket/comments-prazan', 'gdocs/potpis'],
        counts,
        { changed: true },
      );
      return v.lost.length === 0 && !v.vacuous;
    },
  },
  {
    id: 'korpus/prazan-izvjestaj-tvrdi-da-mjeri',
    imitates:
      'commitani korpusni izvjestaj tvrdi `measuresRepairEffectiveness: true` uz NULA ciljanih ' +
      'provjera. Izmjereno 2026-09-03: nakon oznacavanja devet sidecara kao `synthetic` u ' +
      'commitanom skupu je ostalo 7 fixtura i 0 ciljanih provjera, pa su `failCount 0` i ' +
      '`passRegressionCount 0` u `tests/real-corpus.test.ts` postali VAKUUMSKI istiniti. ' +
      'Isti kod nad stvarnim radovima daje 94 ciljane provjere, 4 pada i 4 regresije, i upravo ' +
      'zato je regresija popravka danima stajala neprimijecena: commitani gard je po konstrukciji ' +
      'ne moze vidjeti, a njegovo zeleno se cita kao potvrda zdravlja',
    caught: () => {
      const lazan = { targetedCheckCount: 0, measuresRepairEffectiveness: true };
      return lazan.measuresRepairEffectiveness !== lazan.targetedCheckCount > 0;
    },
    // Baseline: posten prazan izvjestaj (nula provjera, oznaka `false`) NE smije se prijaviti,
    // inace bi gard vristao na zateceno i tocno stanje.
    cleanBefore: () => {
      const posten = { targetedCheckCount: 0, measuresRepairEffectiveness: false };
      return posten.measuresRepairEffectiveness === posten.targetedCheckCount > 0;
    },
  },
  {
    id: 'korpus/nepoznata-traka-tumaci-se-kao-real',
    imitates:
      'tipfeler ili nova traka u sidecaru (`converted-v2`, `koncertirano`) protumaci se kao `real` ' +
      'jer filtar nabraja SAMO zabranjene vrijednosti; deny-by-default trazi bijeli popis, isto ' +
      'nacelo kojim classification-guard obara build na neklasificiranom modulu',
    caught: () =>
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'converted-v2' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: '' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: null }),
    // Baseline: `undefined` NIJE nepoznata vrijednost nego izostanak polja, i mora proci, jer su
    // svi postojeci sidecari nastali prije uvodjenja trake.
    cleanBefore: () => sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: undefined }),
  },
  {
    // Namjerno BEZ `axis`: ta tvrdnja vjezba `readAxis` nad BODOVANIM osima, a citatni stil se ne
    // boduje. Upravo zato ga nijedan postojeci gard nije vidio.
    id: 'citation/zivi-stil-bez-ijedne-tvrdnje',
    imitates:
      'profil nosi `recommendedCitation` a nema nijednu tvrdnju o stilu: citatni motor koji stvarno ' +
      'analizira studentov rad odabran je bez izvora, stranice i citata. Rani `return []` u ' +
      '`citationFindings` je tu granu sutke gutao, pa je klasa koju je FER pilot otkrio na jednom ' +
      'profilu (IEEE bez izvora, ispravljeno 2026-08-22) ostala nevidljiva na jos 95 profila',
    caught: () =>
      buildScoredValueDrift(
        [
          {
            id: 'mutacija-citation-unbacked',
            rules: { recommendedCitation: 'ieee' },
            ruleEntries: [],
          } as unknown as ThesisProfile,
        ],
        SOURCES,
      ).citationStyle.some((c) => c.kind === 'unbacked' && c.liveValue === 'ieee'),
    // Baseline: profil BEZ zivog stila ne smije prijaviti nista. Bez ovoga bi gard "hvatao" tako
    // sto vristi na svaki profil koji citatni stil uopce nema.
    cleanBefore: () =>
      buildScoredValueDrift(
        [{ id: 'mutacija-citation-cist', rules: {}, ruleEntries: [] } as unknown as ThesisProfile],
        SOURCES,
      ).citationStyle.length === 0,
  },
  /**
   * Gard nad ozicenjem dokaza po osi. Do 2026-08-31 nije imao mutaciju, a uz to se nije izvodio ni
   * u jednom gateu: stajao je kao kod na vrhu `scripts/run-closed-loop.mts`, a CI posao koji se
   * ZOVE `closed-loop` pokrece `npm run test:slow`, koji tu skriptu nikad ne dotakne.
   */
  {
    id: 'dokaz-po-osi/os-bez-signala-tiho-pada-na-changelog',
    imitates:
      'strukturna os udje u skup a zaboravi se signal, pa zauvijek nosi dokaz koji znaci samo ' +
      '"fixer se javio". Tocno se to dogodilo s `element-caption` i `field-integrity`, koje su bez ' +
      'ijednog spomena padale na slabije changelog pravilo',
    caught: () => {
      try {
        assertAxisEvidenceWiring(['os-koje-nema']);
        return false;
      } catch (e) {
        return (e as Error).message.includes('AXIS_SIGNAL');
      }
    },
    cleanBefore: () => {
      // Baseline: stvarno ozicenje mora proci, inace gard "hvata" tako sto vristi na sve.
      try {
        assertAxisEvidenceWiring();
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'dokaz-po-osi/os-bez-fixera-nikad-ne-zaradi-applied',
    imitates:
      'os ima signal ali nema unos u APPLIED_AXIS_FIXER, pa je `changedFixerIds.has(undefined)` ' +
      'uvijek `false` i os nikad ne moze zaraditi dokaz `applied`. Prva izvedba garda provjeravala ' +
      'je samo prvu mapu i time promasila bas os zbog koje je nastala',
    caught: () => {
      try {
        // Signal postoji (stvarna mapa), fixer ne: gard mora gledati OBJE mape.
        assertAxisEvidenceWiring(['empty-paragraphs'], AXIS_SIGNAL, {});
        return false;
      } catch (e) {
        return (e as Error).message.includes('APPLIED_AXIS_FIXER');
      }
    },
    cleanBefore: () => {
      // Baseline: ista os uz OBJE stvarne mape mora proci, pa tvrdnja gore govori o fixeru.
      try {
        assertAxisEvidenceWiring(['empty-paragraphs'], AXIS_SIGNAL, APPLIED_AXIS_FIXER);
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'lupa/navod-s-krive-osi',
    imitates:
      'dokazna lupa koja uz nalaz stavi citat pravila koje tu os ne uredjuje. Most medju imenskim ' +
      'prostorima je rucno kuriran popis, pa je najlaksi nacin da pokvari povjerenje upravo ' +
      'prevelika darezljivost: navod iz sluzbene upute uz nalaz koji taj navod ne opravdava',
    // `bibliography-rules` uredjuje abecedni poredak popisa literature; nalaz govori o shemi
    // numeriranja stranica. Dokaz se NE smije zalijepiti.
    caught: () => evidenceFor('bibliography-rules', 'page.numbers.scheme', 'Shema numeriranja stranica', 'formatting') === 0,
    // Baseline: pravilo koje TU os stvarno uredjuje mora dati dokaz, inace tvrdnja gore prolazi
    // samo zato sto lupa ne radi nista.
    cleanBefore: () => evidenceFor('section-surgery-rules', 'page.numbers.scheme', 'Shema numeriranja stranica', 'formatting') === 1,
  },
  /**
   * T16 korak B2. Bez ove mutacije `transition` bi mogao biti `switch` koji za nepoznat par vrati
   * ZATECENO stanje, suite bi ostao zelen, a stroj ne bi tvrdio nista: nedopusten prijelaz ne bi
   * bio greska nego samo jos jedan upis. Tocno tako `app.ts` radi danas, sa 97 rucnih dodira
   * `hidden` i bez ijedne tablice prijelaza.
   */
  {
    id: 'stroj/nedozvoljen-prijelaz-tiho-prolazi',
    imitates:
      'stroj stanja napisan kao `switch` koji nepoznat par stanje/dogadaj propusta umjesto da ga ' +
      'odbije, pa preskakanje koraka (dokument -> analiza) izgleda kao dopusten prijelaz',
    caught: () => {
      const popustljiv = (st: WizardState, dg: WizardEvent): WizardState => transition(st, dg) ?? st;
      let dopusteni = 0;
      for (const st of SVA_STANJA) for (const dg of SVI_DOGADAJI) if (popustljiv(st, dg) !== null) dopusteni += 1;
      return dopusteni === SVA_STANJA.length * SVI_DOGADAJI.length;
    },
    cleanBefore: () => {
      let dopusteni = 0;
      for (const st of SVA_STANJA) for (const dg of SVI_DOGADAJI) if (transition(st, dg) !== null) dopusteni += 1;
      return dopusteni === 9 && transition('dokument', 'pokreni-analizu') === null;
    },
  },
  /**
   * Provjera koja se tiho preskoci jednaka je provjeri koje nema. `post-deploy-smoke` je ulaz cuvao
   * slijepljenom stazom, pa na Windowsu nije izveo nista i vratio 0, dok je na CI-ju bio crven 40
   * puta zaredom. Gard mora prijaviti oblik, a ne osloniti se na to da netko primijeti tisinu.
   */
  {
    id: 'cli/straza-ulaza-slijepljenom-stazom',
    imitates:
      'ESM straza `import.meta.url === `file://` + process.argv[1]`, koja se na Windowsu nikad ne ' +
      'poklopi, pa se skripta ucita, ne izvede nista i izade s kodom 0 (lazno zeleno)',
    caught: () => hasNaiveEntryGuard('if (import.meta.url === `file://${process.argv[1]}`) main();'),
    // Baseline: stvaran izvor u repozitoriju mora biti cist, inace tvrdnja gore ne govori o mutaciji.
    cleanBefore: () =>
      !hasNaiveEntryGuard(readFileSync(resolve(process.cwd(), 'scripts/post-deploy-smoke.mjs'), 'utf8')),
  },
];
describe('mutacijsko testiranje: garda stvarno grizu', () => {
  it.each(MUTATIONS.map((m) => [m.id, m] as const))('%s', (_id, mutation) => {
    expect(mutation.cleanBefore(), `baseline nije cist, pa tvrdnja nije o mutaciji (${mutation.imitates})`).toBe(true);
    expect(mutation.caught(), `mutacija NIJE uhvacena: ${mutation.imitates}`).toBe(true);
  });

  it('svaka mutacija imenuje stvaran kvar koji imitira', () => {
    for (const mutation of MUTATIONS) {
      expect(mutation.imitates.length, mutation.id).toBeGreaterThan(20);
    }
  });

  /**
   * Jedna brojka umjesto rucnog pregleda. Kad se doda gard, doda se i mutacija; kad broj padne,
   * netko je uklonio mutaciju umjesto da popravi gard.
   */
  it('N od N mutacija uhvaceno, i broj mutacija ne smije pasti', () => {
    const caught = MUTATIONS.filter((m) => m.cleanBefore() && m.caught());
    expect(caught).toHaveLength(MUTATIONS.length);
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(40);
  });

  /**
   * Anti-regresija na najgori nacin da ovaj test oslabi: da sve mutacije vjezbaju JEDNU os. Prva
   * izvedba je imala tocno taj kvar - sve cetiri tvrdnje o vezanju vrijednosti isle su na `font`, pa
   * se `readAxis` moglo svesti na "ako nije font, vrati undefined" i suite bi ostao zelen, cime bi
   * se vratio bas onaj `paper-size` kvar koji zaglavlje ove datoteke navodi kao motiv.
   */
  it('mutacije vjezbaju vise osi, ne samo font', () => {
    const axes = new Set(MUTATIONS.map((m) => m.axis).filter(Boolean));
    expect([...axes].sort()).toEqual(['font', 'font-size', 'justify', 'margins', 'paper-size']);
  });

  it('isRuleScored je izvedena istina, ne pohranjena zastavica', () => {
    // Zadnja crta: kad bi se `scored` citao iz podataka, sve gornje mutacije bi se mogle zaobici
    // jednim rucnim `scored: true`.
    expect(isRuleScored(goodEntry({ status: 'draft' }))).toBe(false);
    expect(isRuleScored(goodEntry({ sourcePage: null }))).toBe(false);
    expect(isRuleScored(goodEntry())).toBe(true);
  });

  it('mutacije ne diraju stvarne podatke na disku', () => {
    // Baseline hash stvarnog izvora mora biti netaknut i nakon svih mutacija iznad.
    // Putanja iz registra je repo-relativna; vitest se vrti iz korijena repozitorija.
    const raw = readFileSync(resolve(process.cwd(), REAL_SOURCE.snapshotPath!));
    expect(raw.byteLength).toBeGreaterThan(1000);
    expect(checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems).toEqual([]);
  });
});
