// src/shared/skip-link.ts
//
// Pristupacnost (WCAG 2.4.1 Bypass Blocks, razina A): "Preskoci na sadrzaj" kao prvi
// fokusabilni element svake stranice, pa korisnik tipkovnice ili citaca zaslona preskace
// 6 do 8 navigacijskih poveznica ravno do glavnog sadrzaja. Injektira se iz zajednickog
// ui-boot.ts (jedan izvor za sve stranice) umjesto rucnog dodavanja u svaki HTML: svaka
// stranica vec ima <main>, pa je meta pouzdana bez diranja markupa. Cista DOM logika bez
// bocnih efekata na uvoz, da je testabilna u izolaciji (stil je u ./skip-link.css).

/**
 * Prepend a visually-hidden-until-focused skip link that moves focus to <main>.
 * Idempotentno: ako link vec postoji, ne dodaje drugi. Vraca kreirani element ili null
 * (kad na stranici nema <main>).
 */
export function setupSkipLink(doc: Document = document): HTMLAnchorElement | null {
  const main = doc.querySelector('main');
  if (!main) return null;
  // Reuse postojeceg id-a (index ima <main id="top">), inace stabilan fallback.
  if (!main.id) main.id = 'glavni-sadrzaj';
  // Programski fokusabilan bez ulaska u tab red.
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  const existing = doc.querySelector<HTMLAnchorElement>('a.skip-link');
  if (existing) return existing;

  const link = doc.createElement('a');
  link.className = 'skip-link';
  link.href = `#${main.id}`;
  link.textContent = 'Preskoči na sadržaj';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    // href sam pomice viewport, ali fokus mora eksplicitno na <main> (inace ostaje na linku).
    main.focus();
    if (typeof main.scrollIntoView === 'function') main.scrollIntoView();
    try { history.replaceState(null, '', `#${main.id}`); } catch { /* history odbijen */ }
  });
  if (doc.body) doc.body.insertBefore(link, doc.body.firstChild);
  return link;
}
