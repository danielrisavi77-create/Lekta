#!/usr/bin/env node
/**
 * HARVEST realnih cross-style citata za KNJIGE / MONOGRAFIJE / POGLAVLJA / ZBORNIKE (rad u zborniku).
 *
 * Hrcak daje samo clanke. Za knjige/poglavlja/zbornike koristimo doi.org content negotiation
 * (nezavisni CSL procesor): isti DOI renderiran u vise stilova = cross-style ground truth BEZ
 * ljudskih oznaka, isto nacelo kao Hrcak korpus. Stilovi koje doi.org daje, a nas parser cilja:
 *   apa -> 'apa'   |   ieee -> 'ieee'   |   elsevier-vancouver -> 'vancouver'
 * (Chicago-notes oblik doi.org ne nudi; Chicago knjige/poglavlja pokriva round-trip test.)
 *
 * Diskrecija kvalitete: ukljucujemo SAMO DOI-je s dovoljno potpunim Crossref metapodacima da sva
 * tri stila renderiraju iste FIELD-ove (inace degenerirani citat = lazna odstupanja, ne bug parsera).
 *
 * Pokreni:  node scripts/harvest-doi-citations.mjs [out.json] [--dois d1,d2,...] [--limit N]
 * Zadano izlaz: tests/fixtures/citation-samples-books.json
 *
 * GRANICA (posteno): ovo je QA PARSERA (softver), NE proglasavanje pravila (koji fakultet trazi
 * koji stil ostaje ljudsko). Konsenzus je proxy: hvata strukturne lomove, ne dijeljene bugove.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const MAILTO = 'danielrisavi77@gmail.com'; // Crossref etiketa (polite pool)
const UA = `LektaCitationHarvest/1.0 (mailto:${MAILTO})`;
const CACHE = join(root, '.harvest-cache');
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const outPath = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'tests/fixtures/citation-samples-books.json'));
const doisArg = (args.find((a) => a.startsWith('--dois=')) || '').replace('--dois=', '');
const explicitDois = doisArg ? doisArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '--limit=140').replace('--limit=', '')) || 140;
// --merge: uniraj s postojecim fixtureom po DOI-ju (skaliranje je akumulativno, ne zamjena verificiranih).
const merge = args.includes('--merge');

const STYLES = { apa: 'apa', ieee: 'ieee', vancouver: 'elsevier-vancouver' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheKey = (s) => join(CACHE, s.replace(/[^a-z0-9]/gi, '_').slice(0, 180) + '.txt');

async function fetchText(url, headers = {}, { cache = true, retries = 3 } = {}) {
  const ck = cacheKey(url + JSON.stringify(headers));
  if (cache && existsSync(ck)) return readFileSync(ck, 'utf8');
  for (let i = 0; i < retries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctl.signal });
      clearTimeout(to);
      const txt = await res.text();
      if (res.ok && txt) { if (cache) writeFileSync(ck, txt); return txt; }
    } catch { /* retry */ }
    await sleep(600 * (i + 1));
  }
  return '';
}

// --- Crossref discovery (potpuni metapodaci) --------------------------------
const QUERIES = [
  // proceedings-articles (rad u zborniku / konferencija): bogat container + page
  { type: 'proceedings-article', q: 'machine learning' },
  { type: 'proceedings-article', q: 'signal processing' },
  { type: 'proceedings-article', q: 'information systems Croatia' },
  { type: 'proceedings-article', q: 'robotics control' },
  { type: 'proceedings-article', q: 'wireless networks' },
  { type: 'proceedings-article', q: 'power electronics' },
  { type: 'proceedings-article', q: 'natural language processing' },
  { type: 'proceedings-article', q: 'software engineering' },
  { type: 'proceedings-article', q: 'civil engineering structures' },
  { type: 'proceedings-article', q: 'renewable energy systems' },
  // book-chapters (poglavlje u knjizi / handbooku)
  { type: 'book-chapter', q: 'psychology handbook' },
  { type: 'book-chapter', q: 'computer vision' },
  { type: 'book-chapter', q: 'linguistics' },
  { type: 'book-chapter', q: 'public health' },
  { type: 'book-chapter', q: 'political science' },
  { type: 'book-chapter', q: 'education pedagogy' },
  { type: 'book-chapter', q: 'environmental science' },
  { type: 'book-chapter', q: 'law human rights' },
  { type: 'book-chapter', q: 'philosophy ethics' },
  { type: 'book-chapter', q: 'management organization' },
  // monografije / knjige s izdavacem (podzastupljene: vise upita)
  { type: 'monograph', q: 'economics' },
  { type: 'monograph', q: 'history' },
  { type: 'monograph', q: 'sociology' },
  { type: 'monograph', q: 'anthropology' },
  { type: 'monograph', q: 'political theory' },
  { type: 'monograph', q: 'literature criticism' },
  { type: 'book', q: 'statistics' },
  { type: 'book', q: 'mathematics analysis' },
  { type: 'book', q: 'chemistry' },
  { type: 'book', q: 'medicine physiology' },
  { type: 'book', q: 'geography' },
  // dopunski krug (raznolikost domena/izdavaca): sprijeci da svi primjeri budu isti oblik
  { type: 'proceedings-article', q: 'computer graphics' },
  { type: 'proceedings-article', q: 'data mining knowledge discovery' },
  { type: 'proceedings-article', q: 'biomedical engineering' },
  { type: 'book-chapter', q: 'sociology gender' },
  { type: 'book-chapter', q: 'economics finance' },
  { type: 'book-chapter', q: 'history medieval' },
  { type: 'book-chapter', q: 'neuroscience' },
  { type: 'monograph', q: 'religion' },
  { type: 'monograph', q: 'archaeology' },
  { type: 'monograph', q: 'musicology' },
  { type: 'book', q: 'physics quantum' },
  { type: 'book', q: 'biology ecology' },
];

function familyOf(a) { return (a && (a.family || a.name)) ? String(a.family || a.name) : ''; }
function yearOf(m) {
  const p = m.issued && m.issued['date-parts'] && m.issued['date-parts'][0];
  return p && p[0] ? String(p[0]) : '';
}
// Potpunost: sve sto sva tri stila trebaju da renderiraju iste fieldove.
// SVI autori moraju imati prezime: prazan slot (Crossref cesto ima ", ") CSL renderira razlicito
// po stilu ("[1] et al." vs ", Vishnevsky") pa daje lazna cross-style odstupanja (nije bug parsera).
function complete(m) {
  if (/^10\.5962\/bhl/i.test(String(m.DOI))) return false; // Biodiversity Heritage Library: los OCR meta (razni lead-autori po stilu)
  const authors = Array.isArray(m.author) ? m.author : [];
  const hasAuthor = authors.length >= 1 && authors.every((a) => familyOf(a).trim());
  const title = String((m.title && m.title[0]) || '');
  const container = String((m['container-title'] && m['container-title'][0]) || '');
  // Container-title == title (npr. jednopoglavljna knjiga / naslov = naziv knjige): granica
  // naslov/container je nedefinirana pa se stilovi razilaze (jedan dedu plira, drugi ne). Odbaci.
  const nrm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (container && nrm(container) === nrm(title)) return false;
  // Odbaci ambiguozne naslove: podnaslov tockom ("Glavni. Podnaslov" -> autor-godina ne zna granicu polja),
  // ugnijezdeni navodnici (lome IEEE ',"' granicu) i XML markup u naslovu ("<title>...</title>", SPIE/
  // Crossref los meta). To NISU bugovi parsera nego neodredivost/kvar izvora.
  const hasTitle = !!title && !/\.\s/.test(title) && !/["“”]/.test(title) && !/[<>]|&lt;|&gt;/.test(title);
  const hasYear = !!yearOf(m);
  if (!hasAuthor || !hasTitle || !hasYear) return false;
  if (m.type === 'proceedings-article' || m.type === 'book-chapter') {
    // container + PRAVI raspon stranica (start != end); jedna stranica ("11" ili "11-11")
    // renderira se nekonzistentno ("11" vs "11-11") i "11" je dvosmisleno (str./vol.).
    const pm = String(m.page || '').match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    return !!(m['container-title'] && m['container-title'][0]) && !!pm && pm[1] !== pm[2];
  }
  return !!m.publisher; // knjiga/monografija: barem izdavac (inace nema mjesta ni izdavaca -> degenerirano)
}

async function discover() {
  const picked = new Map(); // doi -> type
  const select = 'DOI,type,title,author,container-title,page,issued,publisher';
  for (const { type, q } of QUERIES) {
    const url = `https://api.crossref.org/works?filter=type:${type}&query=${encodeURIComponent(q)}&rows=40&select=${encodeURIComponent(select)}&mailto=${MAILTO}`;
    const txt = await fetchText(url);
    if (!txt) continue;
    let items = [];
    try { items = JSON.parse(txt).message.items || []; } catch { continue; }
    // raznolikost: uzmi po nekoliko iz svake grupe autora (1 / 2 / 3-5 / 6+)
    const byCount = { s: [], d: [], t: [], m: [] };
    for (const m of items) {
      if (!complete(m)) continue;
      const n = m.author.filter(familyOf).length;
      const b = n === 1 ? 's' : n === 2 ? 'd' : n <= 5 ? 't' : 'm';
      byCount[b].push(m);
    }
    for (const b of ['s', 'd', 't', 'm']) {
      for (const m of byCount[b].slice(0, 3)) {
        const doi = String(m.DOI).toLowerCase();
        if (!picked.has(doi)) picked.set(doi, m.type);
      }
    }
    await sleep(300);
  }
  return [...picked.entries()].map(([doi, type]) => ({ doi, type })).sort((a, b) => a.doi.localeCompare(b.doi));
}

// --- render 3 stila po DOI-ju + validacija ----------------------------------
function isError(s) { return !s || /^\s*\{"(?:code|status)"/.test(s); }
function looksDegenerate(styles) {
  for (const v of Object.values(styles)) {
    if (/^\s*(?:\[\d+\])?\s*,/.test(v)) return true;                    // prazan prvi autor (", Vishnevsky")
    if (/,\s*,/.test(v)) return true;                                    // prazan autor u sredini
    if (/^\s*(?:\[\d+\])?\s*(?:and\b|et al\.)/i.test(v)) return true;    // "[1] et al.," / "[1] and X" bez prvog
  }
  // APA "In (Editor)," / "In ( )" = nedostaje urednik u metapodacima -> nekonzistentno medu stilovima.
  if (/\bIn \(\s*(?:Editor|Ed\.?)?\s*\)\s*,/i.test(styles.apa)) return true;
  // Prazan urednik "(, Ed.)" / "( , Editor)" (Crossref editor bez imena) -> APA pusti "(, Ed.)" u naslov.
  if (/\(\s*,\s*Ed(?:itor)?s?\.?\s*\)/i.test(styles.apa)) return true;
  // XML markup u naslovu ("&lt;title&gt;...", SPIE/Crossref los meta): degeneriran naslov u svim stilovima.
  if (Object.values(styles).some((v) => /&lt;|&gt;|<\/?title>/i.test(v))) return true;
  // Naslov = naziv knjige/containera: naslov se u APA-i ponovi ("Naslov? Naslov?, str."). Granica polja
  // je nedefinirana pa se stilovi razilaze; to nije bug parsera nego neodrediv izvor.
  const apaBody = styles.apa.replace(/^.*?\(\d{4}[a-z]?\)\.\s*/, '');
  if (/^(.{15,}?)[\s,.]+\1(?![\w])/i.test(apaBody)) return true;
  // Knjiga/monografija s urednikom+platformom umjesto stranicama ("In X (Editor), Oxford Medicine Online.")
  // -> jedan stil je poglavlje, drugi knjiga; type-ambiguozno. Odbaci.
  if (/\bIn\s+[^,]+\((?:Editor|Ed\.?)\),\s+[A-Z]/.test(styles.apa) && !/,\s*\d+[-–]\d+/.test(styles.apa)) return true;
  return false;
}
function clean(s) {
  return s.replace(/\s+/g, ' ').replace(/[“”]/g, '"').trim();
}

async function harvestOne({ doi, type }) {
  const styles = {};
  for (const [key, csl] of Object.entries(STYLES)) {
    const txt = await fetchText(`https://doi.org/${doi}`, { Accept: `text/x-bibliography; style=${csl}` });
    await sleep(250);
    if (isError(txt)) return null;
    styles[key] = clean(txt);
  }
  if (looksDegenerate(styles)) return null;
  return { id: `doi-${doi.replace(/[^a-z0-9]/gi, '-')}`, type, doi, styles };
}

// --- main -------------------------------------------------------------------
// --refilter: bez mreze, ponovno primijeni looksDegenerate na SPREMLJENI fixture i izbaci degenerirane.
if (args.includes('--refilter')) {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  const kept = [], dropped = [];
  for (const a of prev.articles || []) (looksDegenerate(a.styles) ? dropped : kept).push(a);
  prev.articles = kept;
  writeFileSync(outPath, JSON.stringify(prev, null, 2) + '\n');
  console.log(`Refilter: zadrzano ${kept.length}, izbaceno ${dropped.length}`);
  dropped.forEach((a) => console.log(`  - ${a.id}`));
  process.exit(0);
}

const targets = explicitDois.length
  ? explicitDois.map((doi) => ({ doi: doi.toLowerCase(), type: 'unknown' }))
  : (await discover()).slice(0, limit);

console.log(`Kandidata: ${targets.length}`);
const articles = [];
for (const t of targets) {
  const e = await harvestOne(t);
  if (e) { articles.push(e); console.log(`  + ${e.type.padEnd(20)} ${e.doi}`); }
  else console.log(`  - preskocen (error/degenerirano) ${t.doi}`);
}

// --merge: uniraj s vec verificiranim fixtureom (dedup po DOI-ju); novi harvest samo dodaje.
let finalArticles = articles;
if (merge && existsSync(outPath)) {
  let prev = [];
  try { prev = JSON.parse(readFileSync(outPath, 'utf8')).articles || []; } catch { /* prazno */ }
  const byDoi = new Map();
  for (const a of prev) byDoi.set(String(a.doi).toLowerCase(), a);
  let added = 0;
  for (const a of articles) {
    const k = String(a.doi).toLowerCase();
    if (!byDoi.has(k)) { byDoi.set(k, a); added++; }
  }
  finalArticles = [...byDoi.values()].sort((a, b) => String(a.doi).localeCompare(String(b.doi)));
  console.log(`\nMerge: ${prev.length} postojecih + ${added} novih = ${finalArticles.length}`);
}

const corpus = {
  _note: 'Realni cross-style citati za KNJIGE/MONOGRAFIJE/POGLAVLJA/ZBORNIKE, harvestirani doi.org content negotiation (CSL). Stil->parser: apa->apa, ieee->ieee, elsevier-vancouver->vancouver. Isti DOI u vise stilova = ground truth bez ljudskih oznaka. Pipeline: scripts/harvest-doi-citations.mjs; audit: scripts/citation-parser-audit.mjs.',
  articles: finalArticles,
};
writeFileSync(outPath, JSON.stringify(corpus, null, 2) + '\n');
console.log(`\nZapisano ${finalArticles.length} clanaka -> ${outPath}`);
