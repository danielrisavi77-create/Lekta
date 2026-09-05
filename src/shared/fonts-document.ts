/**
 * GLASOVI KOJE NOSE SAMO STRANICE S DOKUMENTOM I PODACIMA.
 *
 * - Source Serif 4 (`--ink-serif`): zrcali Wordov izlaz u pregledima (naslovnica, izjava, citat,
 *   literatura). Nije brand font, nego prikaz TUDJEG dokumenta.
 * - IBM Plex Mono (`--mono`): podatkovni glas i SAMO to (ocjene, sifre pravila, folio oznake).
 *
 * Uvozi ga svaka stranica koja te mete stvarno ima; `/` ih nema nijednu, pa ovaj modul NE SMIJE
 * uci u njegov graf. Cuva to `tests/entry-fonts.test.ts`.
 *
 * Caveat je do 2026-09-05 bio peti glas ("rukopis korektora", `--font-hand`). Uklonjen je jer ga
 * je nakon reza ruta ucitavao jos samo `src/main.ts`, koji vise nije ulaz nijedne stranice, pa je
 * token uzivo padao na sustavni `cursive` (na Windowsu Comic Sans). Biljeska korektora sada ide
 * kurzivom display serifa.
 */
import '@fontsource-variable/source-serif-4'; // dokument-pregledi: zrcale Word izlaz
import '@fontsource/ibm-plex-mono/400.css'; // podatkovni glas: brojevi, sifre, statusi
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
