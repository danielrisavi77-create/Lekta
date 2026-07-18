// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));

function buildDom(): void {
  document.body.innerHTML = `
    <select id="st-heading">
      <option>Izjava o izvornosti</option>
      <option>Izjava o akademskoj čestitosti</option>
    </select>
    <input id="st-author" type="text">
    <select id="st-worktype">
      <option>Seminarski rad</option>
      <option>Završni rad</option>
      <option selected>Diplomski rad</option>
      <option>Specijalistički rad</option>
      <option>Doktorski rad</option>
      <option>Projektni rad</option>
    </select>
    <input id="st-title" type="text">
    <input id="st-place" type="text">
    <input id="st-date-picker" type="date">
    <input id="st-date" type="text">
    <button id="st-sample" type="button"></button>
    <button id="st-clear" type="button"></button>
    <div id="st-sheet"></div>
    <p id="st-hint"></p>
    <button id="st-copy" type="button" disabled></button>
    <button id="st-docx" type="button" disabled></button>
    <button id="st-print" type="button" disabled></button>`;
}

const $ = (s: string): any => document.querySelector(s);
function fireChange(el: any) { el.dispatchEvent(new Event('change', { bubbles: true })); }
function click(el: any) { el.dispatchEvent(new Event('click', { bubbles: true })); }

describe('izjava-page: date-picker <-> tekst sinkronizacija i Ocisti default (DOM)', () => {
  beforeEach(async () => {
    vi.resetModules();
    buildDom();
    await import('../src/tools/izjava-page'); // init() se okine na import (readyState !== loading)
  });

  it('picker promjena puni #st-date hrvatskim oblikom', () => {
    const picker = $('#st-date-picker');
    picker.value = '2026-07-03';
    fireChange(picker);
    expect($('#st-date').value).toBe('3. srpnja 2026.');
  });

  it('BUG: "Ubaci primjer" postavlja I picker I tekst na uskladjenu vrijednost', () => {
    // Prije popravka: picker.value ostaje netaknut nakon "Ubaci primjer", pa bi ponovna
    // potvrda ISTOG datuma u pickeru bila no-op (change se ne okida na nepromijenjenu vrijednost)
    // i tekst bi zauvijek ostao na SAMPLE vrijednosti neovisno o onome sto picker pokazuje.
    click($('#st-sample'));
    expect($('#st-date').value).toBe('3. srpnja 2026.');
    expect($('#st-date-picker').value).toBe('2026-07-03');
  });

  it('BUG: "Ocisti" prazni I picker I tekst', () => {
    click($('#st-sample'));
    click($('#st-clear'));
    expect($('#st-date').value).toBe('');
    expect($('#st-date-picker').value).toBe('');
  });

  it('BUG: "Ocisti" vraca #st-worktype na stvarni HTML default (Diplomski), ne na selectedIndex=0', () => {
    const wt = $('#st-worktype');
    wt.value = 'Doktorski rad';
    fireChange(wt);
    click($('#st-clear'));
    expect(wt.value).toBe('Diplomski rad');
  });
});

function fireInput(el: any) { el.dispatchEvent(new Event('input', { bubbles: true })); }

describe('izjava-page: #st-hint tekst razlikuje "locked" (nijedno polje) od "preporuceno" (vec otkljucano)', () => {
  beforeEach(async () => {
    vi.resetModules();
    buildDom();
    await import('../src/tools/izjava-page');
  });

  it('BUG: prazna forma (locked) ne kaze "Preporučeno" nego trazi da se otkljuca izvoz', async () => {
    await vi.waitFor(() => expect($('#st-hint').textContent).toBeTruthy());
    expect($('#st-hint').textContent).not.toContain('Preporučeno');
    expect($('#st-hint').textContent).toContain('otključaš');
  });

  it('kad je barem jedno polje popunjeno (otkljucano), ostatak je i dalje "Preporučeno dodati"', async () => {
    $('#st-author').value = 'Ana Anić';
    fireInput($('#st-author'));
    await vi.waitFor(() => expect($('#st-hint').textContent).toContain('Preporučeno dodati'));
    expect($('#st-copy').disabled).toBe(false);
  });
});
