import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeSiteStats } from '../src/coverage/site-stats';

/**
 * PECENE BROJKE ZA TRAKU NA `/` (`data/coverage/site-stats.json`).
 *
 * Cisti ulaz ne smije vuci registar profila ni katalog, pa cita pecen JSON. Time nastaje klasicna
 * rupa: brojka koja zaostane za podacima stoji na naslovnici dok je netko ne primijeti. Ovaj gard
 * tvrdi da je pecena vrijednost jednaka SVJEZEM izracunu istom formulom; svaki novi profil ili
 * ustanova bez `npm run gen-site-stats` pada ovdje, a ne na naslovnici.
 */

const baked = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'coverage', 'site-stats.json'), 'utf8')) as Record<string, unknown>;

describe('site-stats: pecene brojke naslovnice', () => {
  it('pecena vrijednost === svjez izracun (inace: npm run gen-site-stats)', () => {
    expect(baked).toEqual(computeSiteStats());
  });

  it('brojke su stvarne, ne nule: gard nad praznim registrom bi prolazio vakuumski', () => {
    const fresh = computeSiteStats();
    expect(fresh.profiles).toBeGreaterThan(100);
    expect(fresh.institutions).toBeGreaterThan(10);
    expect(fresh.works).toBeGreaterThan(100_000);
  });

  it('ulaz `/` cita SAMO pecen JSON, ne registar', () => {
    // Uvoz registra u ulaz bio bi veci od cijele stranice; formula zivi u modulu koji ulaz ne uvozi.
    const entry = readFileSync(resolve(__dirname, '..', 'src', 'routes', 'intake', 'main.ts'), 'utf8');
    expect(entry).toContain('data/coverage/site-stats.json');
    expect(entry).not.toContain('profile-registry');
    expect(entry).not.toContain('catalog-loader');
    // Modul s formulom zavrsava na `site-stats'`, pecen JSON na `site-stats.json'`; zabranjen je samo modul.
    expect(entry).not.toContain("coverage/site-stats'");
  });
});
