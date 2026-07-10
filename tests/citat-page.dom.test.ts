// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));

const TYPES = ['knjiga', 'poglavlje', 'clanak', 'mrezni', 'zavrsni', 'propis'];
const FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

function buildDom(): void {
  document.body.innerHTML = `
    <select id="f-faculty"><option value="">Bez fakulteta</option></select>
    <p id="f-style-info" hidden></p>
    <button id="tab-single" class="active"></button>
    <button id="tab-bulk"></button>
    <div id="panel-single">
      <select id="f-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
      <select id="f-style"><option value="autor-godina">Autor-godina</option><option value="fusnota">Fusnota</option></select>
      ${FIELDS.map((k) => `<div data-field="${k}"><input id="f-${k}"></div>`).join('')}
      <div id="out" class="empty"></div>
      <div id="out-hint"></div>
      <button id="copyBtn"></button>
      <div id="out-intext" hidden><span id="intextValue"></span></div>
      <button id="copyIntextBtn"></button>
      <button id="c-sample"></button>
      <button id="c-clear"></button>
    </div>
    <div id="panel-bulk" hidden>
      <textarea id="bulk-input"></textarea>
      <button id="bulk-parse"></button>
      <div id="bulk-entries"></div>
      <button id="bulk-generate" hidden></button>
      <div id="bulk-output"></div>
      <button id="bulk-copy" hidden></button>
    </div>`;
}

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function fireChange(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }

describe('citat-page: izbornik fakulteta + bulk (DOM)', () => {
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
    fireChange('#f-faculty', 'efos');
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
    fireChange('#f-faculty', '');
    expect($('#f-style').querySelector('option[value="autor-godina"]')).toBeTruthy();
    expect($('#f-style-info').hidden).toBe(true);
  });

  it('tab prebacuje na "Cijela literatura"', () => {
    $('#tab-bulk').click();
    expect($('#panel-bulk').hidden).toBe(false);
    expect($('#panel-single').hidden).toBe(true);
  });

  it('bulk: zalijepi -> prepoznaj -> editabilne kartice po referenci', () => {
    $('#bulk-input').value = 'Kovačić, I. (2020). Naslov knjige. Zagreb: Naklada.\n\nHorvat, A. (2019). Drugi naslov. Zagreb: Druga naklada.';
    $('#bulk-parse').click();
    const cards = $('#bulk-entries').querySelectorAll('.bulk-card');
    expect(cards.length).toBe(2);
    // svaka kartica ima <select vrste> + bar jedno polje
    expect(cards[0].querySelector('.card-type')).toBeTruthy();
    expect(cards[0].querySelectorAll('input[data-key]').length).toBeGreaterThan(0);
    expect($('#bulk-generate').hidden).toBe(false);
  });

  it('bulk: generiraj -> sortirana literatura (2 retka) + copy vidljiv', () => {
    $('#bulk-generate').click();
    const result = $('#bulk-result');
    expect(result).toBeTruthy();
    const lines = result.value.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect($('#bulk-copy').hidden).toBe(false);
  });
});
