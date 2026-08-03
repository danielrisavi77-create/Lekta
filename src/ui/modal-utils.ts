/**
 * Fokus u modalima (a11y): zarobi Tab unutar modala i vrati fokus na okidac pri zatvaranju.
 * Izdvojeno iz app.ts da ga repair-panel.ts/repair-price-slider.ts mogu koristiti bez
 * cikličkog uvoza (app.ts vec uvozi rendere iz tih datoteka).
 */
let _modalReturnFocus: HTMLElement | null = null;
let _modalDepth = 0;

export function modalFocusables(el: HTMLElement): HTMLElement[] {
  return [
    ...el.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((x) => x.offsetWidth || x.offsetHeight || x.getClientRects().length);
}

export function setBackgroundInert(on: boolean): void {
  ['header.topbar', 'main', 'footer'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (on) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  });
}

export function trapModal(el: HTMLElement | null): void {
  if (!el) return;
  _modalReturnFocus = document.activeElement as HTMLElement | null;
  if (++_modalDepth === 1) setBackgroundInert(true);
  (el as any)._trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = modalFocusables(el);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', (el as any)._trap);
  setTimeout(() => {
    (el.querySelector<HTMLElement>('.modal-close') || modalFocusables(el)[0])?.focus();
  }, 30);
}

export function releaseModal(el: HTMLElement | null): void {
  if (el && (el as any)._trap) {
    el.removeEventListener('keydown', (el as any)._trap);
    (el as any)._trap = null;
    if (--_modalDepth <= 0) {
      _modalDepth = 0;
      setBackgroundInert(false);
    }
  }
  if (_modalReturnFocus) {
    try {
      _modalReturnFocus.focus();
    } catch {
      /* element vise nije u DOM-u ili nije fokusabilan, sigurno preskoci */
    }
    _modalReturnFocus = null;
  }
}
