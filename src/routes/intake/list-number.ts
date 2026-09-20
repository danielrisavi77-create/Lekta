/**
 * BROJ ULAZNOG LISTA (Z7).
 *
 * Zaglavlje papira na `/` nosi "Nº 0001 · Nepregledano". Broj NIJE ukras: to je koliko ZAVRSENIH
 * analiza ovaj preglednik pamti u `lekta.history.v2`, plus ova koju korisnik upravo poduzima. Nova
 * pohrana ili pokvaren zapis daju "0001", jer je tada ovaj rad doista prvi koji preglednik pamti.
 *
 * STO TAJ BROJ NIJE, jer je prvi prolaz Z7 tvrdio suprotno (pregled je to oborio):
 *
 *   NIJE broj radova u "Moji radovi". `src/routes/my-work/main.ts` lokalne radove gradi iz
 *   IndexedDB sesija (`IndexedDbDocumentSessionStore.list`) i `STORAGE_KEYS.history` uopce ne
 *   dira. Skupovi se razilaze u OBA smjera: dokument ostavljen prije kraja analize ondje stoji a
 *   ovdje se ne broji, dok analiza koja nije ostavila sesiju broj ovdje povecava.
 *
 *   NIJE broj koji raste bez kraja. `saveAnalysisHistory` (`src/ui/app.ts`) pise tek po ZAVRSENOJ
 *   analizi na `/rad/`, preskace demo rezultate i rezu popis na 20 zapisa, pa je "0021" strop.
 *
 * Time ostaje tocno ono sto natpis i tvrdi: koji je ovo po redu list u knjizi OVOG preglednika.
 *
 * JE LI TO SADRZAJ RADA? Nije, i granica je ovdje ostra: broj se IZVODI iz brojanja zapisa u
 * pregledniku, ne iz dokumenta, i ne ulazi ni u kakav izlaz. Isto vrijedi za pecat: cisto
 * dekorativan, `aria-hidden`, bez veze s ocjenom.
 *
 * ZASTO ZASEBAN MODUL, a ne funkcija u `main.ts`: `main.ts` na kraju zove `start()`, pa bi ga test
 * uvozom POKRENUO (IndexedDB, intake kontroler, ulazna sekvenca). Ovdje nema nicega osim citanja
 * pohrane, pa se tri slucaja (prazno, dvanaest zapisa, pokvaren JSON) mjere izravno.
 */

import { safeStorageGet, STORAGE_KEYS } from '../../shared/browser-storage';

/** Koliko znamenki nosi broj lista. Sirinu u CSS-u drze tabularne znamenke, ne ovaj broj. */
const ZNAMENKI = 4;

/**
 * Koliko je radova vec zabiljezeno u ovom pregledniku.
 *
 * `safeStorageGet` na pokvarenom JSON-u ne baca nego vraca rezervnu vrijednost, pa je prazna i
 * pokvarena pohrana ovdje namjerno ISTI ishod: nula zabiljezenih radova.
 */
function zabiljezenihRadova(): number {
  const zapisi = safeStorageGet(STORAGE_KEYS.history, []);
  return Array.isArray(zapisi) ? zapisi.length : 0;
}

/** Redni broj ovog ulaznog lista, oblikovan na cetiri znamenke (npr. `0013`). */
export function ulazniListBroj(): string {
  return String(zabiljezenihRadova() + 1).padStart(ZNAMENKI, '0');
}

/**
 * Upisuje broj u zaglavlje papira. Pocetna vrijednost `0001` vec stoji u `index.html`, pa stranica
 * bez JS-a ili prije ovog poziva nikad ne pokazuje prazninu.
 */
export function prikaziUlazniListBroj(doc: Document): void {
  const polje = doc.querySelector<HTMLElement>('[data-intake-list-broj]');
  if (!polje) return;
  polje.textContent = ulazniListBroj();
}
