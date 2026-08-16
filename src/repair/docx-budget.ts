/**
 * JEDAN izvor gornjih granica dokumenta za CIJELI put: intake -> analiza -> popravak.
 *
 * Zasto postoji: granice su prije bile razasute i MEDJUSOBNO NEUSKLADJENE, pa je dokument
 * mogao proci analizu i onda biti odbijen na popravku:
 *  - analiza je na desktopu primala do 50 MB (`uploadCapBytes`),
 *  - klijent i Edge funkcija za popravak odbijaju sve preko 20 MB
 *    (`REPAIR_MAX_UPLOAD_BYTES`, `REPAIR_MAX_DOCX_BYTES`).
 * Obecati analizu pa odbiti popravak nakon privole je losa granica proizvoda, cak i kad je
 * svaka pojedina brojka tehnicki opravdana. Zato je gornja granica sada zajednicka.
 *
 * Vrijednost je 20 MB jer je popravak uze grlo: radi na Edge funkciji (256 MB) i zip-codec
 * drzi 64 MB ukupno dekomprimirano uz tranzijentni 2x concat peak.
 */
const MB = 1024 * 1024;

/** Najveci .docx koji se prima na BILO KOJEM koraku (analiza i popravak dijele ovu granicu). */
export const DOCX_MAX_UPLOAD_BYTES = 20 * MB;

/** Najveci ukupan dekomprimirani sadrzaj paketa (zip-bomba guard u zip-codecu). */
export const DOCX_MAX_TOTAL_DECOMPRESSED_BYTES = 64 * MB;

/**
 * Najveci broj zapisa u paketu.
 *
 * Prije je CHECK imao 512 a REPAIR 4096, dakle granica je bila neuskladjena i u OBRNUTOM
 * smjeru: analiza je odbijala paket koji bi popravak primio. Poravnato je na STROZU (512)
 * jer je ta brojka obrazlozena u src/docx/parser.ts: realan .docx ima 10-40 zapisa, doktorat
 * prepun slika 200-300, a napadacki zip deklarira do 65535 da napuse central-directory obradu.
 * Popustiti CHECK na 4096 znacilo bi oslabiti postojecu obranu radi kozmeticke simetrije.
 */
export const DOCX_MAX_ZIP_ENTRIES = 512;
