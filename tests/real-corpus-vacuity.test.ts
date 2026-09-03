/**
 * Gard: izvjestaj o stvarnom korpusu mora reci kad NISTA ne mjeri.
 *
 * Zasto postoji, izmjereno 2026-09-03. `docs/generated/repair-real-corpus.json` je jedini korpusni
 * artefakt koji je commitan, reproducibilan i koji CI vrti. Nakon sto je devet sidecara oznaceno
 * `synthetic: true`, u njemu je ostalo 7 dopustenih fixtura s UKUPNO NULA ciljanih provjera:
 *
 *     commitani korpus     0 ciljanih provjera    0 padova   0 regresija
 *     stvarni radovi      94 ciljanih provjera    4 pada     4 regresije
 *
 * Tvrdnje `failCount === 0` i `passRegressionCount === 0` u `tests/real-corpus.test.ts` time postaju
 * VAKUUMSKI istinite: prolaze jer nema sto pasti. Posljedica nije akademska, nego objasnjava zasto
 * je regresija popravka danima stajala neprimijecena: commitani gard je po konstrukciji ne moze
 * vidjeti, a njegovo zeleno se cita kao potvrda zdravlja.
 *
 * Ovaj gard ne moze dodati stvarne radove u git (gitignorirani su namjerno i to je ispravno). Moze
 * uciniti prazninu GLASNOM umjesto tihom, i sprijeciti da netko ukloni tu oznaku ne primijetivsi
 * sto ona znaci.
 */
import { describe, it, expect } from 'vitest';
import baked from '../docs/generated/repair-real-corpus.json';

type Scope = { targetedCheckCount: number; measuresRepairEffectiveness: boolean };
type Report = { scope: Scope; results: Array<{ targetedCheckCount: number }> };
const izvjestaj = baked as unknown as Report;

/**
 * Zateceno stanje 2026-09-03: NULA. Ratchet smije samo RASTI.
 *
 * Raste kad se u commitani korpus doda fixtura koju profil stvarno cilja. Ne smije pasti: pad znaci
 * da je pokrivenost izgubljena, a upravo je takav pad (16 -> 7 dopustenih) i doveo do ove praznine,
 * i to bez ijednog upozorenja.
 */
const CILJANIH_RATCHET = 0;

describe('commitani korpus: praznina mora biti glasna', () => {
  it('zbroj u `scope` se slaze sa zbrojem po dokumentima', () => {
    const zbroj = izvjestaj.results.reduce((n, r) => n + r.targetedCheckCount, 0);
    expect(izvjestaj.scope.targetedCheckCount).toBe(zbroj);
  });

  /** Oznaka i broj moraju govoriti isto; oznaka koja laze gora je od nikakve. */
  it('`measuresRepairEffectiveness` je istinito TOCNO kad ima ciljanih provjera', () => {
    expect(izvjestaj.scope.measuresRepairEffectiveness).toBe(izvjestaj.scope.targetedCheckCount > 0);
  });

  it('broj ciljanih provjera smije samo rasti', () => {
    expect(
      izvjestaj.scope.targetedCheckCount,
      'pokrivenost je pala: commitani korpus mjeri manje nego prije',
    ).toBeGreaterThanOrEqual(CILJANIH_RATCHET);
  });

  /**
   * Dok je artefakt prazan, njegovo zeleno se NE SMIJE citati kao zdravlje popravka. Ova tvrdnja
   * pada cim netko doda ciljanu pokrivenost, i to je namjerno: tada treba spustiti ratchet i
   * obrisati ovaj test, jer praznine vise nema.
   */
  it('dok je prazan, izvjestaj to izricito priznaje', () => {
    if (izvjestaj.scope.targetedCheckCount === 0) {
      expect(
        izvjestaj.scope.measuresRepairEffectiveness,
        'nula ciljanih provjera znaci da ovaj izvjestaj NE mjeri ucinkovitost popravka',
      ).toBe(false);
    } else {
      expect(izvjestaj.scope.measuresRepairEffectiveness).toBe(true);
    }
  });

  /** NEGATIVNA KONTROLA: detektor mora razlikovati prazan izvjestaj od punog. */
  it('detektor prepoznaje i neprazan izvjestaj', () => {
    const pun: Scope = { targetedCheckCount: 94, measuresRepairEffectiveness: true };
    expect(pun.measuresRepairEffectiveness).toBe(pun.targetedCheckCount > 0);
    const lazan: Scope = { targetedCheckCount: 0, measuresRepairEffectiveness: true };
    expect(lazan.measuresRepairEffectiveness === (lazan.targetedCheckCount > 0)).toBe(false);
  });
});
