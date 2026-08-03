// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));
vi.mock('../src/tools/tool-analytics', () => ({ trackToolEvent: async () => false }));

function buildDom(): void {
  document.body.innerHTML = `
    <select id="lit-sort">
      <option value="alphabetical" selected>Abecedno</option>
      <option value="appearance">Zadrži izvorni redoslijed</option>
    </select>
    <textarea id="lit-input"></textarea>
    <button id="lit-sample" type="button"></button>
    <button id="lit-clear" type="button"></button>
    <p id="lit-order-note"></p>
    <b id="lit-total">0</b>
    <b id="lit-unique">0</b>
    <b id="lit-dupes">0</b>
    <b id="lit-issues">0</b>
    <ul id="lit-list"></ul>
    <button id="lit-copy" type="button" disabled></button>
    <button id="lit-docx" type="button" disabled></button>`;
}

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function fireChange(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }

describe('literatura-page: IEEE/Vancouver "zadrzi izvorni redoslijed" prekidac (DOM)', () => {
  beforeAll(async () => {
    buildDom();
    await import('../src/tools/literatura-page'); // init() se okine na import (readyState !== loading)
  });

  const RAW = '[3] Zorić, Z. (2020). Treći rad.\n[1] Anić, A. (2019). Prvi rad.\n[2] Marić, M. (2021). Drugi rad.';

  it('zadano (abecedno) sortira popis, red je vidljiv u #lit-list', () => {
    setVal('#lit-input', RAW);
    const items = [...$('#lit-list').querySelectorAll('.lit-text')].map((el: any) => el.textContent);
    expect(items[0]).toContain('Anić');
    expect(items[1]).toContain('Marić');
    expect(items[2]).toContain('Zorić');
    expect($('#lit-order-note').textContent).toMatch(/abecedno/i);
  });

  it('BUG: prebacivanje na "Zadrži izvorni redoslijed" vise ne razbija numericki popis', () => {
    fireChange('#lit-sort', 'appearance');
    const items = [...$('#lit-list').querySelectorAll('.lit-text')].map((el: any) => el.textContent);
    expect(items[0]).toContain('Zorić'); // [3] ostaje prvi, kako je zalijepljeno
    expect(items[1]).toContain('Anić');  // [1]
    expect(items[2]).toContain('Marić'); // [2]
    expect($('#lit-order-note').textContent).toMatch(/izvorni redoslijed/i);
  });

  it('povratak na abecedno ponovno sortira', () => {
    fireChange('#lit-sort', 'alphabetical');
    const items = [...$('#lit-list').querySelectorAll('.lit-text')].map((el: any) => el.textContent);
    expect(items[0]).toContain('Anić');
  });
});
