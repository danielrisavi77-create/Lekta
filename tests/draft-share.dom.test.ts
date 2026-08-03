// @vitest-environment happy-dom
/**
 * Dijeljeni draft naslovnica <-> izjava (sessionStorage): zajednicka polja (ime, naslov,
 * vrsta rada, mjesto) putuju izmedju alata; puni se SAMO prazno polje; datum/godina se NE
 * dijele. Modul draft-share.ts + integracija na obje stranice (svaka u svjezem modulu).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveToolDraft, readToolDraft } from '../src/tools/draft-share';

vi.mock('../src/shared/ui-boot', () => ({}));
vi.mock('../src/tools/tool-analytics', () => ({ trackToolEvent: async () => false }));

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }

function buildIzjavaDom(): void {
  document.body.innerHTML = `
    <select id="st-heading"><option>Izjava o izvornosti</option></select>
    <input id="st-author" type="text">
    <select id="st-worktype">
      <option>Seminarski rad</option><option>Završni rad</option><option selected>Diplomski rad</option>
      <option>Specijalistički rad</option><option>Doktorski rad</option><option>Projektni rad</option>
    </select>
    <input id="st-title" type="text"><input id="st-place" type="text">
    <input id="st-date-picker" type="date"><input id="st-date" type="text">
    <button id="st-sample" type="button"></button><button id="st-clear" type="button"></button>
    <div id="st-sheet"></div><p id="st-hint"></p>
    <button id="st-copy" type="button"></button><button id="st-docx" type="button"></button><button id="st-print" type="button"></button>`;
}

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
});

describe('draft-share modul', () => {
  it('round-trip cuva samo neprazna dijeljena polja', () => {
    saveToolDraft({ author: ' Ana Anić ', title: '', workTypeLabel: 'Doktorski rad', place: 'Split' });
    expect(readToolDraft()).toEqual({ author: 'Ana Anić', workTypeLabel: 'Doktorski rad', place: 'Split' });
  });

  it('smece u storageu se tiho ignorira', () => {
    sessionStorage.setItem('lekta.tool-draft', '{nije json');
    expect(readToolDraft()).toEqual({});
    sessionStorage.setItem('lekta.tool-draft', JSON.stringify({ author: 42, place: 'Zagreb' }));
    expect(readToolDraft()).toEqual({ place: 'Zagreb' });
  });
});

describe('izjava-page integracija', () => {
  it('draft iz naslovnice puni SAMO prazna polja izjave (label vrste rada se mapira)', async () => {
    saveToolDraft({ author: 'Ana Anić', title: 'Naslov iz naslovnice', workTypeLabel: 'Doktorski rad', place: 'Rijeka' });
    buildIzjavaDom();
    await import('../src/tools/izjava-page');
    expect($('#st-author').value).toBe('Ana Anić');
    expect($('#st-title').value).toBe('Naslov iz naslovnice');
    expect($('#st-place').value).toBe('Rijeka');
    expect($('#st-worktype').value).toBe('Doktorski rad');
  });

  it('postojeci unos se NIKAD ne gazi draftom', async () => {
    saveToolDraft({ author: 'Draft Autor' });
    buildIzjavaDom();
    $('#st-author').value = 'Vec upisana Ana';
    await import('../src/tools/izjava-page');
    expect($('#st-author').value).toBe('Vec upisana Ana');
  });

  it('unos na izjavi se sprema u draft (za povratak na naslovnicu)', async () => {
    buildIzjavaDom();
    await import('../src/tools/izjava-page');
    // Eksplicitno odaberi vrstu rada (happy-dom ne postuje pocetni 'selected' atribut,
    // pa se test ne oslanja na inicijalno stanje selecta).
    const wt = $('#st-worktype');
    wt.value = 'Doktorski rad';
    wt.dispatchEvent(new Event('change', { bubbles: true }));
    setVal('#st-author', 'Iva Ivić');
    setVal('#st-place', 'Osijek');
    const d = readToolDraft();
    expect(d.author).toBe('Iva Ivić');
    expect(d.place).toBe('Osijek');
    expect(d.workTypeLabel).toBe('Doktorski rad'); // trenutno odabrani label ide s draftom
  });
});
