/**
 * BROJ ULAZNOG LISTA (Z7).
 *
 * Zaglavlje papira na `/` nosi "Nº 0001 · Nepregledano". Broj NIJE ukras: to je koliko radova vec
 * lezi u lokalnoj povijesti (`lekta.history.v2`, ista pohrana koju cita "Moji radovi"), plus ovaj
 * koji korisnik upravo poduzima. Nova pohrana ili pokvaren zapis daju "0001", jer je tada ovaj rad
 * doista prvi koji ovaj preglednik pamti.
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
