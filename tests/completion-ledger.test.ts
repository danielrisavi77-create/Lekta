/**
 * Gard za completion ledger (docs/generated/completion-ledger.json), P0-3 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 * Ledger je jedini artefakt koji odgovara na pitanje "je li MOJ studij, MOJA vrsta rada dokazano
 * pokrivena i do koje razine". Zato ga cuvaju DVIJE vrste tvrdnji:
 *   1. drift: commitani izlaz === svjezi izracun (kad padne: `npm run completion-ledger`);
 *   2. postenje: nijedan redak ne smije tvrditi vise nego sto njegove osi dokazuju.
 *
 * Druga skupina je vaznija. Drift gard hvata zastarjelost, ali ne bi uhvatio da netko olabavi
 * ljestvicu i tiho promakne 400 profila u razinu B.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist, ruleEvidenceKey } from '../src/verification/worklist';
import { loadRepositoryAiEvidenceContext } from '../scripts/ai-evidence-context-loader';
import { hashRepairSourceTree } from '../scripts/lib/repair-source-hash.mjs';
import {
  buildCompletionLedger,
  assessGlobalARatchet,
  assessFacultyMinimumBRatchet,
  assessFacultyAllARatchet,
  CLAIM_LADDER,
  STROP_RAZINE_A,
  proofSourceProblems,
  type LedgerInputs,
  type CompletionLedger,
} from '../src/verification/completion-ledger';
import { provenUnitWorkTypes } from '../src/verification/real-corpus-attestation';
import { attestationContentDigestSync } from '../src/verification/attestation-content-digest';
import { auditAiEvidence } from '../src/verification/ai-evidence-audit';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';
import baked from '../docs/generated/completion-ledger.json';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8')) as T;

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const legalProfileIds = new Set(LEGAL_DEPARTMENTS_WITH_DRAFTS.map((profile) => profile.id));
const aiEvidenceContext = await loadRepositoryAiEvidenceContext(
  resolve(process.cwd()),
  profiles,
  SOURCE_REGISTRY as SourceEntry[],
);

const inputs: LedgerInputs = {
  currentRepairSourceHash: hashRepairSourceTree(resolve(process.cwd(), 'src', 'repair')),
  registryProfiles: profiles.map((p) => ({
    id: p.id,
    scope: legalProfileIds.has(p.id) ? 'legal' : 'faculty',
    unitId: (p as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (p as unknown as { workTypes?: string[] }).workTypes ?? [],
  })),
  faculties: readJson<{ faculties: LedgerInputs['faculties'] }>('docs/generated/faculty-matrix.json').faculties,
  coverageCells: readJson<{ cells: LedgerInputs['coverageCells'] }>('data/coverage/scored-coverage.json').cells,
  worklistRows: computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], [], {
    aiEvidenceResults: aiEvidenceContext.resultsByRule,
  }).rows,
  repairRows: readJson<{ rows: LedgerInputs['repairRows'] }>('docs/generated/repair-coverage.json').rows,
  programs: readJson<{ programs: LedgerInputs['programs'] }>('data/programs/program-registry.json').programs,
  titleTemplates: readJson<LedgerInputs['titleTemplates']>('data/title-pages/templates-index.json'),
  citationSpecs: readJson<LedgerInputs['citationSpecs']>('data/tools/citation-specs/verified-index.json'),
  declarations: readJson<LedgerInputs['declarations']>('data/declarations/declarations.json'),
  closedLoop: readJson<{ rows: NonNullable<LedgerInputs['closedLoop']> }>('docs/generated/closed-loop.json').rows,
};

/**
 * Ovjera se MORA ucitati isto kao u generatoru, inace svjezi izracun nema dokaz koji commitani ima i
 * drift test pada na razlici koja nije regresija. Tocno taj razred kvara (artefakt ovisi o ulazu koji
 * test ne daje) danas je vec jednom obojio CI crvenim.
 */
const corpusAttestation = readJson<Parameters<typeof buildCompletionLedger>[0]['corpusAttestation']>(
  'data/verification/real-corpus-attestation.json',
);
const fresh = buildCompletionLedger({ ...inputs, corpusAttestation });
// Synthetic counterfactual: a fresh v2 measurement would need a new content digest as well as
// a current repair hash. This object stays inside the test; the signed repository record is untouched.
const validCorpusAttestation = corpusAttestation && inputs.currentRepairSourceHash
  ? (() => {
    const refreshed = { ...corpusAttestation, repairSourceHash: inputs.currentRepairSourceHash };
    return { ...refreshed, signedContentDigest: attestationContentDigestSync(refreshed) };
  })()
  : null;
const freshWithCurrentAttestation = buildCompletionLedger({ ...inputs, corpusAttestation: validCorpusAttestation });

describe('completion ledger: drift', () => {
  it('code-only PR zadrzava masterove A i B razine na istom registru', () => {
    expect(fresh.summary.byClaim.A).toBe(38);
    expect(fresh.summary.byClaim.B).toBe(300);
  });

  it('commitani izlaz === svjezi izracun (inace: npm run completion-ledger)', () => {
    expect(fresh).toEqual(baked as unknown as CompletionLedger);
  });

  it('pokriva svaki registrirani profil, sa retkom po vrsti rada', () => {
    expect(fresh.summary.profileCount).toBe(profiles.length);
    expect(fresh.summary.rowCount).toBeGreaterThanOrEqual(fresh.summary.profileCount);
  });

  // Master has no real AI packages. Build a five-rule synthetic package so the
  // ledger still exercises the worklist boundary without copying source evidence.
  function syntheticPackage(legacyCount = 0, badProvenance = false) {
    const original = profiles.find((profile) => profile.id === 'efos-doktorski')!;
    const fixture = createAiEvidenceAuditFixture();
    const entries = Array.from({ length: 5 }, (_, index) => {
      const ruleId = `${original.id}--synthetic-${index + 1}`;
      const manifestId = `closed-loop:${original.id}:${ruleId}:${fixture.manifest.inputHash}:${fixture.manifest.outputHash}:pass`;
      const rule = { ...fixture.rule, ruleId, scored: true, status: 'verified' as const,
        confirmedVia: index < legacyCount ? 'ai-1pass-batch' as const : 'ai-evidence-audit' as const,
        verifiedBy: index < legacyCount ? 'legacy-batch' : 'ai-evidence-audit' };
      const evidence = { ...fixture.evidence, profileId: original.id, ruleId,
        schemaVersion: badProvenance ? 1 as const : 2 as const,
        model: badProvenance
          ? { provider: 'OpenAI', model: 'GPT-5', version: 'runtime-version-not-exposed' }
          : { provider: 'openai', model: 'fixture-extract', version: '1' },
        passes: fixture.evidence.passes.map((pass) => badProvenance ? pass : {
          ...pass, model: pass.pass === 'refute'
            ? { provider: 'anthropic', model: 'fixture-refute', version: '1' }
            : { provider: 'openai', model: 'fixture-extract', version: '1' },
        }),
        execution: { ...fixture.evidence.execution, manifestId },
      };
      const manifest = { ...fixture.manifest, profileId: original.id, ruleId, manifestId };
      return { rule: { ...rule, aiEvidence: index < legacyCount ? undefined : evidence }, evidence, manifest };
    });
    const profile: ThesisProfile = { ...original, ruleEntries: entries.map((item) => item.rule) };
    const resultsByRule = Object.fromEntries(entries.map(({ rule, evidence, manifest }) => [
      ruleEvidenceKey(profile.id, rule.ruleId),
      auditAiEvidence({ ...fixture, profileId: profile.id, rule, evidence, manifest }),
    ]));
    const worklist = computeWorklist([profile], [fixture.source], [], { aiEvidenceResults: resultsByRule });
    const controlled = buildCompletionLedger({ ...inputs, corpusAttestation,
      worklistRows: inputs.worklistRows.map((row) => row.profileId === profile.id ? worklist.rows[0] : row),
    });
    return { entries, worklist, controlled, profile, resultsByRule };
  }

  it('synthetic schema-2 evidence clears bulk pending and allows B', () => {
    const { worklist, controlled, resultsByRule } = syntheticPackage();
    expect(Object.values(resultsByRule)).toEqual(Array.from({ length: 5 }, () => ({ valid: true, reasons: [] })));
    expect(worklist.rows[0].pendingEvidence).toBe(0);
    expect(controlled.rows.find((row) => row.profileId === 'efos-doktorski')).toMatchObject({
      claim: 'B', rules: 'verified', repair: 'faculty-specific', proof: 'synthetic-pass',
    });
  });

  it('one legacy bulk rule keeps the synthetic package below B', () => {
    const { worklist, controlled } = syntheticPackage(1);
    expect(worklist.rows[0].pendingEvidence).toBe(1);
    expect(controlled.rows.find((row) => row.profileId === 'efos-doktorski')).toMatchObject({
      claim: 'C', rules: 'bulk-pending',
    });
  });

  it('five synthetic packages with false legacy provider provenance remain below B', () => {
    const { worklist, controlled } = syntheticPackage(0, true);
    expect(worklist.rows[0].pendingEvidence).toBe(5);
    expect(worklist.ruleItems.map((item) => item.reasonCodes)).toEqual(
      Array.from({ length: 5 }, () => ['provider-provenance-recheck']),
    );
    expect(controlled.rows.find((row) => row.profileId === 'efos-doktorski')).toMatchObject({
      claim: 'C', rules: 'bulk-pending', repair: 'faculty-specific', proof: 'synthetic-pass',
    });
  });

  it('masterova svjeza ovjera zadrzava A, a promjena repair koda ga uklanja', () => {
    expect(provenUnitWorkTypes(corpusAttestation, inputs.currentRepairSourceHash).size).toBeGreaterThan(0);
    expect(fresh.summary.byClaim.A).toBe(38);
    const stale = buildCompletionLedger({
      ...inputs,
      currentRepairSourceHash: 'f'.repeat(64),
      corpusAttestation,
    });
    expect(stale.summary.byClaim.A).toBe(0);
  });

  it('ima svaki jedinstveni ID iz registara tocno u izvedenom skupu profila', () => {
    const registryIds = profiles.map((profile) => profile.id).sort();
    const ledgerIds = [...new Set(fresh.rows.map((row) => row.profileId).filter((id): id is string => id !== null))].sort();

    expect(new Set(registryIds).size).toBe(registryIds.length);
    expect(ledgerIds).toEqual(registryIds);
    expect(fresh.summary.profileCount).toBe(ledgerIds.length);
    expect(fresh.summary.rowCount).toBe(fresh.rows.length);
  });

  it('informativni globalni A pokazatelj broji profile samo kad su svi njihovi redci A', () => {
    expect(fresh.globalA).toMatchObject({
      registeredProfileCount: profiles.length,
      allProfilesA: false,
    });
  });

  it('globalni A pokazatelj zahtijeva da svaki redak profila bude A', () => {
    const result = assessGlobalARatchet(
      ['profil-a', 'profil-b'],
      [
        { profileId: 'profil-a', claim: 'A' },
        { profileId: 'profil-a', claim: 'B' },
        { profileId: 'profil-b', claim: 'A' },
      ],
    );

    expect(result).toMatchObject({
      profilesAtA: 1,
      profilesBelowA: ['profil-a'],
      allProfilesA: false,
    });
  });

  it('informativni globalni A pokazatelj bilježi registrirani profil bez ledger retka', () => {
    const result = assessGlobalARatchet(
      ['profil-a', 'profil-b'],
      [{ profileId: 'profil-a', claim: 'A' }],
    );
    expect(result.allProfilesA).toBe(false);
    expect(result.missingProfileIds).toEqual(['profil-b']);
  });

  it('svježi ledger primjenjuje prag B samo na 407 fakultetskih profila', () => {
    expect(fresh.facultyMinimumB.registeredFacultyCount).toBe(inputs.registryProfiles.filter((profile) => profile.scope === 'faculty').length);
    expect(fresh.facultyMinimumB.legalProfileCount).toBe(3);
  });
});

describe('ratchet najmanje B za fakultete', () => {
  it('traži A ili B za svaki fakultetski profil, ali pravne profile izvještava odvojeno', () => {
    const registry = [
      { id: 'fakultet-a', scope: 'faculty' as const },
      { id: 'fakultet-b', scope: 'faculty' as const },
      { id: 'pravni-a', scope: 'legal' as const },
    ];
    const rows = [
      { profileId: 'fakultet-a', claim: 'A' as const },
      { profileId: 'fakultet-b', claim: 'B' as const },
      { profileId: 'pravni-a', claim: 'C' as const },
    ];

    const result = assessFacultyMinimumBRatchet(registry, rows);

    expect(result).toMatchObject({
      registeredFacultyCount: 2,
      facultyAtLeastB: 2,
      facultyBelowB: [],
      meetsFacultyMinimumB: true,
      legalProfileCount: 1,
      legalProfilesAtA: 0,
      legalProfilesBelowA: ['pravni-a'],
    });
  });

  it('blokira nedostajući fakultetski profil i svaki fakultetski redak ispod B', () => {
    const result = assessFacultyMinimumBRatchet(
      [
        { id: 'fakultet-a', scope: 'faculty' },
        { id: 'fakultet-b', scope: 'faculty' },
      ],
      [{ profileId: 'fakultet-a', claim: 'C' }],
    );

    expect(result.meetsFacultyMinimumB).toBe(false);
    expect(result.facultyBelowB).toEqual(['fakultet-a', 'fakultet-b']);
    expect(result.missingFacultyIds).toEqual(['fakultet-b']);
  });
});

describe('ratchet A za sve fakultetske profile', () => {
  it('prolazi samo kad su svi fakultetski profili A, a pravne profile izvještava odvojeno', () => {
    const result = assessFacultyAllARatchet(
      [
        { id: 'fakultet-a', scope: 'faculty' },
        { id: 'fakultet-b', scope: 'faculty' },
        { id: 'pravni-a', scope: 'legal' },
      ],
      [
        { profileId: 'fakultet-a', claim: 'A' },
        { profileId: 'fakultet-b', claim: 'A' },
        { profileId: 'pravni-a', claim: 'C' },
      ],
    );

    expect(result).toMatchObject({
      registeredFacultyCount: 2,
      facultyAtA: 2,
      facultyBelowA: [],
      meetsFacultyAllA: true,
      legalProfileCount: 1,
      legalProfilesBelowA: ['pravni-a'],
    });
  });

  it('blokira profil na B, nedostajući profil, dupli ID i neregistrirani redak', () => {
    const result = assessFacultyAllARatchet(
      [
        { id: 'fakultet-a', scope: 'faculty' },
        { id: 'fakultet-b', scope: 'faculty' },
        { id: 'fakultet-b', scope: 'faculty' },
      ],
      [
        { profileId: 'fakultet-a', claim: 'A' },
        { profileId: 'fakultet-b', claim: 'B' },
        { profileId: 'strani-profil', claim: 'A' },
      ],
    );

    expect(result.meetsFacultyAllA).toBe(false);
    expect(result.facultyBelowA).toEqual(['fakultet-b']);
    expect(result.missingFacultyIds).toEqual([]);
    expect(result.unregisteredFacultyIds).toEqual(['strani-profil']);
    expect(result.duplicateFacultyRegistryIds).toEqual(['fakultet-b']);
  });

  it('svježi completion ledger izlaže završni A ratchet za 407 fakultetskih profila', () => {
    expect(fresh.schemaVersion).toBe(3);
    expect(fresh.facultyAllA.registeredFacultyCount).toBe(inputs.registryProfiles.filter((profile) => profile.scope === 'faculty').length);
    expect(fresh.facultyAllA.meetsFacultyAllA).toBe(false);
    expect(fresh.facultyAllA.facultyBelowA.length).toBeGreaterThan(0);
  });
});

describe('completion ledger: nijedan redak ne tvrdi vise nego sto dokazuje', () => {
  it('A i B traže dokazno revalidirana pravila, fakultetski popravak I dokaz na dokumentu', () => {
    for (const row of fresh.rows) {
      if (row.claim !== 'A' && row.claim !== 'B') continue;
      expect(row.rules, `${row.profileId}: razina ${row.claim} bez potpuno verificiranih pravila`).toBe('verified');
      expect(row.repair, `${row.profileId}: razina ${row.claim} bez fakultetskog popravka`).toBe('faculty-specific');
      expect(
        row.claim === 'A' ? 'real-docx-pass' : 'synthetic-pass',
        `${row.profileId}: razina ${row.claim} s dokazom ${row.proof}`,
      ).toBe(row.proof);
    }
  });

  it('nijedan blocker za razinu ne zahtijeva ljudski audit ili pregled', () => {
    const blockers = fresh.rows.flatMap((row) => row.blockedReasons.map((reason) => `${row.profileId}: ${reason}`));
    expect(blockers.join('\n')).not.toMatch(/ljudsk|human|ru[cč]ni pregled/i);
  });

  it('samo razina A smije biti bez ijednog razloga blokade', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'A') expect(row.blockedReasons).toEqual([]);
      else expect(row.blockedReasons.length, `${row.profileId} (${row.claim}) nema razlog`).toBeGreaterThan(0);
    }
  });

  it('bulk-pending pravila nikad ne dosezu A ni B', () => {
    for (const row of fresh.rows) {
      if (row.rules === 'bulk-pending') expect(['C', 'D', 'E']).toContain(row.claim);
    }
  });

  it('lažno ponuđen fakultetski fixer ne zadržava sintetički B profil na B', () => {
    const candidate = fresh.rows.find((row) => row.claim === 'B' && row.proof === 'synthetic-pass');
    expect(candidate).toBeDefined();
    const changed = structuredClone(inputs);
    changed.repairRows = changed.repairRows.map((repair) =>
      repair.profileId === candidate!.profileId ? { ...repair, recommended: true } : repair,
    );

    const result = buildCompletionLedger({ ...changed, corpusAttestation });
    const row = result.rows.find((item) => item.profileId === candidate!.profileId && item.workType === candidate!.workType);
    expect(row?.repair).toBe('universal-hygiene');
    expect(row?.claim).not.toBe('B');
  });

  it('pali closed-loop ne dokazuje B ni kad su pravilo i fixer valjani', () => {
    const candidate = fresh.rows.find((row) => row.claim === 'B' && row.proof === 'synthetic-pass');
    expect(candidate).toBeDefined();
    const changed = structuredClone(inputs);
    changed.closedLoop = (changed.closedLoop ?? []).map((loop) =>
      loop.profileId === candidate!.profileId ? { ...loop, outcome: 'fail' } : loop,
    );
    changed.faculties = changed.faculties.map((faculty) => ({
      ...faculty,
      profiles: faculty.profiles.map((profile) => profile.profileId === candidate!.profileId
        ? { ...profile, automaticTests: { ...profile.automaticTests, syntheticClosedLoop: 'fail' } }
        : profile),
    }));

    const result = buildCompletionLedger({ ...changed, corpusAttestation });
    const row = result.rows.find((item) => item.profileId === candidate!.profileId && item.workType === candidate!.workType);
    expect(row?.proof).not.toBe('synthetic-pass');
    expect(row?.claim).not.toBe('B');
  });

  it('pravilo novog AI paketa koje worklist još traži sruši B bez legacy bulk oznake', () => {
    const candidate = fresh.rows.find((row) => row.claim === 'B' && row.proof === 'synthetic-pass');
    expect(candidate).toBeDefined();
    const changed = structuredClone(inputs);
    changed.worklistRows = changed.worklistRows.map((row) => row.profileId === candidate!.profileId
      ? { ...row, pendingEvidence: 1, hasAiAuditedRules: true }
      : row);

    const result = buildCompletionLedger({ ...changed, corpusAttestation });
    const row = result.rows.find((item) => item.profileId === candidate!.profileId && item.workType === candidate!.workType);
    expect(row?.rules).toBe('bulk-pending');
    expect(row?.claim).not.toBe('B');
  });

  it('E znaci doista nula bodovanih pravila, a ne samo slab dokaz', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'E') expect(row.evidence.scoredTotal).toBe(0);
      if (row.evidence.scoredTotal > 0) expect(row.claim).not.toBe('E');
    }
  });

  it('strop razine A je imenovan, prvi, na SVAKOM E retku profila i ni na jednom drugom retku', () => {
    // E = redci bez bodovanog pravila iz sluzbenog izvora + programi bez profila. Strop nose samo prvi:
    // program bez profila nije strop nego prazno mjesto, i vec ima vlastiti doslovni razlog.
    const eProfila = fresh.rows.filter((r) => r.claim === 'E' && r.profileId !== null);
    expect(eProfila.length).toBeGreaterThan(0);
    for (const row of eProfila) expect(row.blockedReasons[0]).toBe(STROP_RAZINE_A);
    for (const row of fresh.rows) {
      if (row.claim !== 'E') expect(row.blockedReasons).not.toContain(STROP_RAZINE_A);
    }
  });

  it('podmetnuti trenutni repairSourceHash dize SAMO ovjereni par jedinica x vrsta rada', () => {
    // Odluka vlasnika 2026-09-05: dokaz vrijedi za (jedinica, vrsta rada). Isti profil moze biti A za
    // diplomski a B za doktorski. Mjera: bez ovjere ledger ima manje A; s ovjerom se smije promijeniti
    // iskljucivo redak ciji je par ovjeren, i to samo prema gore.
    const bezOvjere = buildCompletionLedger({ ...inputs, corpusAttestation: null });
    const dokazani = provenUnitWorkTypes(validCorpusAttestation, inputs.currentRepairSourceHash);
    expect(dokazani.size).toBeGreaterThan(0);
    const aPrije = bezOvjere.rows.filter((r) => r.claim === 'A').length;
    const aPoslije = freshWithCurrentAttestation.rows.filter((r) => r.claim === 'A').length;
    expect(aPoslije).toBeGreaterThan(aPrije);
    for (const row of freshWithCurrentAttestation.rows) {
      const prije = bezOvjere.rows.find((r) => r.profileId === row.profileId && r.workType === row.workType);
      expect(prije).toBeDefined();
      const par = `${row.unitId}::${row.workType}`;
      if (!dokazani.has(par)) expect(row.claim).toBe(prije!.claim);
      if (row.claim === 'A' && prije!.claim !== 'A') expect(dokazani.has(par)).toBe(true);
    }
  });

  it('zbirna os pomocnog sadrzaja je NAJSLABIJI clan svoje tri podosi', () => {
    const order = ['exact-official', 'exact-derived', 'reused', 'generic', 'unknown'];
    for (const row of fresh.rows) {
      const worst = Math.max(
        order.indexOf(row.assetDetail.titlePage),
        order.indexOf(row.assetDetail.citation),
        order.indexOf(row.assetDetail.declaration),
      );
      expect(row.assets).toBe(order[worst]);
    }
  });

  it('svaka razina ljestvice ima formulaciju koju smijemo pokazati', () => {
    for (const row of fresh.rows) expect(CLAIM_LADDER[row.claim]).toBeTruthy();
  });
});

describe('completion ledger: nacionalna tvrdnja', () => {
  /**
   * Ovo je poanta cijelog audita pretvorena u test. Dokle god ijedan redak nije na A ili B, ili
   * postoji program bez evidencije, tvrdnja "Lekta provjerava i popravlja svaki akademski rad u
   * Hrvatskoj" je NO-GO. Test NE trazi da blokatora nema (danas ih ima); trazi da su IMENOVANI,
   * pa se stanje ne moze predstaviti kao dovrseno.
   */
  it('blokatori nacionalne tvrdnje su izvedeni iz osi, ne prepricani', () => {
    const s = fresh.summary;
    const unproven = s.byClaim.C + s.byClaim.D + s.byClaim.E;
    expect(s.programGaps).toBe(fresh.rows.filter((r) => r.program === 'missing').length);
    if (s.programGaps > 0 || unproven > 0 || s.programsWithoutProfile.length > 0) {
      expect(s.nationalClaimBlockers.length).toBeGreaterThan(0);
    } else {
      expect(s.nationalClaimBlockers).toEqual([]);
    }
  });

  it('nijedan redak jos nema program iz sluzbenog Upisnika (faza P1 nije izvedena)', () => {
    // Kad P1 zavrsi, ovaj test se mijenja u suprotnu tvrdnju. Dok traje, cuva da nitko ne oznaci
    // program `official` bez stvarne sinkronizacije s Upisnikom.
    expect(fresh.summary.byProgram.official).toBe(0);
  });

  it('zatecena tri evidentirana programa bez profila ostaju vidljiva', () => {
    expect(fresh.summary.programsWithoutProfile).toHaveLength(3);
    expect(fresh.summary.programsWithoutProfile.join(' ')).toContain('Vojno vođenje');
  });
});

/**
 * Vanjski audit 2026-09-08, nalaz 4: od 31 profila razine A samo je 12 izravno u ovjeri, 19 nasljedjuje
 * dokaz po paru jedinica x vrsta rada (odluka vlasnika 2026-09-05), a sucelje ih je pokrivalo istom
 * recenicom. Ledger sada uz os dokaza nosi i IZVOR (`proofSource`), pa se izmjereno i izvedeno moze
 * razlikovati bez sroceanja u sucelju.
 */
describe('completion ledger: izvor dokaza na stvarnom radu', () => {
  it('os dokaza i njezin izvor se slazu na svakom retku (svjeze i commitano)', () => {
    expect(proofSourceProblems(freshWithCurrentAttestation.rows)).toEqual([]);
    expect(proofSourceProblems((baked as CompletionLedger).rows)).toEqual([]);
  });

  it('svaki A redak ima izvor, i nijedan redak bez dokaza na stvarnom radu ga nema', () => {
    for (const row of freshWithCurrentAttestation.rows) {
      if (row.claim === 'A') expect(row.proofSource, row.profileId ?? '?').not.toBeNull();
      if (row.proof !== 'real-docx-pass') expect(row.proofSource, row.profileId ?? '?').toBeNull();
    }
  });

  it('zbroj po izvoru odgovara redovima', () => {
    const s = freshWithCurrentAttestation.summary.byProofSource;
    expect(s.profile + s['unit-work-type'] + s.none).toBe(freshWithCurrentAttestation.rows.length);
    expect(s.profile + s['unit-work-type']).toBe(freshWithCurrentAttestation.summary.byProof['real-docx-pass']);
  });

  /**
   * RATCHET s imenovanim brojkama (izmjereno 2026-09-09 nad ovjerom od 2026-09-05): 18 redaka ima
   * dokaz izmjeren na vlastitom profilu (12 razlicitih profila, tocno onih 12 iz `profileIds` ovjere),
   * 23 retka ga nasljedjuju po paru. Izmjereni broj smije samo RASTI (vise ovjerenih profila), a
   * naslijedjeni se smije mijenjati samo uz svjesnu izmjenu ovdje. Pad izmjerenog znaci da je ovjera
   * izgubila profil ili da je definicija izvora popustila.
   */
  it('izmjereno naspram naslijedjeno: 18 redaka / 12 profila izmjereno, 23 retka naslijedjeno', () => {
    const s = freshWithCurrentAttestation.summary.byProofSource;
    expect(s.profile).toBeGreaterThanOrEqual(18);
    expect(s['unit-work-type']).toBe(23);
    const izravniProfili = new Set(freshWithCurrentAttestation.rows.filter((r) => r.proofSource === 'profile').map((r) => r.profileId));
    expect(izravniProfili.size).toBeGreaterThanOrEqual(12);
  });

  it('gard nad izvorom stvarno grize (podmetnut A redak bez izvora)', () => {
    const cisto = freshWithCurrentAttestation.rows;
    expect(proofSourceProblems(cisto)).toEqual([]);
    const a = cisto.find((r) => r.claim === 'A')!;
    expect(proofSourceProblems([{ ...a, proofSource: null }])).toHaveLength(1);
    const b = cisto.find((r) => r.proof !== 'real-docx-pass')!;
    expect(proofSourceProblems([{ ...b, proofSource: 'unit-work-type' }])).toHaveLength(1);
  });
});
