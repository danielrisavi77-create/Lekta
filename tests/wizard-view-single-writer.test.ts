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

function citaj(rel: string): string {
  return fs.readFileSync(path.join(KORIJEN, rel), 'utf8');
}

describe('prikaz se mijenja samo kroz renderView', () => {
  it('app.ts nema nijedan rucni dodir tri glavne povrsine', () => {
    const s = citaj('src/ui/app.ts');
    for (const id of PRIKAZI) {
      for (const radnja of ['add', 'remove'] as const) {
        // DOSLOVAN niz, ne regex: escape u regexu je vec jednom razbio ovaj gard tako da je
        // izgledao ispravno a nije uopce grizao. Trazi se tocno ono sto je stajalo u kodu.
        const igla = "#" + id + "').classList." + radnja + "('hidden')";
        const koliko = s.split(igla).length - 1;
        expect(koliko, id + ' se u app.ts jos prebacuje rucno (' + radnja + ')').toBe(0);
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
  it('gard stvarno grize', () => {
    const igla = "#progressView').classList.add('hidden')";
    const podmetnuto = "nesto();$('" + igla + ";nestoDrugo();";
    expect(podmetnuto.split(igla).length - 1, 'podmetnut rucni dodir mora biti prijavljen').toBe(1);
    expect(citaj('src/ui/app.ts').split(igla).length - 1, 'baseline je izmjeren, ne pretpostavljen').toBe(0);
  });
});
