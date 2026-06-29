/**
 * Institucionalna coverage matrica i meta statusa (CLAUDE.md backlog 1 i 3).
 * Hidrira data/coverage/*.json u tipizirane oblike. Tanak prolaz, bez logike.
 */
import rawMatrix from '../../data/coverage/institutional-coverage-matrix.json';
import rawStatusMeta from '../../data/coverage/coverage-status-meta.json';
import type {
  InstitutionalCoverageMatrix,
  CoverageProgram,
  CoverageStatusMeta,
} from '../profiles/profile-schema';

export const INSTITUTIONAL_COVERAGE_MATRIX =
  rawMatrix as unknown as InstitutionalCoverageMatrix;

export const COVERAGE_STATUS_META =
  rawStatusMeta as unknown as Record<string, CoverageStatusMeta>;

/** Programi za zadanu jedinicu (unitId). */
export function coverageForUnit(unitId: string): CoverageProgram[] {
  return INSTITUTIONAL_COVERAGE_MATRIX.programs.filter((p) => p.unitId === unitId);
}
