/**
 * Claude Code PostToolUse hook (Edit|Write): odmah nakon zapisa pokrece oxlint nad TOM JEDNOM datotekom
 * i gresku vraca modelu, umjesto da se kvar otkrije tek u `build-gate` na CI-ju (odluka vlasnika
 * 2026-10-13: brza povratna sprega, trajno u repou).
 *
 * Ne blokira zapis: PostToolUse se izvodi nakon alata. Izlaz 2 znaci da stderr ide modelu kao nalaz koji
 * mora popraviti; izlaz 0 znaci cisto ili izvan opsega. Samo oxlint (Rust, desetinke sekunde po datoteci);
 * `tsc` nad cijelim projektom je tezak posao i ide kroz `with-gate-lock`, ne kroz hook na svaki zapis.
 *
 * Opseg: JS/TS izvor izvan putanja koje `.oxlintrc.json` ignorira (`data/`, `docs/`, `public/`, `.claude/`,
 * `dist/`, `visual-system-v2/`) i izvan `tests/fixtures/`. Pravila i ignore i dalje cita sam oxlint iz
 * `.oxlintrc.json`, pa hook i `npm run lint` ne mogu razilaziti u presudi nad istom datotekom.
 *
 * FAIL-OPEN kao ostali hookovi: bez `node_modules` (npr. svjez clone), na timeout ili vlastitu gresku
 * hook sutke propusta, uz kratku napomenu na stderr.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readHookInput } from './hook-input.mjs';

const EKSTENZIJE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IZVAN_OPSEGA = [/^node_modules\//, /^dist\//, /^dist-packs\//, /^data\//, /^docs\//, /^public\//,
  /^\.claude\//, /^visual-system-v2\//, /^tests\/fixtures\//];
/** Najvise redaka nalaza koje hook vraca modelu; ostatak se sazima u jedan redak. */
const MAX_REDAKA = 40;
const TIMEOUT_MS = 20_000;

/** @param {string | null} rel putanja relativna na korijen repozitorija, s `/` */
export function uOpsegu(rel) {
  return typeof rel === 'string' && EKSTENZIJE.test(rel) && !IZVAN_OPSEGA.some((re) => re.test(rel));
}

/**
 * Cista presuda nad ishodom oxlinta, bez nuspojava.
 * @param {string} rel
 * @param {{ status: number | null, stdout?: string, stderr?: string, error?: unknown }} ishod
 * @returns {{ prijavi: boolean, poruka: string }}
 */
export function judgeLint(rel, ishod) {
  if (ishod.error || ishod.status === null) {
    return { prijavi: false, poruka: `lint-feedback: oxlint nije zavrsio za ${rel}, propustam (fail-open).` };
  }
  if (ishod.status === 0) return { prijavi: false, poruka: '' };
  const retci = String(ishod.stdout ?? '').replace(/\r\n/g, '\n').split('\n').filter((r) => r.trim() !== '');
  const prikaz = retci.slice(0, MAX_REDAKA);
  if (retci.length > MAX_REDAKA) prikaz.push(`... jos ${retci.length - MAX_REDAKA} redaka`);
  if (prikaz.length === 0) prikaz.push(String(ishod.stderr ?? '').trim() || `oxlint izlaz ${ishod.status}`);
  return {
    prijavi: true,
    poruka: `lint-feedback: oxlint nalazi greske u ${rel} (isto pravilo kao build-gate). Popravi ih prije sljedeceg koraka:\n`
      + prikaz.join('\n'),
  };
}

function findRepoRoot(start) {
  let current = resolve(start || process.cwd());
  while (true) {
    if (existsSync(join(current, 'docs', 'agents', 'tasks.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Lokalni oxlint iz `node_modules`; null kad nije instaliran. */
function oxlintBin(root) {
  const ime = process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint';
  const bin = join(root, 'node_modules', '.bin', ime);
  return existsSync(bin) ? bin : null;
}

async function main() {
  const payload = await readHookInput('lint-feedback');
  if (!payload) process.exit(0);
  let presuda;
  try {
    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath.trim()) process.exit(0);
    const cwd = payload?.cwd || process.cwd();
    const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
    const root = findRepoRoot(dirname(absolute));
    if (!root || !existsSync(absolute)) process.exit(0);
    const rel = relative(root, absolute).replace(/\\/g, '/');
    if (rel.startsWith('../') || isAbsolute(rel) || !uOpsegu(rel)) process.exit(0);
    const bin = oxlintBin(root);
    if (!bin) process.exit(0);
    const ishod = spawnSync(bin, ['--format', 'unix', rel], {
      cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, shell: process.platform === 'win32',
    });
    presuda = judgeLint(rel, ishod);
  } catch (err) {
    process.stderr.write('lint-feedback: interna greska, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  if (presuda.prijavi) {
    process.stderr.write(presuda.poruka + '\n');
    process.exit(2);
  }
  if (presuda.poruka) process.stderr.write(presuda.poruka + '\n');
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/lint-feedback.mjs');
if (isMain) main();
