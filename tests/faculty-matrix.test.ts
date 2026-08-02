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

  it('stvarne DOCX uzorke ne prikazuje kao dokaz 100/100', () => {
    const report = buildFacultyMatrixReport();
    expect(report.summary.realDocxSampleCount).toBeGreaterThan(0);
    expect(report.summary.realCorpusReviewCount).toBeGreaterThan(0);
    expect(report.summary.syntheticClosedLoopNotRunCount).toBe(report.summary.profileCount);
    expect(report.faculties.some((faculty) => faculty.profilesWithoutRealDocx.length > 0)).toBe(true);
  });
});
