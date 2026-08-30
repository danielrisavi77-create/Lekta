import { createFrameCoalescer } from './frame-coalescer';

export type PremiumTone = 'brand' | 'pass' | 'warn' | 'danger' | 'info';

export interface PremiumBarValue {
  label: string;
  value: number;
  max: number;
  tone?: PremiumTone;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function setProgressValue(node: HTMLElement, value: number, max = 100): number {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const percent = clampPercent((value / safeMax) * 100);
  const normalized = String(Math.round(percent * 100) / 100);
  node.style.setProperty('--viz-value', normalized);
  node.setAttribute('aria-valuemin', '0');
  node.setAttribute('aria-valuemax', String(safeMax));
  node.setAttribute('aria-valuenow', String(Math.min(safeMax, Math.max(0, value))));
  return percent;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setupPremiumTilt(): void {
  if (prefersReducedMotion()) return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches) return;

  document.querySelectorAll<HTMLElement>('[data-premium-tilt]').forEach((card) => {
    if (card.dataset.premiumTiltReady === 'true') return;
    card.dataset.premiumTiltReady = 'true';
    let bounds: DOMRect | null = null;
    const coalescer = createFrameCoalescer<{ x: number; y: number }>((value) => {
      card.style.setProperty('--premium-rotate-x', `${value.y.toFixed(2)}deg`);
      card.style.setProperty('--premium-rotate-y', `${value.x.toFixed(2)}deg`);
    });
    card.addEventListener('pointerenter', () => {
      bounds = card.getBoundingClientRect();
      card.style.willChange = 'transform';
    });
    card.addEventListener('pointermove', (event) => {
      if (!bounds) bounds = card.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 4;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -4;
      coalescer.schedule({ x, y });
    });
    card.addEventListener('pointerleave', () => {
      coalescer.cancel();
      card.style.setProperty('--premium-rotate-x', '0deg');
      card.style.setProperty('--premium-rotate-y', '0deg');
      card.style.willChange = 'auto';
      bounds = null;
    });
  });
}

function setupPremiumProgress(): void {
  document.querySelectorAll<HTMLElement>('[data-premium-progress]').forEach((node) => {
    const value = Number(node.dataset.value || 0);
    const max = Number(node.dataset.max || 100);
    setProgressValue(node, value, max);
  });
}

export function setupPremiumVisuals(): void {
  setupPremiumTilt();
  setupPremiumProgress();
  document.documentElement.dataset.premiumReady = 'true';
}
