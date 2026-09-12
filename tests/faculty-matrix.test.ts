import { describe, expect, it } from 'vitest';
import generatedReport from '../docs/generated/faculty-matrix.json';
import { buildFacultyMatrixReport } from './helpers/faculty-matrix';

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

  /**
   * SVAKI brojac po razlogu mora biti konacan broj, na SVAKOJ razini sazetka.
   *
   * Izmjereno 2026-09-12: `faculty-matrix.ts` je imao vlastiti, prepisan popis razloga i pri dodavanju
   * novoga ostao bez njega. To nije dalo gresku nego `undefined + 1 = NaN`, a `NaN` se u JSON zapisuje
   * kao `null`, pa je artefakt na sest mjesta nosio `null` ondje gdje je trebao broj. Uhvatila ga je
   * tek duboka usporedba cijelog izvjestaja, i to preko `NaN !== NaN`, dakle najzaobilaznije moguce.
   *
   * Anotacija tipa tu ne pomaze: `tests/**` se ne typechecka (`include: ["src"]`).
   */
  it('svaki brojac po razlogu je konacan broj, na svakoj razini', () => {
    const kljuceviVrha = Object.keys(generatedReport.cellSummary.byReason);
    expect(kljuceviVrha.length, 'prazan popis razloga; tvrdnja nize ne bi mjerila nista').toBeGreaterThan(3);
    const lose: string[] = [];
    const provjeri = (byReason: Record<string, unknown>, gdje: string) => {
      for (const k of kljuceviVrha) {
        const v = byReason[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) lose.push(`${gdje}.${k} = ${JSON.stringify(v)}`);
      }
    };
    provjeri(generatedReport.cellSummary.byReason as Record<string, unknown>, 'vrh');
    for (const f of generatedReport.faculties) {
      provjeri((f.cellSummary as { byReason: Record<string, unknown> }).byReason, f.unitId ?? 'fakultet');
      for (const p of f.profiles) {
        provjeri((p.cellSummary as { byReason: Record<string, unknown> }).byReason, p.profileId);
      }
    }
    expect(lose, 'brojac nije konacan broj; nedostaje li kljuc u nekom prepisanom popisu?').toEqual([]);
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
});
