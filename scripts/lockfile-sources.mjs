// scripts/lockfile-sources.mjs
//
// `npm run audit:lockfile` (T99, issue #220): svaki paket u `package-lock.json` mora dolaziti s
// `https://registry.npmjs.org/` i nositi `sha512-` integrity. `npm audit` gleda samo poznate CVE-ove,
// ne odakle se paket preuzima: PR (i Dependabot PR) moze podmetnuti `resolved` na drugi host,
// `http://` bez TLS-a ili git izvor, i nitko to ne bi vidio (lockfile injection).
//
// Bez ratcheta: na dan uvodjenja lockfile je bio cist (1466 od 1467 paketa s registryja; jedini bez
// `resolved` je `inBundle`), pa je gard tvrdi od prvog dana. Bez nove ovisnosti (`lockfile-lint`):
// provjera je nekoliko redaka nad JSON-om.
//
// Pravila (Codex runda 1 na #258):
//  - `lockfileVersion` mora biti tocno broj 3; nepoznat format je pad, ne tiho citanje.
//  - `integrity` mora biti JEDAN SRI zapis `sha512-<base64>` s digestom od tocno 64 bajta. npm-ov
//    `ssri` iz niza s vise zapisa bira algoritam po svom redu, pa `sha512- sha1-...` ili prazan
//    `sha512-` nisu dokaz SHA512.
//  - `inBundle: true` je izuzet od `resolved`/`integrity` SAMO kad mu je neposredni roditelj stvaran
//    provjeren paket koji ga navodi u `bundleDependencies` (stize u roditeljevom tarballu); ako ipak
//    nosi `resolved` ili `integrity`, oni se provjeravaju kao kod obicnog paketa.
//  - `link: true` (workspace) nije dopusten: repo nema workspaceove, pa je svaki link podmetanje
//    izvora mimo registryja. Uvodjenje workspaceova trazi svjesnu izmjenu ovog garda.
//
// SELFTEST (`--selftest`) dokazuje da gard grize: podmetnuti losi izvori moraju pasti, a `inBundle`
// bez `resolved` mora proci. Vrti se u CI-ju PRIJE stvarnog mjerenja (obrazac `npm-audit-ratchet.mjs`).
//
// Izlaz ide preko `process.exitCode`, ne `process.exit()` (isti razlog kao u npm-audit-ratchet.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const REGISTRY = 'https://registry.npmjs.org/';

/** SRI vrijednost je tocno jedan `sha512-` zapis s digestom od 64 bajta, bez opcija (`?`). */
export function isStrictSha512(integrity) {
  if (typeof integrity !== 'string') return false;
  const m = /^sha512-([A-Za-z0-9+/]{86}==)$/.exec(integrity);
  return m !== null && Buffer.from(m[1], 'base64').length === 64;
}

/** Problemi izvora jednog zapisa koji nosi (ili mora nositi) `resolved` i `integrity`. */
function sourceProblems(name, meta) {
  const out = [];
  const { resolved, integrity } = meta;
  if (typeof resolved !== 'string') out.push(`${name}: nema \`resolved\``);
  else if (!resolved.startsWith(REGISTRY)) out.push(`${name}: \`resolved\` nije ${REGISTRY} (${resolved})`);
  if (typeof integrity !== 'string') out.push(`${name}: nema \`integrity\``);
  else if (!isStrictSha512(integrity)) out.push(`${name}: \`integrity\` nije jedan sha512 zapis od 64 bajta (${integrity.slice(0, 16)})`);
  return out;
}

/** Ime paketa iz kljuca `.../node_modules/<ime>` (s opsegom `@a/b`). */
function packageName(key) {
  const i = key.lastIndexOf('node_modules/');
  return i === -1 ? key : key.slice(i + 'node_modules/'.length);
}

/**
 * Prekrsaji izvora u parsiranom lockfileu, po imenu paketa. Nevaljan oblik (verzija razlicita od 3,
 * nema `packages`, nijedan provjeren paket) je takodjer prekrsaj: necitljiv lockfile ne smije biti zelen.
 * @param {unknown} lock
 * @returns {{ problems: string[], checked: number, skipped: number }}
 */
export function lockfileSourceProblems(lock) {
  const obj = lock && typeof lock === 'object' && !Array.isArray(lock) ? /** @type {Record<string, unknown>} */ (lock) : null;
  if (!obj) return { problems: ['lockfile nije JSON objekt'], checked: 0, skipped: 0 };
  if (obj.lockfileVersion !== 3) {
    return { problems: [`lockfileVersion mora biti broj 3, a je ${JSON.stringify(obj.lockfileVersion)}`], checked: 0, skipped: 0 };
  }
  const packages = obj.packages;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
    return { problems: ['lockfile nema objekt `packages`'], checked: 0, skipped: 0 };
  }
  const entries = /** @type {Record<string, Record<string, unknown>>} */ (packages);
  const problems = [];
  let checked = 0;
  let skipped = 0;
  for (const [name, raw] of Object.entries(entries)) {
    const meta = raw && typeof raw === 'object' ? raw : {};
    if (name === '') {
      skipped += 1;
      continue;
    }
    if (meta.link === true) {
      problems.push(`${name}: \`link\` nije dopusten (repo nema workspaceove; cilj ${JSON.stringify(meta.resolved)})`);
      continue;
    }
    if (meta.inBundle === true) {
      const cut = name.lastIndexOf('/node_modules/');
      const parentKey = cut === -1 ? '' : name.slice(0, cut);
      const parent = parentKey ? entries[parentKey] : undefined;
      const bundled = parent && Array.isArray(parent.bundleDependencies) ? parent.bundleDependencies : [];
      if (!parent || parent.inBundle === true || parent.link === true || !bundled.includes(packageName(name))) {
        problems.push(`${name}: \`inBundle\` bez roditelja koji ga navodi u bundleDependencies (${parentKey || 'nema roditelja'})`);
        continue;
      }
      if (meta.resolved !== undefined || meta.integrity !== undefined) problems.push(...sourceProblems(name, meta));
      skipped += 1;
      continue;
    }
    checked += 1;
    problems.push(...sourceProblems(name, meta));
  }
  if (checked === 0) problems.push('lockfile nema nijedan provjeren paket');
  return { problems, checked, skipped };
}

/** Ispravan SRI za selftest i testove: 64 bajta, pa prolazi strogu provjeru. */
const SHA512 = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;

function selftest() {
  const ok = (name) => ({ resolved: `${REGISTRY}${name}/-/${name}-1.0.0.tgz`, integrity: SHA512 });
  const parent = { ...ok('a'), bundleDependencies: ['c'] };
  const lock = (extra, version = 3) => ({
    lockfileVersion: version,
    packages: { '': { name: 'x' }, 'node_modules/a': parent, ...extra },
  });
  const sha1Tail = 'sha1-EfatjsUqKYSrqv18O1FlA3hcIHI=';
  const mustFail = {
    'drugi host': lock({ 'node_modules/b': { ...ok('b'), resolved: 'https://evil.example/b/-/b-1.0.0.tgz' } }),
    'http bez TLS-a': lock({ 'node_modules/b': { ...ok('b'), resolved: 'http://registry.npmjs.org/b/-/b-1.0.0.tgz' } }),
    'git+https izvor': lock({ 'node_modules/b': { ...ok('b'), resolved: 'git+https://github.com/x/b.git#abc' } }),
    'git+ssh izvor': lock({ 'node_modules/b': { ...ok('b'), resolved: 'git+ssh://git@github.com/x/b.git#abc' } }),
    'drugi registry': lock({ 'node_modules/b': { ...ok('b'), resolved: 'https://registry.yarnpkg.com/b/-/b-1.0.0.tgz' } }),
    'bez resolved': lock({ 'node_modules/b': { integrity: SHA512 } }),
    'bez integrity': lock({ 'node_modules/b': { resolved: ok('b').resolved } }),
    'sha1 integrity': lock({ 'node_modules/b': { ...ok('b'), integrity: sha1Tail } }),
    'sha512 uz sha1 rezervu': lock({ 'node_modules/b': { ...ok('b'), integrity: `sha512- ${sha1Tail}` } }),
    'prazan sha512': lock({ 'node_modules/b': { ...ok('b'), integrity: 'sha512-' } }),
    'inBundle bez roditelja': lock({ 'node_modules/b/node_modules/c': { version: '1.0.0', inBundle: true } }),
    'inBundle sa stranim resolved': lock({ 'node_modules/a/node_modules/c': { inBundle: true, resolved: 'https://evil.example/c.tgz' } }),
    'link na workspace': lock({ 'node_modules/w': { resolved: '../izvan', link: true } }),
    'lockfileVersion 4': lock({}, 4),
    'lockfileVersion kao tekst': lock({}, '3'),
  };
  for (const [label, input] of Object.entries(mustFail)) {
    if (lockfileSourceProblems(input).problems.length === 0) {
      console.error(`[lockfile-sources] FAIL selftest: "${label}" NIJE prijavljen. Gard ne grize.`);
      return 1;
    }
  }
  const bundled = lockfileSourceProblems(lock({ 'node_modules/a/node_modules/c': { version: '1.0.0', inBundle: true } }));
  if (bundled.problems.length !== 0) {
    console.error(`[lockfile-sources] FAIL selftest: \`inBundle\` s pravim roditeljem je lazno prijavljen: ${bundled.problems.join('; ')}`);
    return 1;
  }
  console.log(`[lockfile-sources] SELF-TEST OK: ${Object.keys(mustFail).length} losih ulaza se hvata, inBundle s roditeljem prolazi.`);
  return 0;
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const { problems, checked, skipped } = lockfileSourceProblems(JSON.parse(readFileSync(LOCK_PATH, 'utf8')));
  if (problems.length) {
    console.error(`[lockfile-sources] FAIL: ${problems.length} prekrsaja u package-lock.json (provjereno ${checked}):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`[lockfile-sources] OK: ${checked} paketa s ${REGISTRY} i sha512 integrity (izuzeto ${skipped}: korijen i inBundle s roditeljem).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`[lockfile-sources] FAIL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
