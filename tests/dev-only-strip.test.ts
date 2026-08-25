/**
 * Dev-only strip (audit P0): setup modal ("Produkcijska konfiguracija") i QA konzola
 * REZU se iz DEPLOY builda, ne skrivaju. Ovaj test cuva: (1) markeri u index.html su
 * balansirani, (2) strip uklanja bas dev blokove a NE dira produkcijske modale,
 * (3) CSP invarijanta: jedina inline <script> (FOUC tema) ostaje bajt-identicna i
 * nakon stripa (tests/csp-hash.test.ts hasha izvornik; strip je ne smije taknuti).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - .mjs util bez deklaracija (dijeli se s vite.config.ts)
import { stripDevOnly, devOnlyMarkersBalanced } from '../scripts/strip-dev-only.mjs';

const html = readFileSync(resolve(__dirname, '..', 'rad', 'index.html'), 'utf8');

function inlineScripts(s: string): string[] {
  return [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe('dev-only strip', () => {
  it('markeri u index.html su balansirani i postoje', () => {
    expect(devOnlyMarkersBalanced(html)).toBe(true);
    expect(html.includes('dev-only:start')).toBe(true);
  });

  it('strip uklanja setup modal, QA modal i QA gumb', () => {
    const out = stripDevOnly(html);
    for (const marker of ['setupModal', 'qaModal', 'qaBtn', 'Produkcijska konfiguracija', 'QA konzola', 'setupSupabaseAnon', 'Payment linkovi']) {
      expect(out.includes(marker), marker).toBe(false);
    }
  });

  it('strip NE dira produkcijske dijelove (modali, analyzer, footer)', () => {
    const out = stripDevOnly(html);
    for (const keep of ['historyBtn', 'orderModal', 'legalModal', 'guaranteeModal', 'authModal', 'id="analyzer"', 'consentBanner']) {
      expect(out.includes(keep), keep).toBe(true);
    }
  });

  it('CSP invarijanta: tocno jedna inline skripta, bajt-identicna prije i poslije stripa', () => {
    const before = inlineScripts(html);
    const after = inlineScripts(stripDevOnly(html));
    expect(before.length).toBe(1);
    expect(after.length).toBe(1);
    expect(after[0]).toBe(before[0]);
  });
});
