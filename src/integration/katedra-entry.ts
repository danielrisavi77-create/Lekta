import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { isAcademicWorkType, type AcademicWorkType } from './academic-suite-contracts';

const PROJECT_SESSION_SLOT = 'lekta.katedra-project.v0.1';
const COMPLETION_HANDOFF_SESSION_SLOT = 'lekta.completion-handoff.v0.1';
// Keep aligned with katedra-capture.ts. Duplicated here deliberately to avoid a
// circular dependency (capture imports currentKatedraProjectId from this module).
const HANDOFF_RESULT_SESSION_SLOT = 'lekta.katedra-handoff-result.v0.1';
const HANDOFF_TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

export interface KatedraEntryContext {
  projectId?: string;
  unitId?: string;
  programId?: string;
  profileId?: string;
  rulesetId?: string;
  workType?: AcademicWorkType;
  handoffToken?: string;
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

function cleanHandoffToken(value: string | null): string | undefined {
  const out = String(value || '').trim();
  return HANDOFF_TOKEN_RE.test(out) ? out : undefined;
}

function handoffTokenFromHash(hash: string): string | undefined {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return undefined;
  try {
    return cleanHandoffToken(new URLSearchParams(raw).get('handoff'));
  } catch {
    return undefined;
  }
}

export function parseKatedraEntryContext(search: string, hash = ''): KatedraEntryContext {
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
    handoffToken: handoffTokenFromHash(hash),
  };
}

function clearCapturedHandoffResult(): void {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(HANDOFF_RESULT_SESSION_SLOT); } catch {}
}

function clearCompletionHandoffToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(COMPLETION_HANDOFF_SESSION_SLOT); } catch {}
}

function rememberCompletionHandoffToken(projectId?: string, token?: string): void {
  if (!projectId || !token || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(COMPLETION_HANDOFF_SESSION_SLOT, JSON.stringify({ projectId, token }));
  } catch {}
}

function stripHandoffFragment(): void {
  if (typeof window === 'undefined' || !window.location.hash) return;
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.has('handoff')) return;
    params.delete('handoff');
    const remaining = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ''}`,
    );
  } catch {}
}

export function rememberKatedraProjectId(projectId?: string): void {
  if (!projectId || typeof sessionStorage === 'undefined') return;
  try {
    const previous = cleanId(sessionStorage.getItem(PROJECT_SESSION_SLOT));
    if (previous && previous !== projectId) {
      clearCapturedHandoffResult();
      clearCompletionHandoffToken();
    }
    sessionStorage.setItem(PROJECT_SESSION_SLOT, projectId);
  } catch {}
}

export function clearKatedraProjectId(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PROJECT_SESSION_SLOT);
    sessionStorage.removeItem(HANDOFF_RESULT_SESSION_SLOT);
    sessionStorage.removeItem(COMPLETION_HANDOFF_SESSION_SLOT);
  } catch {}
}

export function currentKatedraProjectId(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try { return cleanId(sessionStorage.getItem(PROJECT_SESSION_SLOT)); } catch { return undefined; }
}

export function currentCompletionHandoffToken(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(COMPLETION_HANDOFF_SESSION_SLOT);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { projectId?: unknown; token?: unknown };
    const projectId = typeof parsed.projectId === 'string' ? cleanId(parsed.projectId) : undefined;
    const token = typeof parsed.token === 'string' ? cleanHandoffToken(parsed.token) : undefined;
    if (!projectId || !token || projectId !== currentKatedraProjectId()) return undefined;
    return token;
  } catch {
    return undefined;
  }
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
  rememberCompletionHandoffToken(context.projectId, context.handoffToken);
  if (context.handoffToken) stripHandoffFragment();

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
  const context = parseKatedraEntryContext(window.location.search, window.location.hash);
  const hasEntryContext = Boolean(
    context.projectId || context.unitId || context.programId || context.workType || context.handoffToken,
  );

  // A direct Lekta visit in the same browser tab must not inherit an earlier
  // Katedra/Completion project or result. Query/hash metadata is the authority
  // for whether this page load belongs to a cross-product workflow.
  if (!hasEntryContext) {
    clearKatedraProjectId();
    return;
  }

  // App init is synchronous today; one macrotask also makes this tolerant of a
  // future async catalog render without coupling to ui/app internals.
  window.setTimeout(() => { applyKatedraEntryContext(context); }, 0);
}

bootstrapKatedraEntryContext();
