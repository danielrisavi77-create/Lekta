import { describe, expect, it } from 'vitest';
import generatedReport from '../docs/generated/faculty-matrix.json';
import { buildFacultyMatrixReport, projectRuleEvidence } from './helpers/faculty-matrix';
import type { RuleEntry, SourceEntry } from '../src/profiles/profile-schema';

describe('fakultetska matrica Repair Enginea', () => {
  it('pokriva sve profile i ostaje sinkronizirana s generiranim izvještajem', () => {
    const report = buildFacultyMatrixReport();
    expect(report).toEqual(generatedReport);
    expect(report.summary.facultyCount).toBeGreaterThan(0);
    expect(report.summary.profileCount).toBeGreaterThan(0);
    expect(report.summary.mappedOptionCount).toBe(report.summary.offeredOptionCount);
    expect(report.summary.profileCoverageFailCount).toBe(0);
    expect(report.faculties.every((faculty) => faculty.profiles.length === faculty.profileCount)).toBe(true);
  });

  it('stvarne DOCX uzorke ne prikazuje kao dokaz 100/100', () => {
    const report = buildFacultyMatrixReport();
    expect(report.summary.realDocxSampleCount).toBeGreaterThan(0);
    expect(report.summary.realCorpusReviewCount).toBeGreaterThan(0);
    // Do 2026-08-29 je ovdje stajalo `toBe(profileCount)`, cime je test PRIKOVAO kvar: matrica je
    // polje `syntheticClosedLoop` drzala na 'not-run' za svih 407 profila iako
    // `docs/generated/closed-loop.json` ima redak za svakoga. Sada se trazi obratno.
    expect(report.summary.syntheticClosedLoopNotRunCount).toBeLessThan(report.summary.profileCount);
    expect(report.summary.syntheticClosedLoopPassCount).toBeGreaterThan(0);
    expect(report.faculties.some((faculty) => faculty.profilesWithoutRealDocx.length > 0)).toBe(true);
  });

  /**
   * UGOVOR CELIJE (F2.4, tocka 7): tocno jedan od dva statusa, nikad prazno i nikad treci.
   * `pokriveno` mora imati dokaz s artefaktom, `nepokriveno` razlog iz zatvorenog popisa.
   */
  it('svaka celija ima status, i nijedna nije prazna', () => {
    const report = buildFacultyMatrixReport();
    const s = report.cellSummary;
    expect(s.cellCount).toBeGreaterThan(0);
    expect(s.coveredCount + s.uncoveredCount).toBe(s.cellCount);
    // Zbroj razloga mora tocno pokriti nepokrivene celije: celija bez razloga inace nestane iz
    // brojke i pokrivenost izgleda bolje nego sto jest.
    const reasonTotal = Object.values(s.byReason).reduce((total, count) => total + count, 0);
    expect(reasonTotal).toBe(s.uncoveredCount);
    // Dokaz jacine `resolved` je podskup pokrivenih, nikad veci.
    expect(s.resolvedCount).toBeLessThanOrEqual(s.coveredCount);
  });

  it('matrica mjeri sve fixere, ne samo sest profilnih osi', () => {
    const report = buildFacultyMatrixReport();
    // Prije sirenja je matrica po profilu vidjela najvise 6 osi. Celija ima jednu po fixeru, pa
    // broj celija po profilu mora biti visestruko veci; bez ove tvrdnje bi se suzenje natrag na
    // profilne osi provuklo kao "manje celija, bolji broj".
    const perProfile = report.cellSummary.cellCount / report.summary.profileCount;
    expect(perProfile).toBeGreaterThan(20);
    expect(Number.isInteger(perProfile)).toBe(true);
  });

  it('jedinstvena matrica veže profil uz izvor, citat, audit status i A-E dokaz po vrsti rada', () => {
    const report = buildFacultyMatrixReport();
    const efosDoctoral = report.faculties
      .flatMap((faculty) => faculty.profiles)
      .find((profile) => profile.profileId === 'efos-doktorski');

    expect(report.summary.profileCount).toBe(407);
    expect(report.legalProfiles).toHaveLength(3);
    expect(efosDoctoral?.ruleEvidence).toContainEqual(expect.objectContaining({
      ruleId: 'efos-doktorski--paper-size',
      sourceId: 'efos-upute-studentski-2023',
      sourcePage: 'Odjeljak 2, tiskana str. 3',
      quote: 'veličina je stranice A4 (210x297 mm)',
      recordedStatus: 'verified',
      verificationMethod: 'ai-evidence-audit',
      aiEvidenceValidation: 'not-revalidated',
      aiClaim: { value: 'A4', scope: 'whole', modality: 'directive' },
      aiPasses: expect.arrayContaining([
        expect.objectContaining({ pass: 'extract', verdict: 'confirm' }),
        expect.objectContaining({ pass: 'quote-check', verdict: 'confirm' }),
        expect.objectContaining({ pass: 'refute', verdict: 'confirm' }),
      ]),
      auditExecution: expect.objectContaining({
        manifestId: expect.stringContaining('closed-loop:efos-doktorski:'),
        testId: 'closed-loop:efos-doktorski:efos-doktorski--paper-size',
        command: 'npm run closed-loop -- --profile efos-doktorski --no-structural',
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      scored: true,
      fixerId: 'paper-size-fixer',
    }));
    expect(efosDoctoral?.completionByWorkType).toEqual([
      expect.objectContaining({
        workType: 'doctoral',
        level: expect.stringMatching(/^[A-E]$/),
        blockedReasons: expect.any(Array),
        claimSource: 'docs/generated/completion-ledger.json',
      }),
    ]);
    expect(efosDoctoral?.automaticTests).toMatchObject({
      realCorpus: 'not-run',
      syntheticClosedLoop: 'pass',
    });
  });

  it('ne skriva nedostajući izvor ili citat i dopušta profil bez staging pravila', () => {
    const entries = [{
      ruleId: 'profile--missing-source',
      sourceId: 'unregistered-source',
      status: 'verified',
      scored: true,
      value: 'A4',
    }] as RuleEntry[];

    expect(projectRuleEvidence(entries, new Map<string, SourceEntry>())).toEqual([
      expect.objectContaining({
        ruleId: 'profile--missing-source',
        sourceId: 'unregistered-source',
        sourceTitle: null,
        sourceUrl: null,
        sourcePage: null,
        quote: null,
        recordedStatus: 'verified',
        aiEvidenceValidation: 'missing',
        scored: true,
      }),
    ]);
    expect(projectRuleEvidence([], new Map<string, SourceEntry>())).toEqual([]);
  });
});
