/**
 * Gardovi za REZULTAT: SVE U JEDNOM (ALIGNMENT Z34). Ciste funkcije nad tekstom, pa ih
 * `tests/gate-mutations.test.ts` moze hraniti podmetnutim kvarom bez pisanja po disku.
 *
 *   cijenaProblems   cijena NIKAD u klijentskom kodu Z34: izvor je serverski katalog, a postojeci
 *                    tok popravka iznos ne prikazuje. Predlozak ima "14,99 €" (F35).
 *   plusBodProblems  bodovi po zahvatu ne postoje (`repair-outlook.ts` r. 8-20, odluka vlasnika):
 *                    vidljivi tekst stola i ladice ne smije nositi "+N" ni uz zahvat ni uz ocjenu.
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
