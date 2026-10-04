/**
 * BL-P0-01-4: origin generatora SEO stranica mora doci iz JEDNOG izvora (scripts/site-origin.mjs)
 * s fallbackom na zivu primarnu domenu (od T49 lekta.hr; prije lektahr.netlify.app). Prije
 * popravka su generate-citation-tools.mjs (lekta.hr) i generate-legal-pages.mjs (lektahr.netlify.app)
 * imali razlicit fallback, pa je build bez LEKTA_SITE_ORIGIN mogao utisnuti kanonik na krivu domenu.
 * Ovaj test reproducira taj rascjep i cuva ga zatvorenim (dio je `npm run check`, guard u
 * verify-deploy-dist.mjs radi tek na netlify deploy lancu).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard5Wired } from './helpers/seo-origin-wiring';
import { canonicalProblem, isInOrigin, PRIMARY_ORIGIN, seoOriginProblems, RETIRED_ORIGIN, rewritePublicSeo, SITE_ORIGIN } from '../scripts/site-origin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// CR se normalizira (CLAUDE.md): na Windows checkoutu su robots.txt i sitemap CRLF, a testovi traze `$` uz `m`.
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');

describe('SEO generator origin (BL-P0-01-4)', () => {
  it('dijeljeni fallback je ziva primarna domena lekta.hr (T49), nikad umirovljeni netlify origin', () => {
    // Neovisno o env-u: kanonik nikad ne smije biti stara Netlify adresa (od T49 nije kanonik).
    expect(SITE_ORIGIN).not.toBe(RETIRED_ORIGIN);
    // Bez postavljenog env-a fallback mora biti ziva primarna domena.
    if (!process.env.LEKTA_SITE_ORIGIN) {
      expect(SITE_ORIGIN).toBe('https://lekta.hr');
    }
    // Bez zavrsne kose crte (URL-ovi se grade kao `${SITE_ORIGIN}/put`).
    expect(SITE_ORIGIN.endsWith('/')).toBe(false);
    // Produkcijski build dobiva isti origin iz netlify.toml.
    expect(read('netlify.toml')).toMatch(/LEKTA_SITE_ORIGIN = "https:\/\/lekta\.hr"/);
  });

  it('oba generatora crpe origin iz dijeljenog modula, bez vlastitog fallbacka', () => {
    for (const gen of ['scripts/generate-citation-tools.mjs', 'scripts/generate-legal-pages.mjs']) {
      const src = read(gen);
      expect(src).toContain("site-origin.mjs");
      // Nema zaostalog lokalnog `LEKTA_SITE_ORIGIN || 'https://...'` fallbacka koji bi mogao driftati.
      expect(src).not.toMatch(/LEKTA_SITE_ORIGIN\s*\|\|\s*'https:/);
    }
  });

  // public/sitemap.xml i public/robots.txt su rucno odrzavani (kopiraju se u dist/ nepromijenjeni,
  // za razliku od ostatka SEO pipelinea koji ih derivira iz SITE_ORIGIN); testira se javna kopija
  // izravno (dist/ zrcali public/ 1:1 preko Vite publicDir), bez potrebe za punim buildom.
  it('public/sitemap.xml <loc> i public/robots.txt Sitemap: prate SITE_ORIGIN (dist/ ih zrcali)', () => {
    const sitemapXml = read('public/sitemap.xml');
    const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((mm) => mm[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(isInOrigin(loc, SITE_ORIGIN), loc).toBe(true);

    const robotsTxt = read('public/robots.txt');
    const sitemapLines = [...robotsTxt.matchAll(/^Sitemap:\s*(\S+)/gim)].map((mm) => mm[1]);
    expect(sitemapLines.length).toBeGreaterThan(0);
    for (const url of sitemapLines) expect(isInOrigin(url, SITE_ORIGIN), url).toBe(true);
  });

  it('isInOrigin usporedjuje origin, ne prefiks niza (Codex nalaz 7 na #273)', () => {
    expect(isInOrigin('https://lekta.hr/alati/', 'https://lekta.hr')).toBe(true);
    expect(isInOrigin('https://lekta.hr.evil.example/', 'https://lekta.hr')).toBe(false);
    expect(isInOrigin('https://lekta.hr:8443/', 'https://lekta.hr')).toBe(false);
    expect(isInOrigin('http://lekta.hr/', 'https://lekta.hr')).toBe(false);
    expect(isInOrigin('nije-url', 'https://lekta.hr')).toBe(false);
  });

  it('staging build prepisuje sitemap i robots na svoj origin i ne dopusta indeksiranje (Codex nalaz 1 na #273)', () => {
    const staging = 'https://lekta-staging.netlify.app';
    const robots = rewritePublicSeo('robots.txt', read('public/robots.txt'), staging);
    expect(robots).toMatch(/^Disallow: \/$/m);
    expect(robots).not.toMatch(/^Allow: \/$/m);
    for (const url of [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((mm) => mm[1])) {
      expect(isInOrigin(url, staging), url).toBe(true);
    }
    const sitemap = rewritePublicSeo('sitemap.xml', read('public/sitemap.xml'), staging);
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((mm) => mm[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(isInOrigin(loc, staging), loc).toBe(true);
  });

  it('gard #5 nad sintetickim artefaktom: kanonik mora biti u originu (Codex runda 2, nalaz 7)', () => {
    const html = (href: string) => `<html><head><link rel="canonical" href="${href}"></head></html>`;
    // Negativne kontrole kroz ISTU funkciju koju zove verify-deploy-dist.
    expect(canonicalProblem(html('//evil.example/'), PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem(html('https://lekta.hr.evil.example/'), PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem(html('https://lektahr.netlify.app/'), PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem(html(''), PRIMARY_ORIGIN)).toMatch(/bez href/);
    // Drugi kanonik u istom dokumentu se takodjer provjerava.
    expect(canonicalProblem(html('https://lekta.hr/') + html('//evil.example/'), PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    // Cisti slucajevi.
    expect(canonicalProblem(html('https://lekta.hr/alati/'), PRIMARY_ORIGIN)).toBeNull();
    expect(canonicalProblem(html('/alati/'), PRIMARY_ORIGIN)).toBeNull();
    expect(canonicalProblem('<html></html>', PRIMARY_ORIGIN)).toBeNull();
  });

  it('kanonik se cita kao HTML atribut: razmaci, vise rel tokena, entiteti (Codex runda 3, 7a)', () => {
    expect(canonicalProblem('<link rel = "canonical" href="//evil.example/">', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem('<link rel="canonical" href="&#x2f;&#x2f;evil.example/">', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem('<link rel="canonical" href="&#47;&#47;evil.example/">', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem('<link rel="canonical" href="&sol;&sol;evil.example/">', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem('<LINK REL="Alternate Canonical" HREF=\'//evil.example/\'>', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    expect(canonicalProblem('<link href=//evil.example/ rel=canonical>', PRIMARY_ORIGIN)).toMatch(/nije unutar/);
    // Druge link relacije nisu kanonik.
    expect(canonicalProblem('<link rel="stylesheet" href="//cdn.example/a.css">', PRIMARY_ORIGIN)).toBeNull();
    expect(canonicalProblem('<link rel = "canonical" href = "https://lekta.hr/alati/">', PRIMARY_ORIGIN)).toBeNull();
  });

  it('gard #5 kroz svoju ulaznu tocku nad sintetickim artefaktom pada, a cist artefakt prolazi (Codex runda 3, 7b)', () => {
    const cist = [
      { rel: 'index.html', text: '<link rel="canonical" href="https://lekta.hr/">' },
      { rel: 'alati/a.html', text: '<a href="/alati.html">x</a><link rel="canonical" href="https://lekta.hr/alati/a.html">' },
      { rel: 'sitemap.xml', text: '<loc>https://lekta.hr/</loc>' },
    ];
    expect(seoOriginProblems(cist, PRIMARY_ORIGIN)).toEqual([]);
    expect(seoOriginProblems([...cist, { rel: 'x.html', text: '<link rel = "canonical" href="//evil.example/">' }], PRIMARY_ORIGIN))
      .toEqual([expect.stringMatching(/^dist\/x\.html: canonical .*nije unutar/)]);
    expect(seoOriginProblems([...cist, { rel: 'y.html', text: '<a href="https://lektahr.netlify.app/">' }], PRIMARY_ORIGIN))
      .toEqual([expect.stringMatching(/umirovljeni origin/)]);
    expect(seoOriginProblems([...cist, { rel: 's.xml', text: '<loc>https://lektahr.netlify.app/</loc>' }], PRIMARY_ORIGIN))
      .toEqual([expect.stringMatching(/sitemap/)]);
    // Build kojem je SITE_ORIGIN bas stari host smije ga nositi (rucni povratak).
    expect(seoOriginProblems([{ rel: 'y.html', text: '<a href="https://lektahr.netlify.app/">' }], RETIRED_ORIGIN)).toEqual([]);
    // Svaki problem garda vodi u fail: mutacija u gate-mutations uklanja fail i mora pasti.
    expect(guard5Wired(read('scripts/verify-deploy-dist.mjs'))).toBe(true);
  });

  it('generatori: kanonik apsolutan iz SITE_ORIGIN, navigacija relativna (Codex runda 2 i 3, nalazi 2a i 2b)', () => {
    // Isti artefakt sluzi i na lekta.hr i na lektahr.netlify.app (bez 301). Apsolutna interna
    // poveznica na lekta.hr bi korisnika na starom hostu odvela s njegovog lokalnog stanja, a
    // relativan kanonik bi na starom hostu kanonizirao stari host.
    const generatori = ['generate-citation-tools.mjs', 'generate-coverage-page.mjs', 'generate-legal-pages.mjs',
      'generate-title-page-tools.mjs', 'generate-faculty-pages.mjs', 'generate-competitor-pages.mjs'];
    let kanonika = 0;
    for (const g of generatori) {
      const src = read(`scripts/${g}`);
      for (const tag of src.match(/<[a-z]+\b[^>]*\bhref="[^"]*"[^>]*>/gi) ?? []) {
        const href = /\bhref="([^"]*)"/i.exec(tag)?.[1] ?? '';
        const jeKanonik = /^<link\b[^>]*\brel="canonical"/i.test(tag);
        if (jeKanonik) {
          kanonika++;
          if (href === '${canonical}') {
            // Kanonik kroz varijablu: svaka dodjela `canonical` u generatoru mora poceti s SITE_ORIGIN.
            const dodjele = [...src.matchAll(/\bcanonical\s*[=:]\s*`([^`]*)`/g)].map((m) => m[1]);
            expect(dodjele.length, `${g}: kanonik kroz varijablu bez vidljive dodjele`).toBeGreaterThan(0);
            for (const d of dodjele) expect(d, `${g}: dodjela kanonika`).toMatch(/^\$\{SITE_ORIGIN\}/);
          } else {
            expect(href, `${g}: kanonik mora biti apsolutan iz SITE_ORIGIN: ${tag}`).toMatch(/^\$\{SITE_ORIGIN\}/);
          }
        } else {
          expect(href, `${g}: navigacija ne smije biti apsolutna na SITE_ORIGIN: ${tag}`).not.toMatch(/^\$\{SITE_ORIGIN\}/);
        }
      }
      expect(src, g).not.toMatch(/ctaHtml\(`\$\{SITE_ORIGIN/);
    }
    expect(kanonika, 'generator test mora vidjeti stvarne kanonike').toBeGreaterThanOrEqual(2);
    expect(read('scripts/generate-citation-tools.mjs')).toContain("const GENERAL_TOOL_URL = '/citat.html';");
  });

  it('javni origin se prepoznaje po URL.origin, ne po nizu (Codex runda 2, nalaz 1)', () => {
    expect(rewritePublicSeo('robots.txt', read('public/robots.txt'), 'https://lekta.hr:443')).toMatch(/^Allow: \/$/m);
  });

  it('produkcijski build ne dira sitemap ni robots i ostaje indeksiran', () => {
    for (const name of ['robots.txt', 'sitemap.xml']) {
      const src = read(`public/${name}`);
      expect(rewritePublicSeo(name, src, PRIMARY_ORIGIN)).toBe(src);
    }
    expect(rewritePublicSeo('robots.txt', read('public/robots.txt'), RETIRED_ORIGIN)).toMatch(/^Allow: \/$/m);
  });
});
