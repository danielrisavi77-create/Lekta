/**
 * BL-P0-01-4: origin generatora SEO stranica mora doci iz JEDNOG izvora (scripts/site-origin.mjs)
 * s fallbackom na zivu domenu (lektahr.netlify.app), nikad na neregistriranu lekta.hr. Prije
 * popravka su generate-citation-tools.mjs (lekta.hr) i generate-legal-pages.mjs (lektahr.netlify.app)
 * imali razlicit fallback, pa je build bez LEKTA_SITE_ORIGIN mogao utisnuti kanonik na krivu domenu.
 * Ovaj test reproducira taj rascjep i cuva ga zatvorenim (dio je `npm run check`, guard u
 * verify-deploy-dist.mjs radi tek na netlify deploy lancu).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from '../scripts/site-origin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('SEO generator origin (BL-P0-01-4)', () => {
  it('dijeljeni fallback je ziva domena, nikad neregistrirana lekta.hr', () => {
    // Neovisno o env-u: origin nikad ne smije biti gola lekta.hr domena.
    expect(SITE_ORIGIN).not.toMatch(/^https?:\/\/lekta\.hr\b/i);
    // Bez postavljenog env-a fallback mora biti ziva domena.
    if (!process.env.LEKTA_SITE_ORIGIN) {
      expect(SITE_ORIGIN).toBe('https://lektahr.netlify.app');
    }
    // Bez zavrsne kose crte (URL-ovi se grade kao `${SITE_ORIGIN}/put`).
    expect(SITE_ORIGIN.endsWith('/')).toBe(false);
    // Izvor modula sadrzi zivi fallback, a NE lekta.hr literal.
    const src = read('scripts/site-origin.mjs');
    expect(src).toContain("'https://lektahr.netlify.app'");
    expect(src).not.toMatch(/'https:\/\/lekta\.hr'/);
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
    for (const loc of locs) expect(loc.startsWith(SITE_ORIGIN)).toBe(true);

    const robotsTxt = read('public/robots.txt');
    const sitemapLines = [...robotsTxt.matchAll(/^Sitemap:\s*(\S+)/gim)].map((mm) => mm[1]);
    expect(sitemapLines.length).toBeGreaterThan(0);
    for (const url of sitemapLines) expect(url.startsWith(SITE_ORIGIN)).toBe(true);
  });
});
