import { describe, expect, it } from 'vitest';
import { ensureRulesForCurrentSelection } from '../src/profiles/ensure-current-rules';

/**
 * UTRKA ODABIRA. Zateceni obrazac je `await ensureProfileRules(currentDefinitionId())` pa odmah
 * `currentProfile()`, koji DOM cita ponovno. Promjena studija ili vrste rada tijekom dohvata
 * znaci: ucitan profil A, razrjesen profil B, `currentProfile` baca. Poziv stoji IZVAN `try`
 * bloka na svim mjestima, pa se analiza tiho izgubi.
 *
 * Kljucna tvrdnja ovih gardova nije "petlja se vrti", nego UGOVOR: za id koji funkcija vrati,
 * `ensure` je pozvan. Bez toga bi pozivatelj i dalje mogao naletjeti na neucitana pravila, a
 * petlja bi samo pomaknula trenutak kvara.
 */

/** Citac koji vraca zadani niz vrijednosti, pa zadnju ponavlja; imitira korisnika koji mijenja odabir. */
function scriptedReader(values: Array<string | null>): () => string | null {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('utrka odabira pri dohvatu pravila', () => {
  it('miran odabir se rjesava u jednom krugu', async () => {
    const seen: Array<string | null> = [];
    const out = await ensureRulesForCurrentSelection(
      () => 'fpzg-politologija-diplomski',
      async (id) => { seen.push(id); },
    );
    expect(out).toMatchObject({ id: 'fpzg-politologija-diplomski', stable: true, rounds: 1 });
    expect(seen).toEqual(['fpzg-politologija-diplomski']);
  });

  it('promjena odabira TIJEKOM dohvata dovodi do ponovnog dohvata za NOVI profil', async () => {
    // Citanja: prvo A (prije awaita), pa B (provjera poslije awaita), pa B (idempotentno).
    const seen: Array<string | null> = [];
    const out = await ensureRulesForCurrentSelection(
      scriptedReader(['A', 'B', 'B']),
      async (id) => { seen.push(id); },
    );
    expect(out.id).toBe('B');
    expect(out.stable).toBe(true);
    expect(seen).toEqual(['A', 'B']);
  });

  it('UGOVOR: za vraceni id je `ensure` uvijek pozvan, i kad se odabir ne smiri', async () => {
    // Citac koji se nikad ne ponovi: svako citanje daje nov profil.
    let n = 0;
    const seen: Array<string | null> = [];
    const out = await ensureRulesForCurrentSelection(
      () => `p${n++}`,
      async (id) => { seen.push(id); },
      3,
    );
    expect(out.stable).toBe(false);
    // Bez zavrsnog osiguranja pozivatelj bi dobio id za koji pravila NISU trazena, sto je
    // tocno kvar zbog kojeg ova funkcija postoji.
    expect(seen).toContain(out.id);
    expect(seen[seen.length - 1]).toBe(out.id);
  });

  it('broj krugova je omedjen, pa nesmiren odabir ne vrti petlju bez kraja', async () => {
    let calls = 0;
    let n = 0;
    const out = await ensureRulesForCurrentSelection(() => `p${n++}`, async () => { calls += 1; }, 3);
    expect(calls).toBe(4); // tri pokusaja + zavrsno osiguranje
    expect(out.rounds).toBe(4);
  });

  it('besmislen broj pokusaja se svodi na jedan, pa miran odabir ostaje `stable`', async () => {
    // Prva izvedba ovog garda tvrdila je samo da je `ensure` pozvan barem jednom. To je
    // mjerilo krivu stvar: uz nula pokusaja zavrsno osiguranje svejedno pozove `ensure`, pa je
    // ugovor zadovoljen i mutacija je prolazila. Stvarna steta je drugdje: bez ijednog kruga
    // MIRAN odabir se nikad ne usporedi sam sa sobom, pa se prijavi kao nesmiren. Pozivatelj
    // koji na `stable` vjesa odluku dobiva laznu uzbunu na svakom pozivu.
    for (const attempts of [0, -5, Number.NaN]) {
      const seen: Array<string | null> = [];
      const out = await ensureRulesForCurrentSelection(() => 'X', async (id) => { seen.push(id); }, attempts);
      expect(seen.length).toBeGreaterThanOrEqual(1);
      expect(out.stable).toBe(true);
    }
  });

  it('neodabran profil (null) se prenosi kakav jest, bez izmisljanja', async () => {
    const seen: Array<string | null> = [];
    const out = await ensureRulesForCurrentSelection(() => null, async (id) => { seen.push(id); });
    expect(out).toMatchObject({ id: null, stable: true });
    expect(seen).toEqual([null]);
  });

  it('greska dohvata se ne guta: pozivatelj je mora vidjeti', async () => {
    // Tiho progutana greska mrezu bi pretvorila u "profil bez pravila" i vratila nas na tihi
    // gubitak, samo na drugom mjestu.
    await expect(
      ensureRulesForCurrentSelection(() => 'A', async () => { throw new Error('mreza'); }),
    ).rejects.toThrow('mreza');
  });
});
