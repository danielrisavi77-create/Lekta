// supabase/functions/_shared/cors.ts
//
// Suzenje CORS-a (data-flow-07): umjesto Access-Control-Allow-Origin: * reflektiraj SAMO
// dopusteno porijeklo. Nedopusteno porijeklo NE dobiva header uopce (SEC-12), a localhost se
// reflektira samo uz izricitu env zastavicu LEKTA_ALLOW_LOCALHOST_CORS=1 (SEC-11), koja se u
// produkciji ne postavlja.
// CORS nije granica za ne-browser klijente (oni ga ignoriraju); ovo je obrana u dubinu za
// anonimne endpointe (faculty-request) da ih tudji sajt ne moze zvati iz korisnikovog preglednika.
//
// Izomorfno (bez Deno.env) pa se pickAllowedOrigin moze jedinicno testirati u vitestu.

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Smije li se localhost reflektirati.
 *
 * Do 2026-08-17 je localhost bio dopusten BEZUVJETNO, i u produkciji (audit SEC-11). Posljedica:
 * bilo koja lokalna web aplikacija na korisnikovu racunalu mogla je iz njegovog preglednika
 * zvati produkcijske funkcije s njegovim kolacicima i tokenom. Sada je vezan uz izricitu env
 * zastavicu koja se u produkciji ne postavlja.
 *
 * Cita se lijeno i defenzivno: `_shared/cors.ts` je namjerno izomorfan (bez Deno.env na vrhu)
 * da ostane jedinicno testabilan u vitestu, pa se globalni Deno objekt dohvaca kroz opcionalni
 * pristup umjesto izravno.
 */
function localhostAllowed(): boolean {
  try {
    const env = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno?.env;
    return env?.get('LEKTA_ALLOW_LOCALHOST_CORS') === '1';
  } catch {
    return false;
  }
}

/**
 * Porijeklo koje se smije reflektirati, ili PRAZAN string ako nijedno.
 *
 * Prazno znaci "ne salji Access-Control-Allow-Origin uopce" (audit SEC-12). Prije se za
 * nedopusteno porijeklo vracalo primarno dopusteno porijeklo; preglednik bi to doduse blokirao
 * jer se origini ne podudaraju, ali odgovor je tvrdio nesto sto nije istina. Izostanak headera
 * je i tocniji i lakse citljiv u dijagnostici.
 */
export function pickAllowedOrigin(
  origin: string | null | undefined,
  allowed: string[],
  opts: { allowLocalhost?: boolean } = {},
): string {
  const o = (origin ?? '').trim();
  if (!o) return '';
  if (allowed.includes(o)) return o;
  const allowLocal = opts.allowLocalhost ?? localhostAllowed();
  if (allowLocal && LOCALHOST.test(o)) return o;
  return '';
}

/** Puni CORS set za dani zahtjev (reflektira dopusteno porijeklo; izostavlja ga ako nije dopusteno). */
export function corsHeadersFor(
  origin: string | null | undefined,
  allowed: string[],
  methods = 'POST, OPTIONS',
  headers = 'authorization, content-type, apikey',
): Record<string, string> {
  const picked = pickAllowedOrigin(origin, allowed);
  return {
    // Bez dopustenog porijekla header se NE salje (prazna vrijednost bi bila neispravan header).
    ...(picked ? { 'Access-Control-Allow-Origin': picked } : {}),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': headers,
    'Access-Control-Allow-Methods': methods,
  };
}
