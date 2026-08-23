#!/usr/bin/env node
// scripts/verify-deploy-dist.mjs
//
// Fail-fast provjera DEPLOY artefakta (dist/) PRIJE objave; wirano kao zadnji korak
// netlify.toml command lanca. Deploy ne moze proci ako: dev alati (setup modal, QA
// konzola) procure u HTML ili JS bundle, pravne stranice fale, ili je interna
// verifikacijska konzola zavrsila u distu. Bolje pasti na buildu nego objaviti rupu.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
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
  // Oznake statusa se provjeravaju po KLASI, ne po tekstu. Tekst je javni copy i mijenja se:
  // d22a15a je oznaku "Potpuno pokriveno" namjerno preimenovao u "Sva pravila bodovana", jer je
  // stara formulacija tvrdila vise nego sto completion ledger dokazuje. Verifikator je ostao na
  // literalu iz ebc677f (2026-08-01) i time rusio CIJELI Netlify build, iako je stranica bila
  // ispravna. Klasa je strukturna i ne mijenja se pri prepravljanju teksta.
  const TIER_CLASSES = ["tier-full", "tier-partial", "tier-advisory", "tier-none"];
  const missingTiers = TIER_CLASSES.filter((c) => !html.includes(`<dt class="${c}">`));
  if (missingTiers.length) fail(`dist/pokrivenost.html nema legendu za razine: ${missingTiers.join(", ")}`);
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
    // Datiranost se cita iz STRUKTURE i iz samog datuma, ne iz natpisa "zadnja provjera".
    // Isti razlog kao kod pokrivenost.html iznad: natpis je javni copy, pa ga prepravljanje
    // teksta rusi, a stranica je pritom posve ispravna.
    //
    // Usput je tvrdnja i stroza nego prije. Stara je trazila JEDNO pojavljivanje natpisa na
    // stranici, pa je stranica koja je tiho izgubila dio cinjenica (ili im datum) i dalje
    // prolazila. Sada se broj izvora usporedjuje s podacima, a svaki mora nositi datum.
    const html = fs.readFileSync(p, 'utf8');
    const expected = (facts[slug].facts || []).length;
    const sources = [...html.matchAll(/<span class="fact-source">([\s\S]*?)<\/span>/g)].map((m) => m[1]);
    if (sources.length !== expected) {
      fail(`dist/usporedba/${slug}/index.html ima ${sources.length} izvora, a podaci nose ${expected}`);
    }
    const undated = sources.filter((src) => !/\d{1,2}\. \d{1,2}\. \d{4}\./.test(src));
    if (undated.length) {
      fail(`dist/usporedba/${slug}/index.html ima ${undated.length} izvor(a) bez datuma provjere`);
    }
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

// CSP ALLOWLISTA (audit SEC-01, SEC-02).
//
// `connect-src` i `form-action` su do 2026-08-17 sadrzavali `https://*.supabase.co`, dakle svaki
// Supabase projekt na svijetu, uz komentar koji je tvrdio da je neocekivan odljev podataka
// tehnicki onemogucen. Ovaj gate cuva da se wildcard ne vrati i da build stvarno supstituira
// tokene: nesupstituiran token bio bi gori od wildcarda, jer bi CSP postao neispravan.
{
  const headersPath = path.join(DIST, '_headers');
  if (!fs.existsSync(headersPath)) fail('dist/_headers ne postoji (CSP se ne bi primijenio)');
  const headers = fs.readFileSync(headersPath, 'utf8');

  for (const token of ['__CSP_SUPABASE__', '__CSP_LS__']) {
    if (headers.includes(token)) fail(`dist/_headers sadrzi nesupstituiran token ${token} (cspAllowlist plugin nije odradio)`);
  }

  const csp = (headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m) || [])[1] ?? '';
  if (!csp) fail('dist/_headers nema Content-Security-Policy');

  const directive = (name) => (csp.match(new RegExp(`${name} ([^;]*)`)) || [])[1] ?? '';
  for (const name of ['connect-src', 'form-action']) {
    const value = directive(name);
    if (!value) fail(`CSP nema direktivu ${name}`);
    if (/https:\/\/\*\./.test(value)) fail(`CSP ${name} sadrzi wildcard host: "${value.trim()}"`);
    if (!/https:\/\/[a-z0-9-]+\.supabase\.co/.test(value)) {
      fail(`CSP ${name} nema konkretan Supabase origin: "${value.trim()}"`);
    }
  }
}

// DOKAZ O IZVEDENIM RAZINAMA PROVJERE (audit P0-13, P0-12).
//
// `npm run check` je samo Tier 0: ne otvara dokument nijednim stvarnim uredivacem. Tier 1
// (python-docx) i Tier 2 (pravi Word) postoje kao skripte, ali su se pokretali rucno i odvojeno,
// pa se za konkretan commit nije moglo reci JESU LI uopce izvedeni. `npm run release:check` vrti
// sve razine i ostavlja potpisan trag; ovdje se taj trag provjerava.
//
// Gate je vezan uz `LEKTA_REQUIRE_RELEASE_PROOF=1`, a ne ukljucen bezuvjetno, jer bi inace prvi
// sljedeci deploy pao dok vlasnik ne odvrti visesatni lanac. Kad ga jednom odvrti, postavi
// zastavicu i dokaz postaje obavezan.
{
  /**
   * Je li dokaz zastario u odnosu na ono sto se gradi.
   *
   * Ne moze se samo usporediti `proof.commit !== HEAD`, jer je sam dokaz datoteka u repozitoriju:
   * cim ga commitas, HEAD se pomakne i dokaz bi UVIJEK ispao zastario, pa bi gate bio neupotrebljiv
   * (klasican problem koke i jajeta). Zato se gleda STO se promijenilo: dokaz vrijedi sve dok se
   * izmedju njegovog commita i HEAD-a nije promijenilo nista osim samog dokaza.
   *
   * Kad se povijest ne moze procitati (plitak clone na CI-ju), radije se NE tvrdi da je zastario:
   * ostale provjere (`complete`, `dirtyWorkingTree`) i dalje vrijede.
   */
  const staleAgainst = (proofCommit, headCommit) => {
    try {
      const changed = execSync(`git diff --name-only ${proofCommit} ${headCommit}`, {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      return changed.some((f) => f !== 'docs/generated/RELEASE_PROOF.json');
    } catch {
      return false;
    }
  };

  const proofPath = path.join(ROOT, 'docs', 'generated', 'RELEASE_PROOF.json');
  const required = process.env.LEKTA_REQUIRE_RELEASE_PROOF === '1';
  const complain = (msg) => {
    if (required) fail(`dokaz o provjerama: ${msg}`);
    console.warn(`[verify-deploy-dist] UPOZORENJE: dokaz o provjerama: ${msg}`);
    console.warn('  Pokreni `npm run release:check`, pa postavi LEKTA_REQUIRE_RELEASE_PROOF=1 da gate postane tvrd.');
  };

  let head = process.env.COMMIT_REF || '';
  if (!head) {
    try {
      head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      head = '';
    }
  }

  if (!fs.existsSync(proofPath)) {
    complain('docs/generated/RELEASE_PROOF.json ne postoji');
  } else {
    let proof = null;
    try {
      proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    } catch {
      complain('RELEASE_PROOF.json nije valjan JSON');
    }
    if (proof) {
      if (!proof.complete) {
        const missing = Array.isArray(proof.missingRequired) ? proof.missingRequired.join(', ') : '?';
        complain(`nije potpun, bez prolaza ostaju: ${missing}`);
      } else if (head && proof.commit && proof.commit !== head && staleAgainst(proof.commit, head)) {
        // Zastario dokaz je opasniji od nikakvog: izgleda kao potvrda za kod koji nije provjeren.
        complain(`vezan je uz commit ${String(proof.commit).slice(0, 12)}, a gradi se ${head.slice(0, 12)}`);
      } else if (proof.dirtyWorkingTree) {
        complain('nastao je nad NECISTIM radnim stablom, pa ne pokriva sve sto se gradi');
      } else {
        console.log(`[verify-deploy-dist] dokaz o provjerama OK (commit ${String(proof.commit).slice(0, 12)}).`);
      }
    }
  }
}

// PRAVNI IDENTITET PRUZATELJA (audit A26-01, LEG-01/02/03).
//
// `data/legal/provider.json` je jedino mjesto s identitetom trgovca i voditelja obrade.
// Dok je prazan, `legal-content.ts` ga tise ispusta (renderira napomenu "bit ce objavljeni"),
// pa se prazno stanje moze deployati a da nitko ne primijeti.
//
// DVA ODVOJENA PRAGA, jer ih pokrecu dva razlicita zakona i okidaju se u razlicitim trenucima:
//
//   1. OBRADA (GDPR cl. 13). Okida se cim dokument NAPUSTI preglednik, ne kad se naplati.
//      Besplatna analiza je 100% lokalna pa ondje prazan identitet jos prolazi. Besplatna beta
//      popravka NE prolazi: `GO_LIVE_REPAIR.md` je izrijekom zove "privatnosni zaokret" jer se
//      dokument uploada i pohranjuje, a rad nosi ime studenta, fakultet i temu. Ispitanik tada
//      ima pravo znati TKO je voditelj obrade i kome uputiti zahtjev za brisanjem. Po vlastitoj
//      napomeni u `legal-content.ts` "Lekta" je naziv usluge, a ne pravni subjekt, pa protiv
//      njega nema kome uputiti zahtjev. Besplatno ne znaci bez voditelja obrade.
//
//   2. NAPLATA (ZZP, predugovorne informacije). Trazi sve iz praga obrade, plus identifikaciju
//      TRGOVCA: OIB i telefon.
//
// Zato gate nije bezuvjetan nego vezan uz zastavice koje se postave tek kad to doista ide live:
// `LEKTA_REPAIR_LIVE=1` za betu popravka, `LEKTA_COMMERCE_LIVE=1` za naplatu (naplata
// podrazumijeva obradu pa ukljucuje i prvi prag). Bez ijedne je nalaz glasno upozorenje.
{
  const providerPath = path.join(ROOT, 'data', 'legal', 'provider.json');
  const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));

  // Prag 1: dokument napusta preglednik (GDPR cl. 13, identitet i sjediste voditelja obrade).
  const REQUIRED_FOR_PROCESSING = {
    privacyController: 'voditelj obrade (GDPR cl. 13): tko pravno odredjuje svrhe i sredstva obrade',
    address: 'sjediste pravnog subjekta',
  };
  // Prag 2: naplata (sve iz praga obrade + identifikacija trgovca po ZZP-u).
  const REQUIRED_FOR_COMMERCE = {
    ...REQUIRED_FOR_PROCESSING,
    oib: 'OIB pravnog subjekta (identifikacija trgovca)',
    phone: 'telefonski broj trgovca (predugovorna informacija, ZZP)',
  };

  const missingFrom = (required) =>
    Object.entries(required)
      .filter(([field]) => !String(provider[field] ?? '').trim())
      .map(([field, why]) => `  - ${field} (${why})`);

  // OBA praga se izvode iz ONOGA STO SE ISPORUCUJE, ne iz zapamcenih zastavica: LEKTA_REPAIR_LIVE
  // i LEKTA_COMMERCE_LIVE ne postavlja nista u lancu deploya (netlify.toml ima samo NODE_VERSION,
  // DEPLOY i LEKTA_SITE_ORIGIN), pa je gate koji visi samo o njima inertan tocno u stanju za koje
  // je pisan. Detekcija i obrazlozenje zive u zasebnom modulu jer se tako mogu testirati
  // sintetickim bundleom: pravi dist danas ima naplatu UGASENU, pa bi se nad njim mogao dokazati
  // samo negativan smjer (vidi tests/deploy-gate-shipped-config.test.ts).
  const { shippedCapabilities } = await import('./deploy-gate-shipped-config.mjs');
  const shipped = shippedCapabilities(
    assets.map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')),
  );
  const commerceLive = process.env.LEKTA_COMMERCE_LIVE === '1' || shipped.commerce;
  const commerceWhy = shipped.why.commerce ?? 'LEKTA_COMMERCE_LIVE=1';
  const repairLive = process.env.LEKTA_REPAIR_LIVE === '1' || shipped.repair;
  const repairWhy = shipped.why.repair ?? 'LEKTA_REPAIR_LIVE=1';
  const missingForProcessing = missingFrom(REQUIRED_FOR_PROCESSING);
  const missingForCommerce = missingFrom(REQUIRED_FOR_COMMERCE);

  if (commerceLive && missingForCommerce.length) {
    fail(
      [`naplata je ZIVA (${commerceWhy}), a data/legal/provider.json nema:`, ...missingForCommerce].join(os.EOL),
    );
  }
  // I bez naplate: cim se dokument uploada i pohranjuje, voditelj obrade mora biti imenovan.
  if (repairLive && missingForProcessing.length) {
    fail(
      [
        `popravak je ZIV (${repairWhy}), dakle dokument se uploada i pohranjuje,`,
        'a data/legal/provider.json nema:',
        ...missingForProcessing,
        '  Besplatna beta ne oslobadja od GDPR cl. 13: ispitanik mora znati tko je voditelj obrade.',
      ].join(os.EOL),
    );
  }

  // Upozorenje o pragu NAPLATE vrijedi dok naplata nije ziva, neovisno o popravku. Prije je
  // uvjet glasio `!commerceLive && !repairLive`, pa bi cim popravak ozivi nedostajuci oib/phone
  // utihnuli sve do tvrdog pada na naplati.
  if (!commerceLive && missingForCommerce.length) {
    console.warn(
      [
        '[verify-deploy-dist] UPOZORENJE: data/legal/provider.json nema:',
        ...missingForCommerce,
        '  Besplatna LOKALNA analiza time nije blokirana (nista ne napusta preglednik).',
        `  Popravak se NE SMIJE upaliti dok nedostaje ijedno polje praga obrade (sada ih nedostaje ${missingForProcessing.length}).`,
        '  Kad se popune, postavi LEKTA_REPAIR_LIVE=1 (beta popravka) ili LEKTA_COMMERCE_LIVE=1 (naplata) da gate postane tvrd.',
      ].join(os.EOL),
    );
  }
}

console.log(`[verify-deploy-dist] OK: bez dev alata u HTML/JS, pravne stranice prisutne, konzola iskljucena, origin unutar ${SITE_ORIGIN}, svi inline <script> pokriveni CSP whitelistom, citatne SEO stranice imaju OG/Twitter/favicon i noindex/sitemap su konzistentni, /fakulteti hub pokriva sve jedinice s ispravnim pretraga/analitika/citatni linkovima, naslovnica SEO stranice imaju OG/Twitter/favicon i sitemap je konzistentan.`);
