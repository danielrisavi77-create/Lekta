import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { isAcademicWorkType, type AcademicWorkType } from './academic-suite-contracts';

const PROJECT_SESSION_KEY = 'lekta.katedra-project.v0.1';

export interface KatedraEntryContext {
  projectId?: string;
  unitId?: string;
  programId?: string;
  profileId?: string;
  rulesetId?: string;
  workType?: AcademicWorkType;
}

const LEGACY_WORK_SLUGS: Record<string, AcademicWorkType> = {
  seminarski: 'seminar',
  seminar: 'seminar',
  zavrsni: 'final',
  završni: 'final',
  final: 'final',
  diplomski: 'graduate',
  graduate: 'graduate',
};

function cleanId(value: string | null): string | undefined {
  const out = String(value || '').trim();
  if (!out || out.length > 200) return undefined;
  return out;
}

export function parseKatedraEntryContext(search: string): KatedraEntryContext {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const rawWork = String(params.get('workType') || params.get('work') || '').trim().toLowerCase();
  const workType = isAcademicWorkType(rawWork) ? rawWork : LEGACY_WORK_SLUGS[rawWork];

  return {
    projectId: cleanId(params.get('project')),
    unitId: cleanId(params.get('unit')),
    programId: cleanId(params.get('program')),
    profileId: cleanId(params.get('profile')),
    rulesetId: cleanId(params.get('ruleset')),
    workType,
  };
}

export function rememberKatedraProjectId(projectId?: string): void {
  if (!projectId || typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(PROJECT_SESSION_KEY, projectId); } catch {}
}

export function currentKatedraProjectId(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try { return cleanId(sessionStorage.getItem(PROJECT_SESSION_KEY)); } catch { return undefined; }
}

function dispatchChange(el: HTMLSelectElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Applies only catalog IDs that Lekta can validate itself. Unknown IDs are left
 * for the user to select manually; there is no silent fallback to another unit.
 */
export function applyKatedraEntryContext(context: KatedraEntryContext): boolean {
  if (typeof document === 'undefined') return false;
  rememberKatedraProjectId(context.projectId);

  let changed = false;
  const unitId = context.unitId;
  if (unitId) {
    const institution = ZAGREB_CATALOG.find(inst => inst.units.some(unit => unit.id === unitId));
    const institutionSelect = document.querySelector<HTMLSelectElement>('#institutionSelect');
    const unitSelect = document.querySelector<HTMLSelectElement>('#unitSelect');

    if (institution && institutionSelect) {
      const institutionOption = Array.from(institutionSelect.options).find(o => o.value === institution.id);
      if (institutionOption) {
        institutionSelect.value = institution.id;
        dispatchChange(institutionSelect);
        changed = true;
      }
    }

    if (unitSelect) {
      const unitOption = Array.from(unitSelect.options).find(o => o.value === unitId);
      if (unitOption) {
        unitSelect.value = unitId;
        dispatchChange(unitSelect);
        changed = true;
      }
    }
  }

  if (context.programId) {
    const programSelect = document.querySelector<HTMLSelectElement>('#programSelect');
    const option = programSelect && Array.from(programSelect.options).find(o => o.value === context.programId);
    if (programSelect && option) {
      programSelect.value = context.programId;
      dispatchChange(programSelect);
      changed = true;
    }
  }

  if (context.workType) {
    const workType = document.querySelector<HTMLSelectElement>('#workType');
    const option = workType && Array.from(workType.options).find(o => o.value === context.workType);
    if (workType && option) {
      workType.value = context.workType;
      dispatchChange(workType);
      changed = true;
    }
  }

  return changed;
}

/** Runs after Lekta's main UI bootstrap, which populates the selects. */
export function bootstrapKatedraEntryContext(): void {
  if (typeof window === 'undefined') return;
  const context = parseKatedraEntryContext(window.location.search);
  if (!context.projectId && !context.unitId && !context.programId && !context.workType) return;

  // App init is synchronous today; one macrotask also makes this tolerant of a
  // future async catalog render without coupling to ui/app internals.
  window.setTimeout(() => { applyKatedraEntryContext(context); }, 0);
}

bootstrapKatedraEntryContext();
