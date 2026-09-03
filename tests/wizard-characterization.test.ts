import { describe, expect, it } from 'vitest';
import { ubaciStranicu } from './helpers/dom-fixture';

/**
 * KARAKTERIZACIJA CAROBNJAKA (T16, korak B0): sto sucelje RADI danas, prije nego se ista premjesta.
 *
 * `app.ts` nema stroj stanja. Prikaz se prebacuje s 97 rucnih dodira `hidden` nad tri `div`-a, a
 * korak se pise izravno u `dataset.step`, bez tablice prijelaza. Plan predvidja da to postane jedan
 * pisac (`renderView`) nad izricitom tablicom; da bi se to smjelo dirati, prvo mora postojati mjera
 * zatecenog ponasanja.
 *
 * TABLICA JE IZRICITA, ne snapshot. Snapshot se osvjezi jednim `npm test -- -u` i regresija tada
 * izgleda kao namjera; ovdje promjena mora biti upisana rukom, sto je i smisao ugovora.
 *
 * Fixtura je PRAVI `index.html`, jer je `init()` ogradjen na `#analyzer`, a `initLegacy` trazi jos
 * pet korijena. Uvoz modula mjeri oko 20 s na slobodnom stroju, pa je proracun vremena 180 s.
 */

const VIDOVI = ['wizardView', 'progressView', 'resultView'] as const;

function stanje(): { korak: string; vidljivo: string[] } {
  return {
    korak: document.getElementById('wizardView')?.getAttribute('data-step') ?? '-',
    vidljivo: VIDOVI.filter((id) => !document.getElementById(id)?.classList.contains('hidden')),
  };
}

/** Izmjereno 2026-09-03 nad pravim `index.html`. Svaka promjena ovdje je promjena ponasanja. */
const OCEKIVANI_PRIJELAZI: Array<[string, string]> = [
  ['stepToProfile', '2'],
  ['stepToAnalyze', '3'],
  ['stepBackProfile', '2'],
  ['stepBackDoc', '1'],
  ['stepToProfile', '2'],
];

describe('carobnjak: zatecено ponasanje', () => {
  it('prijelazi i vidljivost prikaza su tocno ovakvi', async () => {
    ubaciStranicu();
    expect(document.getElementById('analyzer'), '#analyzer mora postojati, inace init() ne trci').toBeTruthy();
    await import('../src/ui/app');

    const pocetno = stanje();
    expect(pocetno.korak, 'pocetni korak').toBe('1');
    expect(pocetno.vidljivo, 'na pocetku je vidljiv samo carobnjak').toEqual(['wizardView']);

    for (const [gumb, ocekivaniKorak] of OCEKIVANI_PRIJELAZI) {
      const el = document.getElementById(gumb) as HTMLElement | null;
      expect(el, `${gumb} mora postojati u stvarnoj stranici`).toBeTruthy();
      el!.click();
      await new Promise((r) => setTimeout(r, 30));
      const s = stanje();
      expect(s.korak, `nakon klika na ${gumb}`).toBe(ocekivaniKorak);
      expect(s.vidljivo, `nakon klika na ${gumb} smije biti vidljiv samo carobnjak`).toEqual(['wizardView']);
    }
  }, 180000);

  /**
   * INVARIJANTA koju buduci `renderView` mora ocuvati: nikad dva prikaza istovremeno. Danas to
   * nitko ne tvrdi, pa se moze pokvariti neprimjetno, jer se `hidden` pise s 97 mjesta.
   */
  it('nikad nisu vidljiva dva prikaza istovremeno', async () => {
    ubaciStranicu();
    await import('../src/ui/app');
    for (const gumb of ['stepToProfile', 'stepToAnalyze', 'stepBackDoc']) {
      (document.getElementById(gumb) as HTMLElement | null)?.click();
      await new Promise((r) => setTimeout(r, 30));
      expect(stanje().vidljivo.length, `nakon ${gumb}`).toBeLessThanOrEqual(1);
    }
  }, 180000);
});
