// Webfontovi za SAMOSTALNE stranice (pravne stranice i 404), JEDAN izvor za generator i test.
//
// ZASTO ODVOJENO. `scripts/generate-legal-pages.mjs` se izvrsava cim se uveze (cita dist/, pise
// stranice), pa ga test ne moze uvesti. Ovdje je cisti dio: obrasci rezova, razrjesavanje imena koja
// je Vite stvarno proizveo i umetanje u 404. Generator i `tests/entry-fonts.test.ts` zovu iste
// funkcije, pa test ne mjeri kopiju.
//
// PRAZAN POGODAK JE PAD, NE ZAMJENA. Do popravka Z7(a) je nepronadjen rez tiho ispadao iz CSS-a i
// stranica je padala na metricki zamjenski glas, a build je bio zelen. Promjena imena u Vite izlazu
// (drugi `assetFileNames`, preimenovan vendorirani rez) tako bi pravne stranice i 404 ostavila bez
// ijednog glasa proizvoda bez ikakvog traga. Sada svaki obrazac mora pogoditi TOCNO jednu datoteku,
// a `problemi` nije prazan cim ne pogodi.

export const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
export const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

// Uspravni rezovi; kurziv serifa samostalne stranice ne crtaju. Latin-ext nosi hrvatsku dijakritiku
// (slova s kvacicom i crticom), pa bez njega "Tražena" crta zamjenskim glasom usred rijeci.
// Obrazac dopusta Viteov hash iza imena (`[name]-[hash][extname]`) i ime bez hasha, nista drugo.
export const WEBFONT_SUBSETS = [
  { family: 'Instrument Serif', weight: '400', pattern: /^instrument-serif-latin-400-normal(?:-[A-Za-z0-9_-]+)?\.woff2$/, unicodeRange: LATIN },
  { family: 'Instrument Serif', weight: '400', pattern: /^instrument-serif-latin-ext-400-normal(?:-[A-Za-z0-9_-]+)?\.woff2$/, unicodeRange: LATIN_EXT },
  { family: 'Geist Mono', weight: '100 900', pattern: /^geist-mono-latin-wght-normal(?:-[A-Za-z0-9_-]+)?\.woff2$/, unicodeRange: LATIN },
  { family: 'Geist Mono', weight: '100 900', pattern: /^geist-mono-latin-ext-wght-normal(?:-[A-Za-z0-9_-]+)?\.woff2$/, unicodeRange: LATIN_EXT },
];

/**
 * `@font-face` blokovi za sve rezove iz `WEBFONT_SUBSETS`, nad imenima datoteka u `dist/assets/`.
 * `problemi` imenuje svaki obrazac koji ne pogadja tocno jednu datoteku; pozivatelj tada PADA.
 */
export function webfontFaces(imena, prefiks = '/assets/') {
  const problemi = [];
  const obitelji = new Set();
  const blokovi = [];
  for (const s of WEBFONT_SUBSETS) {
    const pogoci = imena.filter((f) => s.pattern.test(f));
    if (pogoci.length !== 1) {
      problemi.push(`${s.pattern} pogadja ${pogoci.length} datoteka (${pogoci.join(', ') || 'nijednu'}), a mora tocno jednu`);
      continue;
    }
    obitelji.add(s.family);
    blokovi.push(`@font-face { font-family: "${s.family}"; font-style: normal; font-weight: ${s.weight}; font-display: swap; src: url("${prefiks}${pogoci[0]}") format("woff2"); unicode-range: ${s.unicodeRange}; }`);
  }
  return { css: blokovi.join('\n  '), obitelji, problemi };
}

/**
 * Metricki zamjenski glasovi (lokalni font sa size-adjust i override metrikama), DOSLOVNO iz
 * `src/assets/fonts/fonts.css`, da vrijednosti imaju jedan izvor. Samo uspravni rez. Nula blokova
 * je problem: znaci da se list promijenio ispod citaca, ne da zamjenskih glasova nema.
 */
export function fallbackFaces(fontsCss) {
  const blokovi = Array.from(fontsCss.matchAll(/@font-face\s*\{[^}]*\}/g), (m) => m[0])
    .filter((b) => /font-family:\s*"[^"]* Fallback[^"]*"/.test(b) && !/font-style:\s*italic/.test(b))
    .map((b) => b.replace(/\s+/g, ' '));
  const problemi = blokovi.length === 0 ? ['fonts.css ne daje nijedan uspravni zamjenski glas'] : [];
  return { css: blokovi.join('\n  '), problemi };
}

/** Oznaka u `public/404.html` na koju generator poslije `vite build` umece `@font-face` blokove. */
export const OZNAKA_404 = '/* LEKTA-WEBFONTOVI: generate-legal-pages.mjs ovdje umece @font-face */';

/** 404 s umetnutim blokovima. Oznaka mora postojati TOCNO jednom, inace je to problem, ne tiha preskocena zamjena. */
export function ubaciU404(html, fontFaces) {
  const pojava = html.split(OZNAKA_404).length - 1;
  if (pojava !== 1) return { html, problemi: [`404.html nosi oznaku webfontova ${pojava} puta, a mora tocno jednom`] };
  return { html: html.replace(OZNAKA_404, () => fontFaces), problemi: [] };
}
