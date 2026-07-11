// supabase/functions/_shared/cors.ts
//
// Suzenje CORS-a (data-flow-07): umjesto Access-Control-Allow-Origin: * reflektiraj SAMO
// dopusteno porijeklo (produkcijska domena + localhost za dev). Ostala porijekla dobiju
// primarno dopusteno porijeklo pa preglednik blokira cross-origin poziv s tudje stranice.
// CORS nije granica za ne-browser klijente (oni ga ignoriraju); ovo je obrana u dubinu za
// anonimne endpointe (faculty-request) da ih tudji sajt ne moze zvati iz korisnikovog preglednika.
//
// Izomorfno (bez Deno.env) pa se pickAllowedOrigin moze jedinicno testirati u vitestu.

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Vrati porijeklo koje se smije reflektirati: dopusteno ili localhost, inace primarno (allowed[0]). */
export function pickAllowedOrigin(origin: string | null | undefined, allowed: string[]): string {
  const o = (origin ?? '').trim();
  if (o && (allowed.includes(o) || LOCALHOST.test(o))) return o;
  return allowed[0] ?? '';
}

/** Puni CORS set za dani zahtjev (reflektira dopusteno porijeklo). */
export function corsHeadersFor(
  origin: string | null | undefined,
  allowed: string[],
  methods = 'POST, OPTIONS',
  headers = 'authorization, content-type, apikey',
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': pickAllowedOrigin(origin, allowed),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': headers,
    'Access-Control-Allow-Methods': methods,
  };
}
