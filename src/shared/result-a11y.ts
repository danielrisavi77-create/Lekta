// src/shared/result-a11y.ts
//
// BL-P1-02 (WCAG 2.4.3 Focus Order, 4.1.3 Status Messages): nakon analize se skriva
// #wizardView (s fokusiranim gumbom Analiziraj) pa fokus padne na <body>; rezultat se otkrije
// bez pomaka fokusa i citac zaslona ne dobije obavijest. Ovaj modul (cista, testabilna logika
// bez ovisnosti o app.ts stanju) pomice fokus na naslov rezultata i najavljuje zavrsetak preko
// polite aria-live regije. Wira se jednim pozivom u renderResult (pokriva i stvarni i demo tok).

const LIVE_REGION_ID = 'lekta-sr-status';

/** Reuse ili kreiraj vizualno skrivenu polite aria-live regiju za najave citacu zaslona. */
export function getStatusRegion(doc: Document = document): HTMLElement {
  let el = doc.getElementById(LIVE_REGION_ID);
  if (!el) {
    el = doc.createElement('div');
    el.id = LIVE_REGION_ID;
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    // Fallback za slucaj da .sr-only nije definiran na stranici (ne oslanjaj se samo na klasu).
    el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    doc.body?.appendChild(el);
  }
  return el;
}

/** Najavi poruku citacu zaslona (polite). */
export function announceStatus(message: string, doc: Document = document): void {
  getStatusRegion(doc).textContent = message;
}

/**
 * Pomakni fokus na naslov rezultata (programski, bez skoka viewporta) i najavi zavrsetak.
 * Idempotentno: naslov dobije tabindex=-1 samo ako ga nema. Vraca je li fokus postavljen.
 */
export function focusResult(
  titleEl: HTMLElement | null,
  message = 'Rezultat analize je spreman.',
  doc: Document = document,
): boolean {
  announceStatus(message, doc);
  if (!titleEl) return false;
  if (!titleEl.hasAttribute('tabindex')) titleEl.setAttribute('tabindex', '-1');
  try { titleEl.focus({ preventScroll: true }); } catch { titleEl.focus(); }
  return doc.activeElement === titleEl;
}
