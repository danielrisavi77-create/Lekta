/**
 * Claude Code PostToolUse hook (Edit|Write): odmah nakon zapisa pokrece oxlint nad TOM JEDNOM datotekom
 * i gresku vraca modelu, umjesto da se kvar otkrije tek u `build-gate` na CI-ju (odluka vlasnika
 * 2026-10-13: brza povratna sprega, trajno u repou).
 *
 * Ne blokira zapis: PostToolUse se izvodi nakon alata. Izlaz 2 znaci da stderr ide modelu kao nalaz koji
 * mora popraviti; izlaz 0 znaci cisto ili izvan opsega. Samo oxlint (Rust, desetinke sekunde po datoteci);
 * `tsc` nad cijelim projektom je tezak posao i ide kroz `with-gate-lock`, ne kroz hook na svaki zapis.
 *
 * Opseg: JS/TS izvor izvan putanja koje `.oxlintrc.json` ignorira (`node_modules/`, `dist/`, `dist-packs/`,
 * `data/`, `docs/`, `public/`, `.claude/`, `visual-system-v2/`), dakle isti skup koji lintaju `npm run lint` i
 * build-gate. Pravila i ignore i dalje cita sam oxlint iz `.oxlintrc.json`, pa hook i `npm run lint` ne mogu
 * razilaziti u presudi nad istom datotekom.
 *
 * FAIL-OPEN kao ostali hookovi: bez `node_modules` (npr. svjez clone), na timeout, vlastitu gresku ili
 * neuspjeh oxlinta bez ijednog retka nalaza (kvar alata, ne nalaz) hook propusta, uz kratku napomenu na stderr.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hookFilePath, readHookInput } from './hook-input.mjs';

const EKSTENZIJE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IZVAN_OPSEGA = [/^node_modules\//, /^dist\//, /^dist-packs\//, /^data\//, /^docs\//, /^public\//,
  /^\.claude\//, /^visual-system-v2\//];
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
  if (prikaz.length === 0) {
    // Neuspjeh bez ijednog retka nalaza je kvar pokretanja (putanja, konfiguracija), ne lint greska.
    const razlog = String(ishod.stderr ?? '').trim().split('\n')[0] || `izlaz ${ishod.status}`;
    return { prijavi: false, poruka: `lint-feedback: oxlint nije dao nalaz za ${rel} (${razlog}), propustam (fail-open).` };
  }
  return {
    prijavi: true,
    poruka: `lint-feedback: oxlint nalazi greske u ${rel} (isto pravilo kao build-gate). Popravi ih prije sljedeceg koraka:\n`
      + prikaz.join('\n'),
  };
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
    const putanja = hookFilePath(payload);
    if (!putanja || !putanja.root || !putanja.rel || !existsSync(putanja.absolute)) process.exit(0);
    const { root, rel } = putanja;
    if (!uOpsegu(rel)) process.exit(0);
    const bin = oxlintBin(root);
    if (!bin) process.exit(0);
    // Na Windowsu je `.cmd` omotac i trazi shell; shell spaja argumente, pa putanje s razmakom idu u navodnicima.
    const win = process.platform === 'win32';
    const ishod = spawnSync(win ? `"${bin}"` : bin, ['--format', 'unix', win ? `"${rel}"` : rel], {
      cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, shell: win,
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
