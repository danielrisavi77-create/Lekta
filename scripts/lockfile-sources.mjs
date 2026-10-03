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
// Izuzeti su samo korijen (`""`), `link: true` (lokalni workspace, nema sto preuzeti) i `inBundle: true`
// (dolazi unutar tarballa roditelja, ciji su `resolved` i `integrity` vec provjereni).
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

/**
 * Prekrsaji izvora u parsiranom lockfileu, po imenu paketa. Nevaljan oblik (nije v2/v3, nema
 * `packages`, nijedan provjeren paket) je takodjer prekrsaj: necitljiv lockfile ne smije biti zelen.
 * @param {unknown} lock
 * @returns {{ problems: string[], checked: number, skipped: number }}
 */
export function lockfileSourceProblems(lock) {
  const problems = [];
  const packages = lock && typeof lock === 'object' ? /** @type {Record<string, unknown>} */ (lock).packages : undefined;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
    return { problems: ['lockfile nema objekt `packages` (ocekuje se lockfileVersion 2 ili 3)'], checked: 0, skipped: 0 };
  }
  let checked = 0;
  let skipped = 0;
  for (const [name, raw] of Object.entries(packages)) {
    const meta = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    if (name === '' || meta.link === true || meta.inBundle === true) {
      skipped += 1;
      continue;
    }
    checked += 1;
    const resolved = meta.resolved;
    const integrity = meta.integrity;
    if (typeof resolved !== 'string') problems.push(`${name}: nema \`resolved\``);
    else if (!resolved.startsWith(REGISTRY)) problems.push(`${name}: \`resolved\` nije ${REGISTRY} (${resolved})`);
    if (typeof integrity !== 'string') problems.push(`${name}: nema \`integrity\``);
    else if (!integrity.startsWith('sha512-')) problems.push(`${name}: \`integrity\` nije sha512 (${integrity.split('-')[0]})`);
  }
  if (checked === 0) problems.push('lockfile nema nijedan provjeren paket');
  return { problems, checked, skipped };
}

function selftest() {
  const ok = (name) => ({
    resolved: `${REGISTRY}${name}/-/${name}-1.0.0.tgz`,
    integrity: 'sha512-AAAA',
  });
  const lock = (extra) => ({
    lockfileVersion: 3,
    packages: { '': { name: 'x' }, 'node_modules/a': ok('a'), ...extra },
  });
  const mustFail = {
    'drugi host': { 'node_modules/b': { ...ok('b'), resolved: 'https://evil.example/b/-/b-1.0.0.tgz' } },
    'http bez TLS-a': { 'node_modules/b': { ...ok('b'), resolved: 'http://registry.npmjs.org/b/-/b-1.0.0.tgz' } },
    'git izvor': { 'node_modules/b': { ...ok('b'), resolved: 'git+https://github.com/x/b.git#abc' } },
    'bez integrity': { 'node_modules/b': { resolved: ok('b').resolved } },
    'sha1 integrity': { 'node_modules/b': { ...ok('b'), integrity: 'sha1-AAAA' } },
  };
  for (const [label, extra] of Object.entries(mustFail)) {
    if (lockfileSourceProblems(lock(extra)).problems.length === 0) {
      console.error(`[lockfile-sources] FAIL selftest: "${label}" NIJE prijavljen. Gard ne grize.`);
      return 1;
    }
  }
  const bundled = lockfileSourceProblems(lock({ 'node_modules/a/node_modules/c': { version: '1.0.0', inBundle: true } }));
  if (bundled.problems.length !== 0) {
    console.error(`[lockfile-sources] FAIL selftest: \`inBundle\` bez \`resolved\` je lazno prijavljen: ${bundled.problems.join('; ')}`);
    return 1;
  }
  if (lockfileSourceProblems({ lockfileVersion: 1, dependencies: {} }).problems.length === 0) {
    console.error('[lockfile-sources] FAIL selftest: lockfile bez `packages` NIJE odbijen.');
    return 1;
  }
  console.log(`[lockfile-sources] SELF-TEST OK: ${Object.keys(mustFail).length} losih izvora se hvata, inBundle prolazi, nevaljan lockfile pada.`);
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
  console.log(`[lockfile-sources] OK: ${checked} paketa s ${REGISTRY} i sha512 integrity (izuzeto ${skipped}: korijen, link, inBundle).`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`[lockfile-sources] FAIL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
