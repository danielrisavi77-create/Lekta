/**
 * Regresijska zastita copy-ja tool stranica: CLAUDE.md zabranjuje em i en crtice u sadrzaju,
 * a nijedan test dosad nije citao HTML pa bi ih buduci uredak tiho prosvercao. Ovdje se
 * skenira sirovi HTML (ukljucujuci JSON-LD) korijenskih tool stranica.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGES = ['kartice.html', 'citat.html', 'naslovnica.html', 'literatura.html', 'izjava.html', 'alati.html'];

describe('tool stranice: tipografska pravila', () => {
  for (const page of PAGES) {
    it(`${page} nema em/en crtica`, () => {
      const html = readFileSync(resolve(__dirname, '..', page), 'utf8');
      const em = html.match(/—/g) || [];
      const en = html.match(/–/g) || [];
      expect({ page, em: em.length, en: en.length }).toEqual({ page, em: 0, en: 0 });
    });
  }
});
