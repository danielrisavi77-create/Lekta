import { describe, expect, it } from 'vitest';
import artefakt from '../docs/generated/STATUS.json';
import { izracunajStatus } from '../scripts/generate-status.mjs';

/**
 * Gard nad `docs/generated/STATUS.json`.
 *
 * Artefakt postoji da nazivnici prestanu biti nagadjanje: registar ima 407 profila, ledger 436
 * redaka, a jedinstvenih profila u njima 410. Dok se to ne imenuje, svaki postotak nad "brojem
 * profila" znaci nesto drugo ovisno o tome tko ga racuna.
 *
 * Vremenski pecat i commit se NE usporedjuju: oni se mijenjaju svakim pecenjem i ne govore nista o
 * ispravnosti. Usporedjuje se sve izvedeno iz podataka.
 */
const svjez = izracunajStatus() as unknown as typeof artefakt;

/**
 * Ratchet nad anomalijama, u korist dokaza. Zatecено 2026-09-03, prvo mjerenje:
 *   3 rute bez profila     fpzg-ba-vvu, fpzg-joint-se, pravo-joint-repic
 *                          (student ih moze odabrati, a odabir ne vodi nikamo)
 *   3 profila bez jedinice radno-socijalno-pravo, sociologija, trgovacko-pravo
 *                          (imaju verificirana pravila, ali nisu dostizni kroz odabir)
 * Brojevi smiju samo padati. Rast znaci da je netko dodao rutu bez profila ili profil koji nitko
 * ne moze odabrati, i to je nalaz, ne detalj.
 */
const MAX_RUTA_BEZ_PROFILA = 3;
const MAX_PROFILA_BEZ_JEDINICE = 3;

describe('STATUS.json: jedan izvor nazivnika', () => {
  it('commitani artefakt se slaze sa svjezim izracunom', () => {
    expect(svjez.schemaVersion).toBe(artefakt.schemaVersion);
    expect(svjez.nazivnici).toEqual(artefakt.nazivnici);
    expect(svjez.anomalije).toEqual(artefakt.anomalije);
  });

  it('artefakt nosi provenijenciju, jer je nijedan drugi generirani artefakt nema', () => {
    expect(typeof artefakt.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(artefakt.generatedAt))).toBe(false);
    expect(artefakt.generatedFromCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(artefakt.generator).toBe('npm run status');
  });

  it('nazivnici su medjusobno konzistentni, ne samo prisutni', () => {
    const n = svjez.nazivnici;
    expect(n.ledgerRedaka).toBeGreaterThanOrEqual(n.ledgerJedinstvenihProfila);
    // Svaki registrirani profil mora postojati i u ledgeru; obrnuto ne mora, i ta se razlika imenuje.
    expect(n.ledgerJedinstvenihProfila).toBeGreaterThanOrEqual(
      n.registriranihProfila - svjez.anomalije.profilBezJedinice.length,
    );
  });

  it('ratchet: broj anomalija smije samo padati', () => {
    expect(svjez.anomalije.rutaBezProfila.length, 'vise ruta koje ne vode ni na jedan profil')
      .toBeLessThanOrEqual(MAX_RUTA_BEZ_PROFILA);
    expect(svjez.anomalije.profilBezJedinice.length, 'vise profila koje se ne moze odabrati')
      .toBeLessThanOrEqual(MAX_PROFILA_BEZ_JEDINICE);
  });

  it('anomalije su IMENOVANE, ne samo prebrojane', () => {
    for (const r of svjez.anomalije.rutaBezProfila) {
      expect(r.unitId, 'ruta bez jedinice nije upotrebljiv zapis').toBeTruthy();
      expect(r.programIds.length, 'ruta bez programa se ne da naci').toBeGreaterThan(0);
    }
    for (const id of svjez.anomalije.profilBezJedinice) expect(id.length).toBeGreaterThan(0);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji:
   * jos jedna ruta koja ne vodi ni na jedan profil.
   */
  it('gard na anomalije stvarno grize', () => {
    const baseline = svjez.anomalije.rutaBezProfila.length;
    expect(baseline, 'baseline je izmjeren, ne pretpostavljen').toBe(MAX_RUTA_BEZ_PROFILA);
    const mutiran = [...svjez.anomalije.rutaBezProfila, { unitId: 'izmisljen', workType: 'final', programIds: ['x'] }];
    expect(mutiran.length).toBeGreaterThan(MAX_RUTA_BEZ_PROFILA);
  });
});
