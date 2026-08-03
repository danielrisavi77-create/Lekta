// @vitest-environment happy-dom
/**
 * Nove kartice kontrole: mjera (1800 s razmacima / 1500 bez razmaka), cilj i cijena po
 * kartici, te .docx uvoz (extractDocxText + ZipReader put je pokriven u docx-text.test.ts;
 * ovdje DOM sloj: status poruke i odbijanje ne-docx ulaza).
 * #m-kartice se postavlja sinkrono preko setStat (CSS-only flash, bez rAF animacije), pa
 * asertacije ne ovise o vremenu; matchMedia stub ostaje bezopasan (nista ga vise ne cita).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/shared/ui-boot', () => ({}));
vi.mock('../src/tools/tool-analytics', () => ({ trackToolEvent: async () => false }));

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function fireChange(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }

describe('kartice-page: mjera/cilj/cijena + .docx uvoz (DOM)', () => {
  beforeAll(async () => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes('prefers-reduced-motion'), addListener: () => {}, removeListener: () => {} });
    document.body.innerHTML = `
      <textarea id="kt-input"></textarea>
      <input id="kt-file" type="file">
      <button id="kt-sample" type="button"></button>
      <button id="kt-clear" type="button"></button>
      <button id="kt-copy" type="button" disabled></button>
      <span id="m-kartice"></span><span id="m-words"></span>
      <span id="m-chars"></span><span id="m-chars-nospace"></span>
      <span id="m-sentences"></span><span id="m-paragraphs"></span>
      <span id="m-pages"></span><span id="m-reading"></span>
      <span id="kt-measure-hint"></span>
      <select id="kt-measure"><option value="1800" selected>1800</option><option value="1500">1500</option></select>
      <input id="kt-goal" type="text"><input id="kt-price" type="text">
      <p id="kt-goal-line"></p><p id="kt-price-line"></p>
      <p id="kt-docx-status"></p>
      <div id="kt-sr-summary"></div>`;
    await import('../src/tools/kartice-page');
  });

  it('mjera 1800 (zadano): 3600 znakova s razmacima = 2,00 kartice', async () => {
    setVal('#kt-input', 'a'.repeat(3600));
    await new Promise((r) => setTimeout(r, 120)); // input listener spaja rendere preko rAF
    expect($('#m-kartice').textContent).toBe('2');
  });

  it('prebacivanje na 1500 bez razmaka preracuna prikaz iz charsWithoutSpaces', () => {
    // 3600 'a' bez razmaka: 3600/1500 = 2,4 kartice.
    fireChange('#kt-measure', '1500');
    expect($('#m-kartice').textContent).toBe('2,4');
    expect($('#kt-measure-hint').textContent).toContain('1500 znakova bez razmaka');
    fireChange('#kt-measure', '1800');
    expect($('#m-kartice').textContent).toBe('2');
  });

  it('cilj: prikazuje koliko kartica nedostaje odnosno da je dosegnut', () => {
    setVal('#kt-goal', '5');
    expect($('#kt-goal-line').textContent).toContain('nedostaje još 3');
    setVal('#kt-goal', '1,5');
    expect($('#kt-goal-line').textContent).toContain('dosegnut');
    setVal('#kt-goal', '');
    expect($('#kt-goal-line').textContent).toBe('');
  });

  it('cijena po kartici: mnozi prikazanu mjeru (2 kartice x 2,50 EUR = 5 EUR)', () => {
    setVal('#kt-price', '2,50');
    expect($('#kt-price-line').textContent).toContain('5 EUR');
    setVal('#kt-price', '');
    expect($('#kt-price-line').textContent).toBe('');
  });

  it('.docx uvoz odbija ne-docx datoteku s vidljivom porukom', async () => {
    const input = $('#kt-input');
    const file = new File(['nije docx'], 'rad.pdf', { type: 'application/pdf' });
    const dt = { files: [file] };
    input.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: dt }));
    // ne-docx drop se prepusta pregledniku (nema statusa); ali change na #kt-file javlja gresku
    const fi = $('#kt-file');
    Object.defineProperty(fi, 'files', { value: [file], configurable: true });
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect($('#kt-docx-status').textContent).toContain('.docx');
  });
});
