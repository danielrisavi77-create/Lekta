import { describe, expect, it } from 'vitest';
import {
  FAZA_NATPIS, phaseFor, SVA_STANJA, SVE_FAZE, transition, viewFor,
  type WizardPhase, type WizardState,
} from '../src/ui/wizard-machine';

/**
 * FAZA JE PROJEKCIJA STANJA (korak B1, 2026-09-10).
 *
 * Korisnik barata s tri faze, a stroj s pet stanja. Faza se zato IZVODI, jer bi cetvrti podatak
 * koji netko odrzava usporedno mogao odlutati od stroja, a traka faza koja lazno tvrdi gdje si
 * gora je od trake koje nema.
 */

describe('korisnicka faza', () => {
  it('svako stanje ima tocno jednu fazu, i nijedno ne ispada', () => {
    // Setnja po `SVA_STANJA`, ne po rucnom popisu: novo stanje mora odmah dobiti fazu ili pasti.
    for (const s of SVA_STANJA) {
      const f = phaseFor(s);
      expect(SVE_FAZE, 'stanje ' + s + ' daje fazu izvan popisa').toContain(f);
    }
  });

  it('stanje `provjera` pripada fazi Dokument, i to je zamka koju gard prikiva', () => {
    // Treci korak carobnjaka je ekran s naprednim postavkama i gumbom koji analizu tek POKRECE.
    // Sudar imena je stvaran, pa se tvrdi izricito, da ga sljedeca sesija ne "popravi".
    expect(phaseFor('provjera')).toBe('dokument');
    expect(phaseFor('analiza')).toBe('provjera');
  });

  it('nalaz pripada fazi Provjera, ne Popravak', () => {
    // PROMJENA ZATECENOG PONASANJA, svjesna. CSS je do danas palio korak "Popravci" cim je nalaz
    // na ekranu, pa je traka tvrdila da korisnik popravlja dok on jos samo cita nalaz.
    expect(phaseFor('rezultat')).toBe('provjera');
  });

  it('faza se ne vraca unatrag na sretnom putu', () => {
    // Monotonost: prolazak kroz dopustene prijelaze naprijed nikad ne smanjuje redni broj faze.
    const redni = (f: WizardPhase): number => SVE_FAZE.indexOf(f);
    const put: Array<[WizardState, 'na-profil' | 'na-provjeru' | 'pokreni-analizu' | 'analiza-gotova']> = [
      ['dokument', 'na-profil'], ['profil', 'na-provjeru'],
      ['provjera', 'pokreni-analizu'], ['analiza', 'analiza-gotova'],
    ];
    for (const [od, dogadaj] of put) {
      const doStanja = transition(od, dogadaj);
      expect(doStanja, 'prijelaz ' + od + ' -' + dogadaj + '-> mora biti dopusten').not.toBeNull();
      expect(redni(phaseFor(doStanja!))).toBeGreaterThanOrEqual(redni(phaseFor(od)));
    }
  });

  it('svaka faza ima natpis, i nijedan nije prazan', () => {
    for (const f of SVE_FAZE) {
      expect(FAZA_NATPIS[f], 'faza ' + f + ' nema natpis').toBeTruthy();
      expect(FAZA_NATPIS[f].trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * FAZA `popravak` JOS NIJE DOSTIZNA, i to je tvrdnja a ne propust. Stanje `popravak` dolazi u
   * koraku B3. Dok ga nema, traka ga smije prikazati kao "slijedi", ali nijedno stanje ne smije
   * tvrditi da je korisnik VEC ondje. Kad B3 dodá stanje, ovaj test PADA i to je namjerno: tjera
   * sljedecu sesiju da svjesno prepise tvrdnju umjesto da faza tiho postane dostizna.
   */
  it('faza Popravak jos nije dostizna ni iz jednog stanja', () => {
    expect(SVA_STANJA.map(phaseFor)).not.toContain('popravak');
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji: faza koja
   * lazno tvrdi gdje je korisnik.
   */
  it('gard grize: kriva faza za nalaz mora pasti', () => {
    const mutirano: Readonly<Record<WizardState, WizardPhase>> = {
      dokument: 'dokument', profil: 'dokument', provjera: 'dokument',
      analiza: 'provjera', rezultat: 'popravak', // <- podmetnuto
    };
    expect(mutirano.rezultat, 'mutacija mora biti razlicita od stvarnog izvoda').not.toBe(phaseFor('rezultat'));
    // Uz mutaciju bi tvrdnja "Popravak nije dostizan" pala, sto je bas ono sto gard treba javiti.
    expect(SVA_STANJA.map((s) => mutirano[s])).toContain('popravak');
  });

  it('SENTINEL: popisi nisu prazni, pa setnje nisu vakuumske', () => {
    expect(SVA_STANJA.length).toBe(5);
    expect(SVE_FAZE.length).toBe(3);
    // `viewFor` i `phaseFor` moraju pokrivati ISTI skup stanja; inace jedan od njih tiho zaostane.
    for (const s of SVA_STANJA) expect(viewFor(s).prikaz).toBeTruthy();
  });
});
