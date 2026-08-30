import './result-visuals.css';
import type { VisualFindingModel, VisualResultModel } from './visual-result-model';
import { categorySummaryHtml } from './category-summary';
import { priorityFindingsHtml } from './priority-findings';
import { readinessHaloHtml } from './technical-compliance-halo';

export type ResultsRenderer = 'legacy' | 'cockpit';
export type ResultsCockpitAction =
  | { kind: 'preview'; findingId: string }
  | { kind: 'repair'; findingId: string }
  | { kind: 'confirm'; findingId: string }
  | { kind: 'ignore'; findingId: string; reason: string }
  | { kind: 'reopen'; findingId: string }
  | { kind: 'preview-location'; paragraphIndex: number; footnoteId?: number }
  | { kind: 'open-findings' }
  | { kind: 'simulate-repair' }
  | { kind: 'repair-safe' };

export interface ResultsCockpitOptions {
  repairAvailable: boolean;
  advancedOpen?: boolean;
  onAction?: (action: ResultsCockpitAction) => void;
  onAdvancedToggle?: (open: boolean) => void;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

type ResultsCockpitFindingAction = Extract<ResultsCockpitAction, { findingId: string }>;
function primaryAction(findings: readonly VisualFindingModel[], repairAvailable: boolean): ResultsCockpitFindingAction | null {
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

export function authorityHtml(model: VisualResultModel['authority']): string {
  const kind = model.authoritative ? 'verified' : 'limited';
  return [
    '<div class="cockpit-authority" data-cockpit-authority="', kind, '">',
    '<span class="cockpit-authority__mark" aria-hidden="true">&#10003;</span>',
    '<div><strong>', escapeHtml(model.label), '</strong><p>', escapeHtml(model.description), '</p></div></div>',
  ].join('');
}

function headerHtml(model: VisualResultModel): string {
  const confirmation = model.header.profileConfirmed ? 'Profil potvr?en' : 'Profil nije potvr?en';
  return `<header class="cockpit-header" data-cockpit-header><div><span class="cockpit-kicker">Rezultat provjere</span><h2>${escapeHtml(model.header.documentName)}</h2><p>${escapeHtml(model.header.profile)} ? ${escapeHtml(model.header.authorityLabel)}</p></div><span class="cockpit-header__status ${model.header.profileConfirmed ? 'cockpit-header__status--confirmed' : ''}"><span aria-hidden="true">${model.header.profileConfirmed ? '?' : 'i'}</span>${confirmation}</span></header>`;
}

function documentDnaHtml(model: VisualResultModel): string {
  if (model.documentDna.kind === 'unavailable') return `<section class="cockpit-dna cockpit-dna--unavailable" data-cockpit-dna aria-labelledby="cockpitDnaTitle"><div class="cockpit-section-heading"><span class="cockpit-kicker">Struktura rada</span><h2 id="cockpitDnaTitle">DNA rada</h2></div><p>${escapeHtml(model.documentDna.reason)}</p></section>`;
  const segments = model.documentDna.segments.map((segment) => { const anchored = typeof segment.paragraphIndex === 'number' && Number.isInteger(segment.paragraphIndex) && segment.paragraphIndex >= 0; const attrs = `data-cockpit-dna-segment data-segment-id="${escapeHtml(segment.id)}"${anchored ? ` data-paragraph-index="${segment.paragraphIndex}"` : ''}${typeof segment.footnoteId === 'number' ? ` data-footnote-id="${segment.footnoteId}"` : ''}`; const detail = segment.page != null ? `${segment.value} ? str. ${segment.page}` : segment.value; return anchored ? `<button type="button" class="cockpit-dna__segment" ${attrs}><span class="cockpit-dna__node" aria-hidden="true"></span><strong>${escapeHtml(segment.label)}</strong><span>${escapeHtml(detail)}</span></button>` : `<div class="cockpit-dna__segment" ${attrs}><span class="cockpit-dna__node" aria-hidden="true"></span><strong>${escapeHtml(segment.label)}</strong><span>${escapeHtml(detail)}</span></div>`; }).join('');
  return `<section class="cockpit-dna" data-cockpit-dna aria-labelledby="cockpitDnaTitle"><div class="cockpit-section-heading"><span class="cockpit-kicker">Struktura rada</span><h2 id="cockpitDnaTitle">DNA rada</h2></div><div class="cockpit-dna__track">${segments}</div><p class="cockpit-dna__hint">Odaberi ozna?enu to?ku za skok na to?no mjesto u dokumentu.</p></section>`;
}

function actionRowHtml(model: VisualResultModel, repairAvailable: boolean): string {
  const safeDisabled = !repairAvailable || model.signals.automaticFixes <= 0;
  return `<section class="cockpit-actions" aria-label="Sljede?i koraci"><button type="button" class="button button-primary" data-cockpit-action="open-findings">Pregledaj nalaze</button><button type="button" class="button button-secondary" data-cockpit-action="simulate-repair"${repairAvailable ? '' : ' disabled'}>Simuliraj popravak</button><button type="button" class="button button-secondary" data-cockpit-action="repair-safe"${safeDisabled ? ' disabled' : ''}>Popravi sigurne stavke <span class="cockpit-actions__count">${escapeHtml(model.signals.automaticFixes)}</span></button></section>`;
}

export function resultRendererFor(doc: Document): ResultsRenderer {
  const search = doc.defaultView?.location.search ?? '';
  const requested = new URLSearchParams(search).get('resultRenderer');
  if (requested === 'legacy') return 'legacy';
  const root = doc.documentElement.dataset.resultRenderer ?? doc.body?.dataset.resultRenderer;
  if (root === 'cockpit' || root === 'v1') return 'cockpit';
  return root === 'legacy' ? 'legacy' : 'cockpit';
}

export function renderResultsCockpit(mount: HTMLElement, model: VisualResultModel, options: ResultsCockpitOptions): void {
  const status = statusCopy(model);
  const action = primaryAction(model.findings.top, options.repairAvailable);
  const advancedOpen = options.advancedOpen === true;
  const haloStatus = haloStatusLabel(model);
  mount.className = 'result-cockpit result-cockpit--' + status.tone;
  mount.dataset.cockpitExperience = 'correction-desk';
  mount.innerHTML = [
    headerHtml(model),
    '<div class="cockpit-hero" data-cockpit-hero data-cockpit-status="', status.tone, '">',
    '<div class="cockpit-hero__copy"><span class="cockpit-kicker">Rezultat provjere</span><h2>', escapeHtml(status.label), '</h2><p>', escapeHtml(status.description), '</p></div>',
    readinessHaloHtml(model.score, model.signals, haloStatus),
    '<button type="button" class="button button-primary cockpit-primary" data-cockpit-primary',
    action ? ' data-finding-id="' + escapeHtml(action.findingId) + '"' : '', '>', primaryButtonLabel(action), '</button></div>',
    '<section class="cockpit-priority" aria-labelledby="cockpitPriorityTitle"><div class="cockpit-section-heading"><span class="cockpit-kicker">Prvo pogledajte</span><h2 id="cockpitPriorityTitle">Najva\u017Eniji nalazi</h2></div>',
    priorityFindingsHtml(model.findings.top, options.repairAvailable), '</section>', categorySummaryHtml(model.categories),
    documentDnaHtml(model),
    actionRowHtml(model, options.repairAvailable),
    '<button type="button" class="cockpit-advanced-toggle" data-cockpit-action="advanced" data-cockpit-advanced aria-expanded="', advancedOpen ? 'true' : 'false', '"><span>Napredna provjera</span><span aria-hidden="true">&#65291;</span></button>',
  ].join('');
  mount.dataset.advancedOpen = String(advancedOpen);

  mount.querySelector<HTMLButtonElement>('[data-cockpit-primary]')?.addEventListener('click', () => {
    if (action) options.onAction?.(action);
    else options.onAdvancedToggle?.(true);
  });
  mount.querySelectorAll<HTMLButtonElement>('[data-cockpit-dna-segment]').forEach((button) => button.addEventListener('click', () => {
    const paragraphIndex = Number(button.dataset.paragraphIndex);
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) return;
    const footnoteId = Number(button.dataset.footnoteId);
    options.onAction?.({ kind: 'preview-location', paragraphIndex, ...(Number.isInteger(footnoteId) && footnoteId >= 0 ? { footnoteId } : {}) });
  }));
  (['open-findings', 'simulate-repair', 'repair-safe'] as const).forEach((kind) => {
    mount.querySelector<HTMLButtonElement>(`[data-cockpit-action="${kind}"]`)?.addEventListener('click', () => options.onAction?.({ kind }));
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

function haloStatusLabel(model: VisualResultModel): string {
  if (model.readiness.kind === 'blocked') return 'Nije spremno';
  if (model.readiness.kind === 'needs-work' || model.readiness.kind === 'manual-review') return 'Uvjetno spremno';
  return 'Spremno';
}
