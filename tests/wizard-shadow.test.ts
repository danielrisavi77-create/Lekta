import { describe, expect, it } from 'vitest';
import { ubaciStranicu } from './helpers/dom-fixture';
import { oziciSjenu, resetirajSjenu, stanjeSjene, usporediSDom, type Neslaganje } from '../src/ui/wizard-shadow';

/**
 * DOKAZ DA SE STROJ SLAZE SA STVARNOSCU (T16, korak B3).
 *
 * Stroj iz `wizard-machine.ts` je do sada bio tvrdnja o sebi samome: tablica koju provjerava test
 * napisan uz istu tablicu. Ovdje se vozi USPOREDNO s pravim `app.ts` nad pravim `index.html`, i
 * tvrdi se da nijedan prijelaz ne proizvede neslaganje.
 *
 * Tek to opravdava sljedeci korak (B4, preokret pisca). Bez ovoga bi preokret bio pogadjanje.
 */

async function pripremi(): Promise<Neslaganje[]> {
  ubaciStranicu();
  await import('../src/ui/app');
  resetirajSjenu();
  const neslaganja: Neslaganje[] = [];
  oziciSjenu(document, (n) => neslaganja.push(n));
  return neslaganja;
}

const NIZ = ['stepToProfile', 'stepToAnalyze', 'stepBackProfile', 'stepBackDoc', 'stepToProfile'];

describe('stroj u sjeni nad pravim app.ts', () => {
  it('nijedan prijelaz ne proizvede neslaganje s DOM-om', async () => {
    const neslaganja = await pripremi();
    expect(usporediSDom(), 'pocetno stanje se mora slagati').toBeNull();

    for (const gumb of NIZ) {
      (document.getElementById(gumb) as HTMLElement | null)?.click();
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(
      neslaganja,
      `sjena se razisla s DOM-om:\n${neslaganja.map((n) => JSON.stringify(n)).join('\n')}`,
    ).toEqual([]);
    expect(stanjeSjene(), 'nakon izmjerenog niza sjena je na profilu').toBe('profil');
  }, 180000);

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se stvarno neslaganje: DOM se rucno prebaci na
   * krivi korak, pa usporedba MORA prijaviti.
   */
  it('usporedba stvarno prijavljuje kad se razidju', async () => {
    await pripremi();
    expect(usporediSDom(), 'baseline mora biti cist, inace tvrdnja nije o mutaciji').toBeNull();

    document.getElementById('wizardView')?.setAttribute('data-step', '3');
    const n = usporediSDom();
    expect(n, 'podmetnut krivi korak mora biti prijavljen').not.toBeNull();
    expect(n!.ocekivanKorak).toBe('1');
    expect(n!.stvarniKorak).toBe('3');
  }, 180000);
});
