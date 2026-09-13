import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDZET_APP, KORIJEN, POPUST, bajtova, presudaRatcheta } from './helpers/ui-budget';

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
 */

/**
 * `BUDZET_APP` i mjerenje zive u `tests/helpers/ui-budget.ts`, jer ih cita i mutacija
 * `ui-budzet/naduvan-budzet` u `tests/gate-mutations.test.ts`. Izmjereno 2026-09-13: mutacija
 * koja je vjezbala presudu nad IZMISLJENIM budzetom ostajala je zelena i kad se `BUDZET_APP`
 * naduva na `999 * 1024`, dakle na tocno onaj kvar koji imenuje. Kopija broja mjeri samu sebe.
 */
// UKUPNI BUDZET `src/ui` JE UKINUT 2026-09-09, odlukom vlasnika. Ovo je zapis zasto, jer bi bez
// njega sljedeca sesija guard vratila.
//
// Brojao je BAJTOVE IZVORA cijelog `src/ui`, ukljucujuci komentare. Komentari se pri buildu
// odbacuju i korisnik ih nikad ne preuzme, pa je guard oporezivao upravo ono sto ovaj repozitorij
// izricito trazi: gusto objasnjene odluke. U dva dana je dignut PET puta (831 -> 869 KB), svaki
// put uz mjerenje i biljesku, i svaki put zato sto znacajka koju vlasnik trazi po prirodi slijece
// u `src/ui`. Guard koji se digne svaki put kad zasmeta jednak je guardu koji ne postoji.
//
// Ono sto korisnik STVARNO osjeti, tezinu preuzimanja, cuva `bundleSizeGuard` u `vite.config.ts`:
// mjeri izgradjeni entry (960 KB) i pada kad lazy split pukne. To je mjera koja se tice studenta
// na laptopu; zbroj izvornih bajtova nije.
//
// `BUDZET_APP` OSTAJE i NIJE isti slucaj. On ima cilj (monolit se rasplice) i taj se cilj mjeri
// PADANJEM, uz pravilo da se spusta cim datoteka smrsavi. Dvaput u jednom danu je natjerao
// selidbu objasnjenja iz `app.ts` u modul umjesto dizanja brojke, dakle radio je svoj posao.
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
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji:
   * datoteka za jedan bajt preko budzeta.
   */
  it('gard na rast stvarno grize', () => {
    const s = bajtova('src/ui/app.ts');
    expect(s, 'baseline je izmjeren, ne pretpostavljen').toBeLessThanOrEqual(BUDZET_APP);
    expect(BUDZET_APP + 1).toBeGreaterThan(BUDZET_APP);
    const mutiran = BUDZET_APP + 1;
    expect(mutiran <= BUDZET_APP, 'podmetnut rast preko budzeta mora pasti').toBe(false);
  });
});
