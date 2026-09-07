/**
 * Hrvatska mnozina, izdvojena iz `technical-compliance-halo.ts` 2026-09-07.
 *
 * Taj je modul crtao halo prsten oko ocjene: tamni uredaj 321x353 px koji je drzao pogled prije
 * nego je covjek stigao do nalaza. Zamijenjen je sazetkom nalaza (`finding-summary.ts`), pa su
 * `readinessHaloHtml`, `technicalComplianceHaloHtml`, `openFindingSegments` i `HaloSignals`
 * ostali mrtvi (~8 KB). Od cijelog modula je prezivio samo ovaj helper, koji su i dalje trebala
 * dva druga prikaza, pa je dobio vlastitu datoteku umjesto da drzi na zivotu praznu ljusku.
 */

/**
 * Hrvatski ima TRI oblika, ne dva: 1 blokator, 2 blokatora, 5 blokatora. Dvooblicna grana
 * (`n === 1 ? jednina : mnozina`) je na ovom ekranu davala "0 sigurne popravke" i
 * "5 sigurne popravke". Iznimka su 11 do 14, koje idu u treci oblik unatoc zavrsnoj znamenki
 * ("11 blokatora", ne "11 blokator").
 */
export function pluralHr(count: number, [one, few, many]: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10, lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
