import fs from 'node:fs';
import path from 'node:path';
import { isInOrigin } from './site-origin.mjs';

function xmlText(value) {
  return value.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function groups(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi'))].map((match) => match[1]);
}

function locations(xml) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)].map((match) => xmlText(match[1]));
}

function localFileForUrl(value, distRoot, siteOrigin, label, problems) {
  if (!isInOrigin(value, siteOrigin)) {
    problems.push(`${label} <loc>${value}</loc> nije unutar ${siteOrigin}`);
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${label} sadrži neispravan URL: ${value}`);
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    problems.push(`${label} URL mora biti kanonički i bez vjerodajnica, upita ili fragmenta: ${value}`);
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    problems.push(`${label} sadrži neispravno URL kodiranje: ${value}`);
    return null;
  }
  const segments = decodedPath.split('/').filter(Boolean);
  if (decodedPath.includes('\\') || decodedPath.includes('\0') || decodedPath.includes('//') || segments.some((part) => part === '.' || part === '..' || part.includes(':'))) {
    problems.push(`${label} sadrži nesigurnu putanju: ${value}`);
    return null;
  }

  const relativePath = decodedPath.endsWith('/') || !segments.length
    ? path.join(...segments, 'index.html')
    : path.join(...segments);
  const filePath = path.resolve(distRoot, relativePath);
  const relativeToDist = path.relative(distRoot, filePath);
  if (relativeToDist === '..' || relativeToDist.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToDist)) {
    problems.push(`${label} izlazi izvan dist/: ${value}`);
    return null;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    problems.push(`${label} navodi ${value}, ali dist/${relativeToDist} ne postoji`);
    return null;
  }
  return filePath;
}

/** Provjerava da sitemap indeks vodi do postojećih URLsetova i statičkih stranica u dist/. */
export function sitemapDistProblems(distRoot, siteOrigin, indexName = 'sitemap.xml') {
  const problems = [];
  const indexPath = path.join(distRoot, indexName);
  if (!fs.existsSync(indexPath)) return [`dist/${indexName} ne postoji`];

  const indexXml = fs.readFileSync(indexPath, 'utf8');
  if (!/<sitemapindex\b[^>]*>[\s\S]*<\/sitemapindex\s*>/i.test(indexXml)) {
    return [`dist/${indexName} mora biti valjan sitemap indeks`];
  }

  const sitemapEntries = groups(indexXml, 'sitemap');
  if (!sitemapEntries.length) problems.push(`dist/${indexName} nema sitemap unosa`);
  const seenSitemaps = new Set();
  for (const entry of sitemapEntries) {
    const sitemapLocs = locations(entry);
    if (sitemapLocs.length !== 1) {
      problems.push(`dist/${indexName} sitemap unos mora imati točno jedan <loc>`);
      continue;
    }
    const [sitemapUrl] = sitemapLocs;
    const sitemapPath = localFileForUrl(sitemapUrl, distRoot, siteOrigin, `dist/${indexName}`, problems);
    if (!sitemapPath) continue;
    if (seenSitemaps.has(sitemapPath)) {
      problems.push(`dist/${indexName} dvaput navodi ${sitemapUrl}`);
      continue;
    }
    seenSitemaps.add(sitemapPath);

    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const label = `dist/${path.relative(distRoot, sitemapPath).split(path.sep).join('/')}`;
    if (!/<urlset\b[^>]*>[\s\S]*<\/urlset\s*>/i.test(sitemapXml)) {
      problems.push(`${label} mora biti sitemap URLset`);
      continue;
    }
    const urlEntries = groups(sitemapXml, 'url');
    if (!urlEntries.length) problems.push(`${label} nema URL unosa`);
    for (const urlEntry of urlEntries) {
      const pageLocs = locations(urlEntry);
      if (pageLocs.length !== 1) {
        problems.push(`${label} URL unos mora imati točno jedan <loc>`);
        continue;
      }
      const [pageUrl] = pageLocs;
      localFileForUrl(pageUrl, distRoot, siteOrigin, label, problems);
    }
  }
  return problems;
}
