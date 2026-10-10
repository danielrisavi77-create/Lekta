/**
 * Gardovi za REZULTAT: SVE U JEDNOM (ALIGNMENT Z34). Ciste funkcije nad tekstom, pa ih
 * `tests/gate-mutations.test.ts` moze hraniti podmetnutim kvarom bez pisanja po disku.
 *
 *   cijenaProblems   cijena NIKAD u klijentskom kodu Z34: izvor je serverski katalog, a postojeci
 *                    tok popravka iznos ne prikazuje. Predlozak ima "14,99 €" (F37).
 *   plusBodProblems  bodovi po zahvatu ne postoje (`repair-outlook.ts` r. 8-20, odluka vlasnika):
 *                    vidljivi tekst stola i ladice ne smije nositi "+N" ni uz zahvat ni uz ocjenu.
 *   plusBodIzvorProblems  isto, ali nad IZVOROM modula Z34 (Codex R11): "+N" u uvjetno crtanom
 *                    tekstu (npr. samo uz siguran zahvat) prikaz u testu mozda nikad ne nacrta, a
 *                    izvor ga nosi uvijek. Gleda samo sadrzaj string literala, bez komentara.
 *
 * Pokret (Z31) i lijena granica dijele gardove Z33 (`analysis-live-guard.ts`).
 */

/** Znakovi da je u izvor usla cijena: valuta, iznos s centima ili klijentski cjenik. */
const ZNAKOVI_CIJENE: ReadonlyArray<readonly [string, (kod: string) => boolean]> = [
  ['znak eura', (kod) => kod.includes('€')],
  ['iznos s centima', (kod) => /\d+,\d{2}\s*(?:EUR|eura)\b/i.test(kod)],
  ['klijentski cjenik (priceEur, eurLabel, WORK_TYPE_TIERS)', (kod) => /\bpriceEur\b|\beurLabel\s*\(|\bWORK_TYPE_TIERS\b/.test(kod)],
];

export function cijenaProblems(izvori: Readonly<Record<string, string>>): string[] {
  const problemi: string[] = [];
  for (const [ime, src] of Object.entries(izvori)) {
    // Komentari smiju OBJASNJAVATI zasto cijene nema (i navesti iznos iz predloska); kod ne smije.
    const kod = src.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const [opis, ima] of ZNAKOVI_CIJENE) if (ima(kod)) problemi.push(`${ime}: ${opis}`);
  }
  return problemi;
}

/** Vidljivi tekst (textContent) stola i ladice; vraca svaki "+N" koji se ondje pojavi. */
export function plusBodProblems(tekst: string): string[] {
  return [...tekst.matchAll(/\+\s*\d+/g)].map((m) => `bodovi po zahvatu: "${m[0]}"`);
}

/** Komentari smiju objasnjavati zasto "+N" ne postoji; kod (literali) ne smije ga nositi. */
const bezKomentaraKoda = (src: string): string => src.replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * Sadrzaj svih string i template literala (bez navodnika), u redoslijedu izvora. Izraz umetka
 * (`${k + 1}`) nije tekst, pa se zamjenjuje znakom NUL: "· +${p}" ostaje uhvacen, a "${k + 1}" ne.
 */
function literali(kod: string): string[] {
  return [...kod.matchAll(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g)]
    .map((m) => m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, '\u0000'));
}

/**
 * "+N" uz zahvat ili ocjenu u izvoru Z34: znamenka iza plusa ("+7", "+ 7"), plus iza tocke
 * predloska ("· +${p}") ili literal koji zavrsava plusom kojem se dolijepi broj ("'+' + n").
 * "+ <naziv zahvata>" na cedulji koja leti nije bod i ne obara gard.
 */
export function plusBodIzvorProblems(izvori: Readonly<Record<string, string>>): string[] {
  const problemi: string[] = [];
  for (const [ime, src] of Object.entries(izvori)) {
    for (const l of literali(bezKomentaraKoda(src))) {
      const m = /\+\s*\d+/.exec(l) ?? /·\s*\+/.exec(l) ?? /\+\s*$/.exec(l);
      if (m) problemi.push(`${ime}: "${m[0].trim()}" u tekstu`);
    }
  }
  return problemi;
}
