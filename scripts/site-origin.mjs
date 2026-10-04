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

/**
 * Problem s kanonikom u HTML-u, ili null. Svaki `<link rel="canonical">` se razrjesava prema
 * `siteOrigin` i mora pasti u taj origin; relativni (`/a`) je u redu, a protokol-relativni
 * (`//evil.example/`) ili tudji apsolutni nije (Codex runda 2, nalaz 7 na #273). Ovo je
 * provjera koju zove gard #5 u verify-deploy-dist, pa ga testovi vjezbaju izravno.
 *
 * @param {string} html
 * @param {string} siteOrigin
 * @returns {string | null}
 */
export function canonicalProblem(html, siteOrigin) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    // `rel` je popis tokena odvojenih razmacima, bez obzira na velika slova (Codex runda 3, 7a).
    const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('canonical')) continue;
    const href = decodeHtmlEntities(attrs.get('href') ?? '').trim();
    if (href === '') return `canonical bez href: ${tag}`;
    let resolved;
    try {
      resolved = new URL(href, `${siteOrigin}/`).href;
    } catch {
      return `canonical ${href} nije valjan URL`;
    }
    if (!isInOrigin(resolved, siteOrigin)) return `canonical ${href} nije unutar ${siteOrigin}`;
  }
  return null;
}

/**
 * Gard #5 iz verify-deploy-dist kao cista funkcija: problemi SEO origina u skupu dist datoteka.
 * HTML ne smije nositi RETIRED_ORIGIN (osim kad je build bas za njega) i svaki kanonik mora biti u
 * `siteOrigin`; XML (sitemap) ne smije nositi RETIRED_ORIGIN. verify-deploy-dist za svaki problem
 * zove `fail`, a testovi vjezbaju istu funkciju nad sintetickim artefaktom (Codex runda 3, 7b).
 *
 * @param {{ rel: string, text: string }[]} files putanje relativne na dist/ i sadrzaj
 * @param {string} siteOrigin
 * @returns {string[]}
 */
export function seoOriginProblems(files, siteOrigin) {
  const nosiStari = (text) => !isInOrigin(siteOrigin, RETIRED_ORIGIN) && /https?:\/\/lektahr\.netlify\.app\b/i.test(text);
  const problems = [];
  for (const { rel, text } of files) {
    if (rel.endsWith('.html')) {
      if (nosiStari(text)) problems.push(`dist/${rel} sadrzi umirovljeni origin ${RETIRED_ORIGIN} umjesto ${siteOrigin}`);
      const kanonik = canonicalProblem(text, siteOrigin);
      if (kanonik) problems.push(`dist/${rel}: ${kanonik}`);
    } else if (rel.endsWith('.xml') && nosiStari(text)) {
      problems.push(`dist/${rel} (sitemap) sadrzi ${RETIRED_ORIGIN}`);
    }
  }
  return problems;
}

/** Atributi jednog HTML taga: `ime = "v"`, `ime='v'`, `ime=v` i razmaci oko `=`; imena malim slovima. */
function parseAttributes(tag) {
  const out = new Map();
  const tijelo = tag.replace(/^<\s*[a-z0-9-]+/i, '').replace(/\/?>$/, '');
  for (const m of tijelo.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const ime = m[1].toLowerCase();
    if (!out.has(ime)) out.set(ime, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Dekodira brojcane (`&#47;`, `&#x2f;`) i ceste imenovane entitete kakve preglednik dekodira u atributu. */
function decodeHtmlEntities(value) {
  const IMENOVANI = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/', colon: ':', period: '.', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (cijeli, ent) => {
    if (ent[0] === '#') {
      const kod = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(kod) && kod > 0 && kod <= 0x10ffff ? String.fromCodePoint(kod) : cijeli;
    }
    return IMENOVANI[ent.toLowerCase()] ?? cijeli;
  });
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
    if (!isInOrigin(siteOrigin, origin)) out = out.replaceAll(`${origin}/`, `${siteOrigin}/`);
  }
  // Usporedba origina, ne nizova: `https://lekta.hr:443` je isti javni origin (Codex runda 2, nalaz 1).
  const javni = isInOrigin(siteOrigin, PRIMARY_ORIGIN) || isInOrigin(siteOrigin, RETIRED_ORIGIN);
  if (name === 'robots.txt' && !javni) out = out.replace(/^Allow:[ \t]*\/[ \t]*(?=\r?$)/m, 'Disallow: /');
  return out;
}
