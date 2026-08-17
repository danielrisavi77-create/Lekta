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

/**
 * Najveci dekomprimirani sadrzaj JEDNOG zapisa pri ANALIZI.
 *
 * Analiza i popravak ne mjere isto, pa jedna brojka ne pokriva oba:
 *  - ANALIZA cita LIJENO, samo XML dijelove koje treba (document.xml, styles.xml, footnotes...),
 *    pa se media nikad ne dekomprimira; granica je per-zapis, s agregatom kao guardom protiv
 *    ponovljenog citanja istog zapisa.
 *  - POPRAVAK mora procitati CIJELI paket da ga ponovno zapise, pa je njegova granica UKUPNA
 *    (`DOCX_MAX_TOTAL_DECOMPRESSED_BYTES`) i po prirodi stroza.
 *
 * Zato dokument moze proci analizu i pasti na popravku. To se NE rjesava izjednacavanjem brojki
 * (mjere razlicite stvari) nego `docxCapability()` ispod, koji jos na intakeu iz zip central
 * directoryja procita DEKLARIRANE velicine i unaprijed kaze je li popravak uopce moguc.
 */
export const DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY = 200 * MB;

/** Zasto popravak nije moguc za ovaj paket (null kad jest). */
export type DocxRepairBlocker = 'upload-too-large' | 'too-many-entries' | 'decompresses-too-large';

/** Sto se s ovim paketom realno moze, izvedeno PRIJE ijedne skupe operacije. */
export interface DocxCapability {
  canAnalyze: boolean;
  canRepair: boolean;
  /** Zbroj DEKLARIRANIH dekomprimiranih velicina svih zapisa (iz central directoryja). */
  totalDeclaredBytes: number;
  entryCount: number;
  repairBlocker: DocxRepairBlocker | null;
}

/**
 * Moze li se paket analizirati i, VAZNIJE, moze li se popraviti.
 *
 * Poanta je postenje sucelja: bez ovoga analiza prodje, korisnik dobije popis popravaka, klikne
 * "Popravi", potvrdi slanje na server i tek tada dobije 422 jer zip-codec ne moze progutati paket.
 * Ulaz je jeftin (velicina datoteke + central directory), pa se odgovor zna prije analize.
 */
export function docxCapability(input: { fileBytes: number; entryCount: number; totalDeclaredBytes: number }): DocxCapability {
  const { fileBytes, entryCount, totalDeclaredBytes } = input;
  const withinUpload = fileBytes > 0 && fileBytes <= DOCX_MAX_UPLOAD_BYTES;
  const withinEntries = entryCount <= DOCX_MAX_ZIP_ENTRIES;
  const withinDecompressed = totalDeclaredBytes <= DOCX_MAX_TOTAL_DECOMPRESSED_BYTES;
  const repairBlocker: DocxRepairBlocker | null = !withinUpload
    ? 'upload-too-large'
    : !withinEntries
      ? 'too-many-entries'
      : !withinDecompressed
        ? 'decompresses-too-large'
        : null;
  return {
    canAnalyze: withinUpload && withinEntries,
    canRepair: repairBlocker === null,
    totalDeclaredBytes,
    entryCount,
    repairBlocker,
  };
}

/** Kratko, korisniku razumljivo objasnjenje zasto popravak nije moguc (hrvatski, bez brojki iz koda). */
export function repairBlockerMessage(blocker: DocxRepairBlocker): string {
  switch (blocker) {
    case 'upload-too-large':
      return `Dokument je veći od ${Math.round(DOCX_MAX_UPLOAD_BYTES / MB)} MB, koliko automatski popravak može primiti.`;
    case 'too-many-entries':
      return `Dokument sadrži više od ${DOCX_MAX_ZIP_ENTRIES} ugrađenih dijelova, više nego što automatski popravak može sigurno obraditi.`;
    case 'decompresses-too-large':
      return `Raspakirani sadržaj dokumenta prelazi ${Math.round(DOCX_MAX_TOTAL_DECOMPRESSED_BYTES / MB)} MB, koliko automatski popravak može sigurno obraditi. Analiza je moguća, popravak nije.`;
  }
}
