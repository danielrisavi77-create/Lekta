/**
 * Gard nad izvjestajem closed-loop petlje kroz katalog (P4-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Petlja sama NE ide u `npm run check`: 407 profila je dvije stvarne analize plus popravak po
 * profilu. Ovdje se cuva njezin ISHOD - da se ne moze tiho pogorsati, i da regresija ili pad
 * fixera nikad ne prodju kao "uredno stanje".
 *
 * Osvjezavanje: `npm run closed-loop`, pa upisi nove brojke u data/profiles/closed-loop-ratchet.json.
 */
import { describe, expect, it } from 'vitest';
import report from '../docs/generated/closed-loop.json';
import ratchet from '../data/profiles/closed-loop-ratchet.json';

const count = (outcome: string): number => report.rows.filter((r) => r.outcome === outcome).length;

describe('closed-loop kroz katalog: ishod se ne smije tiho promijeniti', () => {
  it('izvjestaj pokriva cijeli katalog', () => {
    expect(report.profileCount).toBe(ratchet.profileCount);
    expect(report.rows).toHaveLength(ratchet.profileCount);
  });

  /**
   * Regresija znaci da je popravak oborio provjeru koja je prolazila, a error da je fixer bacio ili
   * je paket ispao neispravan. Oboje mora ostati na NULI; to nije ratchet nego tvrda granica.
   */
  it('nijedan profil ne zavrsava regresijom ni greskom', () => {
    expect(count('regression'), 'popravak je oborio provjeru koja je prolazila').toBe(0);
    expect(count('error'), 'fixer je bacio ili je paket ispao neispravan').toBe(0);
  });

  it('broj profila koji prolaze petlju ne smije pasti', () => {
    expect(count('pass')).toBeGreaterThanOrEqual(ratchet.pass);
  });

  it('zatecene kategorije odgovaraju zabiljezenima', () => {
    expect(count('pass'), 'pass').toBe(ratchet.pass);
    expect(count('no-repair'), 'no-repair').toBe(ratchet.noRepair);
    expect(count('no-rules'), 'no-rules').toBe(ratchet.noRules);
    expect(count('unresolved'), 'unresolved').toBe(ratchet.unresolved);
  });

  /**
   * `unresolved` znaci da je popravak izveden a nijedan nalaz nije nestao. Danas ih nema, i to je
   * tvrda granica: prvi takav profil je ili stvarni kvar popravka ili kriva osnovica u harnessu
   * (vidi `liveProfile` u pogonu - analiza i popravak MORAJU gledati istu, `effectiveRules`
   * osnovicu, inace petlja prijavi proturjecje kojeg u proizvodu nema).
   */
  it('nijedan profil ne ostaje bez ijednog rijesenog nalaza', () => {
    const unresolved = report.rows.filter((r) => r.outcome === 'unresolved').map((r) => r.profileId);
    expect(unresolved, 'popravak je izveden, a nista nije rijeseno').toEqual([]);
  });
});
