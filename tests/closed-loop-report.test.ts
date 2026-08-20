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
    expect(count('partial'), 'partial').toBe(ratchet.partial);
  });

  /**
   * `unresolved` znaci da je popravak izveden a nijedan nalaz nije nestao. Danas ih nema, i to je
   * tvrda granica: prvi takav profil je ili stvarni kvar popravka ili kriva osnovica u harnessu
   * (vidi `liveProfile` u pogonu - analiza i popravak MORAJU gledati istu, `effectiveRules`
   * osnovicu, inace petlja prijavi proturjecje kojeg u proizvodu nema).
   */
  /**
   * `partial` znaci da je dio prekrsenih osi rijesen, a dio nije - i to je vlastiti ishod, ne
   * `pass`. Prvo mjerenje ih je spajalo (usporedjivalo je BROJ NASLOVA provjera s BROJEM OSI, dvije
   * razlicite jedinice) i time precijenilo pokrivenost za 47 profila.
   *
   * Zatecenih sest su svi na osi `paper-size` i svi u dvije obitelji: profil trazi format papira,
   * ali za tu os nema zapisa s fixerom, pa popravak nije ponudjen. To je podatkovni posao, ne kvar
   * motora - imenovani su da ne utihnu.
   */
  it('zatecenih sest djelomicnih profila ostaje imenovano', () => {
    const partial = report.rows.filter((r) => r.outcome === 'partial').map((r) => r.profileId).sort();
    expect(partial).toEqual([...ratchet.partialProfiles].sort());
    for (const row of report.rows.filter((r) => r.outcome === 'partial')) {
      expect(row.axesRemaining, `${row.profileId}: neocekivana preostala os`).toEqual(['paper-size']);
    }
  });

  it('nijedan profil ne ostaje bez ijednog rijesenog nalaza', () => {
    const unresolved = report.rows.filter((r) => r.outcome === 'unresolved').map((r) => r.profileId);
    expect(unresolved, 'popravak je izveden, a nista nije rijeseno').toEqual([]);
  });
});
