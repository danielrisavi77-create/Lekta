// @vitest-environment happy-dom
/**
 * scripts/generate-citation-tools.mjs generira samostalnu staticku SEO stranicu za brojac
 * kartica (brojac-kartica.js). Ta stranica NE moze importirati src/tools/counter.ts (plain
 * <script>, ne modul), pa rucno duplicira NFC/trim/nevidljivi-znakovi/rijeci logiku. Regresija:
 * duplikat je bio NEPOTPUN (samo CRLF strip, bez NFC/trim/nevidljivih znakova), pa je davao
 * drugaciji (obicno visi) "naplatni" broj kartica za identican tekst nego kanonski alat na
 * /alati/kartice.html. Test izvrsava STVARNI generirani script (izvucen iz izvora, main() se
 * NE pokrece - ima tesku bocnu ucin i cita profile/specove) i usporeduje s countText() za
 * rubne slucajeve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countText } from '../src/tools/counter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'scripts/generate-citation-tools.mjs'), 'utf-8');

function extractBrojacScript(source: string): string {
  const m = source.match(/const BROJAC_JS = String\.raw`([\s\S]*?)`;/);
  if (!m) throw new Error('BROJAC_JS predlozak nije nadjen u generate-citation-tools.mjs');
  return m[1];
}

function runBrojacScript(scriptSrc: string, text: string): { chars: string; kartice: string; words: string } {
  document.body.innerHTML =
    '<textarea id="text-input"></textarea><span id="char-count"></span><span id="page-count"></span><span id="word-count"></span>';
  // eslint-disable-next-line no-new-func
  new Function(scriptSrc)();
  const input = document.getElementById('text-input') as HTMLTextAreaElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return {
    chars: document.getElementById('char-count')!.textContent || '',
    kartice: document.getElementById('page-count')!.textContent || '',
    words: document.getElementById('word-count')!.textContent || '',
  };
}

describe('generate-citation-tools.mjs: brojac-kartica.js ostaje uskladjen s kanonskim countText()', () => {
  const scriptSrc = extractBrojacScript(src);

  const cases: Array<[string, string]> = [
    ['NFD dijakritika (dekomponirano) + nevidljivi znak + rubne praznine', '  Naivéna riječnik​.  '],
    ['BOM na pocetku', '﻿Tekst s BOM-om na pocetku.'],
    ['tocno jedna kartica (1800 znakova)', 'a'.repeat(1800)],
    ['em/en crtica bez razmaka razdvaja rijeci', 'rijec—rijec drugo–drugo'],
  ];

  for (const [label, raw] of cases) {
    it(`daje identicne brojeve kao countText() za: ${label}`, () => {
      const got = runBrojacScript(scriptSrc, raw);
      const expected = countText(raw);
      expect(got.chars).toBe(String(expected.charsWithSpaces));
      expect(got.kartice).toBe(expected.kartice.toFixed(2).replace('.', ','));
      expect(got.words).toBe(String(expected.words));
    });
  }
});
