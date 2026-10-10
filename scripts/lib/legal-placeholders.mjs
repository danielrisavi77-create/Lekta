// Oznake u pravnom tekstu koje se NE SMIJU objaviti (T86): `[ODLUKA VLASNIKA: ...]` za odluku koju
// donosi vlasnik (npr. Z36, klauzula jamstva bete) i `[PROVJERITI: ...]` za cinjenicu koja jos nije
// provjerena u izvoru. Pravni tekst mjesto oznacava umjesto da vrijednost izmisli; ovaj modul je
// jedino mjesto koje oznaku prepoznaje, a `scripts/verify-deploy-dist.mjs` obara objavu dok ijedna
// stoji u dist/. Baseline i mutacija: `tests/gate-mutations.test.ts`.

const OZNAKA = /\[(?:ODLUKA VLASNIKA|PROVJERITI):[^\]]*\]/g;

/**
 * Sve neobjavljive oznake u tekstu, redom pojavljivanja.
 * @param {string} text
 * @returns {string[]}
 */
export function findLegalPlaceholders(text) {
  return String(text).match(OZNAKA) ?? [];
}
