#!/usr/bin/env node
// scripts/extraction-probe.mjs
//
// Mrezni dio extraction testa (faza C plana zastite baze pravila): glumi napadaca
// koji preko ZIVOG profile-rules endpointa pokusava enumerirati bazu pravila. Dopuna
// statickom dijelu (tests/extraction-attack.test.ts nad dist artefaktom): ovaj mjeri
// da je enumeracija SKUPA, tj. da rate limit nastupi prije nego se izvuce znacajan
// broj profila.
//
// SAMO STAGING, nikad produkcija: origin mora biti eksplicitno zadan preko
// LEKTA_STAGING_ORIGIN i ne smije sadrzavati produkcijski host (obrana od
// slucajnog DoS-a vlastite produkcije). Bez varijable skripta uredno odustaje
// (exit 0, status unavailable u release-checku), isti obrazac kao Word razine.
//
// POSTEN KRITERIJ: ne tvrdi da su vrijednosti pravila tajne (namjerno su javne na SEO
// stranicama). Tvrdi da rate limit nastupi PRIJE praga distinct profila, i da odgovor
// ne nosi evidence (never-marker kljuceve). Anti-DoS: tvrd cap zahtjeva, razmak medju
// pozivima, prekid na prvi 429.

import { NEVER_KEY_MARKERS, findKeyMarkers } from './security/never-markers.mjs';

const ORIGIN = (process.env.LEKTA_STAGING_ORIGIN ?? '').trim().replace(/\/+$/, '');
// Prag prolaza: rate limit mora udariti PRIJE ovoliko razlicitih profila. Velikodusno
// iznad ljudske gornje granice (student pogleda nekoliko profila), daleko ispod 407.
const DISTINCT_THRESHOLD = 25;
// Anti-DoS tvrde granice.
const MAX_REQUESTS = 40;
const DELAY_MS = 300;
const PROD_HOST = 'lektahr.netlify.app';

function fail(msg) { console.error(`[extraction-probe] FAIL: ${msg}`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!ORIGIN) {
  console.log('[extraction-probe] preskace se: LEKTA_STAGING_ORIGIN nije postavljen (probe ide samo protiv staginga).');
  process.exit(0);
}
if (ORIGIN.includes(PROD_HOST)) {
  fail(`origin ${ORIGIN} sadrzi produkcijski host (${PROD_HOST}); probe se NIKAD ne vrti protiv produkcije.`);
}

// Kandidati za enumeraciju: sinteticki generirani id-jevi (napadac ne zna prave, pa
// gadja fakultet-vrsta kombinacije). Realno je da vecina vrati 404, ali SVAKI trosi
// rate slot; cilj je izmjeriti kad limit udari, ne pogoditi prave profile.
function candidateIds() {
  const units = ['fpzg', 'pravo', 'efzg', 'fer', 'ffzg', 'pmf', 'unizd', 'unipu', 'efos', 'medri',
    'fsb', 'grad', 'arh', 'alu', 'adu', 'agr', 'bak', 'algebra', 'aspira', 'effectus',
    'unin', 'unidu', 'riteh', 'ufzg', 'kbf', 'sfzg', 'vef', 'ttf', 'geof', 'rgnf'];
  const kinds = ['zavrsni', 'diplomski', 'doktorski', 'strucni-diplomski', 'integrirani-diplomski'];
  const ids = [];
  for (const u of units) for (const k of kinds) ids.push(`${u}-${k}`);
  return ids;
}

async function main() {
  const endpoint = `${ORIGIN}/functions/v1/profile-rules`;
  console.log(`[extraction-probe] meta: ${endpoint} (prag distinct < ${DISTINCT_THRESHOLD}, cap ${MAX_REQUESTS} zahtjeva)`);
  const distinctSeen = new Set();
  let requests = 0;
  let rateLimitedAt = null;
  let evidenceLeak = null;

  for (const id of candidateIds()) {
    if (requests >= MAX_REQUESTS) break;
    requests += 1;
    let res;
    try {
      res = await fetch(`${endpoint}?v=1&profileId=${encodeURIComponent(id)}`);
    } catch (e) {
      console.warn(`[extraction-probe] mrezna greska na ${id}: ${e?.message ?? e}`);
      await sleep(DELAY_MS);
      continue;
    }
    if (res.status === 429) { rateLimitedAt = distinctSeen.size; break; }
    if (res.status === 200) {
      distinctSeen.add(id);
      const body = await res.text();
      const markers = findKeyMarkers(body, NEVER_KEY_MARKERS);
      if (markers.length) evidenceLeak = { id, markers };
    }
    await sleep(DELAY_MS);
  }

  console.log(`[extraction-probe] zahtjeva: ${requests}, uspjesnih (200) distinct profila: ${distinctSeen.size}, rate-limit na: ${rateLimitedAt ?? 'nije udario'}`);

  if (evidenceLeak) {
    fail(`odgovor za ${evidenceLeak.id} nosi evidence kljuceve (${evidenceLeak.markers.join(', ')}); provenijencija je procurila`);
  }
  // SENTINEL: nula uspjesnih odgovora nije dokaz otpornosti nego dokaz da probe nije ni stigao do
  // mete. Izmjereno 2026-09-06: `lekta-staging` je SSO-zakljucan i vraca 401 na svaki od 40
  // zahtjeva, pa je probe izvukao 0 distinct profila, sto je ispod praga, i zavrsio s "OK". Takav
  // prolaz bi u RELEASE_PROOF usao kao dokazana zastita od bulk enumeracije, a nije izmjereno
  // nista. Prag koji se zadovoljava NEDOSTUPNOSCU mete ne mjeri metu.
  if (distinctSeen.size === 0) {
    fail(
      `nijedan od ${requests} zahtjeva nije vratio 200 (distinct profila: 0). Meta je nedostupna, `
      + 'najcesce SSO ili pauzirana instalacija, pa ovaj probe NIJE dokaz. Otkljucaj staging ili '
      + 'usmjeri LEKTA_STAGING_ORIGIN na instalaciju koja odgovara.',
    );
  }
  if (rateLimitedAt === null && distinctSeen.size >= DISTINCT_THRESHOLD) {
    fail(`izvuceno ${distinctSeen.size} distinct profila bez rate limita (prag ${DISTINCT_THRESHOLD}); enumeracija je prejeftina`);
  }
  if (rateLimitedAt !== null && rateLimitedAt >= DISTINCT_THRESHOLD) {
    fail(`rate limit udario tek na ${rateLimitedAt} distinct profila (prag ${DISTINCT_THRESHOLD}); cap je previsok`);
  }
  const how = rateLimitedAt !== null
    ? `rate limit udario na ${rateLimitedAt} distinct profila (< ${DISTINCT_THRESHOLD})`
    : `pristojan probe (cap ${MAX_REQUESTS} zahtjeva) izvukao samo ${distinctSeen.size} distinct profila (< ${DISTINCT_THRESHOLD}), bulk enumeracija nije prosla`;
  console.log(`[extraction-probe] OK: bez evidence u odgovoru; ${how}.`);
}

main().catch((e) => fail(e?.message ?? String(e)));
