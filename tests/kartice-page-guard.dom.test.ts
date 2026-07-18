// @vitest-environment happy-dom
/**
 * MAX_ZNAKOVA guard (2 milijuna znakova) u kartice-page.ts: dva odvojena buga.
 * 1) slice(0, MAX_ZNAKOVA) rezuci po UTF-16 code unit indeksu; ako granica padne unutar
 *    astralnog znaka (npr. emoji), ostavlja usamljeni surogat (mojibake) na kraju.
 * 2) guard je prije postojao SAMO u 'input' listeneru, ne i na prvi render() u init(); DOM
 *    vrijednost postavljena izravno prije importa (npr. bfcache) prolazila je bez ogranicenja.
 * Odvojen fajl (ne kartice-page.test.ts) jer svaki test treba SVOJE pocetno stanje #kt-input
 * PRIJE nego se modul importa (init() cita input.value samo jednom, pri ucitavanju).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const MAX_ZNAKOVA = 2_000_000;

function buildDom(initialValue: string): void {
  document.body.innerHTML = `
    <textarea id="kt-input"></textarea>
    <button id="kt-sample" type="button"></button>
    <button id="kt-clear" type="button"></button>
    <button id="kt-copy" type="button" disabled></button>
    <span id="m-kartice"></span><span id="m-words"></span>
    <span id="m-chars"></span><span id="m-chars-nospace"></span>
    <span id="m-sentences"></span><span id="m-paragraphs"></span>
    <span id="m-pages"></span><span id="m-reading"></span>
    <div id="kt-sr-summary"></div>`;
  (document.querySelector('#kt-input') as HTMLTextAreaElement).value = initialValue;
}

beforeEach(() => {
  vi.resetModules();
});

describe('kartice-page: MAX_ZNAKOVA guard (surogatni par + inicijalni render)', () => {
  it('BUG: pocetna DOM vrijednost preko granice (bfcache/programatski upisana) se rezuci VEC na prvi render, ne tek na sljedeci input', async () => {
    const oversized = 'a'.repeat(MAX_ZNAKOVA + 500);
    buildDom(oversized);
    await import('../src/tools/kartice-page');
    const input = document.querySelector('#kt-input') as HTMLTextAreaElement;
    expect(input.value.length).toBeLessThanOrEqual(MAX_ZNAKOVA);
  });

  it('BUG: rezanje na granici NE prepolavlja UTF-16 surogatni par (emoji tocno na MAX_ZNAKOVA)', async () => {
    // Visoki surogat emoji-ja pada TOCNO na zadnji indeks unutar slice(0, MAX_ZNAKOVA) granice.
    const oversized = 'a'.repeat(MAX_ZNAKOVA - 1) + '😀' + 'a'.repeat(10); // 😀
    buildDom(oversized);
    await import('../src/tools/kartice-page');
    const input = document.querySelector('#kt-input') as HTMLTextAreaElement;
    const clamped = input.value;
    expect(clamped.length).toBeLessThanOrEqual(MAX_ZNAKOVA);
    // Zadnji code unit ne smije biti usamljeni visoki surogat (mojibake).
    const lastCode = clamped.charCodeAt(clamped.length - 1);
    expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
  }, 15000);
});
