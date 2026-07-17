/**
 * Tema (#themeBtn) i mobilni izbornik (#mobileMenuBtn/#mobileNav) su centralizirani u
 * ui-boot.ts (setupThemeToggle/setupMobileNav). Prije commit F3 svaka stranica je nosila
 * vlastiti inline <script> IIFE koji je rucno vezao iste listenere; jedna stranica
 * (landing_usporedba.html) je taj leftover skript zadrzala i nakon refaktora, sto se
 * teoretski sudara s ui-boot.ts (dvostruko vezanje: inline skripta izvrsava se sinkrono
 * tijekom parsiranja, prije modula, i prva vezuje listener). U produkciji CSP (public/_headers)
 * blokira svaku inline skriptu bez odgovarajuceg sha256 hasha, pa se sudar realno nije
 * manifestirao za posjetitelje - ali popravak "dodaj unsafe-inline u CSP" umjesto brisanja
 * mrtvog retka bi otvorio pravu XSS povrsinu na svih 8 javnih stranica. Ovaj test cuva da
 * se leftover IIFE ne vrati (ovdje ili na bilo kojoj drugoj povrsinskoj stranici) tako da
 * broji inline <script> blokove koji referenciraju #themeBtn/#mobileMenuBtn po HTML datoteci.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  'index.html',
  'naslovnica.html',
  'citat.html',
  'kartice.html',
  'izjava.html',
  'literatura.html',
  'alati.html',
  'landing_usporedba.html',
];

/** Svi <script> blokovi osim application/ld+json (strukturirani podaci, ne izvrsni kod). */
function inlineScriptBodies(html: string): string[] {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type=["']application\/ld\+json["']/i.test(m[1] || ''))
    .map((m) => m[2]);
}

describe('nema dupliciranog chrome inline skripta (tema/mobilni izbornik)', () => {
  it.each(PAGES)('%s: inline <script> ne referencira #themeBtn/#mobileMenuBtn', (page) => {
    const html = readFileSync(join(root, page), 'utf8');
    const offending = inlineScriptBodies(html).filter(
      (body) => body.includes('themeBtn') || body.includes('mobileMenuBtn'),
    );
    expect(offending).toEqual([]);
  });
});
