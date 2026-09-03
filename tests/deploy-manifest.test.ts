import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../supabase/deploy-manifest.json';
import { izracunajManifest } from '../scripts/generate-deploy-manifest.mjs';

/**
 * Gard nad `supabase/deploy-manifest.json`.
 *
 * Izvjestaj o driftu usporedjuje repozitorij s deployanim stanjem, ali nema OCEKIVANJE s kojim bi
 * ga usporedio: bez manifesta "produkcija ima 18 od 22" ne razlikuje namjeru od propusta.
 *
 * Manifest je IZVEDEN iz koda, pa ovaj test tvrdi da nije odlutao. Polja koja su odluka a ne
 * cinjenica (`owner`, `intentionalExclusion`, `reason`) namjerno su prazna i ovdje se NE tvrdi da
 * su popunjena; tvrdi se samo da njihov broj ne raste.
 */
const svjez = izracunajManifest() as unknown as typeof manifest;

/** Zatecено 2026-09-03: nijedna funkcija nema upisanog vlasnika. Broj smije samo padati. */
const MAX_BEZ_VLASNIKA = 24;

describe('deploy manifest', () => {
  it('commitani manifest se slaze sa svjezim izvodom iz koda', () => {
    expect(svjez.schemaVersion).toBe(manifest.schemaVersion);
    expect(svjez.functions).toEqual(manifest.functions);
  });

  it('pokriva TOCNO one funkcije koje repozitorij ima', () => {
    const dir = path.resolve(__dirname, '..', 'supabase', 'functions');
    const uRepou = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .filter((n) => fs.existsSync(path.join(dir, n, 'index.ts')))
      .sort();
    expect(manifest.functions.map((f) => f.function)).toEqual(uRepou);
    expect(uRepou.length, 'prazan skup nije prolaz').toBeGreaterThan(0);
  });

  it('svaka funkcija je deklarirana u config.toml i ima odluku o verify_jwt', () => {
    for (const f of manifest.functions) {
      expect(f.declaredInConfig, `${f.function} nije u supabase/config.toml`).toBe(true);
      expect(typeof f.verifyJwt, `${f.function} nema verify_jwt`).toBe('boolean');
    }
  });

  it('tajne su izvedene, ne prepisane: svaka funkcija cita barem SUPABASE_URL', () => {
    for (const f of manifest.functions) {
      expect(f.requiredSecrets.length, `${f.function} ne cita nijednu tajnu`).toBeGreaterThan(0);
    }
  });

  it('ratchet: broj funkcija bez upisanog vlasnika smije samo padati', () => {
    const bez = manifest.functions.filter((f) => f.owner === null).length;
    expect(bez).toBeLessThanOrEqual(MAX_BEZ_VLASNIKA);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se kvar zbog kojeg gard postoji: funkcija
   * postoji u repou, a iz manifesta je ispala.
   */
  it('gard na izostavljenu funkciju stvarno grize', () => {
    const okrnjen = manifest.functions.slice(1).map((f) => f.function);
    const puni = svjez.functions.map((f) => f.function);
    expect(okrnjen).not.toEqual(puni);
    expect(puni.length - okrnjen.length).toBe(1);
  });
});
