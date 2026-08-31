#!/usr/bin/env node
// scripts/post-deploy-smoke.mjs
//
// Provjera ZIVE instalacije nakon deploya (audit P1-29).
//
// ZASTO POSTOJI. Sve sto smo dosad imali mjeri kod PRIJE nego ode van: `npm run check` mjeri
// repozitorij, `verify-deploy-dist.mjs` mjeri `dist/` na build stroju. Nijedan ne zna je li ono
// sto je stvarno posluzeno ispravno. Klasa kvarova koja iz toga slijedi je stvarna, ne teorijska:
//
//   - `netlify.toml` generira pravne stranice TEK NAKON `vite build`. Ako taj korak padne, build
//     je "uspio", `dist/` na stroju je bio ispravan, a produkcija servira 404 na privatnost.html.
//   - Djelomican deploy: index.html je nov i trazi `assets/index-<hash>.js`, a CDN jos drzi stari
//     popis datoteka. Stranica se otvori i ne radi nista.
//   - `public/_headers` se ne primijeni, pa CSP i HSTS nestanu. Lokalno se to ne vidi uopce.
//   - Edge funkcija nije deployana ili joj fale tajne. `health` to javi, ali samo ako ga netko pita.
//
// STO OVAJ ALAT NAMJERNO NE RADI. Ne stvara nijedan zapis, ne salje nijedan dokument i ne trazi
// prijavu. Vrti se po rasporedu nad PRODUKCIJOM, pa svaka provjera koja bi nesto upisala postaje
// izvor smeca u zivim podacima. Autorizacija se provjerava iskljucivo tako da se gleda ODBIJA li
// se poziv BEZ tokena, sto je citanje, ne pisanje.
//
// DOKAZ DA GRIZE. Tvrdo pravilo projekta je da se gard bez mutacije ne racuna. `--self-test` vrti
// svaku tvrdnju nad SINTETICKI POKVARENIM odgovorom i trazi da je svaka od njih prijavila kvar, uz
// baseline prolaz nad zdravim odgovorom. Zato su provjere ciste funkcije nad "opazanjem", a mreza
// je odvojena: bez toga bi se mutacija mogla izvesti samo tako da se pokvari produkcija.
//
// Pokretanje:
//   node scripts/post-deploy-smoke.mjs --site https://lektahr.netlify.app \
//        --functions https://<ref>.supabase.co/functions/v1
//   node scripts/post-deploy-smoke.mjs --self-test    (bez mreze)

const DEFAULT_SITE = process.env.LEKTA_SITE_ORIGIN || 'https://lektahr.netlify.app';
const DEFAULT_FUNCTIONS = process.env.LEKTA_FUNCTIONS_ORIGIN
  || 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1';

/** Koliko se ceka na jedan zahtjev. Produkcija koja odgovara sporije od ovoga je i sama nalaz. */
const TIMEOUT_MS = Number(process.env.LEKTA_SMOKE_TIMEOUT_MS || '15000');

import { LEGAL_PAGES } from './lib/legal-pages.mjs';

// ---------------------------------------------------------------------------
// TVRDNJE (ciste funkcije nad opazanjem)
//
// Opazanje je obican objekt {status, headers, text}. Time svaka tvrdnja postaje provjerljiva bez
// mreze, pa `--self-test` moze podmetnuti kvar. Tvrdnja NIKAD sama ne dohvaca.
// ---------------------------------------------------------------------------

/** Rezultat jedne tvrdnje. `detail` je ono sto se ispisuje kad padne, pa mora reci STO je bilo. */
const ok = () => ({ ok: true });
const bad = (detail) => ({ ok: false, detail });

/** Zaglavlja citamo case-insensitive: HTTP ih ne razlikuje, a Headers i obican objekt razlikuju. */
function header(obs, name) {
  const h = obs.headers || {};
  if (typeof h.get === 'function') return h.get(name);
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? null : h[key];
}

export function assertHtmlOk(obs, what) {
  if (obs.status !== 200) return bad(`${what}: HTTP ${obs.status}`);
  const ct = String(header(obs, 'content-type') || '');
  if (!/text\/html/i.test(ct)) return bad(`${what}: content-type "${ct}", ocekivan text/html`);
  if (!/<html[\s>]/i.test(obs.text || '')) return bad(`${what}: tijelo nije HTML dokument`);
  return ok();
}

export function assertContains(obs, marker, what) {
  if (!(obs.text || '').includes(marker)) return bad(`${what}: nedostaje marker "${marker}"`);
  return ok();
}

/**
 * Sigurnosna zaglavlja na POSLUZENOJ stranici.
 *
 * Provjerava se PRISUTNOST i jedno svojstvo koje se ne moze slucajno pogoditi (CSP mora imati
 * script-src bez 'unsafe-inline', jer bas to je razlog zbog kojeg CSP ovdje uopce nesto znaci).
 * Puna politika se ne uspoređuje doslovno: ona se mijenja, a smoke koji pada na svaku legitimnu
 * izmjenu politike brzo se iskljuci.
 */
export function assertSecurityHeaders(obs) {
  const csp = String(header(obs, 'content-security-policy') || '');
  if (!csp) return bad('nema Content-Security-Policy (public/_headers nije primijenjen?)');
  const scriptSrc = csp.match(/script-src ([^;]+)/);
  if (!scriptSrc) return bad('CSP nema script-src direktivu');
  if (/'unsafe-inline'/.test(scriptSrc[1])) return bad("CSP script-src dopusta 'unsafe-inline'");
  if (!header(obs, 'strict-transport-security')) return bad('nema Strict-Transport-Security');
  if (String(header(obs, 'x-content-type-options') || '').toLowerCase() !== 'nosniff') {
    return bad('nema X-Content-Type-Options: nosniff');
  }
  return ok();
}

/**
 * Svaki resurs koji index.html trazi mora postojati.
 *
 * Ovo hvata DJELOMICAN deploy, kvar koji nijedna build provjera ne moze vidjeti: `dist/` je na
 * build stroju bio potpun, ali CDN servira novi HTML uz stari popis datoteka. Trazimo apsolutne
 * i korijenske staze; `//` (protocol-relative) i vanjske hostove preskacemo, jer njih ne deployamo
 * mi i njihov ispad nije nalaz o nasem deployu.
 */
export function extractLocalAssets(html) {
  const out = new Set();
  const push = (u) => {
    if (!u || u.startsWith('//') || /^[a-z]+:/i.test(u) || u.startsWith('#') || u.startsWith('data:')) return;
    out.add(u.startsWith('/') ? u : `/${u}`);
  };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel=["'](?:stylesheet|modulepreload)["'][^>]*\bhref=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'](?:stylesheet|modulepreload)["']/gi)) push(m[1]);
  return [...out];
}

export function assertAssetOk(obs, url) {
  if (obs.status !== 200) return bad(`resurs ${url}: HTTP ${obs.status} (djelomican deploy?)`);
  // Netlify SPA fallback zna na nepostojecu stazu vratiti index.html sa statusom 200. Tada je
  // status lazno zelen, a preglednik bi dobio HTML ondje gdje ocekuje JavaScript.
  const ct = String(header(obs, 'content-type') || '');
  if (/\.js$/i.test(url) && !/javascript|ecmascript/i.test(ct)) {
    return bad(`resurs ${url}: content-type "${ct}" nije JavaScript (SPA fallback na 404?)`);
  }
  if (/\.css$/i.test(url) && !/text\/css/i.test(ct)) {
    return bad(`resurs ${url}: content-type "${ct}" nije CSS`);
  }
  return ok();
}

/**
 * `health` mora reci ISTINU, ne samo odgovoriti.
 *
 * Zahtijeva se status 200 I `status: 'ok'` I zdrava baza. Prijasnja verzija te funkcije je za
 * svaki zahtjev vracala 200 (audit OPS-01), pa monitor koji gleda samo HTTP status ne bi vidio
 * nista. Zato se gleda i tijelo.
 */
export function assertHealth(obs) {
  if (obs.status !== 200) return bad(`health: HTTP ${obs.status}`);
  let body;
  try { body = JSON.parse(obs.text || ''); } catch { return bad('health: odgovor nije JSON'); }
  if (body.status !== 'ok') return bad(`health: status "${body.status}"`);
  if (body?.dependencies?.database?.ok !== true) {
    return bad(`health: baza nije zdrava (${body?.dependencies?.database?.detail ?? 'bez detalja'})`);
  }
  return ok();
}

/**
 * `health` mora i MOCI pasti.
 *
 * Endpoint koji na svaki zahtjev vrati 200 ne mjeri nista. POST na health mora dati 405; ako da
 * 200, funkcija je stara ili je netko vratio "uvijek ok" ponasanje, i cijeli monitoring je od tog
 * trenutka bezvrijedan a da nista ne izgleda pokvareno.
 */
export function assertHealthRejectsPost(obs) {
  if (obs.status !== 405) return bad(`health POST: HTTP ${obs.status}, ocekivano 405 (health ne moze pasti?)`);
  return ok();
}

/**
 * Placeni put mora odbiti poziv BEZ tokena.
 *
 * 401 je jedini prihvatljiv ishod. 200 bi znacio da popravak radi bez prijave; 5xx bi znacio da
 * funkcija puca prije autha, sto je isto nalaz (tada auth nije ono sto odlucuje).
 */
export function assertRequiresAuth(obs, name) {
  if (obs.status === 401) return ok();
  return bad(`${name} bez tokena: HTTP ${obs.status}, ocekivano 401`);
}

// ---------------------------------------------------------------------------
// MREZA
// ---------------------------------------------------------------------------

async function observe(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
    // Tijelo citamo uvijek: bez njega se ne moze provjeriti ni marker ni health.
    const text = await res.text().catch(() => '');
    return { status: res.status, headers: res.headers, text };
  } catch (e) {
    // DNS, TLS, odbijena veza, istek roka. Ovo NIJE tvrdnja o produkciji nego o tome da je nismo
    // uspjeli ni pogledati, pa se dalje vodi odvojeno (vidi classifyRun).
    return { transport: e?.name === 'TimeoutError' ? 'timeout' : (e?.message || 'nedostupno') };
  }
}

/**
 * Sve provjere nad zivom instalacijom.
 *
 * `observeImpl` je injektabilan iskljucivo zato da se lanac moze provrtjeti bez mreze u testu;
 * u radu je uvijek pravi `observe`.
 */
export async function runSmoke({ site, functions, observeImpl = observe }) {
  const nalazi = [];
  /**
   * Zabiljezi nalaz uz HOST i STATUS.
   *
   * Oboje sluzi `classifyRun`: bez njih se ne moze razlikovati pokvaren deploy od promatraca koji
   * ne moze do mreze. Kad je opazanje transportno palo, tvrdnja se uopce NE zove: nad praznim
   * opazanjem bi dala tocan opis krivog uzroka ("nema CSP-a") i time slala u pogresnu dijagnozu.
   */
  const zapisi = (id, host, obs, tvrdnja) => {
    if (obs && obs.transport) {
      nalazi.push({ id, host, ok: false, unreachable: true, detail: `nedostupno: ${obs.transport}` });
      return false;
    }
    const r = tvrdnja();
    nalazi.push({ id, host, status: obs?.status, ...r });
    return r.ok;
  };

  // 1. Naslovnica.
  const index = await observeImpl(`${site}/`);
  const naslovnicaOk = zapisi('index', 'site', index, () => assertHtmlOk(index, 'naslovnica'));
  zapisi('index:headers', 'site', index, () => assertSecurityHeaders(index));

  // 2. Resursi koje naslovnica trazi. Ovo je najvrjednija provjera: djelomican deploy se ne vidi
  //    nigdje drugdje, a stranica je tada mrtva iako sve izgleda deployano.
  //
  // OVISNA PROVJERA, pa se vrti SAMO ako se naslovnica ucitala. Kad nije, "nema nijednog resursa"
  // je istina o stranici koje nema, a ne o buildu; kao samostalan nalaz je slala u krivu dijagnozu
  // i k tome kvarila klasifikaciju (nalaz bez HTTP statusa razbijao je prepoznavanje presretaca,
  // pa je odsjecen promatrac izgledao kao ispad).
  const assets = naslovnicaOk ? extractLocalAssets(index.text || '') : [];
  if (naslovnicaOk && !assets.length) {
    zapisi('assets', 'site', index, () => bad('naslovnica ne referencira nijedan lokalni resurs (prazan build?)'));
  }
  for (const a of assets) {
    const obs = await observeImpl(`${site}${a}`);
    zapisi(`asset:${a}`, 'site', obs, () => assertAssetOk(obs, a));
  }

  // 3. Pravne stranice. Generira ih korak POSLIJE `vite build`, pa su prva stvar koja padne kad
  //    se lanac deploya prekine, i jedina koja nosi pravnu posljedicu.
  for (const [file, marker] of LEGAL_PAGES) {
    const obs = await observeImpl(`${site}/${file}`);
    zapisi(`legal:${file}`, 'site', obs, () => {
      const html = assertHtmlOk(obs, file);
      return html.ok ? assertContains(obs, marker, file) : html;
    });
  }

  // 4. Edge funkcije.
  const health = await observeImpl(`${functions}/health`);
  zapisi('health', 'functions', health, () => assertHealth(health));
  const healthPost = await observeImpl(`${functions}/health`, { method: 'POST' });
  zapisi('health:post', 'functions', healthPost, () => assertHealthRejectsPost(healthPost));
  const repair = await observeImpl(`${functions}/repair-docx`, { method: 'POST', body: '{}' });
  zapisi('auth:repair-docx', 'functions', repair, () => assertRequiresAuth(repair, 'repair-docx'));

  return nalazi;
}

/**
 * Je li ovo nalaz o produkciji ili o nama?
 *
 * SMOKE KOJI VICE VUK GASI SE. Kad promatrac ne moze do mreze (egress politika, DNS, pao runner),
 * naivna provjera prijavi da je SVE pokvareno i nakon druge takve dojave nitko je vise ne gleda.
 * Zato se ta situacija imenuje umjesto da se prijavi kao ispad.
 *
 * Signal je struktura, ne pogadjanje: stranica i Edge funkcije su kod DVA RAZLICITA pruzatelja
 * (Netlify i Supabase). Da oba propadnu u istoj sekundi, i to na potpuno isti nacin, gotovo je
 * uvijek nemoguce; ono sto tako izgleda je promatrac koji je odsjecen. Uvjeti su kumulativni:
 *   - nijedna provjera nije prosla,
 *   - vidjena su OBA hosta (inace je to ispad jednog pruzatelja, sto JEST nalaz),
 *   - svi kvarovi su ili transportni ili dijele jedan te isti status IZ `STATUS_PRESRETACA`.
 *
 * Djelomican kvar NIKAD nije neuvjerljiv: ako je isla makar jedna provjera, mreza radi.
 *
 * Popis statusa je NAMJERNO uzak. Prva verzija je gutala BILO KOJI istovjetan status i self-test
 * ju je odmah oborio: dvaput 200 s pokvarenim tijelom (nema CSP-a, health degradiran) proglasila
 * bi neuvjerljivim, iako 200 dokazuje da smo do oba hosta DOSLI. Sire je i opasnije: 503 na oba
 * pruzatelja jest malo vjerojatan, ali ako se dogodi, to je ispad zbog kojeg netko MORA ustati,
 * pa 503 ovdje svjesno nije.
 */
const STATUS_PRESRETACA = new Set([
  403, // proxy ili WAF odbija CONNECT / zahtjev
  407, // proxy trazi autentikaciju
  451, // blokirano na pravnoj osnovi (filtar mreze)
  511, // captive portal trazi prijavu
]);

export function classifyRun(nalazi) {
  if (!nalazi.length) return 'inconclusive';
  const pali = nalazi.filter((n) => !n.ok);
  if (!pali.length) return 'ok';
  if (pali.length !== nalazi.length) return 'fail';
  const hostovi = new Set(nalazi.map((n) => n.host));
  if (hostovi.size < 2) return 'fail';
  const sviTransportni = pali.every((n) => n.unreachable);
  const statusi = new Set(pali.map((n) => n.status));
  const jedanIstiStatus = !pali.some((n) => n.unreachable)
    && statusi.size === 1
    && STATUS_PRESRETACA.has([...statusi][0]);
  return sviTransportni || jedanIstiStatus ? 'inconclusive' : 'fail';
}

// ---------------------------------------------------------------------------
// SELF-TEST (mutacije: dokaz da svaka tvrdnja grize)
// ---------------------------------------------------------------------------

const ZDRAV_HTML = '<!doctype html><html><head><script type="module" src="/assets/index-abc.js"></script>'
  + '<link rel="stylesheet" href="/assets/index-abc.css"></head><body>AZOP</body></html>';
const ZDRAVA_ZAGLAVLJA = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-x'",
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};
const ZDRAV_HEALTH = JSON.stringify({ status: 'ok', dependencies: { database: { ok: true } } });

/**
 * Svaka mutacija ima ime, ULAZ i tvrdnju koja ju MORA prijaviti. Uz to ide BASELINE nad zdravim
 * ulazom: bez njega bi "prolazila" i provjera koja vristi na sve.
 */
const MUTACIJE = [
  ['naslovnica 404', () => assertHtmlOk({ status: 404, headers: ZDRAVA_ZAGLAVLJA, text: ZDRAV_HTML }, 'x')],
  ['naslovnica servira JSON', () => assertHtmlOk({ status: 200, headers: { 'content-type': 'application/json' }, text: '{}' }, 'x')],
  ['tijelo nije HTML', () => assertHtmlOk({ status: 200, headers: ZDRAVA_ZAGLAVLJA, text: 'ok' }, 'x')],
  ['nedostaje pravni marker', () => assertContains({ text: '<html>prazno</html>' }, 'AZOP', 'x')],
  ['CSP nestao (_headers nije primijenjen)', () => assertSecurityHeaders({ headers: { ...ZDRAVA_ZAGLAVLJA, 'content-security-policy': '' } })],
  ["CSP dopusta 'unsafe-inline'", () => assertSecurityHeaders({ headers: { ...ZDRAVA_ZAGLAVLJA, 'content-security-policy': "script-src 'self' 'unsafe-inline'" } })],
  ['HSTS nestao', () => assertSecurityHeaders({ headers: { ...ZDRAVA_ZAGLAVLJA, 'strict-transport-security': '' } })],
  ['nosniff nestao', () => assertSecurityHeaders({ headers: { ...ZDRAVA_ZAGLAVLJA, 'x-content-type-options': '' } })],
  ['resurs 404 (djelomican deploy)', () => assertAssetOk({ status: 404, headers: {} }, '/assets/index-abc.js')],
  ['SPA fallback vrati HTML umjesto JS', () => assertAssetOk({ status: 200, headers: { 'content-type': 'text/html' } }, '/assets/index-abc.js')],
  ['health degradiran', () => assertHealth({ status: 200, text: JSON.stringify({ status: 'degraded', dependencies: { database: { ok: false, detail: 'timeout' } } }) })],
  // MASKIRANA MUTACIJA. Prva verzija je za 'degraded' UVIJEK rusila i bazu, pa je provjeru statusa
  // pokrivala provjera baze: uklanjanje retka `body.status !== 'ok'` proslo je i self-test i vitest.
  // Ovaj slucaj razdvaja to dvoje, jer health smije degradirati i zbog ovisnosti koja nije baza.
  ['health degradiran uz ZDRAVU bazu (druga ovisnost)', () => assertHealth({ status: 200, text: JSON.stringify({ status: 'degraded', dependencies: { database: { ok: true } } }) })],
  ['health bez polja status', () => assertHealth({ status: 200, text: JSON.stringify({ dependencies: { database: { ok: true } } }) })],
  ['health 200 ali baza pala', () => assertHealth({ status: 200, text: JSON.stringify({ status: 'ok', dependencies: { database: { ok: false } } }) })],
  ['health nije JSON', () => assertHealth({ status: 200, text: '<html>502</html>' })],
  ['health 503', () => assertHealth({ status: 503, text: ZDRAV_HEALTH })],
  ['health uvijek 200 (OPS-01 regresija)', () => assertHealthRejectsPost({ status: 200 })],
  ['popravak radi bez tokena', () => assertRequiresAuth({ status: 200 }, 'repair-docx')],
  ['popravak puca prije autha', () => assertRequiresAuth({ status: 500 }, 'repair-docx')],
];

/**
 * Mutacije nad `classifyRun`. Ova funkcija odlucuje hoce li se nekoga probuditi, pa su joj obje
 * greske skupe: lazna uzbuna gasi monitor, propusten ispad ga cini beskorisnim. Zato se mjere OBA
 * smjera, ne samo "prepoznaje li nedostupnost".
 */
const F = (host, status, extra = {}) => ({ id: 'x', host, status, ok: false, ...extra });
const P = (host) => ({ id: 'x', host, status: 200, ok: true });

const KLASIFIKACIJA = [
  // Ono zbog cega funkcija postoji.
  ['sve transportno palo na oba hosta -> neuvjerljivo',
    () => classifyRun([F('site', undefined, { unreachable: true }), F('functions', undefined, { unreachable: true })]) === 'inconclusive'],
  ['isti HTTP status na oba hosta (proxy/WAF) -> neuvjerljivo',
    () => classifyRun([F('site', 403), F('functions', 403)]) === 'inconclusive'],
  // Ono sto se NE SMIJE progutati kao "neuvjerljivo".
  ['ispad JEDNOG pruzatelja je nalaz, ne neuvjerljivost',
    () => classifyRun([F('site', 503), F('site', 503)]) === 'fail'],
  ['djelomican kvar je nalaz: mreza ocito radi',
    () => classifyRun([P('site'), F('functions', 500)]) === 'fail'],
  ['razliciti statusi na oba hosta su stvaran ispad',
    () => classifyRun([F('site', 404), F('functions', 500)]) === 'fail'],
  ['mjesavina transportnog i HTTP kvara je nalaz',
    () => classifyRun([F('site', undefined, { unreachable: true }), F('functions', 500)]) === 'fail'],
  ['status 200 koji je pao na TIJELU nije neuvjerljiv',
    () => classifyRun([F('site', 200), F('functions', 200)]) === 'fail'],
  ['dvostruki 503 budi ljude: to je ispad, ne filtar',
    () => classifyRun([F('site', 503), F('functions', 503)]) === 'fail'],
  ['dvostruki 404 je pokvaren deploy, ne filtar',
    () => classifyRun([F('site', 404), F('functions', 404)]) === 'fail'],
  ['407 s proxyja je neuvjerljivo',
    () => classifyRun([F('site', 407), F('functions', 407)]) === 'inconclusive'],
  // Zdravi slucajevi.
  ['sve prolazi -> ok', () => classifyRun([P('site'), P('functions')]) === 'ok'],
  ['prazan popis je neuvjerljiv, ne uspjeh', () => classifyRun([]) === 'inconclusive'],
];

const BASELINE = [
  ['naslovnica', () => assertHtmlOk({ status: 200, headers: ZDRAVA_ZAGLAVLJA, text: ZDRAV_HTML }, 'x')],
  ['pravni marker', () => assertContains({ text: ZDRAV_HTML }, 'AZOP', 'x')],
  ['zaglavlja', () => assertSecurityHeaders({ headers: ZDRAVA_ZAGLAVLJA })],
  ['resurs js', () => assertAssetOk({ status: 200, headers: { 'content-type': 'text/javascript' } }, '/assets/index-abc.js')],
  ['resurs css', () => assertAssetOk({ status: 200, headers: { 'content-type': 'text/css' } }, '/assets/index-abc.css')],
  ['health', () => assertHealth({ status: 200, text: ZDRAV_HEALTH })],
  ['health POST', () => assertHealthRejectsPost({ status: 405 })],
  ['auth', () => assertRequiresAuth({ status: 401 }, 'repair-docx')],
];

function selfTest() {
  let pao = 0;
  for (const [ime, f] of BASELINE) {
    const r = f();
    if (!r.ok) { console.error(`  BASELINE FAIL  ${ime}: ${r.detail}`); pao++; }
  }
  for (const [ime, f] of MUTACIJE) {
    const r = f();
    if (r.ok) { console.error(`  NEUHVACENO  ${ime}`); pao++; }
    else console.log(`  uhvaceno    ${ime}`);
  }
  for (const [ime, f] of KLASIFIKACIJA) {
    if (!f()) { console.error(`  KLASIFIKACIJA FAIL  ${ime}`); pao++; }
    else console.log(`  ok          klasifikacija: ${ime}`);
  }
  // Izvlacenje resursa je i samo tvrdnja: prazan popis znaci da smoke ne bi provjerio NISTA.
  const nadjeni = extractLocalAssets(ZDRAV_HTML);
  if (nadjeni.length !== 2) { console.error(`  BASELINE FAIL  izvlacenje resursa: ${nadjeni.length}, ocekivano 2`); pao++; }
  if (extractLocalAssets('<script src="https://cdn.example/x.js"></script>').length !== 0) {
    console.error('  BASELINE FAIL  vanjski resurs se ne smije provjeravati'); pao++;
  }
  if (pao) {
    console.error(`[post-deploy-smoke] SELF-TEST FAIL: ${pao} problema`);
    process.exit(1);
  }
  console.log(`[post-deploy-smoke] SELF-TEST OK: ${BASELINE.length} baseline, ${MUTACIJE.length} mutacija (sve uhvacene), `
    + `${KLASIFIKACIJA.length} tvrdnji o klasifikaciji.`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const site = String(arg('site', DEFAULT_SITE)).replace(/\/+$/, '');
    const functions = String(arg('functions', DEFAULT_FUNCTIONS)).replace(/\/+$/, '');
    console.log(`[post-deploy-smoke] site=${site} functions=${functions}`);
    const nalazi = await runSmoke({ site, functions }).catch((e) => {
      console.error(`[post-deploy-smoke] FAIL: lanac je puknuo prije kraja: ${e?.message ?? e}`);
      process.exit(1);
    });
    for (const n of nalazi) {
      console.log(n.ok ? `  ok    ${n.id}` : `  ${n.unreachable ? '????' : 'FAIL'}  ${n.id}: ${n.detail}`);
    }
    const pali = nalazi.filter((n) => !n.ok);
    const ishod = classifyRun(nalazi);
    if (ishod === 'inconclusive') {
      // IZLAZNI KOD 2, ne 1. Ovo NIJE tvrdnja da je produkcija pokvarena, nego da je nismo vidjeli.
      // Radni tok ispod na 2 javlja drukcije nego na 1, jer bi inace nedostupna mreza budila
      // ljude s dojavom o ispadu koji se nije dogodio.
      console.error('[post-deploy-smoke] NEUVJERLJIVO: nijedna provjera nije prosla, a oba pruzatelja'
        + ' (stranica i Edge) padaju istovjetno. To je gotovo uvijek promatrac bez mreze (egress'
        + ' politika, DNS, proxy), ne ispad. Provjeri dostupnost pa ponovi; ne tvrdi nista o produkciji.');
      process.exit(2);
    }
    if (ishod === 'fail') {
      console.error(`[post-deploy-smoke] FAIL: ${pali.length} od ${nalazi.length} provjera pada nad zivom instalacijom.`);
      process.exit(1);
    }
    console.log(`[post-deploy-smoke] OK: ${nalazi.length} provjera nad zivom instalacijom.`);
  }
}
