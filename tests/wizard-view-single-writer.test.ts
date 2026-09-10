import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JEDAN PISAC PRIKAZA (T16, korak B4).
 *
 * Prije ovog koraka tri glavne povrsine prebacivale su se rucno na sest mjesta u `app.ts`. Nista
 * nije jamcilo da su medjusobno iskljucive: da netko zaboravi jedan poziv, dva bi prikaza bila
 * vidljiva istovremeno, a nijedan test to ne bi vidio.
 *
 * Gard je namjerno TEKSTUALAN, nad izvorom. Provjera kroz izvodjenje vidjela bi samo puteve koje
 * test slucajno prodje; ovako se novi rucni dodir ne moze uvuci ni u granu koju nitko ne testira.
 *
 * CITANJE `hidden` OSTAJE dopusteno (`classList.contains`): `cancelAnalysis` i `renderResult` na
 * njemu grade odluku, i to nije pisanje prikaza.
 */

const KORIJEN = path.resolve(__dirname, '..');
const PRIKAZI = ['wizardView', 'progressView', 'resultView'] as const;

/**
 * OBA OBLIKA PRISTUPA, i to je popravak a ne uljepsavanje.
 *
 * Do 2026-09-10 je gard trazio iskljucivo oblik `').classList.`. Izmjereno tog dana: tog oblika u
 * `app.ts` NIJE BILO NIJEDNOM, dok je oblik s `?.` postojao dvaput, u rukovatelju
 * `[data-open-phase]`, i ondje je stvarno prebacivao `#resultView` i `#wizardView` mimo
 * `renderView`. Gard je dakle bio zelen nad kodom koji je imao tocno onaj kvar zbog kojeg gard
 * postoji.
 *
 * `$()` vraca `any`, pa su oba zapisa jednako prirodna i oba se pojavljuju u datoteci. Popis je
 * zato dio garda, ne pretpostavka o stilu.
 */
const PRISTUPI = ["')", "')?"] as const;

function citaj(rel: string): string {
  return fs.readFileSync(path.join(KORIJEN, rel), 'utf8');
}

describe('prikaz se mijenja samo kroz renderView', () => {
  it('app.ts nema nijedan rucni dodir tri glavne povrsine', () => {
    const s = citaj('src/ui/app.ts');
    for (const id of PRIKAZI) {
      for (const pristup of PRISTUPI) {
        for (const radnja of ['add', 'remove'] as const) {
          // DOSLOVAN niz, ne regex: escape u regexu je vec jednom razbio ovaj gard tako da je
          // izgledao ispravno a nije uopce grizao. Trazi se tocno ono sto je stajalo u kodu.
          const igla = '#' + id + pristup + ".classList." + radnja + "('hidden')";
          const koliko = s.split(igla).length - 1;
          expect(koliko, id + ' se u app.ts jos prebacuje rucno (' + pristup + radnja + ')').toBe(0);
        }
      }
    }
  });

  it('citanje stanja ostaje dopusteno, jer nije pisanje', () => {
    const s = citaj('src/ui/app.ts');
    expect(s, 'odluke koje se grade na `contains` ne smiju biti kolateralna steta garda')
      .toContain(".classList.contains('hidden')");
  });

  it('renderView doista postoji i pise sve tri povrsine', () => {
    const v = citaj('src/ui/wizard-view.ts');
    for (const id of PRIKAZI) expect(v, `${id} mora biti u renderView`).toContain(id);
    expect(v, 'iskljucivost se postize toggleom nad SVIMA, ne pojedinacnim gasenjem').toContain('classList.toggle');
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji.
   */
  it('gard stvarno grize, i to na OBA oblika pristupa', () => {
    const s = citaj('src/ui/app.ts');
    for (const pristup of PRISTUPI) {
      const igla = '#progressView' + pristup + ".classList.add('hidden')";
      const podmetnuto = "nesto();$('" + igla + ";nestoDrugo();";
      expect(podmetnuto.split(igla).length - 1, 'podmetnut rucni dodir (' + pristup + ') mora biti prijavljen').toBe(1);
      expect(s.split(igla).length - 1, 'baseline je izmjeren, ne pretpostavljen').toBe(0);
    }
  });

  /**
   * SENTINEL. Bez ovoga bi prazan ili preimenovan `PRISTUPI` ucinio gornji gard vakuumskim: petlja
   * bi prosla nula puta i test bi bio zelen nad bilo kakvim kodom. Tvrdi se i da je oblik s `?.`
   * stvarno u popisu, jer je bas on bio rupa.
   */
  it('popis oblika nije prazan i sadrzi oblik koji je kroz rupu prolazio', () => {
    expect(PRISTUPI.length).toBeGreaterThan(1);
    expect(PRISTUPI).toContain("')?");
  });
});
