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

/**
 * FOKUS VRACA SAMO MODAL KOJI GA JE I UZEO, i to TEK nakon sto pozadina prestane biti inertna.
 *
 * Do 2026-09-07 je vracanje fokusa stajalo IZVAN provjere `_trap`, pa ga je trosio prvi poziv
 * bez obzira je li taj modal uopce bio otvoren. Globalni Escape rukovatelj zove SVE zatvarace
 * redom (`closeOrder(); closeHistory(); closeLegal(); ...`), pa je `_modalReturnFocus` potrosio
 * `closeOrder`, i to dok je `main` jos `inert`: `.focus()` na element u inertnom podstablu tiho
 * ne uspije, a zastavica se ipak obrise, pa pravi modal poslije nema sto vratiti.
 *
 * Posljedica je bila da se fokus gubi na SVAKOM modalu zatvorenom Escapeom, a ne samo na jednom.
 * Izmjereno na zatecenom `#legalModal`, bez ijedne izmjene u njegovu putu:
 *     X gumb   fokus se vraca na [data-legal] poveznicu
 *     Escape   fokus zavrsi na <body>
 * Gard: `tests/ux/workspace-entry.spec.ts` (list profila) mjeri oba puta.
 *
 * Svi pozivatelji prosljedjuju element koji su prethodno i zarobili, pa rani izlaz nista ne gubi.
 */
export function releaseModal(el: HTMLElement | null): void {
  if (!el || !(el as any)._trap) return;
  el.removeEventListener('keydown', (el as any)._trap);
  (el as any)._trap = null;
  if (--_modalDepth <= 0) {
    _modalDepth = 0;
    setBackgroundInert(false);
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
