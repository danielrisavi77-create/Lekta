// Jedna provjera javne adrese izvora pravila za aplikaciju (finding-view-model) i staticne
// stranice fakulteta (scripts/generate-faculty-pages.mjs). Cisti JS jer generator na CI-ju
// vrti Node 20, koji ne uvozi .ts; tip je u source-url.d.mts.

/**
 * Vraca adresu ako je to jedna apsolutna http(s) adresa DOKUMENTA, inace null:
 * - razmak znaci da je uz adresu upisana proza ("https://x.hr/a.pdf (opis)"), a to nije poveznica;
 * - vjerodajnice u adresi se ne objavljuju;
 * - gola domena (putanja `/` bez upita) vodi na naslovnicu, ne na dokument, pa izvor prikazujemo
 *   kao nedostupan umjesto da korisnika saljemo na pogresnu stranicu (#238, Codex N1). Adresa
 *   stranice s upitom (`/?page_id=17`) jest lokator dokumenta.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function publicSourceUrl(raw) {
  if (typeof raw !== 'string' || raw === '' || /\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    if (url.pathname === '/' && !url.search) return null;
    return raw;
  } catch {
    return null;
  }
}
