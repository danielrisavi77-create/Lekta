// scripts/osv-query.mjs
//
// `npm run audit:osv` (T99, issue #220, korak 2): poznate ranjivosti u ovisnostima koje `npm audit` ne
// vidi, preko OSV API-ja (https://api.osv.dev/v1/querybatch). Umjesto osv-scanner binarija: on ne cita
// `deno.lock` ni `pyproject.toml` (izmjereno nad upstreamom 2026-10-03), pa bi 5 od 6 datoteka iz
// issuea dalo nula paketa. Ova skripta deterministicki cita:
//   - oba `deno.lock`: kljucevi `remote` i ciljevi `redirects` su esm.sh URL-ovi s tocnom verzijom npm
//     paketa (`https://esm.sh/@supabase/auth-js@2.110.2/...`). Kljucevi `redirects` nose raspone
//     (`@^0.8.1`) pa se ne citaju. `workspace.packageJson` u korijenskom locku preslikava package.json,
//     koji vec pokriva `npm audit`;
//   - `training-pipeline/requirements.txt`: samo tocni pinovi `ime==verzija`.
// Datoteke sa samo rasponima verzija (oba `pyproject.toml`, `.claude/katedra-pkg/service/requirements.txt`)
// su IMENOVANA POZNATA RUPA u `data/security/osv-ratchet.json` s datumom; ispisuju se, ne preskacu tiho.
//
// Presuda:
//   - datoteka koja da 0 paketa, nepoznat URL u deno locku ili nevaljan OSV odgovor: pad;
//   - OSV nedostupan (mreza, timeout, HTTP greska): NE ZNAM, izlaz 2. Nikad zeleno;
//   - nalaz izvan `findings` u ratchetu ili vise nalaza od stropa: pad; manje: `::notice` da se strop spusti.
// Svaki prihvaceni nalaz mora imati iznimku s vlasnikom, mitigacijom i rokom (obrazac npm-audit-ratchet).
//
// SELFTEST (`--selftest`) radi bez mreze nad odgovorom slozenim po shemi OSV querybatcha.
// Izlaz ide preko `process.exitCode`, ne `process.exit()` (isti razlog kao u npm-audit-ratchet.mjs).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATCHET_PATH = path.join(ROOT, 'data', 'security', 'osv-ratchet.json');
const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const TIMEOUT_MS = 30_000;

/** Datoteke koje se skeniraju; svaka mora dati barem jedan paket. */
export const SCANNED = [
  { file: 'deno.lock', kind: 'deno' },
  { file: 'supabase/functions/deno.lock', kind: 'deno' },
  { file: 'training-pipeline/requirements.txt', kind: 'pip' },
];

const ESM = /^https:\/\/esm\.sh\/((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@(\d+\.\d+\.\d+[\w.+-]*)(?:[/?#]|$)/i;
/** Kljuc u sekciji `npm` deno.locka: `ime@verzija` ili `ime@verzija_peer@verzija`. */
const DENO_NPM_KEY = /^((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@(\d+\.\d+\.\d+[\w.+-]*?)(?:_.*)?$/i;
/** Sekcije deno.locka v5 koje parser zna; svaka druga je pad, ne tiho preskakanje (Codex R1 na #274). */
const DENO_SECTIONS = new Set(['version', 'remote', 'redirects', 'workspace', 'specifiers', 'npm', 'jsr']);

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * npm paketi s tocnom verzijom iz parsiranog deno.lock (v5). Cita `remote` (esm.sh URL-ovi), ciljeve
 * `redirects` i nativni `npm` graf. `specifiers` samo preslikava na `npm`/`jsr` pa nema vlastitih verzija.
 * `workspace.packageJson` smije nositi samo `npm:` ovisnosti, koje vec pokrivaju package.json i npm audit.
 * JSR graf, nepoznata sekcija, nepoznat URL ili krivi oblik su imenovani problemi: necitani dio grafa
 * ne smije ostati zelen.
 */
export function denoLockPackages(lock, file) {
  if (!isPlainObject(lock)) return { packages: [], problems: [`${file}: nije JSON objekt`] };
  const problems = [];
  if (lock.version !== '5') problems.push(`${file}: deno.lock verzija mora biti "5", a je ${JSON.stringify(lock.version)}`);
  for (const key of Object.keys(lock)) if (!DENO_SECTIONS.has(key)) problems.push(`${file}: nepoznata sekcija \`${key}\``);
  const seen = new Map();
  const add = (name, version) => {
    const k = `${name}@${version}`;
    if (!seen.has(k)) seen.set(k, { ecosystem: 'npm', name, version, file });
  };
  const urls = [];
  if (lock.remote !== undefined) {
    if (!isPlainObject(lock.remote)) problems.push(`${file}: \`remote\` nije objekt`);
    else urls.push(...Object.keys(lock.remote));
  }
  if (lock.redirects !== undefined) {
    if (!isPlainObject(lock.redirects)) problems.push(`${file}: \`redirects\` nije objekt`);
    else {
      for (const [from, to] of Object.entries(lock.redirects)) {
        if (typeof to === 'string') urls.push(to);
        else problems.push(`${file}: redirect ${from} nema tekstualni cilj`);
      }
    }
  }
  for (const url of urls) {
    const m = ESM.exec(url);
    if (m) add(m[1], m[2]);
    else problems.push(`${file}: URL bez tocne npm verzije na esm.sh (${url})`);
  }
  if (lock.npm !== undefined) {
    if (!isPlainObject(lock.npm)) problems.push(`${file}: \`npm\` nije objekt`);
    else {
      for (const key of Object.keys(lock.npm)) {
        const m = DENO_NPM_KEY.exec(key);
        if (m) add(m[1], m[2]);
        else problems.push(`${file}: npm zapis bez tocne verzije (${key})`);
      }
    }
  }
  if (lock.jsr !== undefined && !(isPlainObject(lock.jsr) && Object.keys(lock.jsr).length === 0)) {
    problems.push(`${file}: JSR graf nije podrzan (OSV ga ovdje ne provjerava); dodaj podrsku ili ukloni JSR ovisnosti`);
  }
  if (lock.specifiers !== undefined && (!isPlainObject(lock.specifiers) || Object.values(lock.specifiers).some((v) => typeof v !== 'string'))) {
    problems.push(`${file}: \`specifiers\` nije objekt tekstualnih vrijednosti`);
  }
  if (lock.workspace !== undefined) {
    if (!isPlainObject(lock.workspace)) problems.push(`${file}: \`workspace\` nije objekt`);
    else {
      for (const key of Object.keys(lock.workspace)) if (key !== 'packageJson') problems.push(`${file}: nepoznata sekcija \`workspace.${key}\``);
      const deps = lock.workspace.packageJson?.dependencies;
      if (deps !== undefined && (!Array.isArray(deps) || deps.some((d) => typeof d !== 'string' || !d.startsWith('npm:')))) {
        problems.push(`${file}: \`workspace.packageJson.dependencies\` smije nositi samo npm: ovisnosti (pokriva ih npm audit)`);
      }
    }
  }
  return { packages: [...seen.values()], problems };
}

/** Tocni pinovi `ime==verzija` iz requirements.txt; sve ostalo je raspon i ne skenira se. */
export function requirementsPins(text, file) {
  const packages = [];
  const unpinned = [];
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([0-9][A-Za-z0-9.+!-]*)$/.exec(line);
    if (m) packages.push({ ecosystem: 'PyPI', name: m[1].toLowerCase().replace(/[._]+/g, '-'), version: m[2], file });
    else unpinned.push(line);
  }
  return { packages, unpinned };
}

/** Paketi iz svih skeniranih datoteka; datoteka bez paketa ili s nepoznatim ulazom je problem. */
export function collectPackages(read = (f) => readFileSync(path.join(ROOT, f), 'utf8')) {
  const problems = [];
  const perFile = [];
  const all = [];
  for (const { file, kind } of SCANNED) {
    let pkgs = [];
    try {
      if (kind === 'deno') {
        const r = denoLockPackages(JSON.parse(read(file)), file);
        pkgs = r.packages;
        problems.push(...r.problems);
      } else {
        const r = requirementsPins(read(file), file);
        pkgs = r.packages;
        for (const u of r.unpinned) problems.push(`${file}: redak bez tocnog pina (${u})`);
      }
    } catch (e) {
      problems.push(`${file}: necitljiv (${e instanceof Error ? e.message : String(e)})`);
    }
    if (pkgs.length === 0) problems.push(`${file}: 0 paketa; necitljiv lockfile ne smije biti zelen`);
    perFile.push({ file, count: pkgs.length });
    all.push(...pkgs);
  }
  const unique = new Map(all.map((p) => [`${p.ecosystem}:${p.name}@${p.version}`, p]));
  return { packages: [...unique.values()], perFile, problems };
}

/** Najvise upita u jednom /v1/querybatch zahtjevu (granica OSV API-ja). */
export const OSV_BATCH_LIMIT = 1000;

/** Tijelo zahtjeva za /v1/querybatch. */
export function batchQuery(packages) {
  return { queries: packages.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) };
}

/** Paketi podijeljeni u batchove od najvise OSV_BATCH_LIMIT (Codex R4 na #274). */
export function batches(packages, limit = OSV_BATCH_LIMIT) {
  const out = [];
  for (let i = 0; i < packages.length; i += limit) out.push(packages.slice(i, i + limit));
  return out;
}

/**
 * Identiteti nalaza `ekosustav:ime@verzija ID` iz querybatch odgovora. Odgovor mora imati tocno jedan
 * rezultat po upitu; `next_page_token` (nepotpun rezultat) i krivi oblik su greska, ne nula nalaza.
 */
export function findingsFromBatch(response, packages) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.results)) throw new Error('OSV odgovor nema polje results');
  if (response.results.length !== packages.length) {
    throw new Error(`OSV odgovor ima ${response.results.length} rezultata za ${packages.length} upita`);
  }
  const out = new Set();
  response.results.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`OSV rezultat ${i} nije objekt`);
    if (r.next_page_token) throw new Error(`OSV rezultat ${i} je nepotpun (next_page_token)`);
    if (r.vulns === undefined) return;
    if (!Array.isArray(r.vulns)) throw new Error(`OSV rezultat ${i}: vulns nije polje`);
    const p = packages[i];
    for (const v of r.vulns) {
      if (!v || typeof v.id !== 'string' || !v.id) throw new Error(`OSV rezultat ${i}: ranjivost bez id`);
      out.add(`${p.ecosystem}:${p.name}@${p.version} ${v.id}`);
    }
  });
  return [...out].sort();
}

const isoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Strukturna provjera ratcheta: sortirani nalazi, iznimka s vlasnikom/mitigacijom/rokom, imenovane rupe. */
export function validateOsvRatchet(ratchet, { today = new Date().toISOString().slice(0, 10), exists = (f) => existsSync(path.join(ROOT, f)) } = {}) {
  const problems = [];
  const findings = Array.isArray(ratchet?.findings) ? ratchet.findings : null;
  if (!findings) return ['findings nije polje'];
  if (findings.some((f, i) => typeof f !== 'string' || (i > 0 && findings[i - 1] >= f))) problems.push('findings mora biti sortiran popis bez duplikata');
  const covered = new Set();
  for (const [i, e] of (Array.isArray(ratchet.exceptions) ? ratchet.exceptions : []).entries()) {
    const label = `exceptions[${i}]`;
    if (typeof e?.owner !== 'string' || !e.owner.trim()) problems.push(`${label}.owner nedostaje`);
    if (typeof e?.mitigation !== 'string' || !e.mitigation.trim()) problems.push(`${label}.mitigation nedostaje`);
    if (!isoDate(e?.expiresOn)) problems.push(`${label}.expiresOn nije ISO datum`);
    else if (e.expiresOn < today) problems.push(`${label} je istekla ${e.expiresOn}`);
    for (const f of Array.isArray(e?.findings) ? e.findings : []) covered.add(f);
  }
  for (const f of findings) if (!covered.has(f)) problems.push(`nalaz bez iznimke: ${f}`);
  const gaps = Array.isArray(ratchet.knownGaps) ? ratchet.knownGaps : [];
  for (const [i, g] of gaps.entries()) {
    if (typeof g?.file !== 'string' || !exists(g.file)) problems.push(`knownGaps[${i}]: datoteka ne postoji (${g?.file})`);
    if (typeof g?.reason !== 'string' || !g.reason.trim()) problems.push(`knownGaps[${i}].reason nedostaje`);
    if (!isoDate(g?.since)) problems.push(`knownGaps[${i}].since nije ISO datum`);
  }
  return problems;
}

/** Presuda prema stropu i identitetu (obrazac compareAuditToRatchet). */
export function compareOsvToRatchet(found, ratchet) {
  const expected = Array.isArray(ratchet?.findings) ? ratchet.findings : [];
  const unexpected = found.filter((f) => !expected.includes(f));
  const resolved = expected.filter((f) => !found.includes(f));
  const ceiling = expected.length;
  const verdict = unexpected.length > 0 || found.length > ceiling ? 'above' : found.length < ceiling ? 'below' : 'equal';
  return { verdict, count: found.length, ceiling, unexpected, resolved };
}

/** Svi batchovi redom; prvi NE ZNAM prekida, rezultat se prihvaca tek kad su svi batchovi obradjeni. */
export async function queryAllBatches(packages, fetchImpl = fetch) {
  const found = [];
  for (const chunk of batches(packages)) {
    const { unknown, response } = await queryOsv(chunk, fetchImpl);
    if (unknown) return { unknown };
    found.push(...findingsFromBatch(response, chunk));
  }
  return { found: [...new Set(found)].sort() };
}

async function queryOsv(packages, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(OSV_BATCH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batchQuery(packages)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { unknown: `OSV nedostupan (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!res.ok) return { unknown: `OSV vratio HTTP ${res.status}` };
  return { response: await res.json() };
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function selftest() {
  const pkgs = [
    { ecosystem: 'npm', name: 'tslib', version: '2.8.1', file: 'x' },
    { ecosystem: 'PyPI', name: 'pymupdf', version: '1.26.3', file: 'y' },
  ];
  const ratchet = { findings: [], exceptions: [], knownGaps: [] };
  const checks = [
    ['podmetnut nalaz', () => compareOsvToRatchet(findingsFromBatch({ results: [{ vulns: [{ id: 'GHSA-xxxx' }] }, {}] }, pkgs), ratchet).verdict === 'above'],
    ['cist odgovor je jednak', () => compareOsvToRatchet(findingsFromBatch({ results: [{}, {}] }, pkgs), ratchet).verdict === 'equal'],
    ['krivi broj rezultata', () => { try { findingsFromBatch({ results: [{}] }, pkgs); return false; } catch { return true; } }],
    ['nepotpun rezultat', () => { try { findingsFromBatch({ results: [{ next_page_token: 'x' }, {}] }, pkgs); return false; } catch { return true; } }],
    ['nepoznat URL u deno locku', () => denoLockPackages({ version: '5', remote: { 'https://evil.example/x.js': 'h' } }, 'd').problems.length === 1],
    ['raspon nije pin', () => requirementsPins('fastapi==0.115.*\nlxml>=5\n', 'r').packages.length === 0],
    ['datoteka s 0 paketa', () => collectPackages((f) => (f.endsWith('.lock') ? '{"version":"5","remote":{}}' : 'a==1.0.0')).problems.some((p) => p.includes('0 paketa'))],
    ['nepoznata sekcija deno locka', () => denoLockPackages({ version: '5', remote: {}, novo: {} }, 'd').problems.length === 1],
    ['JSR graf', () => denoLockPackages({ version: '5', jsr: { '@std/path@1.0.0': {} } }, 'd').problems.length === 1],
    ['nativni npm graf se cita', () => denoLockPackages({ version: '5', npm: { 'lodash@4.17.20': {} } }, 'd').packages.length === 1],
    ['batch do 1000', () => batches(Array.from({ length: 1001 }, () => pkgs[0])).map((b) => b.length).join() === '1000,1'],
    ['nalaz bez iznimke', () => validateOsvRatchet({ findings: ['npm:a@1.0.0 GHSA-x'], exceptions: [], knownGaps: [] }, { exists: () => true }).length === 1],
  ];
  for (const [label, ok] of checks) {
    if (!ok()) {
      console.error(`[osv] FAIL selftest: "${label}" nije uhvacen. Gard ne grize.`);
      return 1;
    }
  }
  console.log(`[osv] SELF-TEST OK: ${checks.length} provjera bez mreze.`);
  return 0;
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const ratchet = JSON.parse(readFileSync(RATCHET_PATH, 'utf8'));
  const ratchetProblems = validateOsvRatchet(ratchet);
  if (ratchetProblems.length) throw new Error(`nevaljan osv-ratchet.json: ${ratchetProblems.join('; ')}`);
  const { packages, perFile, problems } = collectPackages();
  for (const { file, count } of perFile) console.log(`[osv] ${file}: ${count} paketa`);
  for (const g of ratchet.knownGaps) console.log(`[osv] POZNATA RUPA od ${g.since}: ${g.file} (${g.reason})`);
  if (problems.length) {
    console.error(`[osv] FAIL: ${problems.length} problema s ulazom:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`[osv] ${perFile.reduce((n, f) => n + f.count, 0)} pojavljivanja po datotekama, ${packages.length} jedinstvenih upita u ${batches(packages).length} batchu`);
  const { unknown, found } = await queryAllBatches(packages);
  if (unknown) {
    console.error(`[osv] NE ZNAM: ${unknown}. Ovo nije zeleno.`);
    summary(`### OSV: NE ZNAM (${unknown})`);
    return 2;
  }
  const status = compareOsvToRatchet(found, ratchet);
  console.log(`[osv] ${packages.length} jedinstvenih paketa, ${status.count} nalaza, strop ${status.ceiling}, presuda ${status.verdict}`);
  for (const f of found) console.log(`  ${status.unexpected.includes(f) ? 'NOVO ' : ''}${f}`);
  summary(`### OSV: ${status.count} nalaza u ${packages.length} jedinstvenih paketa (strop ${status.ceiling}, ${status.verdict})`);
  if (status.verdict === 'above') return 1;
  if (status.verdict === 'below') console.log(`::notice::OSV nalaza je ${status.count}, strop ${status.ceiling}: spusti strop (rijeseno: ${status.resolved.join(', ')})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, (e) => {
    console.error(`[osv] FAIL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
