// Jedna provjera javne adrese izvora pravila za aplikaciju (finding-view-model) i staticne
// stranice fakulteta (scripts/generate-faculty-pages.mjs). Cisti JS jer generator na CI-ju
// vrti Node 20, koji ne uvozi .ts; tip je u source-url.d.mts.

/**
 * Vraca adresu ako je to jedna apsolutna http(s) adresa bez razmaka i bez vjerodajnica,
 * inace null. Razmak znaci da je uz adresu upisana proza ("https://x.hr (opis)"), a takav
 * niz nije poveznica na dokument nego tekst.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function publicSourceUrl(raw) {
  if (typeof raw !== 'string' || raw === '' || /\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return raw;
  } catch {
    return null;
  }
}
