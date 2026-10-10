/**
 * Zastavica prijave Googleom (T102), bez ovisnosti, da je app.ts moze citati sinkrono a da u
 * glavni bundle ne povuce auth modul (google-oauth.ts i session.ts ostaju lijeno ucitani).
 *
 * Ukljucena je samo izricitim `true` ili `1`. Sve ostalo, ukljucujuci odsutnu i praznu
 * vrijednost, znaci iskljuceno: bez zastavice gumb se ne renderira i povratak se ne obraduje.
 */
type Env = Record<string, unknown>;

export function googleAuthEnabled(env: Env = import.meta.env as unknown as Env): boolean {
  const raw = String(env.VITE_AUTH_GOOGLE_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}
