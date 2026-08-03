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
 * The handoff is a primary cross-product continuation action, so it must be
 * mounted inside the initially visible result overview. The previous anchor
 * (`#actionPlan`) lives in a non-active tab and made a valid CTA invisible
 * until the user manually opened “Plan ispravaka”.
 */
function handoffAnchor(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#summaryNote') ??
    document.querySelector<HTMLElement>('#actionPlan')
  );
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

  const anchor = handoffAnchor();
  if (!anchor) return;

  const href = buildKatedraHandoffUrl(katedraBaseUrl(), captured);
  let strip = document.getElementById(CTA_ID);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = CTA_ID;
    strip.className = 'handoff-strip';
    anchor.insertAdjacentElement('afterend', strip);
  } else if (strip.previousElementSibling !== anchor) {
    // Keep an existing strip in the visible overview even if an earlier render
    // mounted it against a fallback anchor while the result UI was settling.
    anchor.insertAdjacentElement('afterend', strip);
  }

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
