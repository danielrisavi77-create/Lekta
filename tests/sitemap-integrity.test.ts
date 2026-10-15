// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapDistProblems } from '../scripts/sitemap-integrity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDists: string[] = [];

function makeDist(files: Record<string, string>): string {
  const temporaryDist = mkdtempSync(path.join(os.tmpdir(), 'lekta-sitemap-'));
  temporaryDists.push(temporaryDist);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(temporaryDist, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
  return temporaryDist;
}

afterEach(() => {
  for (const temporaryDist of temporaryDists.splice(0)) rmSync(temporaryDist, { recursive: true, force: true });
});

describe('sitemap dist integrity', () => {
  it('homepage indeks povezuje sve sitemapove koji se generiraju za produkciju', async () => {
    const { readFileSync } = await import('node:fs');
    const xml = readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(urls.map((url) => new URL(url).pathname)).toEqual([
      '/sitemap-pages.xml',
      '/alati/sitemap-alati.xml',
      '/alati/sitemap-naslovnica.xml',
      '/sitemap-fakulteti.xml',
      '/sitemap-usporedba.xml',
    ]);
  });

  it('prihvaća indeks i rute koje postoje u lokalnom buildu', () => {
    const dist = makeDist({
      'sitemap.xml': '<sitemapindex><sitemap><loc>https://lekta.hr/sitemap-pages.xml</loc></sitemap></sitemapindex>',
      'sitemap-pages.xml': '<urlset><url><loc>https://lekta.hr/</loc></url><url><loc>https://lekta.hr/pravila.html</loc></url></urlset>',
      'index.html': '<html></html>',
      'pravila.html': '<html></html>',
    });
    expect(sitemapDistProblems(dist, 'https://lekta.hr')).toEqual([]);
  });

  it('odbija nepostojeći URLset, putanju izvan dista i nedostajuću stranicu', () => {
    const dist = makeDist({
      'sitemap.xml': '<sitemapindex><sitemap><loc>https://lekta.hr/missing.xml</loc></sitemap><sitemap><loc>https://lekta.hr/%5c..%5cprivate.xml</loc></sitemap></sitemapindex>',
    });
    expect(sitemapDistProblems(dist, 'https://lekta.hr')).toEqual([
      expect.stringContaining('dist/sitemap.xml navodi https://lekta.hr/missing.xml'),
      expect.stringContaining('sadrži nesigurnu putanju'),
    ]);

    const missingPageDist = makeDist({
      'sitemap.xml': '<sitemapindex><sitemap><loc>https://lekta.hr/sitemap-pages.xml</loc></sitemap></sitemapindex>',
      'sitemap-pages.xml': '<urlset><url><loc>https://lekta.hr/not-built.html</loc></url></urlset>',
    });
    expect(sitemapDistProblems(missingPageDist, 'https://lekta.hr')).toEqual([
      expect.stringContaining('not-built.html ne postoji'),
    ]);
  });
});
