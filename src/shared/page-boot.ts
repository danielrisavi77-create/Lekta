/**
 * ULAZ ZA STRANICE KOJE SU DO 2026-09-05 BOOTALE `ui-boot.ts` IZRAVNO
 * (`landing_usporedba`, `landing_benchmark`, `citati-i-literatura`, `alati`).
 *
 * `ui-boot.ts` je istovremeno dijeljeni modul i bio je ulaz tih cetiri stranica, pa se njegov
 * skup fontova nije mogao suziti a da te stranice ne ostanu bez glasa dokument-pregleda: sve
 * cetiri prikazuju listove s `--ink-serif`. Ovaj modul je zato dodavao podatkovne glasove i
 * prepustao ostalo `ui-bootu`.
 *
 * OD Z7 (2026-09-20) NEMA STO DODATI: sve rute nose iste dvije obitelji, a `--ink-serif` vodi na
 * sistemsku Georgiju (`--font-doc`), koja se ne ucitava. Modul ostaje kao ulazna tocka tih cetiri
 * stranica da se njihovi HTML-ovi i vite ulazi ne diraju; kad zatrebaju i sadrzajno, dodaje se
 * ovdje.
 *
 * Ulaz `/` NAMJERNO ne prolazi ovuda, nego zove `ui-boot` izravno preko svoje rute.
 */
import './ui-boot';
