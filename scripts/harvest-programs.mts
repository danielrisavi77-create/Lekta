/**
 * Harvest sluzbenog Upisnika studijskih programa (P1-2 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 *   npx vite-node scripts/harvest-programs.mts [--out <dir>]
 *   npm run harvest-programs
 *
 * Izvor: https://hko.srce.hr/usp (MZOM; programsku podrsku odrzava Srce). Sluzbena evidencija
 * akreditiranih studijskih programa i jedini izvor koji smije popuniti `officialProgramCode`.
 *
 * Skripta NIKAD ne pise u `data/programs/program-registry.json`. Pise u `data/programs/drafts/`,
 * jer je registar autorski sloj: prijenos u njega je zaseban, ljudski korak (ista disciplina kao
 * `ruleEntries`: AI i skripte draftaju, covjek verificira).
 *
 * TRI STVARI KOJE SU SE MORALE OTKRITI MJERENJEM, ne pretpostavkom:
 *   1. Sesija je obavezna. Poziv na /usp/pretrazivanje bez kolacica sa /usp/index vraca
 *      aplikacijsku gresku, ne prazan rezultat.
 *   2. Checkbox grupe traze i svoj `_`-marker (Spring MVC obrazac): bez `_vrsta=on` i drugova
 *      pretraga puca. Prazan parametar NIJE isto sto i "sve"; sentinela je `0` (`-1` za
 *      `strucniNaziv`).
 *   3. Cijeli registar stane u JEDAN zahtjev (~1 MB, 1312 programa), pa nema potrebe ni za
 *      paginacijom ni za 1312 pojedinacnih dohvata detalja. Server se dira jednom.
 *
 * Snapshot se sprema i hashira, ali se NE commita (isto pravilo kao za PDF-ove u CLAUDE.md);
 * u draft ulazi `snapshotHash`, pa je dohvat sljediv bez nosenja 1 MB HTML-a u repozitoriju.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseUpisnikResults } from '../src/programs/upisnik-parse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hko.srce.hr/usp';
const outFlag = process.argv.indexOf('--out');
const SNAPSHOT_DIR = outFlag > -1 ? process.argv[outFlag + 1] : join(root, '.artifacts', 'upisnik');

/** Puni preglednicki headeri; bez njih hrvatski javni sustavi znaju vratiti 418/403 (CLAUDE.md). */
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Puni skup parametara pretrage. Sve checkbox grupe su ukljucene u cijelosti (uz `_`-markere), a
 * padajuci izbornici na sentinelu `0` = "sve". Time je upit doslovno "svi programi".
 */
function searchQuery(): string {
  const params = new URLSearchParams();
  params.set('naziv', '');
  for (const v of ['11', '12', '13', '14', '15', '16', '17', '18']) params.append('vrsta', v);
  params.set('_vrsta', 'on');
  params.set('strucniNazivText', '');
  params.set('strucniNaziv', '-1');
  params.set('sifraUpisnik', '');
  for (const key of ['nositelj', 'izvodac', 'vlasnistvo', 'podrucje', 'polje', 'mjesto', 'jezikIzvodenja', 'akGodIzvodenja']) {
    params.set(key, '0');
  }
  params.set('tipLokacije', '0');
  for (const v of ['K', 'O', 'M', 'D']) params.append('nacinImplementacije', v);
  params.set('_nacinImplementacije', 'on');
  for (const v of ['J', 'D']) params.append('jednopredmetni', v);
  params.set('_jednopredmetni', 'on');
  for (const v of ['R', 'I']) params.append('nacinIzvodenja', v);
  params.set('_nacinIzvodenja', 'on');
  params.set('stem', '0');
  params.set('stemStipendije', '0');
  return params.toString();
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

const indexResponse = await fetch(`${BASE}/index`, { headers: HEADERS, redirect: 'follow' });
if (!indexResponse.ok) {
  console.error(`Upisnik nije dostupan: HTTP ${indexResponse.status} na ${BASE}/index`);
  process.exit(1);
}
const cookie = cookieFrom(indexResponse);
await indexResponse.text();

const searchUrl = `${BASE}/pretrazivanje?${searchQuery()}`;
const searchResponse = await fetch(searchUrl, {
  headers: { ...HEADERS, Cookie: cookie, Referer: `${BASE}/index` },
  redirect: 'follow',
});
if (!searchResponse.ok) {
  console.error(`Pretrazivanje nije uspjelo: HTTP ${searchResponse.status}`);
  process.exit(1);
}
const html = await searchResponse.text();

// Aplikacija na neispravan upit vraca HTTP 200 sa stranicom greske, pa status NIJE dovoljan dokaz.
if (/Dogodila se pogre/i.test(html)) {
  console.error('Upisnik je vratio stranicu greske (HTTP 200). Parametri pretrage su se promijenili.');
  process.exit(1);
}

const { rows, skipped } = parseUpisnikResults(html);
if (!rows.length) {
  console.error('Odgovor je dohvacen, ali nijedan redak nije procitan. Sucelje se promijenilo?');
  process.exit(1);
}

const snapshotHash = createHash('sha256').update(html).digest('hex');
mkdirSync(SNAPSHOT_DIR, { recursive: true });
const snapshotPath = join(SNAPSHOT_DIR, `upisnik-rezultati-${snapshotHash.slice(0, 12)}.html`);
writeFileSync(snapshotPath, html, 'utf8');

// Draft je SORTIRAN i bez vremenske oznake u tijelu, pa ponovni harvest nad nepromijenjenim
// izvorom ne stvara diff; trenutak dohvata zivi uz hash, ne uz svaki redak.
const draft = {
  source: {
    name: 'Upisnik studijskih programa',
    url: `${BASE}/index`,
    publisher: 'Ministarstvo znanosti, obrazovanja i mladih',
    snapshotHash,
    snapshotBytes: html.length,
  },
  rowCount: rows.length,
  rows: [...rows].sort((a, b) => a.sifraUpisnik.localeCompare(b.sifraUpisnik, 'hr', { numeric: true })),
};

const draftDir = join(root, 'data', 'programs', 'drafts');
mkdirSync(draftDir, { recursive: true });
writeFileSync(join(draftDir, 'upisnik.json'), JSON.stringify(draft, null, 2) + '\n');

const byVrsta = new Map<string, number>();
for (const row of rows) byVrsta.set(row.vrsta, (byVrsta.get(row.vrsta) ?? 0) + 1);

console.log('=== Harvest Upisnika ===');
console.log(`programa: ${rows.length}${skipped.length ? `, neprocitanih redaka: ${skipped.length}` : ''}`);
for (const [vrsta, n] of [...byVrsta].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(4)}  ${vrsta}`);
console.log(`izvoditelja (sastavnica): ${new Set(rows.map((r) => r.izvoditelj)).size}`);
console.log(`snapshot: ${snapshotPath} (sha256 ${snapshotHash.slice(0, 12)}..., NE commita se)`);
console.log('zapisano: data/programs/drafts/upisnik.json');
console.log('');
console.log('Draft NIJE registar: prijenos u data/programs/program-registry.json je zaseban, ljudski korak.');
if (skipped.length) {
  console.log('');
  console.log('NEPROCITANI REDCI (sucelje se vjerojatno promijenilo):');
  for (const s of skipped.slice(0, 5)) console.log(`  - ${s}`);
}
