import './result-visuals.css';
import type { VisualFindingModel, VisualResultModel } from './visual-result-model';
import { categorySummaryHtml } from './category-summary';
import { priorityFindingsHtml } from './priority-findings';
import { technicalComplianceHaloHtml } from './technical-compliance-halo';

export type ResultsRenderer = 'legacy' | 'cockpit';
export type ResultsCockpitAction =
  | { kind: 'preview'; findingId: string }
  | { kind: 'repair'; findingId: string }
  | { kind: 'confirm'; findingId: string }
  | { kind: 'ignore'; findingId: string; reason: string }
  | { kind: 'reopen'; findingId: string };

export interface ResultsCockpitOptions {
  repairAvailable: boolean;
  advancedOpen?: boolean;
  onAction?: (action: ResultsCockpitAction) => void;
  onAdvancedToggle?: (open: boolean) => void;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function primaryAction(findings: readonly VisualFindingModel[], repairAvailable: boolean): ResultsCockpitAction | null {
  const repairable = findings.find((finding) => repairAvailable && finding.capabilities.repair);
  if (repairable) return { kind: 'repair', findingId: repairable.id };
  const previewable = findings.find((finding) => finding.capabilities.preview);
  return previewable ? { kind: 'preview', findingId: previewable.id } : null;
}

function statusCopy(model: VisualResultModel): { label: string; description: string; tone: string } {
  if (model.readiness.kind === 'blocked') return { label: model.readiness.label || 'Nije spremno za predaju', description: model.readiness.description, tone: 'blocked' };
  if (model.readiness.kind === 'needs-work') return { label: model.readiness.label || 'Treba doraditi prije predaje', description: model.readiness.description, tone: 'needs-work' };
  if (model.readiness.kind === 'manual-review') return { label: model.readiness.label || 'Potrebna je ru\u010Dna provjera', description: model.readiness.description, tone: 'manual-review' };
  return { label: model.readiness.label || 'Nema automatskih blokatora', description: model.readiness.description, tone: 'clear' };
}

function primaryButtonLabel(action: ResultsCockpitAction | null): string {
  if (!action) return 'Prika\u017Ei \u0161to treba provjeriti';
  return action.kind === 'repair' ? 'Popravi automatski' : 'Otvori prvi nalaz';
}

function authorityHtml(model: VisualResultModel['authority']): string {
  const kind = model.authoritative ? 'verified' : 'limited';
  return [
    '<div class="cockpit-authority" data-cockpit-authority="', kind, '">',
    '<span class="cockpit-authority__mark" aria-hidden="true">&#10003;</span>',
    '<div><strong>', escapeHtml(model.label), '</strong><p>', escapeHtml(model.description), '</p></div></div>',
  ].join('');
}

export function resultRendererFor(doc: Document): ResultsRenderer {
  const search = doc.defaultView?.location.search ?? '';
  const requested = new URLSearchParams(search).get('resultRenderer');
  if (requested === 'legacy') return 'legacy';
  const root = doc.documentElement.dataset.resultRenderer ?? doc.body?.dataset.resultRenderer;
  if (root === 'cockpit' || root === 'v1') return 'cockpit';
  return requested === 'cockpit' ? 'cockpit' : 'legacy';
}

export function renderResultsCockpit(mount: HTMLElement, model: VisualResultModel, options: ResultsCockpitOptions): void {
  const status = statusCopy(model);
  const action = primaryAction(model.findings.top, options.repairAvailable);
  const advancedOpen = options.advancedOpen === true;
  const openFindings = model.findings.document.filter((finding) => finding.status !== 'ignored').length;
  mount.className = 'result-cockpit result-cockpit--' + status.tone;
  mount.innerHTML = [
    '<div class="cockpit-hero" data-cockpit-status="', status.tone, '">',
    '<div class="cockpit-hero__copy"><span class="cockpit-kicker">Rezultat provjere</span><h2>', escapeHtml(status.label), '</h2><p>', escapeHtml(status.description), '</p></div>',
    technicalComplianceHaloHtml(model.score), authorityHtml(model.authority),
    '<div class="cockpit-hero__summary"><strong>', String(openFindings), '</strong><span>otvorenih nalaza koje treba provjeriti</span></div>',
    '<button type="button" class="button button-primary cockpit-primary" data-cockpit-primary',
    action ? ' data-finding-id="' + escapeHtml(action.findingId) + '"' : '', '>', primaryButtonLabel(action), '</button></div>',
    '<section class="cockpit-priority" aria-labelledby="cockpitPriorityTitle"><div class="cockpit-section-heading"><span class="cockpit-kicker">Prvo pogledajte</span><h2 id="cockpitPriorityTitle">Najva\u017Eniji nalazi</h2></div>',
    priorityFindingsHtml(model.findings.top, options.repairAvailable), '</section>', categorySummaryHtml(model.categories),
    '<button type="button" class="cockpit-advanced-toggle" data-cockpit-action="advanced" data-cockpit-advanced aria-expanded="', advancedOpen ? 'true' : 'false', '"><span>Napredna provjera</span><span aria-hidden="true">&#65291;</span></button>',
  ].join('');
  mount.dataset.advancedOpen = String(advancedOpen);

  mount.querySelector<HTMLButtonElement>('[data-cockpit-primary]')?.addEventListener('click', () => {
    if (action) options.onAction?.(action);
    else options.onAdvancedToggle?.(true);
  });
  mount.querySelector<HTMLButtonElement>('[data-cockpit-advanced]')?.addEventListener('click', () => {
    const next = mount.dataset.advancedOpen !== 'true';
    mount.dataset.advancedOpen = String(next);
    mount.querySelector('[data-cockpit-advanced]')?.setAttribute('aria-expanded', String(next));
    options.onAdvancedToggle?.(next);
  });
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-jump]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'preview', findingId });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-action]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.dataset.findingId;
    const kind = button.dataset.findingAction;
    if (!findingId) return;
    if (kind === 'repair') options.onAction?.({ kind: 'repair', findingId });
    else if (kind === 'preview') options.onAction?.({ kind: 'preview', findingId });
    else options.onAdvancedToggle?.(true);
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-confirm]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'confirm', findingId });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore]').forEach((button) => button.addEventListener('click', () => {
    button.closest<HTMLElement>('[data-finding-id]')?.querySelector<HTMLElement>('[data-finding-ignore-form]')?.removeAttribute('hidden');
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore-cancel]').forEach((button) => button.addEventListener('click', () => {
    button.closest<HTMLElement>('[data-finding-ignore-form]')?.setAttribute('hidden', '');
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore-save]').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest<HTMLElement>('[data-finding-id]');
    const findingId = card?.dataset.findingId;
    const reason = card?.querySelector<HTMLInputElement>('[data-finding-ignore-reason]')?.value.trim() ?? '';
    if (findingId && reason) options.onAction?.({ kind: 'ignore', findingId, reason });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-reopen]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'reopen', findingId });
  }));
}
