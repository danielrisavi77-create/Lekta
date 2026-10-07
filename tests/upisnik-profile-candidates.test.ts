import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import upisnik from '../data/programs/drafts/upisnik.json';
import programComponents from '../docs/generated/upisnik-program-components.json';
import profileDecisions from '../data/programs/upisnik-profile-decisions.json';
import verifiedProfiles from '../data/profiles/verified-profiles-heavy.json';
import generatedProfileCandidates from '../docs/generated/upisnik-profile-candidates.json';
import sourceRegistry from '../data/sources/source-registry.json';
import vefSpecialistDraft from '../data/profiles/vef/drafts/vef-specijalisticki.json';
import {
  buildUpisnikProfileCandidates as buildRawUpisnikProfileCandidates,
  validateUpisnikProfileCoverageHolds,
  type ProfileCandidateInput,
  type IntegratedGraduateCoverageDecision,
} from '../src/programs/upisnik-profile-candidates';

const buildUpisnikProfileCandidates: typeof buildRawUpisnikProfileCandidates = (...args) =>
  buildRawUpisnikProfileCandidates(args[0], args[1], args[2], args[3], args[4], args[5], args[6], sourceRegistry, args[8]);

describe('buildUpisnikProfileCandidates', () => {
  it('does not offer an empty-workTypes profile at doctoral or undergraduate level, while an omitted workTypes stays eligible', () => {
    const rows = [
      { sifraUpisnik: '1', naziv: 'Geologija', izvoditelj: 'PMF', vrsta: 'Doktorski studij' },
      { sifraUpisnik: '2', naziv: 'Geologija', izvoditelj: 'PMF', vrsta: 'Sveučilišni prijediplomski studij' },
    ];
    const components = rows.map((row) => ({ programCode: row.sifraUpisnik, executors: [{ componentIds: ['pmf'] }] }));
    const profiles = [
      { id: 'empty', unitId: 'pmf', programs: ['Geologija'], workTypes: [] },
      { id: 'omitted', unitId: 'pmf', programs: ['Geologija'] },
    ];
    const report = buildUpisnikProfileCandidates(rows, components, profiles);
    for (const program of report.programs) {
      expect(program.candidateProfileIds).toEqual(['omitted']);
      expect(program.exactCandidateProfileIds).toEqual(['omitted']);
      expect(program.componentWorkTypeProfileIds).toEqual(['omitted']);
    }
  });

  it('rejects another institution domain and student repositories for a profile decision', () => {
    const rows = [{ sifraUpisnik: '109', naziv: 'Povijest (jednopredmetni)', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '109', executors: [{ componentIds: ['fhs'] }] }];
    const profiles = [{ id: 'fhs-zavrsni', unitId: 'fhs', programs: ['Povijest'], workTypes: ['final'], sources: [{ url: 'https://fhs.unizg.hr/upute' }] }];
    const evidence = { sourceUrl: 'https://fhs.unizg.hr/program/povijest', sourceLocator: 'Povijest', quote: 'Povijest' };
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '109', profileId: 'fhs-zavrsni', evidence }]).summary.evidenceBackedCandidatePrograms).toBe(1);
    for (const sourceUrl of ['https://www.unicath.hr/povijest', 'https://repozitorij.fhs.unizg.hr/povijest']) {
      expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '109', profileId: 'fhs-zavrsni', evidence: { ...evidence, sourceUrl } }])).toThrow(/source domain/i);
    }
  });

  it('accepts faculty hosts while rejecting another faculty on the same university domain', () => {
    const rows = [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }];
    const profiles = [{ id: 'fhs-zavrsni', unitId: 'fhs', programs: ['Povijest'], workTypes: ['final'], sources: [{ url: 'https://www.unizg.hr/studiji' }] }];
    const evidence = { sourceUrl: 'https://fhs.unizg.hr/povijest', sourceLocator: 'Povijest', quote: 'Povijest' };
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '1', profileId: 'fhs-zavrsni', evidence }]).summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '1', profileId: 'fhs-zavrsni', evidence: { ...evidence, sourceUrl: 'https://ffzg.unizg.hr/povijest' } }])).toThrow(/source domain/i);
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '1', profileId: 'fhs-zavrsni', evidence: { ...evidence, sourceUrl: 'https://www.unizg.hr/povijest' } }])).toThrow(/source domain/i);
  });

  it('recognizes inflected programme names and explicit all-studies wording', () => {
    const rows = [{ sifraUpisnik: '3', naziv: 'Elektrotehnika', izvoditelj: 'RITEH', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '3', executors: [{ componentIds: ['riteh'] }] }];
    const profiles = [{ id: 'riteh-zavrsni', unitId: 'riteh', programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: 'https://riteh.uniri.hr/studij' }] }];
    const evidence = { sourceUrl: 'https://riteh.uniri.hr/studij', sourceLocator: 'stranica studija', quote: 'Sveučilišni prijediplomski studij elektrotehnike' };
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '3', profileId: 'riteh-zavrsni', evidence }]).summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '3', profileId: 'riteh-zavrsni', evidence: { ...evidence, quote: 'Svi prijediplomski studiji imaju završni rad' } }]).summary.evidenceBackedCandidatePrograms).toBe(1);
  });

  it('rejects Fizioterapija as evidence for Upisnik 203 Fizika', () => {
    const rows = [{ sifraUpisnik: '203', naziv: 'Fizika', izvoditelj: 'PMF', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '203', executors: [{ componentIds: ['pmf'] }] }];
    const profiles = [{ id: 'pmf-fizika', unitId: 'pmf', programs: ['Fizika'], workTypes: ['final'], sources: [{ url: 'https://www.pmf.unizg.hr/studiji' }] }];
    const evidence = { sourceUrl: 'https://www.pmf.unizg.hr/studiji', sourceLocator: 'službena stranica', quote: 'Fizioterapija' };
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '203', profileId: 'pmf-fizika', evidence }])).toThrow(/program name/i);
  });

  it('rejects inflected vocational wording for university program 3 while accepting its inflected name', () => {
    const rows = [{ sifraUpisnik: '3', naziv: 'Elektrotehnika', izvoditelj: 'RITEH', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '3', executors: [{ componentIds: ['riteh'] }] }];
    const profiles = [{ id: 'riteh-zavrsni', unitId: 'riteh', programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: 'https://riteh.uniri.hr/studij' }] }];
    const evidence = { sourceUrl: 'https://riteh.uniri.hr/studij', sourceLocator: 'službena stranica', quote: 'Prijediplomski studij elektrotehnike' };
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '3', profileId: 'riteh-zavrsni', evidence }]).summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '3', profileId: 'riteh-zavrsni', evidence: { ...evidence, quote: 'Prijediplomski program stručnog studija elektrotehnike' } }])).toThrow(/study type/i);
  });

  it('does not treat a faculty name in a locator as the programme name', () => {
    const rows = [{ sifraUpisnik: '212', naziv: 'Matematika', izvoditelj: 'UNIRI', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '212', executors: [{ componentIds: ['matematika'] }] }];
    const profiles = [{ id: 'math-uniri-zavrsni', unitId: 'matematika', programs: ['Matematika'], workTypes: ['final'], sources: [{ url: 'https://math.uniri.hr/studiji' }] }];
    const evidence = { sourceUrl: 'https://math.uniri.hr/studiji', sourceLocator: 'stranica Fakulteta za matematiku UNIRI, popis studija', quote: 'Sveučilišni prijediplomski studij' };
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '212', profileId: 'math-uniri-zavrsni', evidence }])).toThrow(/program name/i);
  });

  it('preserves rejected evidence on authored holds', () => {
    const rows = [{ sifraUpisnik: '109', naziv: 'Povijest (jednopredmetni)', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '109', executors: [{ componentIds: ['fhs'] }] }];
    const hold = profileDecisions.holds.find((item) => item.programCode === '109')!;
    expect(buildUpisnikProfileCandidates(rows, components, [], [], [], [], [hold]).programs[0]?.remainingHold?.sources).toEqual(hold.sources);
    expect(() => buildUpisnikProfileCandidates(rows, components, [], [], [], [], [{ ...hold, sources: [] }])).toThrow(/needs source evidence/i);
  });

  it('requires a program name or an explicit all-studies scope in the evidence', () => {
    const rows = [{ sifraUpisnik: '60', naziv: 'Građevinarstvo', izvoditelj: 'GradRI', vrsta: 'Sveučilišni prijediplomski studij' }];
    const components = [{ programCode: '60', executors: [{ componentIds: ['gradri'] }] }];
    const profiles = [{ id: 'gradri-zavrsni', unitId: 'gradri', programs: ['Građevinarstvo'], workTypes: ['final'] }];
    const evidence = { sourceUrl: 'https://gradri.uniri.hr/studij', sourceLocator: 'službena stranica', quote: 'Sveučilišni prijediplomski studij' };
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '60', profileId: 'gradri-zavrsni', evidence }])).toThrow(/program name/i);
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '60', profileId: 'gradri-zavrsni', evidence: { ...evidence, quote: 'Na svim prijediplomskim studijima Fakulteta izrađuje se završni rad' } }]).summary.evidenceBackedCandidatePrograms).toBe(1);
  });

  it('rejects evidence claiming a vocational study for a university Upisnik row even when profile has no study kind', () => {
    const rows = [{ sifraUpisnik: '4830', naziv: 'Ekonomija', izvoditelj: 'UNIDU', vrsta: 'Sveučilišni diplomski studij' }];
    const components = [{ programCode: '4830', executors: [{ componentIds: ['unidu'] }] }];
    const profiles = [{ id: 'unidu-diplomski', unitId: 'unidu', programs: ['Ekonomija'], workTypes: ['graduate'] }];
    const evidence = { sourceUrl: 'https://www.unidu.hr/ekonomija', sourceLocator: 'Ekonomija', quote: 'Ekonomija, sveučilišni diplomski studij' };
    expect(buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '4830', profileId: 'unidu-diplomski', evidence }]).summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [{ programCode: '4830', profileId: 'unidu-diplomski', evidence: { ...evidence, quote: 'Ekonomija, stručni diplomski studij' } }])).toThrow(/study type/i);
  });
  it('lists only exact program-name profiles on a mapped component as candidates', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '1', naziv: 'Logopedija', izvoditelj: 'Sveučilište' }],
      [{ programCode: '1', executors: [{ componentIds: ['logri'] }] }],
      [
        { id: 'logri-grad', unitId: 'logri', programs: ['Logopedija'], workTypes: ['graduate'] },
        { id: 'logri-other', unitId: 'logri', programs: ['Kroatistika'], workTypes: ['final'] },
        { id: 'ffri-logri', unitId: 'ffri', programs: ['Logopedija'], workTypes: ['graduate'] },
      ],
    );

    expect(report.programs[0]?.candidateProfileIds).toEqual(['logri-grad']);
    expect(report.programs[0]?.coverageStatus).toBe('exact-name-candidate-needs-evidence');
    expect(report.summary.exactCandidatePrograms).toBe(1);
    expect(report.summary.noExactCandidatePrograms).toBe(0);
  });

  it('does not invent profile matches for unresolved programs or accent differences beyond normalization', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2', naziv: 'Logopedija', izvoditelj: 'Sveučilište' }],
      [],
      [{ id: 'logri-grad', unitId: 'logri', programs: ['Logopedija'], workTypes: ['graduate'] }],
    );

    expect(report.programs[0]?.candidateProfileIds).toEqual([]);
    expect(report.programs[0]?.coverageStatus).toBe('component-unresolved');
    expect(report.summary.unmappedPrograms).toBe(1);
    expect(report.summary.noExactCandidatePrograms).toBe(1);
    expect(report.programs[0]).toMatchObject({
      remainingHold: {
        code: 'component-mapping-needed',
        reason: expect.stringContaining('2'),
        missingEvidence: expect.arrayContaining([expect.stringContaining('stranica programa')]),
      },
    });
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
  });

  it('objašnjava nedostajući profil, nepotvrđen identitet i točan naziv kandidata različitim holdovima', () => {
    const report = buildUpisnikProfileCandidates(
      [
        { sifraUpisnik: '11', naziv: 'Logopedija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni prijediplomski studij' },
        { sifraUpisnik: '12', naziv: 'Logopedija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni diplomski studij' },
        { sifraUpisnik: '13', naziv: 'Psihologija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni diplomski studij' },
      ],
      [11, 12, 13].map((programCode) => ({ programCode: String(programCode), executors: [{ componentIds: ['logri'] }] })),
      [
        { id: 'logri-grad', unitId: 'logri', programs: ['Logopedija'], workTypes: ['graduate'] },
        { id: 'logri-other', unitId: 'logri', programs: ['Drugi program'], workTypes: ['graduate'] },
      ],
    );

    expect(report.programs.map(({ coverageStatus, remainingHold }) => [coverageStatus, remainingHold?.code])).toEqual([
      ['profile-missing-for-component-level', 'profile-for-study-level-needed'],
      ['exact-name-candidate-needs-evidence', 'exact-candidate-evidence-needed'],
      ['identity-evidence-needed', 'program-profile-identity-needed'],
    ]);
  });

  it('čuva redak po redak službene dokaze kad je primjenjivost pravila nerazriješena', () => {
    const evidence = {
      sourceUrl: 'https://www.agr.unizg.hr/study/rules',
      sourceLocator: 'upute za diplomski rad, odjeljak Oblikovanje',
      quote: 'Upute za oblikovanje diplomskog rada, izdanje 2017.',
    };
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '575', naziv: 'Hranidba životinja i hrana', izvoditelj: 'Sveučilište, Agronomski fakultet' }],
      [{ programCode: '575', executors: [{ componentIds: ['agr'] }] }],
      [{ id: 'agr-diplomski', unitId: 'agr', programs: ['Diplomski studiji Agronomskog fakulteta'], workTypes: ['graduate'] }],
      [],
      [],
      [],
      [{
        programCode: '575',
        reason: 'Stranica kolegija programa navodi 2017. upute, dok središnja stranica navodi izdanje 2019.',
        missingEvidence: ['Službena potvrda koja određuje važeće izdanje i primjenjivi skup pravila za ovaj program.'],
        sources: [evidence, { ...evidence, sourceUrl: 'https://www.agr.unizg.hr/faculty/rules-2019', quote: 'Upute za oblikovanje diplomskog rada, izdanje 2019.' }],
      }],
    );

    expect(report.programs[0]).toMatchObject({
      coverageStatus: 'identity-evidence-needed',
      remainingHold: {
        reason: expect.stringContaining('2017. upute'),
        missingEvidence: [expect.stringContaining('važeće izdanje')],
        sources: expect.arrayContaining([expect.objectContaining({ sourceUrl: evidence.sourceUrl })]),
      },
    });
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
  });

  it('odbacuje hold koji bi istodobno ostavio odobrenu profilnu odluku aktivnom', () => {
    const evidence = {
      sourceUrl: 'https://www.agr.unizg.hr/study',
      sourceLocator: 'službena stranica programa',
      quote: 'Hranidba životinja i hrana',
    };
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '575', naziv: 'Hranidba životinja i hrana', izvoditelj: 'Agronomski fakultet' }],
      [{ programCode: '575', executors: [{ componentIds: ['agr'] }] }],
      [{ id: 'agr-diplomski', unitId: 'agr', programs: ['Hranidba životinja i hrana'], workTypes: ['graduate'] }],
      [{ programCode: '575', profileId: 'agr-diplomski', evidence }],
      [],
      [],
      [{ programCode: '575', reason: 'Primjenjivost pravila nije potvrđena.', missingEvidence: ['Važeće upute.'], sources: [evidence] }],
    )).toThrow(/conflicts with another profile decision/);
  });

  it('ne prikazuje hold za verified ni za službeno potvrđenu neprimjenjivost', () => {
    const evidence = {
      sourceUrl: 'https://logri.uniri.hr/study',
      sourceLocator: 'službena stranica studija, završetak',
      quote: 'Sveučilišni diplomski studij Logopedija; studij završava polaganjem svih ispita bez završnog rada.',
    };
    const report = buildUpisnikProfileCandidates(
      [
        { sifraUpisnik: '20', naziv: 'Logopedija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni diplomski studij' },
        { sifraUpisnik: '21', naziv: 'Logopedija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni prijediplomski studij' },
      ],
      [20, 21].map((programCode) => ({ programCode: String(programCode), executors: [{ componentIds: ['logri'] }] })),
      [{ id: 'logri-grad', unitId: 'logri', programs: ['Logopedija'], workTypes: ['graduate'] }],
      [{ programCode: '20', profileId: 'logri-grad', evidence }],
      [{ programCode: '21', reasonCode: 'no-written-final-work', evidence }],
    );

    expect(report.programs.map(({ coverageStatus, remainingHold }) => [coverageStatus, remainingHold])).toEqual([
      ['verified', null],
      ['not-applicable', null],
    ]);
  });

  it('pridružuje precizan hold svakom neriješenom retku u cijelom Upisniku', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
      sourceRegistry,
      profileDecisions.integratedGraduateCoverage,
    );

    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
    expect(report.programs.filter(({ remainingHold }) => remainingHold != null)).toHaveLength(
      report.programs.filter(({ coverageStatus }) => !['verified', 'not-applicable'].includes(coverageStatus)).length,
    );
  });
});

describe('Upisnik profile decision inventory', () => {
  it('keeps the exact named set of verified codes and fresh generated candidates', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
      sourceRegistry,
      profileDecisions.integratedGraduateCoverage,
    );
    const namedCodes = (programs: typeof report.programs) => programs
      .filter((program) => program.profileDecisionEvidence.length > 0)
      .map((program) => program.programCode).sort();
    expect(namedCodes(report.programs)).toEqual(namedCodes(generatedProfileCandidates.programs));
    expect(report.summary).toEqual(generatedProfileCandidates.summary);
    expect(report.programs).toEqual(generatedProfileCandidates.programs);
    expect(new Set(report.programs.map((program) => program.programCode)).size).toBe(1312);
    expect(report.programs).toHaveLength(1312);
    const byCode = new Map(report.programs.map((program) => [program.programCode, program]));
    for (const code of ['109', '4830', '85', '246', '247', '248', '249', '250', '251', '252', '253', '254',
      '857', '865', '868', '869', '870', '872', '889', '1805']) {
      expect(byCode.get(code)?.profileDecisionEvidence, code).toEqual([]);
      expect(byCode.get(code)?.remainingHold?.reason, code).toBeTruthy();
    }
    for (const code of ['144', '295']) expect(byCode.get(code)?.coverageStatus, code).toBe('not-applicable');
    expect(byCode.get('137')?.remainingHold?.reason).toMatch(/pisani završni rad/);
    expect(byCode.get('192')?.profileDecisionEvidence[0]?.quote).toBe('Molekularna biologija');
    expect(byCode.get('194')?.profileDecisionEvidence[0]?.quote).toBe('Biologija');
    for (const decision of profileDecisions.holds.filter((hold) => hold.reason.startsWith('Stranica MEF-a'))) {
      expect(byCode.get(decision.programCode)?.profileDecisionEvidence, decision.programCode).toEqual([]);
      expect(byCode.get(decision.programCode)?.remainingHold?.reason).toContain('ne imenuje');
    }
    expect(profileDecisions.holds.filter((hold) => hold.reason.startsWith('Stranica MEF-a'))).toHaveLength(51);
  });
});

  it('prepoznaje puni profilni naziv s razinom kada se naziv programa točno podudara', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '3', naziv: 'Elektrotehnika', izvoditelj: 'Sveučilište u Rijeci, Tehnički fakultet' }],
      [{ programCode: '3', executors: [{ componentIds: ['riteh'] }] }],
      [{ id: 'riteh-zavrsni', unitId: 'riteh', programs: ['Sveučilišni prijediplomski studij Elektrotehnika'], workTypes: ['final'] }],
    );

    expect(report.programs[0]?.candidateProfileIds).toEqual(['riteh-zavrsni']);
    expect(report.programs[0]?.coverageStatus).toBe('exact-name-candidate-needs-evidence');
  });

describe('study-level-aware profile candidates', () => {
  it('uses the Upisnik study level to avoid matching the same title to the wrong work type', () => {
    const report = buildUpisnikProfileCandidates(
      [
        { sifraUpisnik: '1952', naziv: 'Inženjerstvo okoliša', izvoditelj: 'GFV', vrsta: 'Sveučilišni prijediplomski studij' },
        { sifraUpisnik: '2277', naziv: 'Inženjerstvo okoliša', izvoditelj: 'GFV', vrsta: 'Sveučilišni diplomski studij' },
        { sifraUpisnik: '2461', naziv: 'Inženjerstvo okoliša', izvoditelj: 'GFV', vrsta: 'Doktorski studij' },
      ],
      [
        { programCode: '1952', executors: [{ componentIds: ['geoteh'] }] },
        { programCode: '2277', executors: [{ componentIds: ['geoteh'] }] },
        { programCode: '2461', executors: [{ componentIds: ['geoteh'] }] },
      ],
      [
        { id: 'geoteh-zavrsni', unitId: 'geoteh', programs: ['Inženjerstvo okoliša'], workTypes: ['final'] },
        { id: 'geoteh-diplomski', unitId: 'geoteh', programs: ['Inženjerstvo okoliša'], workTypes: ['graduate'] },
        { id: 'geoteh-doktorski', unitId: 'geoteh', programs: ['Inženjerstvo okoliša'], workTypes: ['doctoral'] },
      ],
    );

    expect(report.programs.map(({ candidateProfileIds }) => candidateProfileIds)).toEqual([
      ['geoteh-zavrsni'],
      ['geoteh-diplomski'],
      ['geoteh-doktorski'],
    ]);
  });
});

describe('evidence-backed program profile decisions', () => {
  const evidence = {
    sourceUrl: 'https://repozitorij.unizd.hr/theses/unizd%3A9492/show-file/0',
    sourceLocator: 'naslovna stranica diplomskog rada, str. 1',
    quote: 'Odjel za hispanistiku i iberske studije; Sveučilišni diplomski studij; Hispanistika',
  };

  it('rejects a UNIZD Hispanistika mapping based on a student thesis', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2168', naziv: 'Hispanistika (dvopredmetni)', izvoditelj: 'Sveučilište u Zadru', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '2168', executors: [{ componentIds: ['unizd'] }] }],
      [{ id: 'unizd-hispanistika-diplomski', unitId: 'unizd', programs: ['Odjel za hispanistiku i iberske studije (diplomski rad, Zadar)'], workTypes: ['graduate'] }],
      [{ programCode: '2168', profileId: 'unizd-hispanistika-diplomski', evidence }],
    )).toThrow(/source domain/i);
  });

  it('rejects a decision whose profile belongs to another component or study level', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2168', naziv: 'Hispanistika (dvopredmetni)', izvoditelj: 'Sveučilište u Zadru', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '2168', executors: [{ componentIds: ['unizd'] }] }],
      [{ id: 'wrong-profile', unitId: 'ffri', programs: ['Hispanistika'], workTypes: ['final'] }],
      [{ programCode: '2168', profileId: 'wrong-profile', evidence }],
    )).toThrow(/component|work type/i);
  });

  it('rejects a decision when the profile does not declare the matching study work type', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2168', naziv: 'Hispanistika (dvopredmetni)', izvoditelj: 'Sveučilište u Zadru', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '2168', executors: [{ componentIds: ['unizd'] }] }],
      [{ id: 'unizd-hispanistika-diplomski', unitId: 'unizd', programs: [], workTypes: [] }],
      [{ programCode: '2168', profileId: 'unizd-hispanistika-diplomski', evidence }],
    )).toThrow(/work type/i);
  });

  it('rejects decisions without traceable source evidence', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2168', naziv: 'Hispanistika (dvopredmetni)', izvoditelj: 'Sveučilište u Zadru', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '2168', executors: [{ componentIds: ['unizd'] }] }],
      [{ id: 'unizd-hispanistika-diplomski', unitId: 'unizd', programs: [], workTypes: ['graduate'] }],
      [{ programCode: '2168', profileId: 'unizd-hispanistika-diplomski', evidence: { ...evidence, quote: ' ' } }],
    )).toThrow(/evidence/i);
  });

  it('classifies a mapped program with only a different profile title as needing identity evidence', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '9', naziv: 'Hispanistika', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '9', executors: [{ componentIds: ['unizd'] }] }],
      [{ id: 'odjelni-profil', unitId: 'unizd', programs: ['Odjel za hispanistiku'], workTypes: ['graduate'] }],
    );

    expect(report.programs[0]?.componentWorkTypeProfileIds).toEqual(['odjelni-profil']);
    expect(report.programs[0]?.coverageStatus).toBe('identity-evidence-needed');
    expect(Object.values(report.summary.coverageByStatus).reduce((sum, count) => sum + count, 0)).toBe(report.summary.totalPrograms);
  });

  it('classifies a component and level with no corresponding profile as a missing profile', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '10', naziv: 'Logopedija', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni diplomski studij' }],
      [{ programCode: '10', executors: [{ componentIds: ['erf'] }] }],
      [{ id: 'erf-zavrsni', unitId: 'erf', programs: ['Logopedija'], workTypes: ['final'] }],
    );

    expect(report.programs[0]?.coverageStatus).toBe('profile-missing-for-component-level');
    expect(report.programs[0]?.componentWorkTypeProfileIds).toEqual([]);
  });

  it('records an officially documented final-exam-only programme as not applicable', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '291', naziv: 'Psihologija', izvoditelj: 'Filozofski fakultet u Rijeci', vrsta: 'Sveučilišni prijediplomski studij' }],
      [{ programCode: '291', executors: [{ componentIds: ['ffri'] }] }],
      [{ id: 'ffri-zavrsni', unitId: 'ffri', programs: [], workTypes: ['final'] }],
      [],
      [{
        programCode: '291',
        reasonCode: 'no-written-final-work',
        evidence: {
          sourceUrl: 'https://ffri.uniri.hr/studiranje/programi/prijediplomski/psih/',
          sourceLocator: 'službena stranica studija, način završetka studija',
          quote: 'Način završetka studija | Polaganje svih ispita i polaganje završnog ispita',
        },
      }],
    );

    expect(report.programs[0]?.coverageStatus).toBe('not-applicable');
    expect(report.programs[0]?.applicabilityDecisionEvidence).toEqual({
      reasonCode: 'no-written-final-work',
      sourceUrl: 'https://ffri.uniri.hr/studiranje/programi/prijediplomski/psih/',
      sourceLocator: 'službena stranica studija, način završetka studija',
      quote: 'Način završetka studija | Polaganje svih ispita i polaganje završnog ispita',
    });
    expect(report.summary.coverageByStatus['not-applicable']).toBe(1);
  });

  it('records a specialist programme with an official exam-only completion rule as not applicable', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '2230', naziv: 'Opća interna medicina', izvoditelj: 'Medicinski fakultet u Rijeci', vrsta: 'Sveučilišni specijalistički studij' }],
      [{ programCode: '2230', executors: [{ componentIds: ['medri'] }] }],
      [],
      [],
      [{
        programCode: '2230',
        reasonCode: 'no-required-written-work',
        evidence: {
          sourceUrl: 'https://medri.uniri.hr/obrazovanje/studiji/poslijediplomski-specijalisticki-studiji/opca-interna-medicina/',
          sourceLocator: 'službena stranica specijalističkog studija, način završetka',
          quote: 'Polaganjem završnog ispita',
        },
      }],
    );

    expect(report.programs[0]?.coverageStatus).toBe('not-applicable');
    expect(report.programs[0]?.applicabilityDecisionEvidence?.reasonCode).toBe('no-required-written-work');
  });

  it('records the PMF undergraduate geophysics programme without a required final paper as not applicable', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '204', naziv: 'Geofizika – klimatologija, meteorologija, oceanografija, seizmologija', izvoditelj: 'Prirodoslovno-matematički fakultet', vrsta: 'Sveučilišni prijediplomski studij' }],
      [{ programCode: '204', executors: [{ componentIds: ['pmf'] }] }],
      [],
      [],
      [{ programCode: '204', reasonCode: 'no-written-final-work', evidence: {
        sourceUrl: 'https://www.pmf.unizg.hr/geof/preddiplomski_studij?ak=2026',
        sourceLocator: 'službeni opis prijediplomskog studija, Način završetka studija',
        quote: 'polaganje svih ispita i prikupljanje 180 ECTS bodova',
      } }],
    );

    expect(report.programs[0]?.coverageStatus).toBe('not-applicable');
    expect(report.programs[0]?.applicabilityDecisionEvidence?.reasonCode).toBe('no-written-final-work');
  });

  it('rejects an exclusion reason code the report does not understand', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '291', naziv: 'Psihologija', izvoditelj: 'Filozofski fakultet u Rijeci', vrsta: 'Sveučilišni prijediplomski studij' }],
      [{ programCode: '291', executors: [{ componentIds: ['ffri'] }] }],
      [],
      [],
      [{
        programCode: '291',
        reasonCode: 'unsupported-reason',
        evidence: {
          sourceUrl: 'https://ffri.uniri.hr/studiranje/programi/prijediplomski/psih/',
          sourceLocator: 'službena stranica studija',
          quote: 'Način završetka studija | Polaganje svih ispita i polaganje završnog ispita',
        },
      } as never],
    )).toThrow(/unsupported reason code/i);
  });
});


describe('committed Upisnik profile decisions', () => {
  it('maps MEFST EBM and neoplasm-biology doctorates to the shared doctoral profile from the official doctoral-school list', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected = [
      ['658', 'Biologija novotvorina'],
      ['728', 'Klinička medicina utemeljena na dokazima'],
    ] as const;

    for (const [programCode, programName] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.programName, programCode).toContain(programName);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'mefst-doktorski',
        sourceUrl: 'https://mefst.unist.hr/studiji/doktorska-skola/52',
        quote: programName,
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('maps TRIBE when the cited quote names that Upisnik programme', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const program = report.programs.find((row) => row.programCode === '1882');

    expect(program?.profileDecisionEvidence).toContainEqual(expect.objectContaining({ profileId: 'mefst-tribe-doktorski' }));
    expect(program?.coverageStatus).toBe('verified');
  });

  it('maps EFRI specialist programmes under the current common specialist-work regulation', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expectedCodes = ['832', '837', '838', '839', '840', '861', '1769', '1915', '2220', '2310'];

    for (const programCode of expectedCodes) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'efri-specijalisticki',
        sourceUrl: 'https://arhiva.efri.uniri.hr/upload/SSS/SSS_EFRI-Pravilnik_rad_22_07_2024.pdf',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('maps FFST undergraduate and graduate programmes under the current faculty regulation', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['287', 'ffst-zavrsni'], ['1642', 'ffst-zavrsni'], ['2581', 'ffst-zavrsni'], ['2621', 'ffst-zavrsni'],
      ['316', 'ffst-diplomski'], ['356', 'ffst-diplomski'], ['435', 'ffst-diplomski'], ['437', 'ffst-diplomski'],
      ['478', 'ffst-diplomski'], ['487', 'ffst-diplomski'], ['1643', 'ffst-diplomski'], ['2135', 'ffst-diplomski'],
      ['2136', 'ffst-diplomski'], ['2582', 'ffst-diplomski'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId,
        sourceUrl: 'https://www.ffst.unist.hr/_download/repository/Pravilnik%20o%20zavr%C5%A1nom%20i%20diplomskom%20radu%202024..pdf',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('keeps FFST generic profile defaults aligned with the V3 decision', () => {
    for (const profileId of ['ffst-zavrsni', 'ffst-diplomski']) {
      const profile = verifiedProfiles[profileId];
      expect(profile.rules.margins).toEqual({ top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 });
      expect(profile.ruleAuthority).toBe('generic');
      expect(profile.normativeScope).toEqual([]);
      expect(profile.advisoryScope).toContain('Margine');
    }
  });

  it('maps the current FFPU final and graduate work programmes to matching profiles', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['2083', 'ffpu-zavrsni'], ['2084', 'ffpu-zavrsni'], ['2091', 'ffpu-zavrsni'], ['2092', 'ffpu-zavrsni'],
      ['2093', 'ffpu-zavrsni'], ['2171', 'ffpu-zavrsni'], ['2260', 'ffpu-zavrsni'], ['2261', 'ffpu-zavrsni'],
      ['2457', 'ffpu-zavrsni'], ['2458', 'ffpu-zavrsni'],
      ['2128', 'ffpu-diplomski'], ['2129', 'ffpu-diplomski'], ['2130', 'ffpu-diplomski'], ['2131', 'ffpu-diplomski'],
      ['2132', 'ffpu-diplomski'], ['2172', 'ffpu-diplomski'], ['2243', 'ffpu-diplomski'], ['2538', 'ffpu-diplomski'],
      ['2539', 'ffpu-diplomski'], ['2819', 'ffpu-diplomski'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('maps current UNIZD programme identities only to matching department and degree profiles', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected = [
      ['2453', 'unizd-zdravstvo-zavrsni'], ['2454', 'unizd-zdravstvo-diplomski'],
      ['1832', 'unizd-ekologija-zavrsni'], ['2428', 'unizd-ekologija-diplomski'],
      ['2298', 'unizd-tko-diplomski'], ['344', 'unizd-talijanistika-diplomski'],
      ['439', 'unizd-francuski-diplomski'], ['440', 'unizd-francuski-diplomski'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    const greek = report.programs.find((row) => row.programCode === '442');
    expect(greek?.coverageStatus).not.toBe('verified');
    expect(greek?.remainingHold?.reason).toContain('prijediplomski studij i završni rad');
    for (const programCode of ['1894', '2297', '2654', '2668']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila/);
      expect(program?.remainingHold?.sources.length, programCode).toBeGreaterThan(0);
    }
  });

  it('maps current VEF specialist studies and English Veterinary Medicine to level-matched profiles', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected = [
      '791', '800', '2693', '2694', '2695', '2696', '2697', '2698',
      '2700', '2701', '2703', '2704', '2705', '2707', '2708',
    ].map((code) => [code, 'vef-specijalisticki'] as const).concat([['4820', 'vef-diplomski'] as const]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    for (const programCode of ['792', '2692']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).not.toBe('verified');
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila/);
    }
  });

  it('maps current PMF Split thesis programmes and blocks uncertain variants', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected: Array<readonly [string, string]> = [
      ['196', 'pmfst-zavrsni'], ['216', 'pmfst-zavrsni'], ['221', 'pmfst-zavrsni'], ['222', 'pmfst-zavrsni'],
      ['507', 'pmfst-diplomski'], ['531', 'pmfst-diplomski'], ['532', 'pmfst-diplomski'], ['535', 'pmfst-diplomski'],
      ['2640', 'pmfst-diplomski'], ['2646', 'pmfst-diplomski'],
    ];
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    expect(report.programs.find((row) => row.programCode === '200')?.applicabilityDecisionEvidence?.reasonCode).toBe('no-written-final-work');
    for (const programCode of ['505', '508', '533', '534', '727', '4849', '4850']) {
      expect(report.programs.find((row) => row.programCode === programCode)?.coverageStatus).not.toBe('verified');
    }
  });

  it('maps North University programmes only to evidence-matched academic-area profiles', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected: Array<readonly [string, string]> = [
      ['945', 'unin-tehnicki-zavrsni'], ['1008', 'unin-tehnicki-zavrsni'], ['1011', 'unin-tehnicki-zavrsni'],
      ['2430', 'unin-tehnicki-zavrsni'], ['2638', 'unin-tehnicki-zavrsni'], ['2639', 'unin-tehnicki-zavrsni'],
      ['2416', 'unin-tehnicki-diplomski'], ['2417', 'unin-tehnicki-diplomski'],
      ['1719', 'unin-biomedicina-zavrsni'], ['2432', 'unin-biomedicina-zavrsni'],
      ['2447', 'unin-biomedicina-diplomski'], ['1775', 'unin-drustveni-diplomski'],
    ];
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    for (const programCode of ['946', '1009', '1774', '2282', '2330', '2376', '2418', '2431', '2464', '2619']) {
      expect(report.programs.find((row) => row.programCode === programCode)?.coverageStatus).not.toBe('verified');
    }
  });

  it('maps only UNIDU programmes covered by the current economics faculty regulation', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected: Array<readonly [string, string]> = [
      ['1729', 'unidu-ekonomija-diplomski'],
      ['1956', 'unidu-ekonomija-zavrsni'], ['2266', 'unidu-ekonomija-zavrsni'],
      ['2308', 'unidu-ekonomija-diplomski'], ['2592', 'unidu-ekonomija-diplomski'],
    ];
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    for (const programCode of ['1652', '2211', '239', '2547', '2587', '4781']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).not.toBe('verified');
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila/);
    }
  });

  it('holds the Swedish undergraduate profile until the cited text names the Upisnik programme', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const program = report.programs.find((row) => row.programCode === '149');

    expect(program?.profileDecisionEvidence).toEqual([]);
    expect(program?.remainingHold?.reason).toBeTruthy();
  });

  it('keeps the Swedish profile partial while recording the current annual guide', () => {
    const profile = verifiedProfiles['ffzg-svedski-zavrsni'];

    expect(profile?.status).toBe('partial');
    expect(profile?.rules).toEqual({});
    expect(profile?.sources).toContain('ffzg-skandi-final-work-2025-26');
  });

  it('maps Zadars tourism and pedagogy graduate programmes using official programme records', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['594', 'unizd-turizam-diplomski', 'https://repozitorij.unizd.hr/theses/unizd%3A9129/download?file_number=0', 'Odjel za turizam i komunikacijske znanosti / Sveučilišni diplomski studij / Poduzetništvo u kulturi i turizmu; Diplomski rad'],
      ['2077', 'unizd-turizam-diplomski', 'https://repozitorij.unizd.hr/theses/unizd%3A9357/download?file_number=0', 'Odjel za turizam i komunikacijske znanosti / Sveučilišni diplomski studij / Kulturna i prirodna baština u turizmu; Diplomski rad'],
      ['582', 'unizd-pedagogija-diplomski', 'https://repozitorij.unizd.hr/theses/unizd%3A8783/show-file/0', 'Odjel za pedagogiju / Sveučilišni diplomski studij / Pedagogija; Diplomski rad'],
    ] as const;

    for (const [programCode, profileId, sourceUrl, quote] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl, quote }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies undergraduate and graduate Agronomy programmes plus FKIT materials chemistry and FŠDT urban forestry', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['99', 'fkit-zavrsni', 'https://www.fkit.unizg.hr/upisi/preddiplomski/prelazak_na_revidirani_program', 'Kemija i inženjerstvo materijala'],
      ['237', 'sumfak-zavrsni', 'https://www.sumfak.unizg.hr/hr/studiji/studiji-urbanog-sumarstva-zastite-prirode-i-okolisa/', 'Prijediplomski studij urbanog šumarstva, zaštite prirode i okoliša'],
      ['246', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Agrarna ekonomika'],
      ['247', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Agroekologija'],
      ['248', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Animalne znanosti'],
      ['249', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Biljne znanosti'],
      ['250', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Ekološka poljoprivreda'],
      ['251', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Hortikultura'],
      ['252', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Krajobrazna arhitektura'],
      ['253', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Poljoprivredna tehnika'],
      ['254', 'agr-zavrsni', 'https://www.agr.unizg.hr/hr/group/103/Preddiplomski%2Bstudij', 'Fitomedicina'],
    ] as const;

    for (const [programCode, profileId, sourceUrl, quote] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl, quote }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies AGR graduate renewable-energy and doctoral agricultural-science programmes at their own levels', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['2257', 'agr-doktorski', 'https://www.agr.unizg.hr/hr/course/hr/209/Sustav%2Bznanstveno-istra%C5%BEiva%C4%8Dkog%2Brada', 'Doktorska disertacija; prijava i obrana teme, pravila i postupci izrade disertacije'],
    ] as const;

    for (const [programCode, profileId, sourceUrl, quote] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl, quote }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  // Vlasnikovo pravilo (2026-09-27): u sukobu izdanja vrijedi najnovije izdanje ZA TU VRSTU RADA. Za diplomski rad AGR-a
  // najnovije su upute iz 2019. (izvor profila agr-diplomski), pa su diplomski programi povezani; 2463 ostaje na holdu.
  it('links AGR graduate programmes to agr-diplomski under the newest-edition rule and keeps 2463 on hold', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
      sourceRegistry,
      profileDecisions.integratedGraduateCoverage,
    );
    for (const programCode of ['313', '314', '567', '568', '569', '570', '571', '572', '573', '574', '575', '576', '577']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).toBe('verified');
      expect(program?.profileDecisionEvidence.map((evidence) => evidence.profileId), programCode).toEqual(['agr-diplomski']);
    }
    const program2463 = report.programs.find((row) => row.programCode === '2463');
    expect(program2463?.coverageStatus).toBe('identity-evidence-needed');
    expect(program2463?.profileDecisionEvidence).toEqual([]);
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
  });

  it('verifies FFRZ, FFST and PMF Split undergraduate programmes from faculty sources', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['162', 'ffrz-bakalaureatski', 'https://www.ffrz.unizg.hr/info-o-studijima/'],
      ['163', 'ffrz-bakalaureatski', 'https://www.ffrz.unizg.hr/info-o-studijima/'],
      ['177', 'ffst-zavrsni', 'https://www.ffst.unist.hr/odsjeci/povijest_umjetnosti'],
      ['191', 'pmfst-zavrsni', 'https://www.pmfst.unist.hr/portfolio-posts/prijediplomski-sveucilisni-studij-biologija-i-kemija/'],
    ] as const;

    for (const [programCode, profileId, sourceUrl] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('excludes FFRI and FFZG psychology programmes whose official sources specify a final exam', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
    );
    const program = report.programs.find(({ programCode }) => programCode === '291');

    expect(program?.coverageStatus).toBe('not-applicable');
    expect(program?.candidateProfileIds).toEqual([]);
    expect(program?.applicabilityDecisionEvidence?.reasonCode).toBe('no-written-final-work');
    const ffzgExclusions = [
      ['294', 'https://dev.ffzg.unizg.hr/hr/studiji/psihologija-131', 'Završetak: Završni ispit'],
      ['132', 'https://dev.ffzg.unizg.hr/hr/odsjeci/lingvistika', 'Lingvistika ISVU: 123; Završni ispit (10 ECTS)'],
      ['178', 'https://dev.ffzg.unizg.hr/hr/studiji/povijest-umjetnosti-130', 'Prijediplomski•Dvopredmetni•ISVU: 130; Završetak: Završni ispit'],
      ['145', 'https://dev.ffzg.unizg.hr/hr/studiji/portugalski-jezik-i-knjizevnost-127', 'Prijediplomski•Dvopredmetni•ISVU: 127; Završetak: Završni ispit'],
      ['147', 'https://dev.ffzg.unizg.hr/hr/studiji/germanistika-111', 'Prijediplomski•Dvopredmetni•ISVU: 111; Završetak: Završni ispit'],
      ['180', 'https://dev.ffzg.unizg.hr/hr/studiji/antropologija-103', 'Prijediplomski•Dvopredmetni•ISVU: 103; Završetak: Završni ispit'],
      ['181', 'https://dev.ffzg.unizg.hr/hr/studiji/etnologija-i-kulturna-antropologija-106', 'Prijediplomski•Dvopredmetni•ISVU: 106; Završetak: Završni ispit'],
    ] as const;
    for (const [programCode, sourceUrl, quote] of ffzgExclusions) {
      const program = report.programs.find(({ programCode: code }) => code === programCode);
      expect(program?.coverageStatus, programCode).toBe('not-applicable');
      expect(program?.candidateProfileIds, programCode).toEqual([]);
      expect(program?.applicabilityDecisionEvidence, programCode).toEqual(expect.objectContaining({
        reasonCode: 'no-written-final-work', sourceUrl, quote,
      }));
    }
    expect(report.summary.notApplicablePrograms).toBe(28);
  });

  it('verifies FFOS undergraduate programmes against official study pages and the most specific available profile', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['108', 'ffos-povijest-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-povijest/studijski-programi/', 'Sveučilišni preddiplomski dvopredmetni studij Povijesti'],
      ['131', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-engleski-jezik-i-knjizevnost/studijski-programi/', 'Sveučilišni prijediplomski dvopredmetni studij Engleski jezik i književnost'],
      ['160', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-filozofiju/izvedbeni-planovi-nastave/', 'PLAN I PROGRAM Sveučilišni prijediplomski dvopredmetni studij Filozofija'],
      ['293', 'ffos-psihologija-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-psihologiju/studijski-programi/', 'SVEUČILIŠNI PRIJEDIPLOMSKI JEDNOPREDMETNI STUDIJ PSIHOLOGIJA'],
      ['298', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-pedagogiju/studijski-programi/', 'Naziv studija: Sveučilišni prijediplomski dvopredmetni studij Pedagogija. Nositelj studija: Sveučilište J. J. Strossmayera u Osijeku, Filozofski fakultet'],
      ['2096', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-hrvatski-jezik-i-knjizevnost/studijski-programi/preddiplomski-studiji/', 'PLAN I PROGRAM Sveučilišni prijediplomski jednopredmetni studij Hrvatski jezik i književnost'],
      ['2097', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-hrvatski-jezik-i-knjizevnost/studijski-programi/preddiplomski-studiji/', 'PLAN I PROGRAM Sveučilišni prijediplomski dvopredmetni studij Hrvatski jezik i književnost'],
      ['2098', 'ffos-germanistika-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-njemacki-jezik-i-knjizevnost/studijski-programi/', 'PLAN I PROGRAM Sveučilišni prijediplomski jednopredmetni i dvopredmetni studij Njemački jezik i književnost'],
      ['2099', 'ffos-germanistika-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-njemacki-jezik-i-knjizevnost/studijski-programi/', 'PLAN I PROGRAM Sveučilišni prijediplomski jednopredmetni i dvopredmetni studij Njemački jezik i književnost'],
      ['2333', 'ffos-zavrsni', 'https://www.ffos.unios.hr/odsjek-za-sociologiju/studijski-programi/', 'Sveučilišni prijediplomski dvopredmetni studij Sociologija'],
      ['2522', 'ffos-zavrsni', 'https://www.ffos.unios.hr/povijest-umjetnosti/o-studiju/', 'Sveučilišni prijediplomski dvopredmetni studij Povijest umjetnosti Filozofskog fakulteta Sveučilišta Josipa Jurja Strossmayera'],
    ] as const;

    for (const [programCode, profileId, sourceUrl, quote] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl, quote }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies FFOS graduate programmes against official study pages and the most specific available profile', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['340', 'ffos-diplomski', 'https://www.ffos.unios.hr/katedra-za-madarski-jezik-i-knjizevnost/studijski-programi-mad/', 'PLAN I PROGRAM Sveučilišni diplomski dvopredmetni studij Mađarski jezik i književnost'],
      ['416', 'ffos-povijest-diplomski', 'https://www.ffos.unios.hr/odsjek-za-povijest/studijski-programi/', 'Naziv studija: Sveučilišni diplomski dvopredmetni studij Povijesti – nastavnički smjer'],
      ['475', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-filozofiju/izvedbeni-planovi-nastave/', 'PLAN I PROGRAM Sveučilišni diplomski dvopredmetni studij Filozofija'],
      ['583', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-pedagogiju/studijski-programi/', 'Naziv studija: Sveučilišni diplomski dvopredmetni studij Pedagogija. Nositelj studija: Sveučilište J. J. Strossmayera u Osijeku, Filozofski fakultet'],
      ['620', 'ffos-psihologija-diplomski', 'https://www.ffos.unios.hr/odsjek-za-psihologiju/studijski-programi/', 'SVEUČILIŠNI DIPLOMSKI JEDNOPREDMETNI STUDIJ PSIHOLOGIJA'],
      ['2137', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-hrvatski-jezik-i-knjizevnost/studijski-programi/diplomski-studiji/', 'PLAN I PROGRAM Sveučilišni diplomski dvopredmetni studij Hrvatski jezik i književnost'],
      ['2138', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-hrvatski-jezik-i-knjizevnost/studijski-programi/diplomski-studiji/', 'PLAN I PROGRAM Sveučilišni diplomski jednopredmetni studij Hrvatski jezik i književnost'],
      ['2139', 'ffos-germanistika-diplomski', 'https://www.ffos.unios.hr/odsjek-za-njemacki-jezik-i-knjizevnost/studijski-programi/', 'PLAN I PROGRAM Sveučilišni diplomski jednopredmetni i dvopredmetni studij Njemački jezik i književnost, nastavnički i prevoditeljski smjer'],
      ['2140', 'ffos-germanistika-diplomski', 'https://www.ffos.unios.hr/odsjek-za-njemacki-jezik-i-knjizevnost/studijski-programi/', 'PLAN I PROGRAM Sveučilišni diplomski jednopredmetni i dvopredmetni studij Njemački jezik i književnost, nastavnički i prevoditeljski smjer'],
      ['2141', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-engleski-jezik-i-knjizevnost/studijski-programi/', 'Sveučilišni diplomski dvopredmetni studij Engleski jezik i književnost- nastavnički smjer'],
      ['2546', 'ffos-diplomski', 'https://www.ffos.unios.hr/odsjek-za-sociologiju/studijski-programi/', 'Sveučilišni diplomski dvopredmetni studij Sociologija'],
      ['4734', 'ffos-diplomski', 'https://www.ffos.unios.hr/wp-content/uploads/2026/02/Web_Povijest-umjetnosti_diplomski-studij_2025-2026.pdf', 'Sveučilišni diplomski dvopredmetni studij Povijest umjetnosti, nastavnički smjer'],
    ] as const;

    for (const [programCode, profileId, sourceUrl, quote] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl, quote }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies the Split art-history program with the Split faculty source, not the Rijeka source', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const program = report.programs.find((row) => row.programCode === '177');

    expect(program?.profileDecisionEvidence).toContainEqual(expect.objectContaining({
      profileId: 'ffst-zavrsni',
      sourceUrl: 'https://www.ffst.unist.hr/odsjeci/povijest_umjetnosti',
      quote: 'Sveučilišni prijediplomski studij Povijest umjetnosti (dvopredmetni)',
    }));
    expect(program?.coverageStatus).toBe('verified');
  });

  it('holds FHS History because the cited page belongs to HKS, while Pula Latin remains verified', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const history = report.programs.find((row) => row.programCode === '109');
    expect(history?.coverageStatus).toBe('identity-evidence-needed');
    expect(history?.remainingHold?.reason).toMatch(/Hrvatskom katoličkom/);
    expect(history?.profileDecisionEvidence).toEqual([]);
    const latin = report.programs.find((row) => row.programCode === '114');
    expect(latin?.profileDecisionEvidence).toContainEqual(expect.objectContaining({ profileId: 'ffpu-zavrsni' }));
    expect(latin?.coverageStatus).toBe('verified');
  });

  it('verifies the remaining sourced maritime, aerospace and industrial programmes', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['88', 'pfst-zavrsni', 'https://www.pfst.unist.hr/novosti/prijem-studenata-1-godine-ag-2627'],
      ['91', 'pfri-zavrsni', 'https://pfri.uniri.hr/web/hr/studij_pre_L.php'],
      ['92', 'pfst-zavrsni', 'https://www.pfst.unist.hr/novosti/prijem-studenata-1-godine-ag-2627'],
      ['96', 'fsb-zavrsni', 'https://www.fsb.unizg.hr/atlantis/web/sites/fsbonline/content/362/733/Sveucilisni_prijediplomski_studij_Zrakoplovno_inzenjerstvo_i_svemirska_tehnika.pdf'],
      ['97', 'fesb-zavrsni', 'https://www.fesb.unist.hr/upisi/prijediplomski/'],
    ] as const;

    for (const [programCode, profileId, sourceUrl] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies FGAG, KTF and PFST undergraduate programs using official programme records', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['47', 'fgag-zavrsni', 'https://gradst.unist.hr/Portals/9/docs/Referada/Izvedbeni/PSSA/SP_PRIJEDIPLOMSKI_AiU_2024.pdf?ver=Rf_KtXrnJM140-9KTwMN7w%3D%3D'],
      ['58', 'fgag-zavrsni', 'https://gradst.unist.hr/studiji/gra%C4%91evinarstvo'],
      ['63', 'ktfst-zavrsni', 'https://www.ktf.unist.hr/index.php/upisi_/obavijesti-prijediplomski-studij/9849-prijave-za-upis-na-prijediplomske-studije'],
      ['64', 'ktfst-zavrsni', 'https://www.ktf.unist.hr/index.php/upisi_/obavijesti-prijediplomski-studij/9849-prijave-za-upis-na-prijediplomske-studije'],
      ['83', 'pfst-zavrsni', 'https://www.pfst.unist.hr/dokumenti/elaborati/Elaborat%20PN-pd.pdf'],
    ] as const;

    for (const [programCode, profileId, sourceUrl] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('verifies FSB, FER, FESB and PFRI programs against official undergraduate study sources', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['48', 'fsb-zavrsni', 'https://fsb.unizg.hr/?fsbonline=&lang=hr&studiranje_i_nastava=&upisi='],
      ['52', 'fer-zavrsni', 'https://www.fer.unizg.hr/studiji/prijediplomski_studij'],
      ['69', 'fesb-zavrsni', 'https://www.fesb.unist.hr/upisi/prijediplomski/'],
      ['74', 'fsb-zavrsni', 'https://fsb.unizg.hr/?fsbonline=&lang=hr&studiranje_i_nastava=&upisi='],
      ['77', 'pfri-zavrsni', 'https://pfri.uniri.hr/web/hr/studij_pre_BS.php'],
      ['87', 'pfri-zavrsni', 'https://pfri.uniri.hr/web/hr/studij_pre_N.php'],
    ] as const;

    for (const [programCode, profileId, sourceUrl] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId, sourceUrl }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('marks the seven RITEH undergraduate programs verified from matching official study sources', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['3', 'https://riteh.uniri.hr/obrazovanje/sveucilisni-prijediplomski-studij/elektrotehnika/'],
      ['50', 'https://riteh.uniri.hr/obrazovanje/sveucilisni-prijediplomski-studij/sveucilisni-prijediplomski-studij-brodogradnje/'],
      ['78', 'https://riteh.uniri.hr/obrazovanje/sveucilisni-prijediplomski-studij/strojarstvo/'],
      ['970', 'https://riteh.uniri.hr/obrazovanje/strucni-prijediplomski-studij/brodogradnja/'],
      ['974', 'https://riteh.uniri.hr/obrazovanje/strucni-prijediplomski-studij/elektrotehnika/'],
      ['991', 'https://riteh.uniri.hr/obrazovanje/strucni-prijediplomski-studij/strucni-prijediplomski-studij-strojarstva/'],
      ['1705', 'https://riteh.uniri.hr/media/filer_public/96/5f/965f3d8a-0e76-4f05-a4c8-543824257fbf/2024_23_09_sps_ra_studijski_program_2024.pdf'],
    ]);

    for (const [programCode, sourceUrl] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('riteh');
      expect(program?.exactCandidateProfileIds, programCode).toContain('riteh-zavrsni');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'riteh-zavrsni',
        sourceUrl,
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed FPZ Upisnik profile decisions', () => {
  it('verifies the three program identities at both study levels against official FPZ pages', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['84', 'fpz-zavrsni'],
      ['85', 'fpz-zavrsni'],
      ['86', 'fpz-zavrsni'],
      ['1524', 'fpz-diplomski'],
      ['1525', 'fpz-diplomski'],
      ['1528', 'fpz-diplomski'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('fpz');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId,
        sourceUrl: programCode.startsWith('15')
          ? 'https://www.fpz.unizg.hr/hr/studiji-i-upisi/diplomski-studij/'
          : 'https://www.fpz.unizg.hr/hr/studiji-i-upisi/prijediplomski-studij/',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed FŠDT Upisnik profile decisions', () => {
  it('verifies the forestry and wood-technology records against official FŠDT study pages', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['236', 'sumfak-zavrsni'],
      ['238', 'sumfak-zavrsni'],
      ['318', 'sumfak-diplomski'],
      ['549', 'sumfak-diplomski'],
      ['1629', 'sumfak-zavrsni'],
      ['2568', 'sumfak-zavrsni'],
      ['2569', 'sumfak-zavrsni'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('sumfak');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed TTF Upisnik profile decisions', () => {
  it('distinguishes the TTI and TMD profiles at undergraduate and graduate levels', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = [
      ['93', 'ttf-zavrsni'],
      ['95', 'ttf-dizajn-zavrsni'],
      ['365', 'ttf-diplomski'],
      ['367', 'ttf-dizajn-diplomski'],
    ] as const;

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('ttf');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId,
        sourceUrl: 'https://www.ttf.unizg.hr/studijski-programi-i-kvote/212',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed Pravni fakultet Upisnik profile decisions', () => {
  it('connects all seventeen exact program records to their faculty profile and study level', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['275', 'pravo-socijalni-rad-zavrsni'],
      ['601', 'pravo-socijalni-rad-diplomski'],
      ['736', 'pravo-specijalisticki-pravni-opci'],
      ['737', 'pravo-specijalisticki-pravni-opci'],
      ['738', 'pravo-specijalisticki-pravni-opci'],
      ['740', 'pravo-specijalisticki-pravni-opci'],
      ['741', 'pravo-specijalisticki-pravni-opci'],
      ['742', 'pravo-specijalisticki-pravni-opci'],
      ['743', 'pravo-socijalne-djelatnosti-specijalisticki'],
      ['744', 'pravo-socijalne-djelatnosti-specijalisticki'],
      ['745', 'pravo-socijalne-djelatnosti-specijalisticki'],
      ['926', 'pravo-integrirani-diplomski'],
      ['1060', 'pravo-javna-uprava-prijediplomski'],
      ['1783', 'pravo-javna-uprava-diplomski'],
      ['1789', 'pravo-socijalna-politika-diplomski'],
      ['2335', 'pravo-socijalne-djelatnosti-specijalisticki'],
      ['2675', 'pravo-specijalisticki-pravni-opci'],
    ]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('pravo');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId,
        sourceUrl: 'https://www.pravo.unizg.hr/studiji/',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed FET Pula Upisnik profile decisions', () => {
  it('separates the named undergraduate and graduate studies into their correct profiles', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['41', 'fetpu-zavrsni'],
      ['259', 'fetpu-zavrsni'],
      ['4859', 'fetpu-zavrsni'],
      ['589', 'fetpu-diplomski'],
      ['1930', 'fetpu-diplomski'],
      ['4860', 'fetpu-diplomski'],
    ]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('fetpu');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('committed ZVU Upisnik profile decisions', () => {
  it('verifies seven undergraduate records and the specialist physiotherapy profile', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['933', 'zvu-zavrsni'],
      ['1017', 'zvu-zavrsni'],
      ['1024', 'zvu-zavrsni'],
      ['1025', 'zvu-zavrsni'],
      ['1097', 'zvu-specijalisticki'],
      ['1978', 'zvu-zavrsni'],
      ['4782', 'zvu-zavrsni'],
      ['4856', 'zvu-zavrsni'],
    ]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('zvu');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('study-kind compatibility', () => {
  it('does not offer an explicitly university-only profile for a vocational study', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const program = report.programs.find((row) => row.programCode === '1048');

    expect(program?.componentIds).toContain('efri');
    expect(program?.exactCandidateProfileIds).not.toContain('efri-zavrsni');
    expect(program?.componentWorkTypeProfileIds).not.toContain('efri-zavrsni');
    expect(program?.coverageStatus).toBe('profile-missing-for-component-level');
  });
});


describe('integrated study compatibility', () => {
  it('does not offer a graduate-only profile for HKS integrated medicine', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const program = report.programs.find((row) => row.programCode === '2585');

    expect(program?.componentIds).toContain('hks');
    expect(program?.exactCandidateProfileIds).not.toContain('hks-diplomski');
    expect(program?.componentWorkTypeProfileIds).not.toContain('hks-diplomski');
    expect(program?.coverageStatus).toBe('profile-missing-for-component-level');
  });
});


describe('explicit decision compatibility', () => {
  it('rejects an explicit match across vocational and university programs', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '11', naziv: 'Poslovna ekonomija', izvoditelj: 'Ekonomski fakultet', vrsta: 'Stručni prijediplomski studij' }],
      [{ programCode: '11', executors: [{ componentIds: ['efri'] }] }],
      [{ id: 'efri-university', unitId: 'efri', programs: ['Sveučilišni prijediplomski studij Poslovna ekonomija'], workTypes: ['final'] }],
      [{ programCode: '11', profileId: 'efri-university', evidence: {
        sourceUrl: 'https://arhiva.efri.uniri.hr/study',
        sourceLocator: 'official study page',
        quote: 'Professional undergraduate study Business Economics',
      } }],
    )).toThrow(/study type/i);
  });
});


describe('specialist cycle refinements', () => {
  it('requires explicit source wording before a specialist profile can refine a generic graduate record', () => {
    expect(() => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '12', naziv: 'Fizioterapija', izvoditelj: 'Zdravstveno veleučilište', vrsta: 'Stručni diplomski studij' }],
      [{ programCode: '12', executors: [{ componentIds: ['zvu'] }] }],
      [{ id: 'zvu-specialist', unitId: 'zvu', programs: ['Specijalistički diplomski stručni studiji ZVU', 'Fizioterapija'], workTypes: ['graduate'] }],
      [{ programCode: '12', profileId: 'zvu-specialist', evidence: {
        sourceUrl: 'https://zvu.hr/study',
        sourceLocator: 'official study page',
        quote: 'Stručni diplomski studij Fizioterapija',
      } }],
    )).toThrow(/study type/i);
  });
});


describe('committed EFRI Upisnik profile decisions', () => {
  it('maps five university business-economics records to the matching level profile', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['256', 'efri-zavrsni'],
      ['1973', 'efri-zavrsni'],
      ['4790', 'efri-zavrsni'],
      ['2711', 'efri-diplomski'],
      ['4793', 'efri-diplomski'],
    ]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.componentIds, programCode).toContain('efri');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    const vocationalStudy = report.programs.find((row) => row.programCode === '1048');
    expect(vocationalStudy?.coverageStatus).toBe('profile-missing-for-component-level');
  });
});


describe('dodatne FKIT, UNIRI i PMF Upisnik odluke', () => {
  it('vezuje službeno potvrđene programe za profil odgovarajuće sastavnice i razine', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const expected = new Map([
      ['98', 'fkit-zavrsni'], ['101', 'fkit-zavrsni'],
      ['384', 'fkit-diplomski'], ['387', 'fkit-diplomski'],
      ['212', 'math-uniri-zavrsni'], ['537', 'math-uniri-diplomski'],
      ['538', 'math-uniri-diplomski'], ['1942', 'math-uniri-diplomski'],
      ['203', 'pmf-fizika-graduate'], ['907', 'pmf-fizika-graduate'],
      ['516', 'pmf-geologija-graduate'], ['528', 'pmf-matematika-graduate'],
    ]);

    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('dodatne ERF i EFZG Upisnik odluke', () => {
  it('zadržava neusklađene FFZG studije na izvorno utemeljenom hold-u po razini i studijskom području', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers, profileDecisions.holds,
    );
    const codes = [44, 136, 137, 140, 143, 146, 150, 151, 312, 427, 455, 456, 464, 465, 468, 469, 491,
      2013, 2081, 2082, 2089, 2090, 2100, 2101, 2102, 2103, 2104, 2105, 2112, 2113, 2118, 2119,
      2143, 2144, 2148, 2264, 2448, 2650, 2853, 4811];
    for (const programCode of codes) {
      const program = report.programs.find((row) => row.programCode === String(programCode));
      expect(program?.coverageStatus, String(programCode)).not.toBe('verified');
      expect(program?.remainingHold?.reason, String(programCode)).not.toMatch(/nema točnog naziva kandidatskog profila/);
    }
    expect(report.programs.find((row) => row.programCode === '144')?.coverageStatus).toBe('not-applicable');
  });

  it('zadržava MEDRI programe bez dokazano primjenjivih profila na konkretnom hold-u', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers, profileDecisions.holds,
    );
    for (const programCode of ['229', '790', '831', '1967', '1998', '2188', '2210', '2214', '2221', '2318', '2607', '2624']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).not.toBe('verified');
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila|nije pronađen profil/);
    }
  });

  it('potvrđuje tri diplomska ERF programa i tri stručna EFZG programa', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions,
    );
    const expected = new Map([
      ['309', 'erf-diplomski'], ['310', 'erf-diplomski'], ['311', 'erf-diplomski'],
      ['943', 'efzg-zavrsni'], ['1947', 'efzg-zavrsni'],
      ['4732', 'efzg-strucni-racunovodstvo'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('povezuje specijalističke programe EFZG-a koje navodi službeni fakultetski popis', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
    );
    const sourceUrl = 'https://www.efzg.unizg.hr/pds-web';
    const expected = [
      ['842', 'Strateško poduzetništvo', 26],
      ['843', 'Informatički menadžment', 6],
      ['844', 'Strategija i korporativno upravljanje', 25],
      ['845', 'Organizacija i menadžment', 17],
      ['851', 'Poslovno upravljanje - MBA', 21],
      ['852', 'Upravljačko računovodstvo i interna revizija', 29],
      ['853', 'Menadžment turizma', 15],
      ['854', 'Pravni i gospodarski okvir poslovanja u Europskoj uniji', 22],
      ['855', 'Marketing neprofitnih organizacija', 9],
      ['856', 'Upravljanje izvozom', 32],
      ['857', 'Marketinški menadžment - studij je u mirovanju od akademske godine 2021./2022.', 10],
      ['858', 'Upravljanje kvalitetom', 31],
      ['860', 'Poslovni marketing', 20],
      ['863', 'Upravljanje financijskim institucijama', 30],
      ['864', 'Financijske institucije i tržišta', 4],
      ['865', 'Međunarodna ekonomija i financije - studij je u mirovanju od akademske godine 2021./2022.', 11],
      ['867', 'Ekonomika Europske unije', 2],
      ['868', 'Lokalni ekonomski razvoj - studij je u mirovanju od akademske godine 2021./2022.', 8],
      ['869', 'Upravljanje marketinškom komunikacijom - studij je u mirovanju od akademske godine 2021./2022.', 33],
      ['870', 'Međunarodno poslovanje poduzeća - studij je u mirovanju od akademske godine 2021./2022.', 12],
      ['872', 'Operacijska istraživanja i optimizacija - studij je u mirovanju od akademske godine 2021./2022.', 16],
      ['873', 'Menadžment prodaje', 14],
      ['882', 'Osiguranje i reosiguranje', 18],
      ['883', 'Statističke metode za ekonomske analize i prognoziranje', 24],
      ['885', 'Financijska analiza', 3],
      ['886', 'Financijsko izvještavanje, revizija i analiza', 5],
      ['887', 'Poduzetništvo i poduzetnički menadžment', 19],
      ['888', 'Računovodstvo i porezi', 23],
      ['889', 'Sustavi upravljanja znanjem - studij je u mirovanju od akademske godine 2021./2022.', 27],
      ['896', 'Vodstvo', 35],
      ['1805', 'Kontroling - studij je u mirovanju od akademske godine 2021./2022.', 7],
      ['2334', 'Upravljanje ljudskim potencijalima', 36],
      ['2487', 'Tržište nekretnina', 28],
      ['2488', 'Ekonomija energije i okoliša', 1],
      ['2534', 'Upravljanje organizacijama i projektima u kulturi', 34],
    ] as const;

    for (const [programCode, quote, itemNumber] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'efzg-specijalisticki',
        sourceUrl,
        sourceLocator: expect.stringContaining(`stavka ${itemNumber}`),
        quote,
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });

  it('povezuje samo dokazani EFZG doktorski program i zadržava posebne/joint programe na provjeri', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows,
      programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const doctoral = report.programs.find((row) => row.programCode === '726');
    expect(doctoral?.profileDecisionEvidence).toContainEqual(expect.objectContaining({ profileId: 'efzg-doktorski' }));
    expect(doctoral?.coverageStatus).toBe('verified');

    for (const programCode of ['866', '2236', '2237', '2251', '2306', '2309', '2403', '2404', '2474', '2554', '2557', '2587', '2835']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).not.toBe('verified');
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila/);
    }
  });

  it('povezuje FHS diplomske programe iz aktualnih zajedničkih uputa i zadržava ostale na provjeri', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers, profileDecisions.holds,
    );
    for (const programCode of ['422', '581', '2159', '2189', '2575']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId: 'fhs-diplomski' }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    for (const programCode of ['161', '2007', '2114', '2115', '2275', '417', '2160', '639', '640', '2536']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).not.toBe('verified');
      expect(program?.remainingHold?.reason, programCode).not.toMatch(/nema točnog naziva kandidatskog profila/);
    }
    expect(report.programs.find((row) => row.programCode === '295')?.coverageStatus).toBe('not-applicable');
  });
});


describe('GradRI Upisnik odluke', () => {
  it('čuva razliku sveučilišnih i stručnih ciklusa u završnim i diplomskim profilima', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['60', 'gradri-zavrsni'], ['378', 'gradri-diplomski'],
      ['981', 'gradri-zavrsni'], ['1091', 'gradri-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


 describe('dodatne GFV, GRF, FPMI i RGNF odluke', () => {
  it('mapira samo programe čiji identitet i ciklus potvrđuje matična ustanova', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['1952', 'geoteh-zavrsni'], ['2277', 'geoteh-diplomski'], ['2461', 'geoteh-doktorski'],
      ['61', 'grf-zavrsni'], ['383', 'grf-diplomski'],
      ['31', 'mathos-zavrsni'], ['2407', 'mathos-zavrsni'],
      ['73', 'rgnf-zavrsni'], ['398', 'rgnf-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});


describe('dodatne FPZG, Pravri i Libertas odluke', () => {
  it('povezuje aktualne studije s odgovarajućim dokazanim profilima', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['1896', 'fpzg-specijalisticki-sigurnosna-politika-rh'],
      ['1897', 'fpzg-specijalisticki-vanjska-politika-diplomacija'],
      ['2199', 'fpzg-mes-master-thesis'],
      ['1059', 'pravri-zavrsni'], ['1869', 'pravri-specijalisticki'],
      ['1957', 'pravri-specijalisticki'], ['2005', 'libertas-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('MEDRI i FFZG diplomske Upisnik odluke', () => {
  it('vezuje integrirane MEDRI i diplomske FFZG programe uz potvrdu službene razine', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['913', 'medri-medicina-diplomski'], ['2644', 'medri-farmacija-diplomski'],
      ['541', 'medri-sanitarno-diplomski'],
      ['428', 'ffzg-arheologija-graduate'], ['492', 'ffzg-etnologija-graduate'],
      ['621', 'ffzg-psihologija-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni PBF, MEF, FFRZ, PVZG i Libertas programi', () => {
  it('mapira točne nazive uz odgovarajuću razinu i stručni ili sveučilišni tip', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['560', 'pbf-diplomski'], ['1936', 'mef-diplomski'],
      ['476', 'ffrz-diplomski'], ['494', 'ffrz-diplomski'],
      ['1043', 'libertas-zavrsni'], ['2003', 'libertas-zavrsni'],
      ['1541', 'pvzg-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni GRAD, KIF, VSITE, KIFOS i HIG programi', () => {
  it('povezuje programe po dokazanoj sastavnici i razini studija', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['57', 'grad-zavrsni'], ['1077', 'kif-diplomski'],
      ['1520', 'vsite-zavrsni'], ['2061', 'vsite-diplomski'],
      ['2324', 'kifos-zavrsni'], ['2523', 'hig-zavrsni'],
      ['2710', 'kifos-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni ARH, RRIF, MVI i AGROMED programi', () => {
  it('razrješava preostale exact-name kandidate uz izvornu razinu i matičnu sastavnicu', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['368', 'arh-diplomski'], ['1533', 'rrif-zavrsni'],
      ['1895', 'mvi-prijediplomski'], ['2045', 'mvi-diplomski'],
      ['2524', 'agromed-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni FESB, PFRI, KEMOS i FOI programi', () => {
  it('potvrđuje identitet studija unutar već utvrđene sastavnice i razine', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['4', 'fesb-zavrsni'], ['5', 'fesb-zavrsni'], ['32', 'fesb-zavrsni'],
      ['6', 'pfri-zavrsni'], ['16', 'pfri-zavrsni'],
      ['28', 'kemos-zavrsni'], ['33', 'foi-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni FFST i FFOS prijediplomski programi', () => {
  it('povezuje dvopredmetne studije s generičkim profilom njihove potvrđene sastavnice', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['23', 'ffos-zavrsni'],
      ['36', 'ffst-zavrsni'], ['37', 'ffst-zavrsni'], ['38', 'ffst-zavrsni'],
      ['39', 'ffst-zavrsni'], ['40', 'ffst-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni FERIT i RGNF prijediplomski programi', () => {
  it('vezuje programe prema službenom nazivu i prijediplomskoj razini', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['51', 'ferit-zavrsni'], ['67', 'ferit-zavrsni'], ['70', 'rgnf-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
  });
});

describe('službeno potvrđeni FFRI programi', () => {
  it('povezuje dostupne prijediplomske i diplomske profile prema nazivima i razini studija', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['106', 'ffri-zavrsni'], ['116', 'ffri-zavrsni'], ['117', 'ffri-germanistika-zavrsni'],
      ['158', 'ffri-zavrsni'], ['176', 'ffri-povum-zavrsni'],
      ['426', 'ffri-diplomski'], ['433', 'ffri-diplomski'], ['434', 'ffri-germanistika-diplomski'],
      ['473', 'ffri-diplomski'], ['486', 'ffri-povum-diplomski'], ['618', 'ffri-psihologija-diplomski'],
      ['1904', 'ffri-diplomski'], ['1921', 'ffri-zavrsni'],
      ['2094', 'ffri-kroatistika-zavrsni'], ['2095', 'ffri-kroatistika-zavrsni'],
      ['2116', 'ffri-zavrsni'], ['2117', 'ffri-zavrsni'],
      ['2133', 'ffri-diplomski'], ['2134', 'ffri-diplomski'],
      ['2163', 'ffri-diplomski'], ['2164', 'ffri-diplomski'], ['2200', 'ffri-diplomski'],
      ['2528', 'ffri-germanistika-diplomski'], ['2529', 'ffri-diplomski'], ['2591', 'ffri-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    expect(report.programs.find((row) => row.programCode === '291')?.coverageStatus).not.toBe('verified');
    expect(report.programs.find((row) => row.programCode === '2239')?.coverageStatus).not.toBe('verified');
  });
});

describe('neriješeni sukobi službenih dokaza o završetku studija', () => {
  it('blokira profilne kandidate za Fonetiku i Anglistiku dok se izvori ne usklade', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers,
    );
    for (const programCode of ['133', '148']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus).toBe('evidence-conflict');
      expect(program?.candidateProfileIds).toEqual([]);
      expect(program?.profileBlockerEvidence?.sources).toHaveLength(2);
      expect(program?.remainingHold?.sources).toHaveLength(2);
    }
    expect(report.summary.coverageByStatus['evidence-conflict']).toBe(2);
  });
});

describe('dodatne diplomske odluke FFZG-a', () => {
  it('povezuje jednopredmetnu i dvopredmetnu povijest umjetnosti s diplomskim profilom', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers,
    );
    for (const programCode of ['2157', '2158']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence).toContainEqual(expect.objectContaining({
        profileId: 'ffzg-povijest-umjetnosti-diplomski',
        sourceUrl: 'https://povum.ffzg.unizg.hr/?page_id=32',
      }));
      expect(program?.coverageStatus).toBe('verified');
    }
  });
});

describe('doktorski program VEF-a', () => {
  it('povezuje Veterinarske znanosti kada citat imenuje program', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers,
    );
    const program = report.programs.find((row) => row.programCode === '674');
    expect(program?.profileDecisionEvidence).toContainEqual(expect.objectContaining({ profileId: 'vef-doktorski' }));
    expect(program?.coverageStatus).toBe('verified');
  });
});

describe('zajednički profil specijalističkih radova VEF-a', () => {
  it('uključuje samo 13 aktualno raspisanih naziva u djelomični profil bez bodovanja nacrta pravila', () => {
    expect(vefSpecialistDraft.entries).toHaveLength(8);
    expect(vefSpecialistDraft.entries.every((entry) => entry.status === 'draft' && entry.scored === false)).toBe(true);
    const specialistProfile = Object.values(verifiedProfiles).find((profile) => profile.id === 'vef-specijalisticki');
    expect(specialistProfile).toEqual(expect.objectContaining({
      id: 'vef-specijalisticki',
      unitId: 'vef',
      status: 'partial',
      workTypes: ['specialist'],
    }));
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers,
    );
    expect(specialistProfile?.rules).toEqual({});
    const coveredCodes = ['793', '794', '795', '796', '797', '801', '802', '803', '1979', '2062', '2272', '2273', '2274'];
    for (const programCode of coveredCodes) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'vef-specijalisticki',
        sourceUrl: 'https://www.vef.unizg.hr/referada/natjecaj-za-upis-na-sveucilisni-specijalisticki-studij-po-smjerovima-akademska-godina-2026-2027/',
      }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    for (const programCode of ['792', '2692', '2706']) {
      expect(report.programs.find((row) => row.programCode === programCode)?.profileDecisionEvidence, programCode)
        .not.toContainEqual(expect.objectContaining({ profileId: 'vef-specijalisticki' }));
    }
  });
});
describe('službeno potvrđene MEFST i UNIDU dodjele', () => {
  it('povezuje samo programe čiji službeni naziv i vrsta odgovaraju profilu', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
    );
    const expected = new Map([
      ['68', 'unidu-elektro-zavrsni'],
      ['2146', 'ffzg-kroatistika-graduate'],
      ['2649', 'ffzg-arheologija-graduate'],
      ['2165', 'ffzg-pedagogija-graduate'],
      ['2166', 'ffzg-pedagogija-graduate'],
      ['901', 'mefst-diplomski'],
      ['912', 'mefst-diplomski'],
      ['4829', 'unidu-elektro-diplomski'],
      ['4855', 'mefst-diplomski'],
      ['351', 'unidu-marikultura-diplomski'],
      ['359', 'unidu-elektro-diplomski'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    expect(report.programs.find((row) => row.programCode === '1752')?.profileDecisionEvidence).not.toContainEqual(
      expect.objectContaining({ profileId: 'mefst-diplomski' }),
    );
  });
});

describe('službeno potvrđene FAZOS i PMF dodjele', () => {
  it('povezuje samo dokazane programe s profilom iste sastavnice i razine', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions,
      profileDecisions.blockers,
      profileDecisions.holds,
    );
    const expected = new Map([
      ['243', 'fazos-zavrsni'], ['1029', 'fazos-zavrsni'], ['1034', 'fazos-zavrsni'],
      ['1035', 'fazos-zavrsni'], ['1036', 'fazos-zavrsni'], ['1615', 'fazos-zavrsni'],
      ['1616', 'fazos-zavrsni'], ['1618', 'fazos-zavrsni'], ['1619', 'fazos-zavrsni'],
      ['562', 'fazos-diplomski'], ['563', 'fazos-diplomski'], ['564', 'fazos-diplomski'],
      ['565', 'fazos-diplomski'], ['566', 'fazos-diplomski'], ['1842', 'fazos-diplomski'],
      ['1847', 'fazos-diplomski'],
      ['500', 'pmf-biologija-graduate'], ['501', 'pmf-biologija-graduate'],
      ['503', 'pmf-biologija-graduate'], ['510', 'pmf-geofizika-graduate'],
      ['523', 'pmf-matematika-graduate'], ['524', 'pmf-matematika-graduate'],
      ['525', 'pmf-matematika-graduate'], ['527', 'pmf-matematika-graduate'],
      ['529', 'pmf-matematika-graduate'], ['2690', 'pmf-matematika-graduate'],
      ['192', 'pmf-biologija-zavrsni'], ['194', 'pmf-biologija-zavrsni'],
    ]);
    for (const [programCode, profileId] of expected) {
      if (profileDecisions.holds.some((hold) => hold.programCode === programCode)) {
        const held = report.programs.find((row) => row.programCode === programCode);
        expect(held?.profileDecisionEvidence, programCode).toEqual([]);
        expect(held?.remainingHold?.reason, programCode).toBeTruthy();
        continue;
      }
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({ profileId }));
      expect(program?.coverageStatus, programCode).toBe('verified');
    }
    const geology = report.programs.find((row) => row.programCode === '226');
    expect(geology?.profileDecisionEvidence).toEqual([]);
    expect(geology?.remainingHold?.reason).toContain('Seminar III');
    expect(report.programs.find((row) => row.programCode === '2645')?.coverageStatus).not.toBe('verified');
    expect(report.programs.find((row) => row.programCode === '502')?.coverageStatus).not.toBe('verified');
    expect(report.programs.find((row) => row.programCode === '204')?.coverageStatus).toBe('not-applicable');
    expect(report.programs.find((row) => row.programCode === '204')?.applicabilityDecisionEvidence?.quote)
      .toBe('polaganje svih ispita i prikupljanje 180 ECTS bodova');
  });
});

describe('PMF Split i VEF ispitni završeci', () => {
  it('povezuje PMFST biologiju i kemiju te izuzima završne ispite matematike', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions,
    );
    const graduate = report.programs.find((row) => row.programCode === '496');
    expect(graduate?.profileDecisionEvidence).toEqual([]);
    expect(graduate?.remainingHold?.reason).toBeTruthy();
    for (const programCode of ['214', '215']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).toBe('not-applicable');
      expect(program?.applicabilityDecisionEvidence?.quote, programCode).toContain('Završni preddiplomski ispit');
    }
  });

  it('izuzima VEF specijalistički program koji završava pisanim i usmenim ispitom', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions,
    );
    const program = report.programs.find((row) => row.programCode === '2706');
    expect(program?.coverageStatus).toBe('not-applicable');
    expect(program?.applicabilityDecisionEvidence).toEqual(expect.objectContaining({
      sourceUrl: 'https://www.vef.unizg.hr/en/studying/postgraduate-master-studies/small-animal-emergency-and-critical-care-medicine/',
      quote: expect.stringContaining('passing the final written and oral exam'),
    }));
  });
});

describe('zajednički doktorski profil MEDRI-ja', () => {
  it('povezuje samo pet doktorskih studija navedenih na službenoj stranici Doktorske škole', () => {
    const profiles = Object.values(verifiedProfiles) as ProfileCandidateInput[];
    const doctoralProfile = profiles.find((profile) => profile.id === 'medri-doktorski');
    expect(doctoralProfile).toEqual(expect.objectContaining({
      unitId: 'medri',
      workTypes: ['doctoral'],
      status: 'partial',
      rules: {},
    }));
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions, profiles, profileDecisions.decisions,
      profileDecisions.exclusions,
    );
    for (const programCode of ['685', '1644', '2518', '2519', '2520']) {
      const program = report.programs.find((row) => row.programCode === programCode);
      expect(program?.coverageStatus, programCode).toBe('verified');
      expect(program?.profileDecisionEvidence, programCode).toContainEqual(expect.objectContaining({
        profileId: 'medri-doktorski',
        sourceUrl: 'https://medri.uniri.hr/obrazovanje/studiji/poslijediplomski-sveucilisni-doktorski-studiji-doktorska-skola/',
      }));
    }
  });
});

describe('integrirani studij VEF-a', () => {
  it('zadržava hrvatski integrirani studij na holdu dok citat ne imenuje program', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions,
      Object.values(verifiedProfiles) as ProfileCandidateInput[], profileDecisions.decisions,
      profileDecisions.exclusions, profileDecisions.blockers, profileDecisions.holds,
      sourceRegistry, profileDecisions.integratedGraduateCoverage,
    );
    const program = report.programs.find((row) => row.programCode === '917');
    expect(program?.profileDecisionEvidence).toEqual([]);
    expect(program?.remainingHold?.reason).toBeTruthy();
  });
});


describe('integrated graduate coverage decision', () => {
  const coverage = profileDecisions.integratedGraduateCoverage as IntegratedGraduateCoverageDecision[];
  const build = (entries: IntegratedGraduateCoverageDecision[] = coverage) => buildUpisnikProfileCandidates(
    upisnik.rows, programComponents.decisions, Object.values(verifiedProfiles) as ProfileCandidateInput[],
    profileDecisions.decisions, profileDecisions.exclusions, profileDecisions.blockers, profileDecisions.holds,
    sourceRegistry, entries,
  );
  it('changes only 917 among exact candidates', () => {
    const before = build([]);
    const after = build();
    const changed = after.programs.filter((row, index) => JSON.stringify(row) !== JSON.stringify(before.programs[index]));
    expect(changed.map((row) => row.programCode)).toEqual(['917']);
    expect(changed[0]?.exactCandidateProfileIds).toEqual(['vef-diplomski']);
    expect(changed[0]?.componentWorkTypeProfileIds).toEqual(['vef-diplomski']);
    expect(after.summary.exactCandidatePrograms).toBe(before.summary.exactCandidatePrograms + 1);
    for (const code of ['900', '915', '919', '2018', '2229', '2236', '2237', '2585']) {
      const row = after.programs.find((item) => item.programCode === code);
      expect(row?.exactCandidateProfileIds, code).toEqual([]);
      expect(row?.componentWorkTypeProfileIds, code).toEqual([]);
    }
  });
  it('keeps its quoted evidence in the extracted source', () => {
    const extract = readFileSync('data/sources/vef/vef-naputak-diplomski-2024-extract.txt', 'utf8');
    const compact = (text: string) => text.replace(/\s+/gu, ' ').trim();
    expect(compact(extract)).toContain(compact(coverage[0]!.evidence.quote));
  });
  it('rejects an unregistered URL on the correct domain and a profile without graduate work type', () => {
    expect(() => build([{ ...coverage[0]!, evidence: { ...coverage[0]!.evidence, sourceUrl: 'https://www.vef.unizg.hr/nepostojeci.pdf' } }])).toThrow(/source registry/i);
    expect(() => build([{ ...coverage[0]!, profileId: 'vef-doktorski' }])).toThrow(/graduate work type/i);
  });
});


describe('Upisnik heuristic guard redesign', () => {
  const decision = (programCode: string, profileId: string, sourceUrl: string, quote: string) => ({
    programCode, profileId, evidence: { sourceUrl, sourceLocator: 'sluzbena stranica', quote },
  });
  const fixture = (name: string, unitId: string, sourceUrl: string, quote: string, vrsta = 'Sveucilisni prijediplomski studij') =>
    buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '1', naziv: name, izvoditelj: unitId, vrsta }],
      [{ programCode: '1', executors: [{ componentIds: [unitId] }] }],
      [{ id: 'profile', unitId, programs: [name], workTypes: ['final'], sources: [{ url: sourceUrl }] }],
      [decision('1', 'profile', sourceUrl, quote)],
    );


  it('accepts a whole-work scope statement only from the bound profile source', () => {
    const url = 'https://pmf.unizg.hr/upute';
    const otherUrl = 'https://pmf.unizg.hr/druge-upute';
    const quote = 'Upute se odnose na sve kategorije studentskih radova';
    const build = (evidenceUrl: string, evidenceQuote: string, profileWorkTypes = ['final'], vrsta = 'Sveucilisni prijediplomski studij') =>
      buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Biologija', izvoditelj: 'PMF', vrsta }],
        [{ programCode: '1', executors: [{ componentIds: ['pmf'] }] }],
        [{ id: 'profile', unitId: 'pmf', programs: ['Biologija'], workTypes: profileWorkTypes, sources: [{ url }] }],
        [decision('1', 'profile', evidenceUrl, evidenceQuote)],
      );
    expect(build(url, quote).programs[0]?.coverageStatus).toBe('verified');
    expect(() => build(otherUrl, quote)).toThrow(/program name/u);
    expect(() => build(url, 'Upute vrijede za sve studente')).toThrow(/program name/u);
    expect(() => build(url, 'Upute se odnose na sve kategorije studentskih obveza')).toThrow(/program name/u);
    expect(() => build('https://medri.uniri.hr/upute', quote)).toThrow(/source domain/u);
    expect(() => build(url, quote, ['graduate'])).toThrow(/work type/u);
  });

  it.each([
    ['Upute se odnose na sve kategorije studentskih radova, a posebice na:', true],
    ['Ove uputa se odnose na sve kategorije studentskih radova', true],
    ['Pravila akademskog pisanja iz ove upute vrijede za sve studentske radove.', true],
    ['Upute se odnose na sve pisane radove studenata', true],
    ['Ove upute ne odnose se na sve studentske radove', false],
    ['Upute se odnose na sve studentske radove osim diplomskih', false],
    ['Upute se odnose na sve studentske radove na kolegiju Seminar iz ekonomije', false],
    ['Pravila se primjenjuju na sve studentske radnike', false],
    ['Komisija je napravila tablicu koja se primjenjuje na sve studentske radove', false],
    ['Upute vrijede za sve studente', false],
    ['Upute se odnose na sve studentske obveze', false],
  ] as const)('whole-work scope: %s', (quote, accepted) => {
    const run = () => fixture('Biologija', 'pmf', 'https://pmf.unizg.hr/upute', quote);
    if (accepted) expect(run().summary.evidenceBackedCandidatePrograms).toBe(1);
    else expect(run).toThrow(/program name/u);
  });

  it('normalizes source host and trailing slash but preserves query and fragment', () => {
    const quote = 'Upute se odnose na sve kategorije studentskih radova';
    const run = (evidenceUrl: string) => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '1', naziv: 'Biologija', izvoditelj: 'PMF', vrsta: 'Sveucilisni prijediplomski studij' }],
      [{ programCode: '1', executors: [{ componentIds: ['pmf'] }] }],
      [{ id: 'profile', unitId: 'pmf', programs: ['Biologija'], workTypes: ['final'], sources: [{ url: 'https://pmf.unizg.hr/upute/?v=1#dio' }] }],
      [decision('1', 'profile', evidenceUrl, quote)],
    );
    expect(run('https://WWW.PMF.UNIZG.HR/upute?v=1#dio').summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(() => run('https://pmf.unizg.hr/upute?v=2#dio')).toThrow(/program name/u);
    expect(() => run('https://pmf.unizg.hr/upute?v=1#drugi')).toThrow(/program name/u);
  });

  it('accepts HTTPS evidence for an EFST profile with the original HTTP source', () => {
    const profileUrl = 'http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf';
    const evidenceUrl = 'https://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf';
    const run = (url: string) => buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '1', naziv: 'Ekonomija', izvoditelj: 'EFST', vrsta: 'Sveucilisni prijediplomski studij' }],
      [{ programCode: '1', executors: [{ componentIds: ['efst'] }] }],
      [{ id: 'profile', unitId: 'efst', programs: ['Ekonomija'], workTypes: ['final'], sources: [{ url: profileUrl }] }],
      [decision('1', 'profile', url, 'Upute se odnose na sve kategorije studentskih radova')],
    );
    expect(run(evidenceUrl).summary.evidenceBackedCandidatePrograms).toBe(1);
    expect(() => run('https://www.efst.unist.hr/portals/0/drugi-dokument.pdf')).toThrow(/program name/u);
  });

  it('matches inflected whole word roots and rejects embedded or merely similar names', () => {
    const url = 'https://pmf.unizg.hr/studij';
    expect(fixture('Biologija', 'pmf', url, 'Studij biologije').programs[0]?.coverageStatus).toBe('verified');
    expect(() => fixture('Biologija', 'pmf', url, 'Mikrobiologija')).toThrow(/program name/u);
    expect(() => fixture('Fizika', 'pmf', url, 'Fizikalna terapija')).toThrow(/program name/u);
  });

  it('limits all-studies wording to the Upisnik cycle', () => {
    const url = 'https://pmf.unizg.hr/studij';
    expect(fixture('Biologija', 'pmf', url, 'Svi prijediplomski studiji imaju zavrsni rad').programs[0]?.coverageStatus).toBe('verified');
    expect(() => fixture('Biologija', 'pmf', url, 'Svi doktorski studiji imaju disertaciju')).toThrow(/program name/u);
    expect(() => fixture('Biologija', 'pmf', url, 'Svi studiji imaju zavrsni rad')).toThrow(/program name/u);
  });

  it('takes the study kind next to studij even when another kind occurs elsewhere', () => {
    const url = 'https://riteh.uniri.hr/studij';
    expect(fixture('Elektrotehnika', 'riteh', url, 'Elektrotehnika; sveucilisni prijediplomski studij. Strucna knjiznica.').programs[0]?.coverageStatus).toBe('verified');
    expect(() => fixture('Elektrotehnika', 'riteh', url, 'Elektrotehnika; strucni prijediplomski studij. Sveucilisna knjiznica.')).toThrow(/study type/u);
    expect(() => fixture('Elektrotehnika', 'riteh', url, 'Elektrotehnika; strucni studij i sveucilisni studij.')).toThrow(/study type/u);
    expect(() => fixture('Elektrotehnika', 'riteh', url, 'Elektrotehnika; strucni prvostupnik inzenjer elektrotehnike')).toThrow(/study type/u);
  });

  it('uses component host keys under university roots and allows a university itself', () => {
    expect(fixture('Elektrotehnika', 'fesb', 'https://data.fesb.unist.hr/studij', 'Elektrotehnika').programs[0]?.coverageStatus).toBe('verified');
    expect(fixture('Ekonomija', 'unidu', 'https://unidu.hr/studij', 'Ekonomija').programs[0]?.coverageStatus).toBe('verified');
    const rows = [{ sifraUpisnik: '1', naziv: 'Elektrotehnika', izvoditelj: 'RITEH', vrsta: 'Sveucilisni prijediplomski studij' }];
    const components = [{ programCode: '1', executors: [{ componentIds: ['riteh'] }] }];
    const profiles = [{ id: 'profile', unitId: 'riteh', programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: 'https://uniri.hr/studij' }] }];
    expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [decision('1', 'profile', 'https://medri.uniri.hr/studij', 'Elektrotehnika')])).toThrow(/source domain/u);
    for (const url of ['https://ffzg.unizg.hr/studij', 'https://unicath.hr/studij']) {
      const fhsRows = [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveucilisni prijediplomski studij' }];
      const fhsComponents = [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }];
      const fhsProfiles = [{ id: 'profile', unitId: 'fhs', programs: ['Povijest'], workTypes: ['final'], sources: [{ url: 'https://fhs.unizg.hr/studij' }] }];
      expect(() => buildUpisnikProfileCandidates(fhsRows, fhsComponents, fhsProfiles, [decision('1', 'profile', url, 'Povijest')])).toThrow(/source domain/u);
    }
  });

  it('rejects cross-unit university hosts and unrelated public suffix domains', () => {
    const cases = [
      ['riteh', 'https://uniri.hr/studij', 'https://medri.uniri.hr/studij'],
      ['fhs', 'https://fhs.unizg.hr/studij', 'https://ffzg.unizg.hr/studij'],
      ['fhs', 'https://fhs.unizg.hr/studij', 'https://unicath.hr/studij'],
      ['kbf', 'https://kbf.unizg.hr/studij', 'https://kbf.unist.hr/studij'],
      ['kbfst', 'https://kbf.unist.hr/studij', 'https://kbf.unizg.hr/studij'],
      ['effectus', 'https://effectus.com.hr/studij', 'https://drugi.com.hr/studij'],
      ['vkjs', 'https://vkjs.gov.hr/studij', 'https://mup.gov.hr/studij'],
      ['sfsb', 'https://sfsb.sharepoint.com/studij', 'https://drugi.sharepoint.com/studij'],
      ['unizd', 'https://unizd.hr/studij', 'https://www.povijest.hr/studij'],
      ['fer', 'https://fer.unizg.hr/studij', 'https://fer.unist.hr/studij'],
      ['fer', 'https://fer.unizg.hr/studij', 'https://fer.com/studij'],
    ] as const;
    for (const [unitId, profileUrl, evidenceUrl] of cases) {
      const rows = [{ sifraUpisnik: '1', naziv: 'Elektrotehnika', izvoditelj: unitId, vrsta: 'Sveucilisni prijediplomski studij' }];
      const components = [{ programCode: '1', executors: [{ componentIds: [unitId] }] }];
      const profiles = [{ id: 'profile', unitId, programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: profileUrl }] }];
      expect(() => buildUpisnikProfileCandidates(rows, components, profiles, [decision('1', 'profile', evidenceUrl, 'Elektrotehnika')]), unitId + ' -> ' + evidenceUrl).toThrow(/source domain/u);
    }
  });

  it('rejects hostile hosts with committed profiles and the source registry', () => {
    const attacks = [
      ['kbf', 'https://kbf.unist.hr/studij'],
      ['kbfst', 'https://kbf.unizg.hr/studij'],
      ['effectus', 'https://drugi.com.hr/studij'],
      ['vkjs', 'https://mup.gov.hr/studij'],
      ['sfsb', 'https://drugi.sharepoint.com/studij'],
      ['unizd', 'https://www.povijest.hr/studij'],
      ['fer', 'https://fer.unist.hr/studij'],
    ] as const;
    for (const [unitId, hostileUrl] of attacks) {
      const profile = (Object.values(verifiedProfiles) as ProfileCandidateInput[]).find((item) => item.unitId === unitId)!;
      const name = profile.programs[0]!;
      const vrsta = unitId === 'vkjs' ? 'Strucni prijediplomski studij'
        : profile.workTypes?.includes('graduate') ? 'Sveucilisni diplomski studij' : 'Sveucilisni prijediplomski studij';
      const rows = [{ sifraUpisnik: '1', naziv: name, izvoditelj: unitId, vrsta }];
      const components = [{ programCode: '1', executors: [{ componentIds: [unitId] }] }];
      const legitimate = decision('1', profile.id, profile.sources![0]!.url, name);
      expect(buildUpisnikProfileCandidates(rows, components, [profile], [legitimate]).summary.evidenceBackedCandidatePrograms).toBe(1);
      expect(() => buildUpisnikProfileCandidates(rows, components, [profile], [{ ...legitimate, evidence: { ...legitimate.evidence, sourceUrl: hostileUrl } }]), unitId).toThrow(/source domain/u);
    }
  });

  it('accepts university component hosts and the documented Arhitekt alias', () => {
    const cases = [
      ['fesb', 'https://fesb.unist.hr/studij', 'https://fesb.unist.hr/studij'],
      ['fesb', 'https://fesb.unist.hr/studij', 'https://data.fesb.unist.hr/studij'],
      ['foi', 'https://foi.unizg.hr/studij', 'https://foi.unizg.hr/studij'],
      ['ttf', 'https://ttf.unizg.hr/studij', 'https://ttf.unizg.hr/studij'],
      ['ffpu', 'https://ffpu.unipu.hr/studij', 'https://ffpu.unipu.hr/studij'],
      ['unidu', 'https://unidu.hr/studij', 'https://unidu.hr/studij'],
      ['arh', 'https://unizg.hr/studij', 'https://arhitekt.unizg.hr/studij'],
    ] as const;
    for (const [unitId, profileUrl, evidenceUrl] of cases) {
      const rows = [{ sifraUpisnik: '1', naziv: 'Elektrotehnika', izvoditelj: unitId, vrsta: 'Sveucilisni prijediplomski studij' }];
      const components = [{ programCode: '1', executors: [{ componentIds: [unitId] }] }];
      const profiles = [{ id: 'profile', unitId, programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: profileUrl }] }];
      expect(buildUpisnikProfileCandidates(rows, components, profiles, [decision('1', 'profile', evidenceUrl, 'Elektrotehnika')]).summary.evidenceBackedCandidatePrograms, unitId + ' -> ' + evidenceUrl).toBe(1);
    }
  });

  it('normalizes generic sole-candidate holds and rejects short requests', () => {
    const report = buildUpisnikProfileCandidates(
      [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveucilisni prijediplomski studij' }],
      [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
      [{ id: 'profile', unitId: 'fhs', programs: ['Drugi studij'], workTypes: ['final'] }],
    );
    const hold = report.programs[0]!.remainingHold!;
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
    const original = [...hold.missingEvidence];
    hold.missingEvidence = ['Sluzbeni aktualni izvor za identitet programa i sastavnicu, uz dokaz obvezne vrste rada i veze s odgovarajucim profilom. '];
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual(expect.arrayContaining([expect.stringContaining('generic evidence request')]));
    hold.missingEvidence = ['Potreban je sluzbeni dokaz.'];
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual(expect.arrayContaining([expect.stringContaining('too short')]));
    hold.missingEvidence = original;
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
  });

  it('preserves all 374 evidence links and every coverage status in the committed inventory', () => {
    const report = buildUpisnikProfileCandidates(
      upisnik.rows, programComponents.decisions, Object.values(verifiedProfiles) as ProfileCandidateInput[],
      profileDecisions.decisions, profileDecisions.exclusions, profileDecisions.blockers,
      profileDecisions.holds, sourceRegistry, profileDecisions.integratedGraduateCoverage,
    );
    const links = (programs: typeof report.programs) => programs.flatMap((row) =>
      row.profileDecisionEvidence.map((evidence) => [row.programCode, evidence.profileId]));
    // 341 veza nakon #182 plus 13 AGR diplomskih programa po pravilu o najnovijem izdanju (2026-09-27)
    // plus 10 EFOS programa kroz izricitu izjavu o opsegu iz izvora profila (#206, 2026-09-28)
    // plus 9 iz pilota kategorije A (2026-10-03): 6 EFST sveucilisnih (izjava o opsegu, https izvor) i 3 FER diplomska
    // (stranica studija kao dokaz identiteta po vlasnikovu pravilu za jedini profil sastavnice). EFST 938, 939 i 1770
    // ostaju na holdu (Codex #284: izjava o opsegu ne imenuje te programe).
    // plus FER 52 (2026-10-05): vlasnik je 2026-10-04 prihvatio izvor profila fer-zavrsni iz 2013., pa autorski hold
    // otpada i 52 ide pravilom jedinog profila kroz stranicu prijediplomskog studija.
    expect(links(report.programs)).toHaveLength(374);
    const pilot = new Map(report.programs.filter((row) => row.profileDecisionEvidence.some((e) => /^(efst|fer)-/u.test(e.profileId)))
      .map((row) => [row.programCode, row.profileDecisionEvidence.map((e) => e.profileId)]));
    for (const [code, profileId] of [['52', 'fer-zavrsni'], ['375', 'fer-diplomski'], ['392', 'fer-diplomski'], ['393', 'fer-diplomski'],
      ['261', 'efst-zavrsni'], ['262', 'efst-zavrsni'], ['263', 'efst-zavrsni'],
      ['591', 'efst-diplomski'], ['592', 'efst-diplomski'], ['1807', 'efst-diplomski']] as const) {
      expect(pilot.get(code)).toEqual([profileId]);
    }
    const efos = new Map(report.programs.filter((row) => row.profileDecisionEvidence.some((e) => e.profileId.startsWith('efos-')))
      .map((row) => [row.programCode, row.profileDecisionEvidence.map((e) => e.profileId)]));
    for (const [code, profileId] of [['595', 'efos-diplomski'], ['597', 'efos-diplomski'], ['4780', 'efos-diplomski'], ['690', 'efos-doktorski'],
      ['775', 'efos-specijalisticki'], ['812', 'efos-specijalisticki'], ['846', 'efos-specijalisticki'], ['892', 'efos-specijalisticki'],
      ['1691', 'efos-specijalisticki'], ['2291', 'efos-specijalisticki']] as const) {
      expect(efos.get(code)).toEqual([profileId]);
    }
    // 1835 (Poduzetnistvo i inovativnost) ostaje hold: jedini dokaz bila je opca stranica sveucilista.
    expect(report.programs.find((row) => row.programCode === '1835')?.coverageStatus).toBe('identity-evidence-needed');
    expect(links(report.programs)).toEqual(links(generatedProfileCandidates.programs));
    expect(report.programs.map((row) => [row.programCode, row.coverageStatus]))
      .toEqual(generatedProfileCandidates.programs.map((row) => [row.programCode, row.coverageStatus]));
    expect(validateUpisnikProfileCoverageHolds(report)).toEqual([]);
  });
});
