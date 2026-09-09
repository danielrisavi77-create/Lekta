// scripts/npm-audit-ratchet.mjs
//
// `npm run audit:ratchet`: broj high/critical nalaza u PUNOM grafu (`npm audit --json`) usporedjuje se
// sa stropom u `data/security/npm-audit-ratchet.json`. Iznad stropa je pad; ispod stropa je poziv
// da se strop spusti (`::notice`); jednako je tiho OK. Logika je u `npm-audit-ratchet-core.mjs`.
//
// SELFTEST (`--selftest`) je dokaz da gard grize: podmece izlaz s brojem iznad stropa i trazi pad,
// pa podmece jednak broj i trazi prolaz. Vrti se u CI-ju PRIJE stvarnog mjerenja (isti obrazac kao
// `check-edge-lock.mjs --selftest` i `post-deploy-smoke.mjs --self-test`).
//
// Izlaz ide preko `process.exitCode`, ne `process.exit()`: uz zivu child-process uticnicu
// `process.exit()` na Windowsu zna vratiti 127 (vidi master-ci u CLAUDE.md).
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { countHighCritical, compareToRatchet, formatVerdict } from './npm-audit-ratchet-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATCHET_PATH = path.join(ROOT, 'data', 'security', 'npm-audit-ratchet.json');

function readRatchet() {
  return JSON.parse(readFileSync(RATCHET_PATH, 'utf8'));
}

function runAudit() {
  // `npm audit` vraca exit 1 kad ima nalaza; to nije greska nego odgovor. Greska je prazan ili
  // neparsabilan izlaz (nema mreze, npm pao), i ona se NE smije citati kao "nula nalaza".
  // Jedan niz kroz shell, bez polja argumenata: Node 24 uz `shell: true` + args javlja DEP0190, a
  // bez shella na Windowsu `npm.cmd` odbija EINVAL. Niz je konstanta, nema korisnickog unosa.
  const r = spawnSync('npm audit --json', { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const out = String(r.stdout ?? '').trim();
  if (!out) throw new Error(`npm audit nije dao izlaz (status ${r.status}); ${String(r.stderr ?? '').slice(0, 300)}`);
  return JSON.parse(out);
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function selftest() {
  const ratchet = readRatchet();
  const ceiling = Number(ratchet.fullGraphHighCritical);
  if (!Number.isFinite(ceiling)) {
    console.error('[audit-ratchet] FAIL selftest: strop nije broj, mutacija nema sto prekoraciti.');
    return 1;
  }
  const fake = (n) => ({ vulnerabilities: Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { severity: i % 2 ? 'high' : 'critical' }])) });
  const above = compareToRatchet(countHighCritical(fake(ceiling + 1)), ratchet);
  if (above.verdict !== 'above') {
    console.error('[audit-ratchet] FAIL selftest: podmetnut porast NIJE prijavljen. Gard ne grize.');
    return 1;
  }
  const equal = compareToRatchet(countHighCritical(fake(ceiling)), ratchet);
  if (equal.verdict !== 'equal') {
    console.error('[audit-ratchet] FAIL selftest: jednak broj nije prosao kao jednak.');
    return 1;
  }
  console.log(`[audit-ratchet] SELF-TEST OK: strop ${ceiling}, porast se hvata, jednakost prolazi.`);
  return 0;
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const ratchet = readRatchet();
  const status = compareToRatchet(countHighCritical(runAudit()), ratchet);
  const msg = formatVerdict(status);
  console.log(`[audit-ratchet] ${msg}`);
  summary(`### Supply chain: ${status.count} high/critical u punom grafu (strop ${status.ceiling}, ${status.verdict})`);
  summary('Produkcijski graf (ono sto ide u bundle) je zaseban korak i JEST blokirajuc.');
  if (status.verdict === 'above') return 1;
  if (status.verdict === 'below') console.log(`::notice::${msg}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`[audit-ratchet] FAIL: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
