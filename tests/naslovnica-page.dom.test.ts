// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';
import { vi } from 'vitest';
import { ensureTemplatesHeavy } from '../src/title-pages/template-loader';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));

function buildDom(): void {
  document.body.innerHTML = `
    <select id="tp-institution"></select>
    <select id="tp-unit" disabled></select>
    <select id="tp-program" disabled></select>
    <datalist id="dl-university"></datalist>
    <input id="tp-university" type="text" list="dl-university">
    <input id="tp-faculty" type="text">
    <input id="tp-study" type="text">
    <input id="tp-author" type="text">
    <input id="tp-studentid" type="text">
    <input id="tp-course" type="text">
    <input id="tp-title" type="text">
    <input id="tp-subtitle" type="text">
    <select id="tp-worktype">
      <option value="seminar">Seminarski rad</option>
      <option value="final">Zavrsni rad</option>
      <option value="graduate" selected>Diplomski rad</option>
      <option value="specialist">Specijalisticki rad</option>
      <option value="doctoral">Doktorski rad</option>
      <option value="project">Projektni rad</option>
    </select>
    <select id="tp-mentor-label"><option>Mentor</option><option>Mentorica</option></select>
    <input id="tp-mentor" type="text">
    <select id="tp-comentor-label"><option>Komentor</option><option>Komentorica</option></select>
    <input id="tp-comentor" type="text">
    <input id="tp-place" type="text">
    <input id="tp-year" type="text">
    <button id="tp-sample" type="button"></button>
    <button id="tp-clear" type="button"></button>
    <span id="tp-template-badge"></span>
    <details id="tp-notes" hidden><summary>Napomene o ovom predlošku</summary><p id="tp-notes-text"></p></details>
    <div id="tp-sheet"></div>
    <button id="tp-print" type="button" disabled></button>
    <button id="tp-docx" type="button" disabled></button>
    <button id="tp-copy" type="button" disabled></button>
    <p id="tp-hint"></p>`;
}

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function fireChange(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }

describe('naslovnica-page: kaskada ustanova/fakultet/studij ne ostavlja zastarjele vrijednosti (DOM)', () => {
  beforeAll(async () => {
    buildDom();
    await import('../src/tools/naslovnica-page'); // init() se okine na import (readyState !== loading)
    // Predlosci su LIJENO ucitani (perf split); eksplicitno pricekaj umjesto oslanjanja na
    // mikrotaskove izmedju testova (isti obrazac kao citat-page.dom.test.ts + faculty-styles).
    await ensureTemplatesHeavy();
  });

  it('kaskada se popuni realnim katalogom', () => {
    expect($('#tp-institution').querySelector('option[value="unizg"]')).toBeTruthy();
  });

  it('odabir ustanove+fakulteta+studija auto-popuni sva tri tekstualna polja', () => {
    fireChange('#tp-institution', 'unizg');
    fireChange('#tp-unit', 'adu');
    fireChange('#tp-program', 'Gluma');
    expect($('#tp-university').value).toBe('Sveučilište u Zagrebu');
    expect($('#tp-faculty').value).toBe('Akademija dramske umjetnosti');
    expect($('#tp-study').value).toBe('Gluma');
  });

  it('BUG: promjena fakulteta na drugi (bez odabira studija) vise NE ostavlja studij s prethodnog fakulteta', () => {
    // Regresija: onUnitChange je azurirao #tp-faculty ali je #tp-study (vezan uz stari
    // fakultet/program) ostajao "Gluma" - kombinacija koja bi tiho zavrsila u naslovnici.
    fireChange('#tp-unit', 'agr');
    expect($('#tp-faculty').value).toBe('Agronomski fakultet');
    expect($('#tp-study').value).toBe('');
  });

  it('BUG: povratak fakulteta na placeholder isprazni fakultet I studij (ne samo select)', () => {
    fireChange('#tp-program', 'Diplomski studiji Agronomskog fakulteta');
    expect($('#tp-study').value).toBe('Diplomski studiji Agronomskog fakulteta');
    fireChange('#tp-unit', '');
    expect($('#tp-faculty').value).toBe('');
    expect($('#tp-study').value).toBe('');
    // Sveuciliste ostaje (kaskadu je jos uvijek "unizg" - samo je fakultet resetiran).
    expect($('#tp-university').value).toBe('Sveučilište u Zagrebu');
  });

  it('BUG: povratak ustanove na placeholder isprazni sveuciliste/fakultet/studij', () => {
    fireChange('#tp-unit', 'adu');
    fireChange('#tp-program', 'Gluma');
    fireChange('#tp-institution', '');
    expect($('#tp-university').value).toBe('');
    expect($('#tp-faculty').value).toBe('');
    expect($('#tp-study').value).toBe('');
  });

  it('rucni unos u #tp-study prezivi naknadnu promjenu fakulteta (nije auto-popunjeno, kaskada ga ne dira)', () => {
    fireChange('#tp-institution', 'unizg');
    fireChange('#tp-unit', 'adu');
    setVal('#tp-study', 'Moj rucni unos studija');
    fireChange('#tp-unit', 'agr');
    expect($('#tp-faculty').value).toBe('Agronomski fakultet');
    expect($('#tp-study').value).toBe('Moj rucni unos studija');
  });

  it('rucni unos u #tp-faculty prezivi povratak fakulteta na placeholder', () => {
    fireChange('#tp-unit', 'adu');
    setVal('#tp-faculty', 'Moj rucni fakultet');
    fireChange('#tp-unit', '');
    expect($('#tp-faculty').value).toBe('Moj rucni fakultet');
  });
});

describe('naslovnica-page: template.notes prikaz + JMBAG/kolegij polja (DOM)', () => {
  it('predlozak s napomenama otvara #tp-notes blok; bez predloska je skriven', () => {
    // agr-graduate u templates.json nosi urednicke napomene (korice, engleska naslovnica...).
    fireChange('#tp-institution', 'unizg');
    fireChange('#tp-unit', 'agr');
    expect($('#tp-notes').hidden).toBe(false);
    expect($('#tp-notes-text').textContent!.length).toBeGreaterThan(20);
    // Povratak na genericki raspored sakrije blok (mrtvi podatak se ne prikazuje prazan).
    fireChange('#tp-unit', '');
    expect($('#tp-notes').hidden).toBe(true);
  });

  it('JMBAG i kolegij ulaze u pregled (JMBAG ispod imena) i u kopirani tekst', () => {
    fireChange('#tp-unit', '');
    setVal('#tp-author', 'Ana Anić');
    setVal('#tp-studentid', '0123456789');
    setVal('#tp-course', 'Lokalna politika');
    const sheet = $('#tp-sheet').textContent || '';
    expect(sheet).toContain('JMBAG: 0123456789');
    expect(sheet).toContain('Kolegij: Lokalna politika');
    // JMBAG redak dolazi ODMAH iza imena (konvencija predlozaka).
    expect(sheet.indexOf('JMBAG: 0123456789')).toBeGreaterThan(sheet.indexOf('Ana Anić'));
  });

  it('JMBAG se sidri iza imena i kad je aktivan predlozak fakulteta', () => {
    fireChange('#tp-unit', 'agr');
    const sheet = $('#tp-sheet').textContent || '';
    expect(sheet).toContain('JMBAG: 0123456789');
    expect(sheet.indexOf('JMBAG: 0123456789')).toBeGreaterThan(sheet.indexOf('Ana Anić'));
  });

  it('BUG: "Ocisti" vraca vrstu rada na HTML default (Diplomski), ne na prvu opciju', () => {
    fireChange('#tp-worktype', 'doctoral');
    ($('#tp-clear') as any).dispatchEvent(new Event('click', { bubbles: true }));
    expect($('#tp-worktype').value).toBe('graduate');
    expect($('#tp-studentid').value).toBe('');
  });
});
