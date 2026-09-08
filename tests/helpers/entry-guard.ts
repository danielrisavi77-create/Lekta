/**
 * Straza ulazne tocke ESM skripte: `import.meta.url === pathToFileURL(process.argv[1]).href`.
 *
 * NAIVAN oblik (`file://` + staza, slijepljena rucno) na Windowsu se NIKAD ne poklopi, jer je
 * `process.argv[1]` ondje `C:\...\x.mjs`, a `import.meta.url` `file:///C:/.../x.mjs`. Skripta se
 * tada ucita, ne izvede NISTA i izade s kodom 0. To je najgori oblik zelenog: izgleda kao prolaz.
 *
 * Izmjereno 2026-09-07 na `scripts/post-deploy-smoke.mjs`: dok je CI (Linux, gdje se naivna straza
 * poklopi) bio crven 40 uzastopnih pokretanja, ista naredba na Windowsu nije ispisala ni redak i
 * vratila je 0, pa se kvar nije mogao reproducirati ondje gdje se radi.
 *
 * Provjera je namjerno DOSLOVNA (bez gradnje regexa iz nizova): escape se kroz slaganje zna
 * izgubiti, sto je u ovom repozitoriju vec jednom proizvelo gard koji ne grize nijedan slucaj.
 */

/** Naivna straza: `file://` neposredno slijepljen s `process.argv[1]`, u backtickovima ili nizu. */
const NAIVNA_STRAZA = /file:\/\/(?:\$\{\s*process\.argv\[1\]\s*\}|['"`]\s*\+\s*process\.argv\[1\])/;

/** True kad izvor sadrzi strazu koja usporeduje `import.meta.url` sa slijepljenom stazom. */
export function hasNaiveEntryGuard(source: string): boolean {
  return NAIVNA_STRAZA.test(source);
}
