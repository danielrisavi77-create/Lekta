/**
 * BL-P1-02: nakon analize fokus mora na naslov rezultata + najava citacu zaslona
 * (WCAG 2.4.3, 4.1.3). focusResult mora: kreirati polite aria-live regiju, najaviti poruku,
 * dati #resultTitle tabindex=-1 i pomaknuti fokus na njega.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { focusResult, announceStatus, getStatusRegion } from '../src/shared/result-a11y';

describe('result a11y (BL-P1-02)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="wizardView"></div><section id="resultView"><h2 id="resultTitle">rad.docx</h2></section>';
  });

  it('kreira jednu polite aria-live regiju i najavljuje', () => {
    announceStatus('Test poruka');
    const region = document.getElementById('lekta-sr-status')!;
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Test poruka');
    // idempotentno: druga najava ne stvara drugu regiju
    announceStatus('Druga');
    expect(document.querySelectorAll('#lekta-sr-status').length).toBe(1);
    expect(getStatusRegion().textContent).toBe('Druga');
  });

  it('pomice fokus na naslov rezultata i cini ga fokusabilnim', () => {
    const title = document.getElementById('resultTitle') as HTMLElement;
    const ok = focusResult(title);
    expect(ok).toBe(true);
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(title);
    expect(document.getElementById('lekta-sr-status')!.textContent).toBe('Rezultat analize je spreman.');
  });

  it('ne baca kad naslov ne postoji (samo najavi)', () => {
    const ok = focusResult(null, 'Gotovo');
    expect(ok).toBe(false);
    expect(document.getElementById('lekta-sr-status')!.textContent).toBe('Gotovo');
  });
});
