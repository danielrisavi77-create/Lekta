// scripts/site-origin.mjs
//
// JEDAN izvor istine za javni origin build-time generatora (SEO kanonik, og:url,
// sitemap loc, CTA). Prije BL-P0-01-4 su generatori imali razlicite fallbackove
// (generate-citation-tools -> lekta.hr, generate-legal-pages -> lektahr.netlify.app),
// pa je build bez LEKTA_SITE_ORIGIN (npr. Cloudflare Pages dashboard) mogao utisnuti
// kanonik na neregistriranu domenu. Sada oba generatora (i verify-deploy-dist guard)
// citaju origin ODAVDE, pa fallback ne moze divergirati.
//
// Fallback je ZIVA primarna domena. Od T49 (registracija 4. 10. 2026.) to je lekta.hr;
// lektahr.netlify.app ostaje ziva Netlify adresa (bez preusmjeravanja, vidi DOMENA_T49.md), ali se kao
// kanonik vise ne koristi. U produkciji netlify.toml postavlja LEKTA_SITE_ORIGIN pa je
// fallback samo sigurnosna mreza. Bez zavrsne kose crte (URL-ovi se grade kao `${SITE_ORIGIN}/put`).

export const SITE_ORIGIN = (process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr').replace(/\/+$/, '');

/** Origin koji od T49 vise nije kanonik; ostaje ziv bez preusmjeravanja (docs/deploy/DOMENA_T49.md). */
export const RETIRED_ORIGIN = 'https://lektahr.netlify.app';

/**
 * Je li apsolutni URL unutar zadanog origina. Usporedjuje `URL.origin`, ne prefiks niza:
 * `https://lekta.hr.evil.example/` pocinje s `https://lekta.hr`, ali nije isti origin (Codex
 * nalaz 7 na #273). Neparsiran URL nije unutar origina.
 *
 * @param {string} url
 * @param {string} origin
 */
export function isInOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** Javna primarna domena; samo ona (i povratak na RETIRED_ORIGIN) smije biti indeksirana. */
export const PRIMARY_ORIGIN = 'https://lekta.hr';

/**
 * public/sitemap.xml i public/robots.txt nose PRIMARY_ORIGIN (ili stari token RETIRED_ORIGIN).
 * Vite ih kopira nepromijenjene, pa ih build uskladjuje sa stvarnim originom builda: staging
 * build (LEKTA_SITE_ORIGIN=https://lekta-staging.netlify.app) inace oglasava produkciju i pada
 * na gardu #7 u verify-deploy-dist. Origin koji nije javni (staging, preview) uz to dobiva
 * `Disallow: /`, da ga trazilice ne indeksiraju (Codex nalaz 1 na #273).
 *
 * @param {string} name ime datoteke u dist/ (`sitemap.xml` ili `robots.txt`)
 * @param {string} source sadrzaj
 * @param {string} siteOrigin origin builda, bez zavrsne kose crte
 * @returns {string}
 */
export function rewritePublicSeo(name, source, siteOrigin) {
  let out = source;
  for (const origin of [PRIMARY_ORIGIN, RETIRED_ORIGIN]) {
    if (origin !== siteOrigin) out = out.replaceAll(`${origin}/`, `${siteOrigin}/`);
  }
  const javni = siteOrigin === PRIMARY_ORIGIN || siteOrigin === RETIRED_ORIGIN;
  if (name === 'robots.txt' && !javni) out = out.replace(/^Allow:[ \t]*\/[ \t]*(?=\r?$)/m, 'Disallow: /');
  return out;
}
