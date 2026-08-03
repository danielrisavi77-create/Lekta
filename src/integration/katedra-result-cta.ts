import type { LektaResult } from './academic-suite-contracts';
import { buildKatedraHandoffUrl } from './katedra-handoff';
import { readCapturedKatedraHandoff } from './katedra-capture';

const CTA_ID = 'katedraHandoffStrip';

function katedraBaseUrl(): string {
  const configured = String(import.meta.env.VITE_KATEDRA_URL || '').trim();
  if (configured) return configured;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:3000';
  return 'https://katedra.hr';
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

/**
 * Katedra is the continuation action for a result, including the free/teaser
 * result. `#resultDetails` can intentionally remain hidden until the detailed
 * report is revealed, so mounting the bridge anywhere inside that subtree
 * makes a valid cross-product action invisible. Mount immediately BEFORE the
 * locked details block instead; that keeps the bridge in the visible result
 * shell while preserving the report paywall/teaser boundary.
 */
function mountKatedraStrip(strip: HTMLElement): boolean {
  const details = document.querySelector<HTMLElement>('#resultDetails');
  if (details?.parentElement) {
    if (strip.nextElementSibling !== details) details.insertAdjacentElement('beforebegin', strip);
    return true;
  }

  // Defensive fallback for alternate/minimal result DOMs.
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

  const href = buildKatedraHandoffUrl(katedraBaseUrl(), captured);
  let strip = document.getElementById(CTA_ID);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = CTA_ID;
    strip.className = 'handoff-strip';
  }
  if (!mountKatedraStrip(strip)) return;

  const count = captured.issues.length;
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
