import type { LektaResult } from './academic-suite-contracts';
import { buildKatedraHandoffUrl } from './katedra-handoff';
import { readCapturedKatedraHandoff } from './katedra-capture';
import { wasCompletionCheckPersisted } from './completion-check-persistence';

const CTA_ID = 'katedraHandoffStrip';
const KATEDRA_PRODUCTION_URL = 'https://katedra.netlify.app';
const KATEDRA_PAIRED_PREVIEW_URL = 'https://deploy-preview-1--katedra.netlify.app';
const LEKTA_PAIRED_PREVIEW_HOST = 'deploy-preview-25--lektahr.netlify.app';

function katedraBaseUrl(): string {
  const configured = String(import.meta.env.VITE_KATEDRA_URL || '').trim();
  if (configured) return configured;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:3000';
  if (location.hostname === LEKTA_PAIRED_PREVIEW_HOST) return KATEDRA_PAIRED_PREVIEW_URL;
  return KATEDRA_PRODUCTION_URL;
}

function removeCta(): void {
  document.getElementById(CTA_ID)?.remove();
}

function validCapturedResult(value: any): value is LektaResult {
  return Boolean(
    value &&
    value.schemaVersion === '0.1' &&
    value.projectId &&
    value.analysisId &&
    value.rulesetId &&
    Array.isArray(value.issues),
  );
}

/** Keep continuation outside the paid/details subtree so free checks can return to the project. */
function mountKatedraStrip(strip: HTMLElement): boolean {
  const details = document.querySelector<HTMLElement>('#resultDetails');
  if (details?.parentElement) {
    if (strip.nextElementSibling !== details) details.insertAdjacentElement('beforebegin', strip);
    return true;
  }

  const anchor =
    document.querySelector<HTMLElement>('#nextSteps') ??
    document.querySelector<HTMLElement>('#fullReportBanner') ??
    document.querySelector<HTMLElement>('#actionPlan');
  if (!anchor) return false;
  if (strip.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', strip);
  return true;
}

export function renderKatedraResultCta(): void {
  const resultView = document.querySelector<HTMLElement>('#resultView');
  if (!resultView || resultView.classList.contains('hidden')) {
    removeCta();
    return;
  }

  const captured = readCapturedKatedraHandoff();
  if (!validCapturedResult(captured)) {
    removeCta();
    return;
  }

  let strip = document.getElementById(CTA_ID);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = CTA_ID;
    strip.className = 'handoff-strip';
  }
  if (!mountKatedraStrip(strip)) return;

  const count = captured.issues.length;
  if (wasCompletionCheckPersisted(captured) && window.history.length > 1) {
    strip.innerHTML = `
      <div>
        <strong>Provjera je spremljena u tvoj projekt</strong>
        <p>${count} ${count === 1 ? 'nalaz je spremljen' : count < 5 ? 'nalaza su spremljena' : 'nalaza je spremljeno'} kao sanitizirani workflow signal. DOCX i tekst rada nisu poslani u Completion.</p>
      </div>
      <button class="btn btn-secondary btn-sm" data-completion-project-back type="button">Natrag u moj projekt →</button>
    `;
    strip.querySelector<HTMLButtonElement>('[data-completion-project-back]')?.addEventListener('click', () => {
      window.history.back();
    });
    return;
  }

  // Legacy/session-only fallback remains available when server persistence was
  // not confirmed (for example direct Lekta use or temporary network failure).
  const href = buildKatedraHandoffUrl(katedraBaseUrl(), captured);
  strip.innerHTML = `
    <div>
      <strong>Riješi nalaze u Katedri</strong>
      <p>Katedra će pretvoriti ${count} ${count === 1 ? 'nalaz' : count < 5 ? 'nalaza' : 'nalaza'} u plan ispravaka. Tekst rada se ne šalje — prelaze samo sanitizirani ID-jevi i metapodaci nalaza.</p>
    </div>
    <a class="btn btn-secondary btn-sm" data-katedra-handoff href="${href}" rel="noopener noreferrer">Riješi u Katedri →</a>
  `;
}

function scheduleRender(): void {
  window.setTimeout(renderKatedraResultCta, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('lekta:katedra-handoff-ready', scheduleRender);
  window.addEventListener('lekta:completion-check-persisted', scheduleRender);
  window.addEventListener('lekta:completion-check-persistence-failed', scheduleRender);
  window.addEventListener('hashchange', scheduleRender);

  const mountObserver = () => {
    const resultView = document.querySelector<HTMLElement>('#resultView');
    if (!resultView) return;
    const observer = new MutationObserver(scheduleRender);
    observer.observe(resultView, { attributes: true, attributeFilter: ['class'], childList: true, subtree: false });
    scheduleRender();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountObserver, { once: true });
  else mountObserver();
}
