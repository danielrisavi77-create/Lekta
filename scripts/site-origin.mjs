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
// lektahr.netlify.app ostaje Netlify adresa koja preusmjerava na nju, pa se kao
// kanonik vise ne koristi. U produkciji netlify.toml postavlja LEKTA_SITE_ORIGIN pa je
// fallback samo sigurnosna mreza. Bez zavrsne kose crte (URL-ovi se grade kao `${SITE_ORIGIN}/put`).

export const SITE_ORIGIN = (process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr').replace(/\/+$/, '');

/** Origin koji vise nije kanonik: Netlify adresa koja nakon T49 preusmjerava na SITE_ORIGIN. */
export const RETIRED_ORIGIN = 'https://lektahr.netlify.app';
