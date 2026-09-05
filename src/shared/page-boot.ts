/**
 * ULAZ ZA STRANICE KOJE SU DO 2026-09-05 BOOTALE `ui-boot.ts` IZRAVNO
 * (`landing_usporedba`, `landing_benchmark`, `citati-i-literatura`, `alati`).
 *
 * `ui-boot.ts` je istovremeno dijeljeni modul i bio je ulaz tih cetiri stranica, pa se njegov
 * skup fontova nije mogao suziti a da te stranice ne ostanu bez glasa dokument-pregleda: sve
 * cetiri prikazuju listove s `--ink-serif`. Ovaj modul je zato tanak: doda podatkovne glasove i
 * pusti `ui-boot` da odradi ostalo.
 *
 * Ulaz `/` NAMJERNO ne prolazi ovuda, nego zove `ui-boot` izravno preko svoje rute.
 */
import './fonts-document';
import './ui-boot';
