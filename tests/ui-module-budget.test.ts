import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUDZET_APP, BUDZET_UI_UKUPNO, KORIJEN, POPUST, bajtova, presudaRatcheta, tsDatoteke,
} from './helpers/ui-budget';

/**
 * RATCHET NAD `src/ui`, postavljen PRIJE ijednog premjestanja koda (T16, korak B1).
 *
 * ZASTO PRIJE. Plan za razbijanje `app.ts` postoji vec danima, a datoteka je u medjuvremenu
 * NARASLA: 334 KB / 1977 redaka -> 359 KB / 2389, a broj rucnih dodira `hidden` s 28 na 97.
 * Bez garda svaka sesija doda "samo jos ovo" i mjera se tiho pogorsa. Ovaj test ne trazi da se
 * `app.ts` odmah razbije; trazi samo da ne raste dalje.
 *
 * DONJA GRANICA je jednako vazna kao gornja. Bez nje bi budzet ostao naduvan nakon prvog
 * uspjesnog izdvajanja i sljedeci rast bi opet prosao. Zato test PADA i kad je datoteka znatno
 * ISPOD budzeta, s uputom da se budzet spusti.
 *
 * MJERENJE I PRESUDA zive u `tests/helpers/ui-budget.ts` (izdvojeni 2026-09-13), jer ih zove i
 * mutacija `ui-budzet/rast-i-naduvan-budzet` u `tests/gate-mutations.test.ts`. Mutacija koja ima
 * vlastitu kopiju pravila ne mjeri gard nego samu sebe; zato je izvor istine jedan. Ondje je i
 * obrazlozenje zasto se CR bajtovi odbacuju umjesto `statSync().size`.
 */

const MAX_HIDDEN_DODIRA = 97;

describe('src/ui: ratchet velicine, prije razbijanja a ne poslije', () => {
  it('app.ts ne raste', () => {
    const s = bajtova('src/ui/app.ts');
    expect(presudaRatcheta(s, BUDZET_APP), `app.ts je narastao na ${(s / 1024).toFixed(1)} KB; budzet je ${(BUDZET_APP / 1024).toFixed(0)} KB`)
      .not.toContain('preko-budzeta');
  });

  it('kad app.ts smrsavi, budzet se MORA spustiti', () => {
    const s = bajtova('src/ui/app.ts');
    expect(
      presudaRatcheta(s, BUDZET_APP),
      `app.ts je sada ${(s / 1024).toFixed(1)} KB, znatno ispod budzeta od ${(BUDZET_APP / 1024).toFixed(0)} KB. `
      + 'Spusti BUDZET_APP na izmjerenu vrijednost, inace gard vise nista ne cuva.',
    ).not.toContain('budzet-naduvan');
  });

  it('ukupna velicina src/ui ne raste', () => {
    const uk = tsDatoteke('src/ui').reduce((s, f) => s + bajtova(f), 0);
    expect(presudaRatcheta(uk, BUDZET_UI_UKUPNO), `src/ui je ${(uk / 1024).toFixed(1)} KB; budzet je ${(BUDZET_UI_UKUPNO / 1024).toFixed(0)} KB`)
      .not.toContain('preko-budzeta');
  });

  /**
   * DONJA GRANA I ZA UKUPNI PRAG, a ne samo za `app.ts`.
   *
   * Do 2026-09-13 je ukupni prag bio goli `toBeLessThanOrEqual`, dakle ratchet samo u jednom
   * smjeru. Izmjereno istoga dana: naduvavanje praga s 838 natrag na 848 KB prolazilo je ZELENO,
   * pa bi prvo sljedece izdvajanje ostavilo 12 KB mrtve zrake i gard bi prestao cuvati bas ono
   * zbog cega postoji. Argument je isti kao za `app.ts` u zaglavlju: bez donje grane budzet ostane
   * naduvan nakon prvog uspjesnog izdvajanja i sljedeci rast opet prodje.
   */
  it('kad src/ui smrsavi, ukupni budzet se MORA spustiti', () => {
    const uk = tsDatoteke('src/ui').reduce((s, f) => s + bajtova(f), 0);
    expect(
      presudaRatcheta(uk, BUDZET_UI_UKUPNO),
      `src/ui je sada ${(uk / 1024).toFixed(1)} KB, znatno ispod budzeta od ${(BUDZET_UI_UKUPNO / 1024).toFixed(0)} KB. `
      + 'Spusti BUDZET_UI_UKUPNO na izmjerenu vrijednost, inace gard vise nista ne cuva.',
    ).not.toContain('budzet-naduvan');
  });

  /**
   * Prikaz se prebacuje rucnim dodirima `hidden` nad tri `div`-a, bez tablice prijelaza. Plan
   * trazi da to postane JEDAN pisac (`renderView`); dok se to ne dogodi, broj barem ne smije rasti.
   */
  it('broj rucnih dodira `hidden` u app.ts ne raste', () => {
    const t = fs.readFileSync(path.join(KORIJEN, 'src/ui/app.ts'), 'utf8');
    const n = (t.match(/classList\.(add|remove)\('hidden'\)/g) ?? []).length;
    expect(n, `dodira je ${n}; dopusteno je najvise ${MAX_HIDDEN_DODIRA}`).toBeLessThanOrEqual(MAX_HIDDEN_DODIRA);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmecu se OBA kvara zbog kojih gard postoji, i to
   * nad STVARNO izmjerenom velicinom `app.ts`, ne nad izmisljenim brojem.
   *
   * Prijasnja izvedba je tvrdila `BUDZET_APP + 1 > BUDZET_APP`, sto je tautologija: prosla bi i
   * da `presudaRatcheta` uopce ne postoji. Ista tvrdnja, u punom obliku, zivi kao mutacija
   * `ui-budzet/rast-i-naduvan-budzet` u `tests/gate-mutations.test.ts`.
   */
  it('gard na rast stvarno grize', () => {
    const s = bajtova('src/ui/app.ts');
    expect(s, 'baseline je izmjeren, ne pretpostavljen').toBeGreaterThan(1000);
    expect(presudaRatcheta(s, BUDZET_APP), 'nemutiran ulaz mora biti cist').toEqual([]);
    expect(presudaRatcheta(s, s - 1), 'datoteka jedan bajt preko budzeta mora pasti').toContain('preko-budzeta');
    expect(presudaRatcheta(s, s + POPUST), 'naduvan budzet mora traziti spustanje').toContain('budzet-naduvan');
  });
});
