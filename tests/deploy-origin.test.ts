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
import { isInOrigin, PRIMARY_ORIGIN, RETIRED_ORIGIN, rewritePublicSeo, SITE_ORIGIN } from '../scripts/site-origin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

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

  it('produkcijski build ne dira sitemap ni robots i ostaje indeksiran', () => {
    for (const name of ['robots.txt', 'sitemap.xml']) {
      const src = read(`public/${name}`);
      expect(rewritePublicSeo(name, src, PRIMARY_ORIGIN)).toBe(src);
    }
    expect(rewritePublicSeo('robots.txt', read('public/robots.txt'), RETIRED_ORIGIN)).toMatch(/^Allow: \/$/m);
  });
});
