import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeSiteStats } from '../src/coverage/site-stats';
import { allUnits } from '../src/catalog/catalog-loader';

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

  /**
   * F8 OBLIK INDEKSA: `units[unitId] = { kratica, naziv }`.
   *
   * Nalog je trazio OBA polja. Prva izvedba je pekla samo `kratica` uz obrazlozenje o proracunu
   * trake; u krugu popravka je proracun PONOVO izmjeren (`esbuild` + `gzipSync`, ista postavka kao
   * `tests/route-shell-budget.test.ts`): 6458 B bez naziva, 8001 B s njim, uz granicu od 8192 B.
   * Naziv dakle stane, pa se pece, a ovaj gard cuva oblik od tihog vracanja na pola posla.
   *
   * NAZIV JE PRESLIKAN, NE IZMISLJEN: usporedjuje se s `name` iz kataloga, jedinicu po jedinicu.
   */
  it('indeks jedinica nosi I kraticu I naziv, a naziv je doslovan iz kataloga', () => {
    const units = (baked as { units?: Record<string, { kratica?: unknown; naziv?: unknown }> }).units ?? {};
    const katalog = new Map(allUnits().map((unit) => [unit.id, unit.name]));
    // SENTINEL: prazan indeks bi petlju ispod ucinio vakuumskom.
    expect(Object.keys(units).length, 'peceni indeks je prazan').toBeGreaterThan(100);
    expect(Object.keys(units).length, 'indeks ne pokriva sve jedinice kataloga').toBe(katalog.size);
    for (const [unitId, unit] of Object.entries(units)) {
      expect(typeof unit.kratica, unitId).toBe('string');
      expect(unit.kratica, unitId).not.toBe('');
      expect(unit.naziv, unitId).toBe(katalog.get(unitId));
    }
    expect(units.fpzg).toEqual({ kratica: 'FPZG', naziv: katalog.get('fpzg') });
  });

  it('brojke su stvarne, ne nule: gard nad praznim registrom bi prolazio vakuumski', () => {
    const fresh = computeSiteStats();
    expect(fresh.profiles).toBeGreaterThan(100);
    expect(fresh.institutions).toBeGreaterThan(10);
    expect(fresh.works).toBeGreaterThan(100_000);
  });

  it('traka cita SAMO pecen JSON, ne registar', () => {
    // Uvoz registra bio bi veci od cijele stranice; formula zivi u modulu koji traka ne uvozi.
    //
    // META SE 2026-09-06 PROMIJENILA, NAMJERA NIJE. Traka je preseljena s ulaza `/` (ondje je
    // konkurirala jedinoj radnji ekrana) na `/saznaj-vise/`, koji i postoji da objasni opseg.
    // Potrosac je sada `routes/shared/site-stats-strip.ts`; pravilo "pecen JSON, nikad ziv
    // registar" vrijedi za njega jednako kao prije za ulaz.
    const strip = readFileSync(resolve(__dirname, '..', 'src', 'routes', 'shared', 'site-stats-strip.ts'), 'utf8');
    expect(strip).toContain('data/coverage/site-stats.json');
    expect(strip).not.toContain('profile-registry');
    expect(strip).not.toContain('catalog-loader');
    // Modul s formulom zavrsava na `site-stats'`, pecen JSON na `site-stats.json'`; zabranjen je samo modul.
    expect(strip).not.toContain("coverage/site-stats'");
  });

  it('ULAZ `/` vise ne vuce brojke uopce: njegov graf ih ne dodiruje', () => {
    // Drugi smjer iste selidbe. Bez ove tvrdnje bi se traka mogla tiho vratiti na ulaz, a s njom i
    // razlog zbog kojeg je maknuta.
    const entry = readFileSync(resolve(__dirname, '..', 'src', 'routes', 'intake', 'main.ts'), 'utf8');
    expect(entry).not.toContain('site-stats');
    expect(entry).not.toContain('intakeStats');
  });
});
