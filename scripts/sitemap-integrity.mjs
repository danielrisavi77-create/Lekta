import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { isInOrigin } from './site-origin.mjs';

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function parseXml(xml, label) {
  const issues = [];
  let document;
  try {
    document = new DOMParser({
      onError: (level, message) => issues.push(`${level}: ${message}`),
    }).parseFromString(xml, 'application/xml');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(message);
  }

  if (issues.length || !document.documentElement || document.doctype) {
    const detail = issues.length ? `: ${issues[0]}` : '';
    return { document: null, problem: `${label} nije valjan XML${detail}` };
  }
  return { document, problem: null };
}

function childElements(node) {
  const elements = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) elements.push(child);
  }
  return elements;
}

function isSitemapElement(element, localName) {
  return element.localName === localName && element.namespaceURI === SITEMAP_NS;
}

function locationForEntry(entry) {
  const children = childElements(entry);
  const locations = children.filter((child) => child.localName === 'loc');
  if (locations.length !== 1 || !isSitemapElement(locations[0], 'loc')) {
    return { value: null, problem: 'unos mora imati točno jedan <loc>' };
  }

  const location = locations[0];
  if (childElements(location).length) {
    return { value: null, problem: '<loc> mora sadržavati samo tekst' };
  }
  const value = location.textContent.trim();
  if (!value) return { value: null, problem: '<loc> ne smije biti prazan' };
  return { value, problem: null };
}

function rootEntries(document, rootName, entryName, label) {
  const root = document.documentElement;
  if (!isSitemapElement(root, rootName)) {
    return { entries: [], problem: `${label} mora biti sitemap ${rootName === 'sitemapindex' ? 'indeks' : 'URLset'}` };
  }

  const entries = childElements(root);
  if (entries.some((entry) => !isSitemapElement(entry, entryName))) {
    return { entries: [], problem: `${label} sadrži nevaljan <${entryName}> element` };
  }
  return { entries, problem: null };
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

/** Provjerava sitemap XML, lokalne URLsetove i statičke stranice u dist/. */
export function sitemapDistProblems(distRoot, siteOrigin, indexName = 'sitemap.xml') {
  const problems = [];
  const indexPath = path.join(distRoot, indexName);
  if (!fs.existsSync(indexPath)) return [`dist/${indexName} ne postoji`];

  const indexXml = fs.readFileSync(indexPath, 'utf8');
  const parsedIndex = parseXml(indexXml, `dist/${indexName}`);
  if (!parsedIndex.document) return [parsedIndex.problem];

  const index = rootEntries(parsedIndex.document, 'sitemapindex', 'sitemap', `dist/${indexName}`);
  if (index.problem) return [index.problem];
  if (!index.entries.length) problems.push(`dist/${indexName} nema sitemap unosa`);

  const seenSitemaps = new Set();
  for (const entry of index.entries) {
    const sitemapLocation = locationForEntry(entry);
    if (sitemapLocation.problem) {
      problems.push(`dist/${indexName} sitemap ${sitemapLocation.problem}`);
      continue;
    }
    const sitemapPath = localFileForUrl(sitemapLocation.value, distRoot, siteOrigin, `dist/${indexName}`, problems);
    if (!sitemapPath) continue;
    if (seenSitemaps.has(sitemapPath)) {
      problems.push(`dist/${indexName} dvaput navodi ${sitemapLocation.value}`);
      continue;
    }
    seenSitemaps.add(sitemapPath);

    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const label = `dist/${path.relative(distRoot, sitemapPath).split(path.sep).join('/')}`;
    const parsedSitemap = parseXml(sitemapXml, label);
    if (!parsedSitemap.document) {
      problems.push(parsedSitemap.problem);
      continue;
    }
    const urlset = rootEntries(parsedSitemap.document, 'urlset', 'url', label);
    if (urlset.problem) {
      problems.push(urlset.problem);
      continue;
    }
    if (!urlset.entries.length) problems.push(`${label} nema URL unosa`);
    for (const urlEntry of urlset.entries) {
      const pageLocation = locationForEntry(urlEntry);
      if (pageLocation.problem) {
        problems.push(`${label} URL ${pageLocation.problem}`);
        continue;
      }
      localFileForUrl(pageLocation.value, distRoot, siteOrigin, label, problems);
    }
  }
  return problems;
}
