import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS, safeStorageGet, safeStorageSet } from '../src/shared/browser-storage';

/**
 * POHRANA U PREGLEDNIKU. Izdvojena iz `app.ts` da je rute mogu koristiti bez uvoza analizatora.
 *
 * Gard postoji zbog JEDNE suptilnosti: `SESSION_MEMORY` je zamjena za `localStorage` kad ga
 * preglednik odbije (privatni prozor, blokirani podaci stranice). Da je pri selidbi ostao u
 * `app.ts` dok su funkcije otisle, one bi se tiho vratile na `fallback` umjesto na zapamcenu
 * vrijednost, i to SAMO ondje gdje pohrana ne radi, dakle ondje gdje se najteze primijeti.
 *
 * Kvar bi izgledao ovako: korisnik u privatnom prozoru izgubi odabir profila izmedju dva koraka, a
 * u obicnom prozoru sve radi. Nijedan test koji ne gasi `localStorage` to ne vidi.
 */

const KEY = 'lekta.test.v1';

describe('pohrana u pregledniku', () => {
  const real = globalThis.localStorage;
  afterEach(() => { Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true }); });
  beforeEach(() => { try { real?.clear(); } catch { /* nedostupan */ } });

  it('kljucevi su imenovani i verzionirani', () => {
    // Neverzioniran kljuc znaci da promjena oblika tiho procita stari zapis kao nov.
    for (const [ime, kljuc] of Object.entries(STORAGE_KEYS as Record<string, string>)) {
      expect(kljuc, ime).toMatch(/^lekta\./);
    }
  });

  it('zapisano se procita natrag', () => {
    expect(safeStorageSet(KEY, { a: 1 })).toBe(true);
    expect(safeStorageGet(KEY)).toEqual({ a: 1 });
  });

  it('nepostojeci kljuc vraca fallback, ne baca', () => {
    expect(safeStorageGet('lekta.test.nema', 'zadano')).toBe('zadano');
  });

  it('BEZ localStorage zapis i dalje uspije, a citanje vrati ZAPAMCENO', () => {
    // Srz garda. Bez `SESSION_MEMORY` bi ovdje doslo `fallback`, i korisnik u privatnom prozoru
    // izgubio bi odabir izmedju dva koraka.
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem() { throw new Error('odbijeno'); }, setItem() { throw new Error('odbijeno'); } },
      configurable: true,
    });
    expect(safeStorageSet(KEY, { b: 2 })).toBe(false);
    expect(safeStorageGet(KEY, 'fallback')).toEqual({ b: 2 });
  });

  it('zapamceno se vraca kao KOPIJA, pa pozivatelj ne moze pokvariti pohranu', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem() { throw new Error('odbijeno'); }, setItem() { throw new Error('odbijeno'); } },
      configurable: true,
    });
    safeStorageSet(KEY, { c: [1, 2] });
    const prvi = safeStorageGet(KEY) as { c: number[] };
    prvi.c.push(3);
    expect((safeStorageGet(KEY) as { c: number[] }).c).toEqual([1, 2]);
  });

  it('pokvaren zapis u pohrani ne rusi citanje', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem() { return '{nije json'; }, setItem() { return undefined; } },
      configurable: true,
    });
    expect(safeStorageGet('lekta.test.smece', 'zadano')).toBe('zadano');
  });
});
