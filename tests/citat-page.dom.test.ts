// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku picker-a) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));

const TYPES = ['knjiga', 'poglavlje', 'clanak', 'mrezni', 'zavrsni', 'propis'];
const FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

function buildDom(): void {
  document.body.innerHTML = `
    <select id="f-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
    <select id="f-style"><option value="autor-godina">Autor-godina</option><option value="fusnota">Fusnota</option></select>
    <select id="f-faculty"><option value="">— Bez fakulteta —</option></select>
    <p id="f-style-info" hidden></p>
    ${FIELDS.map((k) => `<div data-field="${k}"><input id="f-${k}"></div>`).join('')}
    <div id="out" class="empty"></div>
    <div id="out-hint"></div>
    <button id="copyBtn"></button>
    <div id="out-intext" hidden><span id="intextValue"></span></div>
    <button id="copyIntextBtn"></button>
    <button id="c-sample"></button>
    <button id="c-clear"></button>`;
}

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }

describe('citat-page: izbornik fakulteta (DOM)', () => {
  beforeAll(async () => {
    buildDom();
    await import('../src/tools/citat-page'); // init() se okine na import (readyState !== loading)
  });

  it('izbornik fakulteta se napuni (grupe + fakulteti)', () => {
    const fac = $('#f-faculty');
    expect(fac.querySelectorAll('optgroup').length).toBeGreaterThan(10);
    expect(fac.querySelectorAll('option[value]:not([value=""])').length).toBeGreaterThanOrEqual(55);
    expect(fac.querySelector('option[value="efos"]')).toBeTruthy();
  });

  it('odabir fakulteta ucita njegov stil u #f-style + prikaze provenijenciju', () => {
    const fac = $('#f-faculty');
    fac.value = 'efos';
    fac.dispatchEvent(new Event('change', { bubbles: true }));
    // #f-style sada nosi efos stilove (value = indeks), ne genericke
    expect($('#f-style').querySelector('option[value="0"]')).toBeTruthy();
    expect($('#f-style-info').hidden).toBe(false);
    expect($('#f-style-info').textContent).toMatch(/sluzbenim uputama|službenim uputama/i);
  });

  it('render koristi vjeran fakultetski format (efos knjiga)', () => {
    setVal('#f-type', 'knjiga');
    setVal('#f-authors', 'Milas, G.');
    setVal('#f-title', 'Istraživačke metode u psihologiji');
    setVal('#f-year', '2009');
    setVal('#f-place', 'Zagreb');
    setVal('#f-publisher', 'Naklada Slap');
    expect($('#out').textContent).toContain('Milas, G. (2009)');
    expect($('#out').textContent).toContain('Naklada Slap');
  });

  it('povratak na "Bez fakulteta" vrati genericki izbor stila', () => {
    const fac = $('#f-faculty');
    fac.value = '';
    fac.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#f-style').querySelector('option[value="autor-godina"]')).toBeTruthy();
    expect($('#f-style-info').hidden).toBe(true);
  });
});
