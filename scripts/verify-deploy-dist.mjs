#!/usr/bin/env node
// scripts/verify-deploy-dist.mjs
//
// Fail-fast provjera DEPLOY artefakta (dist/) PRIJE objave; wirano kao zadnji korak
// netlify.toml command lanca. Deploy ne moze proci ako: dev alati (setup modal, QA
// konzola) procure u HTML ili JS bundle, pravne stranice fale, ili je interna
// verifikacijska konzola zavrsila u distu. Bolje pasti na buildu nego objaviti rupu.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from './site-origin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const fail = (msg) => { console.error(`[verify-deploy-dist] FAIL: ${msg}`); process.exit(1); };

if (!fs.existsSync(DIST)) fail('dist/ ne postoji');

// 1. index.html bez dev alata
const index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const banned of ['setupModal', 'qaModal', 'qaBtn', 'Produkcijska konfiguracija', 'QA konzola']) {
  if (index.includes(banned)) fail(`dist/index.html sadrzi "${banned}" (dev-only strip nije odradio)`);
}

// 2. JS bundle bez setup/QA koda (tree-shake pod __DEV_TOOLS__=false)
const assets = fs.existsSync(path.join(DIST, 'assets'))
  ? fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
  : [];
if (!assets.length) fail('dist/assets nema JS datoteka');
for (const f of assets) {
  const js = fs.readFileSync(path.join(DIST, 'assets', f), 'utf8');
  for (const banned of ['setupModal', 'qaModal', 'Produkcijska konfiguracija', 'downloadManifest', 'setupReportToken']) {
    if (js.includes(banned)) fail(`dist/assets/${f} sadrzi "${banned}" (JS nije tree-shakean)`);
  }
}

// 3. pravne stranice postoje i sadrze ocekivane markere
const legalChecks = [
  ['privatnost.html', 'AZOP'],
  ['garancija.html', '5 radnih dana'],
  ['obrada-dokumenata.html', 'Lokalna analiza'],
  ['kolacici.html', 'localStorage'],
  ['uvjeti-koristenja.html', 'Predmet usluge'],
  ['pravila-povrata.html', 'Merchant of Record'],
  ['odricanje-od-odgovornosti.html', 'heuristička'],
];
for (const [file, marker] of legalChecks) {
  const p = path.join(DIST, file);
  if (!fs.existsSync(p)) fail(`dist/${file} ne postoji (generate-legal-pages nije prosao?)`);
  if (!fs.readFileSync(p, 'utf8').includes(marker)) fail(`dist/${file} ne sadrzi "${marker}"`);
}

// 3b. javna coverage stranica postoji i nije prazna (generate-coverage-page.mjs)
{
  const p = path.join(DIST, 'pokrivenost.html');
  if (!fs.existsSync(p)) fail('dist/pokrivenost.html ne postoji (generate-coverage-page nije prosao?)');
  const html = fs.readFileSync(p, 'utf8');
  if (!html.includes('Potpuno pokriveno')) fail('dist/pokrivenost.html ne sadrzi ocekivane oznake statusa');
  if (!html.includes('details class="unit"')) fail('dist/pokrivenost.html nema nijednu ustrojbenu jedinicu (prazan podatak?)');
}

// 3c. javni benchmark postoji, objavljuje stvaran rezultat, i testni docx je preuzimljiv
{
  const p = path.join(DIST, 'landing_benchmark.html');
  if (!fs.existsSync(p)) fail('dist/landing_benchmark.html ne postoji (vite.config.ts input mapa?)');
  const html = fs.readFileSync(p, 'utf8');
  if (!/\d+\/\d+/.test(html)) fail('dist/landing_benchmark.html ne sadrzi "X/N" rezultat');
  const docx = path.join(DIST, 'benchmark', 'lekta-benchmark-v1.docx');
  if (!fs.existsSync(docx)) fail('dist/benchmark/lekta-benchmark-v1.docx ne postoji (public/benchmark kopiran?)');
}

// 3d. named-competitor podstranice postoje i nose datiran izvor (generate-competitor-pages.mjs)
{
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/competitors/competitor-facts.json'), 'utf8'));
  for (const slug of Object.keys(facts)) {
    const p = path.join(DIST, 'usporedba', slug, 'index.html');
    if (!fs.existsSync(p)) fail(`dist/usporedba/${slug}/index.html ne postoji (generate-competitor-pages nije prosao?)`);
    if (!fs.readFileSync(p, 'utf8').includes('zadnja provjera')) fail(`dist/usporedba/${slug}/index.html nema datiran izvor ("zadnja provjera")`);
  }
  if (!fs.existsSync(path.join(DIST, 'sitemap-usporedba.xml'))) fail('dist/sitemap-usporedba.xml ne postoji');
}

// 4. interna verifikacijska konzola ne smije u javni build (postojeca DEPLOY invarijanta)
if (fs.existsSync(path.join(DIST, 'verification.html'))) fail('dist/verification.html postoji u DEPLOY buildu');

// 5. SEO origin: nijedan generirani artefakt ne smije nositi neregistriranu domenu lekta.hr,
//    a kanonik/og:url/loc mora biti unutar LEKTA_SITE_ORIGIN (BL-P0-01-4). Hvata build bez
//    env-a s razidenim fallbackom. `lekta.hr` (s tockom) NIJE podniz zive lektahr.netlify.app.
const WRONG_DOMAIN = /https?:\/\/lekta\.hr\b/i;
const collectFiles = (dir, ext, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
};
for (const p of collectFiles(DIST, '.html')) {
  const html = fs.readFileSync(p, 'utf8');
  const rel = path.relative(DIST, p);
  if (WRONG_DOMAIN.test(html)) fail(`dist/${rel} sadrzi neregistriranu domenu lekta.hr (origin fallback nije ujednacen)`);
  const canonicalTag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i);
  const href = canonicalTag && canonicalTag[0].match(/\bhref=["']([^"']+)["']/i);
  if (href && /^https?:\/\//i.test(href[1]) && !href[1].startsWith(SITE_ORIGIN)) {
    fail(`dist/${rel} canonical ${href[1]} nije unutar ${SITE_ORIGIN}`);
  }
}
for (const p of collectFiles(DIST, '.xml')) {
  if (WRONG_DOMAIN.test(fs.readFileSync(p, 'utf8'))) fail(`dist/${path.relative(DIST, p)} (sitemap) sadrzi lekta.hr`);
}

// 6. CSP script-src whitelist: public/_headers NEMA 'unsafe-inline' za skripte, samo par
//    sha256 hasheva. Svaki inline <script> u distu (bez src=, bez inertnog type-a poput
//    application/json ili application/ld+json koje CSP script-src uopce ne gata jer se ne
//    izvrsavaju kao skripta) MORA imati hash u toj whitelisti, inace ga preglednik u
//    produkciji tiho blokira (nema vidljive greske, samo CSP violation u konzoli) - upravo
//    ova klasa buga (generate-citation-tools.mjs je inlineao po-stranicu razlicit config).
const headersRaw = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8');
const cspLine = headersRaw.match(/Content-Security-Policy:\s*(.+)/);
if (!cspLine) fail('public/_headers nema Content-Security-Policy direktivu');
const scriptSrc = cspLine[1].match(/script-src ([^;]+)/);
if (!scriptSrc) fail('CSP nema script-src direktivu');
const allowedScriptHashes = new Set(
  [...scriptSrc[1].matchAll(/'sha256-([^']+)'/g)].map((m) => `sha256-${m[1]}`),
);
const INERT_SCRIPT_TYPES = new Set(['application/json', 'application/ld+json']);
const scriptTagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
for (const p of collectFiles(DIST, '.html')) {
  const html = fs.readFileSync(p, 'utf8');
  const rel = path.relative(DIST, p);
  scriptTagRe.lastIndex = 0;
  let m;
  while ((m = scriptTagRe.exec(html))) {
    const [, attrs, body] = m;
    if (/\bsrc=/i.test(attrs)) continue; // vanjska skripta, script-src 'self' vec pokriva
    const typeMatch = attrs.match(/\btype=["']?([^"'\s>]+)/i);
    if (typeMatch && INERT_SCRIPT_TYPES.has(typeMatch[1].toLowerCase())) continue; // ne izvrsava se
    if (!body.trim()) continue;
    const hash = `sha256-${crypto.createHash('sha256').update(body).digest('base64')}`;
    if (!allowedScriptHashes.has(hash)) {
      fail(
        `dist/${rel} sadrzi inline <script> ciji hash (${hash}) NIJE u public/_headers CSP ` +
          'script-src whitelisti - produkcijski preglednik ce ga tiho blokirati bez vidljive greske',
      );
    }
  }
}

// 7. dist/sitemap.xml i dist/robots.txt su RUCNO odrzavani staticki fajlovi (public/sitemap.xml,
//    public/robots.txt), ne generirani iz SITE_ORIGIN kao ostatak SEO pipelinea (provjera #5
//    hvata generirane kanonike/loc-ove, ali ne i ove); ako se LEKTA_SITE_ORIGIN ikad promijeni
//    (netlify.toml predvidja moguc prelazak s domene), ova dva fajla bi tiho i dalje oglasavala
//    staru domenu bez pada builda dok ostatak sitea vec prati novu.
const sitemapPath = path.join(DIST, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) fail('dist/sitemap.xml nema <loc> unosa');
  for (const loc of locs) {
    if (!loc.startsWith(SITE_ORIGIN)) fail(`dist/sitemap.xml <loc>${loc}</loc> nije unutar ${SITE_ORIGIN}`);
  }
}
const robotsPath = path.join(DIST, 'robots.txt');
if (fs.existsSync(robotsPath)) {
  const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
  const sitemapLines = [...robotsTxt.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  if (!sitemapLines.length) fail('dist/robots.txt nema Sitemap: retka');
  for (const url of sitemapLines) {
    if (!url.startsWith(SITE_ORIGIN)) fail(`dist/robots.txt "Sitemap: ${url}" nije unutar ${SITE_ORIGIN}`);
  }
}

// 8. generirane citatne SEO stranice (dist/alati/citati/*.html + brojac-kartica.html) moraju
//    imati puni OG/Twitter/favicon blok (prije ovog gate-a 0/142 ih je imalo - dijeljeni link
//    padao kao goli tekst) i genericke (bez verificiranog speca) stranice moraju biti
//    noindex, a noindex URL NIKAD u sitemap-alati.xml (crawl-budget/near-duplicate signal).
const citatiDir = path.join(DIST, 'alati/citati');
if (fs.existsSync(citatiDir)) {
  const citatiPages = fs
    .readdirSync(citatiDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(citatiDir, f));
  const brojacPath = path.join(DIST, 'alati/brojac-kartica.html');
  if (fs.existsSync(brojacPath)) citatiPages.push(brojacPath);
  if (!citatiPages.length) fail('dist/alati/citati nema HTML stranica');
  for (const p of citatiPages) {
    const html = fs.readFileSync(p, 'utf8');
    const rel = path.relative(DIST, p);
    for (const needle of ['property="og:title"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'rel="icon"', 'application/ld+json']) {
      if (!html.includes(needle)) fail(`dist/${rel} nema "${needle}" (SEO/social meta regresija u generate-citation-tools.mjs)`);
    }
  }
  const sitemapAlatiPath = path.join(DIST, 'alati/sitemap-alati.xml');
  if (fs.existsSync(sitemapAlatiPath)) {
    const sitemapAlati = fs.readFileSync(sitemapAlatiPath, 'utf8');
    // Basename SET iz <loc>, ne .includes() substring: "rgnf-harvard.html" je substring od
    // stvarno drugog fajla "rgnf-rgnf-harvard.html" (custom-spec token nazvan po fakultetu).
    const sitemapFiles = new Set(
      [...sitemapAlati.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].split('/').pop()),
    );
    for (const p of citatiPages) {
      const html = fs.readFileSync(p, 'utf8');
      const rel = path.relative(DIST, p);
      const isNoindex = /name="robots" content="noindex/.test(html);
      if (isNoindex && sitemapFiles.has(path.basename(p))) {
        fail(`dist/${rel} je noindex ali se navodi u dist/alati/sitemap-alati.xml (bespotreban crawl-budget signal)`);
      }
    }
  }
  // Hrvatski dijakritici: generate-citation-tools.mjs je nekoc pisao SVE literal stringove bez
  // c/c/z/s/dj (za razliku od index.html/app.ts), pa je greska umnozena preko ~144 generiranih
  // stranica. ASCII-fallback substringovi NIKAD ne smiju biti u dist HTML-u; ocekivane dijakriticke
  // rijeci moraju biti PRISUTNE bar negdje u korpusu (hvata regresiju, ne trazi je na svakoj stranici).
  const BANNED_ASCII = ['sluzbenim uputama', 'Brojac kartica', 'sveucilistu', 'tocno po', 'opci oblik', 'jos nemamo'];
  const offendersByNeedle = new Map();
  for (const p of citatiPages) {
    const html = fs.readFileSync(p, 'utf8');
    for (const needle of BANNED_ASCII) {
      if (!html.includes(needle)) continue;
      if (!offendersByNeedle.has(needle)) offendersByNeedle.set(needle, []);
      offendersByNeedle.get(needle).push(path.relative(DIST, p));
    }
  }
  if (offendersByNeedle.size) {
    const detail = [...offendersByNeedle.entries()].map(([needle, files]) => `"${needle}" u ${files.slice(0, 3).join(', ')}`).join('; ');
    fail(`generirane citatne stranice sadrze ASCII-fallback (bez dijakritike) tekst: ${detail}`);
  }
  const allCitatiHtml = citatiPages.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  for (const expected of ['Riječi', 'uključujući', 'Brojač', 'sveučilištu', 'službenih uputa']) {
    if (!allCitatiHtml.includes(expected)) fail(`nijedna generirana citatna stranica ne sadrzi ocekivanu dijakriticku rijec "${expected}" (dijakriticka regresija?)`);
  }
}

// 9. /fakulteti hub (generate-faculty-pages.mjs): master indeks mora spomenuti SVAKU jedinicu
//    iz kataloga (pokrivenu ILI nepokrivenu - "nijedna jedinica ne smije ostati nevidljiva"),
//    pretraga i analitika assets moraju postojati i biti referencirani, i citatni cross-link
//    (Korak 5 popravak) ne smije nikad voditi na fajl koji stvarno ne postoji u distu.
{
  const fakultetiDir = path.join(DIST, 'fakulteti');
  const masterIndexPath = path.join(fakultetiDir, 'index.html');
  if (!fs.existsSync(masterIndexPath)) fail('dist/fakulteti/index.html ne postoji (generate-faculty-pages nije prosao?)');
  const masterHtml = fs.readFileSync(masterIndexPath, 'utf8');

  // 9a. svaka jedinica iz kataloga se pojavljuje NEGDJE na master indeksu (pokrivena ili
  // nepokrivena) - jeftina "nijedna jedinica ne smije ostati nevidljiva" invarijanta.
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog/zagreb-catalog.json'), 'utf8'));
  // Generator HTML-escapea imena (escapeHtml: & < > "), pa se provjera mora raditi protiv
  // ISTOG escapeanog oblika - inace jedinice s navodnicima u imenu (npr. Sveuciliste obrane i
  // sigurnosti "Dr. Franjo Tudjman") laznо padaju jer se rucni "&quot;" nikad ne podudari sa
  // sirovim ".
  const htmlEscape = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const missingUnits = [];
  for (const inst of catalog) {
    for (const u of inst.units || []) {
      const escapedName = htmlEscape(u.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`>${escapedName}[:<]`).test(masterHtml)) missingUnits.push(`${inst.name} / ${u.name}`);
    }
  }
  if (missingUnits.length) {
    fail(`dist/fakulteti/index.html ne spominje ${missingUnits.length} katalog jedinica (npr. ${missingUnits.slice(0, 3).join('; ')})`);
  }

  // 9b. pretraga (Korak 3): asset postoji, master indeks ga referencira i ima trazilicu.
  if (!fs.existsSync(path.join(DIST, 'fakulteti-search.js'))) fail('dist/fakulteti-search.js ne postoji');
  if (!masterHtml.includes('src="/fakulteti-search.js"')) fail('dist/fakulteti/index.html ne referencira /fakulteti-search.js');
  if (!masterHtml.includes('id="fk-q"')) fail('dist/fakulteti/index.html nema #fk-q trazilicu');

  // 9c. analitika (Korak 6): asset postoji i SVAKA generirana fakultetska stranica (iz
  // sitemap-fakulteti.xml) ga referencira.
  if (!fs.existsSync(path.join(DIST, 'fakulteti-analytics.js'))) fail('dist/fakulteti-analytics.js ne postoji');
  const sitemapFakultetiPath = path.join(DIST, 'sitemap-fakulteti.xml');
  if (!fs.existsSync(sitemapFakultetiPath)) fail('dist/sitemap-fakulteti.xml ne postoji');
  const sitemapFakulteti = fs.readFileSync(sitemapFakultetiPath, 'utf8');
  const fakultetiLocs = [...sitemapFakulteti.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!fakultetiLocs.length) fail('dist/sitemap-fakulteti.xml nema <loc> unosa');

  const locToDistFile = (loc) => {
    const relUrl = loc.startsWith(SITE_ORIGIN) ? loc.slice(SITE_ORIGIN.length) : loc;
    const rel = relUrl.replace(/^\/+/, '').replace(/\/+$/, '');
    return path.join(DIST, rel, 'index.html');
  };

  for (const loc of fakultetiLocs) {
    const filePath = locToDistFile(loc);
    if (!fs.existsSync(filePath)) fail(`sitemap-fakulteti.xml navodi ${loc}, ali ${path.relative(DIST, filePath)} ne postoji`);
    const html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('src="/fakulteti-analytics.js"')) {
      fail(`dist/${path.relative(DIST, filePath)} ne referencira /fakulteti-analytics.js`);
    }
  }

  // 9d. citatni cross-link (Korak 5 popravak vec-postojece rupe): svaki /alati/citati/... link
  // nadjen na generiranoj fakultetskoj stranici MORA razrijesiti na stvaran fajl u dist/ -
  // bez pogadjanja generate-citation-tools.mjs's slugFor() logike, samo tvrd build-fail ako
  // se ipak pojavi mrtav link (postojeca rupa PRIJE ovog gate-a: ~52/130 jedinica).
  const CITATI_LINK_RE = /href="(\/alati\/citati\/[^"?#]+)"/g;
  for (const loc of fakultetiLocs) {
    const filePath = locToDistFile(loc);
    if (!fs.existsSync(filePath)) continue; // vec prijavljeno gore
    const html = fs.readFileSync(filePath, 'utf8');
    let m;
    CITATI_LINK_RE.lastIndex = 0;
    while ((m = CITATI_LINK_RE.exec(html))) {
      const target = path.join(DIST, m[1].replace(/^\/+/, ''));
      if (!fs.existsSync(target)) {
        fail(`dist/${path.relative(DIST, filePath)} linka na ${m[1]}, koji ne postoji u dist/ (mrtav citatni link)`);
      }
    }
  }
}

// 10. generirane naslovnica SEO stranice (dist/alati/naslovnica/*.html, generate-title-page-tools.mjs)
//     moraju imati puni OG/Twitter/favicon/JSON-LD blok (isti gate kao #8 za citate), svaki URL
//     iz sitemap-naslovnica.xml mora stvarno postojati u distu, i dijakritika ne smije faliti
//     (ista klasa buga kao #8 - genericki/ASCII-fallback tekst preko desetaka stranica).
const naslovnicaDir = path.join(DIST, 'alati/naslovnica');
if (fs.existsSync(naslovnicaDir)) {
  const naslovnicaPages = fs
    .readdirSync(naslovnicaDir)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => path.join(naslovnicaDir, f));
  if (!naslovnicaPages.length) fail('dist/alati/naslovnica nema pojedinacnih stranica (samo index?)');
  for (const p of naslovnicaPages) {
    const html = fs.readFileSync(p, 'utf8');
    const rel = path.relative(DIST, p);
    for (const needle of ['property="og:title"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'rel="icon"', 'application/ld+json']) {
      if (!html.includes(needle)) fail(`dist/${rel} nema "${needle}" (SEO/social meta regresija u generate-title-page-tools.mjs)`);
    }
    // Honesty-gate invarijanta: SAMO official predlosci generiraju stranicu (vidi
    // selectOfficialPages), pa nijedna od ovih stranica ne smije nikad nositi noindex.
    if (/name="robots" content="noindex/.test(html)) fail(`dist/${rel} je neocekivano noindex (honesty-gate bi trebao propustiti samo official predloske)`);
  }
  const sitemapNaslovnicaPath = path.join(DIST, 'alati/sitemap-naslovnica.xml');
  if (!fs.existsSync(sitemapNaslovnicaPath)) fail('dist/alati/sitemap-naslovnica.xml ne postoji');
  const sitemapNaslovnica = fs.readFileSync(sitemapNaslovnicaPath, 'utf8');
  const naslovnicaLocs = [...sitemapNaslovnica.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!naslovnicaLocs.length) fail('dist/alati/sitemap-naslovnica.xml nema <loc> unosa');
  for (const loc of naslovnicaLocs) {
    const relUrl = loc.startsWith(SITE_ORIGIN) ? loc.slice(SITE_ORIGIN.length) : loc;
    const filePath = path.join(DIST, relUrl.replace(/^\/+/, ''));
    if (!fs.existsSync(filePath)) fail(`sitemap-naslovnica.xml navodi ${loc}, ali ${path.relative(DIST, filePath)} ne postoji`);
  }
  const BANNED_ASCII_NASLOVNICA = ['sluzbeni', 'genericki', 'razlicit', 'potvrdjen'];
  for (const p of naslovnicaPages) {
    const html = fs.readFileSync(p, 'utf8');
    const rel = path.relative(DIST, p);
    for (const needle of BANNED_ASCII_NASLOVNICA) {
      if (html.includes(needle)) fail(`dist/${rel} sadrzi ASCII-fallback (bez dijakritike) tekst "${needle}"`);
    }
  }
  // "Službeni"/"pomoćni" dolaze iz FIKSNIH predlozaka (badge, disclaimer) na SVAKOJ pojedinacnoj
  // stranici - za razliku od "službeni"/"različit" (malim slovom), koji se pojavljuju SAMO
  // slucajno kroz varijabilni sourceNote tekst pojedinih predlozaka, pa nisu pouzdan test.
  const allNaslovnicaHtml = naslovnicaPages.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  for (const expected of ['Službeni', 'pomoćni']) {
    if (!allNaslovnicaHtml.includes(expected)) fail(`nijedna generirana naslovnica stranica ne sadrzi ocekivanu dijakriticku rijec "${expected}" (dijakriticka regresija?)`);
  }
}

console.log(`[verify-deploy-dist] OK: bez dev alata u HTML/JS, pravne stranice prisutne, konzola iskljucena, origin unutar ${SITE_ORIGIN}, svi inline <script> pokriveni CSP whitelistom, citatne SEO stranice imaju OG/Twitter/favicon i noindex/sitemap su konzistentni, /fakulteti hub pokriva sve jedinice s ispravnim pretraga/analitika/citatni linkovima, naslovnica SEO stranice imaju OG/Twitter/favicon i sitemap je konzistentan.`);
