/**
 * CITANJE STVARNOG STANJA PRIKAZA (Z6, popravak nakon pregleda).
 *
 * Modul je NAMJERNO bez ijednog uvoza, pa i bez CSS-a: cita ga i panel "Prilagodi prikaz"
 * (`display-settings.ts`), i dijeljeni boot (`ui-boot.ts`), i ljuska ruta (`route-shell.ts`), i
 * ulazna sekvenca (`routes/intake/intake-motion.ts`). Da nosi stil, uvoz u ljusku bi joj ubacio
 * panelov CSS, sto `tests/route-shell-budget.test.ts` s pravom odbija.
 *
 * POSTOJI ZBOG DVIJU RUPA KOJE SU BILE ISTI RAZRED KVARA: kod je pitao ATRIBUT, a trebao je pitati
 * STANJE. Atribut je samo jedan od dva izvora stanja, i to onaj koji u nacinu "kao sustav" i uz
 * ugasenu postavku pokreta UOPCE NE POSTOJI.
 *
 *   tema    `data-theme` odsutan znaci "kao sustav", dakle odlucuje `prefers-color-scheme`.
 *           Citanje samo atributa je tvrdilo TAMNO i kad je ekran svijetao, pa je lampa dobivala
 *           krivo `aria-pressed`, a prvi klik vodio u vrijednost koja se od zatecene ne razlikuje.
 *   pokret  `data-motion="reduce"` je RUCNI izbor uz sustavni `prefers-reduced-motion`. Tko je
 *           pita samo jedno od to dvoje, gasi pola pokreta.
 */

/** Zadano proizvoda je radna lampa, pa preglednik bez `matchMedia` dobiva TAMNO. */
const BEZ_MATCH_MEDIA_TAMNO = true;

function upit(doc: Document, upitniNiz: string, zadano: boolean): boolean {
  const prozor = doc.defaultView;
  if (!prozor || typeof prozor.matchMedia !== 'function') return zadano;
  try {
    return prozor.matchMedia(upitniNiz).matches;
  } catch {
    // Stariji preglednik zna baciti na upit koji ne poznaje; nepoznat upit nije izbor korisnika.
    return zadano;
  }
}

/** Sustavna preferencija teme. Vrijedi SAMO kad `data-theme` nije postavljen. */
export function sustavPreferiraTamno(doc: Document): boolean {
  return upit(doc, '(prefers-color-scheme: dark)', BEZ_MATCH_MEDIA_TAMNO);
}

/**
 * Je li na ekranu TAMNA tema, bez obzira na to odakle dolazi.
 *
 * Ovo je jedini ispravan ulaz za lampu: i za `aria-pressed`, i za natpis, i za odluku kamo vodi
 * sljedeci klik. Preklopnik koji ne zna sto je na ekranu ne moze voditi u suprotno.
 */
export function tamnoNaEkranu(doc: Document): boolean {
  const tema = doc.documentElement.dataset.theme;
  if (tema === 'light') return false;
  if (tema === 'dark') return true;
  return sustavPreferiraTamno(doc);
}

/** Tema u koju vodi sljedeci klik lampe: uvijek suprotna od onoga sto korisnik vidi. */
export function suprotnaTema(doc: Document): 'dark' | 'light' {
  return tamnoNaEkranu(doc) ? 'light' : 'dark';
}

/**
 * Je li pokret prigusen, rucno ili sustavno.
 *
 * `data-motion="reduce"` u CSS-u gasi `animation` i `transition`, ali Web Animations API
 * (`element.animate()`) ne ovisi ni o jednom od ta dva svojstva, pa ga CSS ne moze zaustaviti.
 * Svaka WAAPI sekvenca mora pitati OVU funkciju prije nego sto pozove `animate`.
 */
export function pokretPrigusen(doc: Document): boolean {
  if (doc.documentElement.dataset.motion === 'reduce') return true;
  return upit(doc, '(prefers-reduced-motion: reduce)', false);
}
