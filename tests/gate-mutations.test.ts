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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runVerificationGate, isRuleScored } from '../src/verification/verification-gate';
import { findScoredValueFindings, sameRuleValue } from '../src/verification/scored-value-binding';
import { computeCoverageCell } from '../src/verification/coverage-report';
import { collectCompileDiagnostics, compileEffectiveRules } from '../src/profiles/rule-compiler';
import { computeBaseDemotedAdvisory, computeDemotedAdvisory } from '../src/profiles/advisory-demotion';
import { demotionProtectedBy } from '../src/profiles/advisory-levers';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import driftArtifact from '../data/verification/scored-value-drift.json';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { checkSourceHashes } from '../scripts/verify-source-hashes.mjs';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
const NOW = '2026-06-30';
/** Stvaran, snapshotiran izvor sa sha256 (isti koji koriste ostali verifikacijski testovi). */
const REAL_SOURCE_ID = 'pravo-upute-oblikovanje-2024';
const REAL_SOURCE = SOURCES.find((s) => s.id === REAL_SOURCE_ID)!;

/** Profil koji STVARNO ima raskorak, uzet iz artefakta, pa mutacija 18 ne moze biti prazna. */
const DRIFTED_PROFILE_ID = Object.keys(
  (driftArtifact as { demotedByProfile: Record<string, string[]> }).demotedByProfile,
).sort()[0]!;
const DRIFTED_AXIS = (driftArtifact as { demotedByProfile: Record<string, string[]> }).demotedByProfile[
  DRIFTED_PROFILE_ID
]![0]!;

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
      const id = DRIFTED_PROFILE_ID;
      const entries = draftRuleEntriesFor(id);
      const axis = DRIFTED_AXIS;
      const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
      const full = computeDemotedAdvisory({ id }, entries, SOURCES);
      return !base.includes(axis) && full.includes(axis);
    },
    cleanBefore: () => {
      // Netrivijalnost: profil i os moraju stvarno postojati u artefaktu, inace je tvrdnja prazna.
      const demoted = (driftArtifact as { demotedByProfile: Record<string, string[]> }).demotedByProfile;
      return (demoted[DRIFTED_PROFILE_ID] ?? []).includes(DRIFTED_AXIS);
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
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(32);
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
