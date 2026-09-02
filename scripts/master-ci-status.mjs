// scripts/master-ci-status.mjs
//
// Je li master ZELEN na CI-u? Odgovor u jednoj naredbi, iz GitHuba, ne iz ovog stroja.
//
// Zasto postoji: 2026-09-02 je mjerenje pokazalo da su CETIRI uzastopna master commita bila
// crvena na CI-u (1f12c0be, 5fd8c84b, f22eb616, 8bb158a6), a to je otkrila tek sesija koja je
// slucajno mjerila nesto drugo. Lokalni `npm run check` to ne moze reci: on mjeri RADNO STABLO
// (vidi CLAUDE.md), a i na 8 GB stroju uz vise sesija zna umrijeti na OOM-u.
//
// TRI ishoda, ne dva. "Ne znam" se NE smije prikazati kao zeleno: `gh` redovno pada na mrezi
// (TLS handshake timeout, unexpected EOF) i pritom zna zavrsiti kao uspjeh, sto je isti razred
// laznog zelenog koji ovaj repozitorij vec dokumentira za pozadinske zadatke.
//
//   0  zeleno    zadnji dovrseni run na masteru je uspio
//   1  CRVENO    zadnji dovrseni run na masteru je pao
//   2  ne znam   gh nedostupan, nije autentificiran, ili nema runova
//
// Pokretanje:  npm run master-ci        (ili: node scripts/master-ci-status.mjs)

import { execFile } from 'node:child_process';

const WORKFLOW = 'check.yml';
// Grana je argument SAMO da bi se crvena i "ne znam" grana mogle stvarno izvrsiti (negativne
// kontrole); bez argumenta je uvijek master, sto je jedina upotreba u proizvodu.
const BRANCH = process.argv[2] || 'master';
const TIMEOUT_MS = 25000;

function gh(args) {
  return new Promise((resolve) => {
    const child = execFile('gh', args, { timeout: TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    child.on('error', () => {});
  });
}

const { err, stdout, stderr } = await gh([
  'run', 'list', '--workflow', WORKFLOW, '--branch', BRANCH, '--limit', '10',
  '--json', 'headSha,status,conclusion,createdAt,url',
]);

if (err || !stdout.trim()) {
  const razlog = (stderr.trim() || String(err && err.message) || 'prazan odgovor').split('\n')[0];
  console.log(`NE ZNAM: gh nije odgovorio (${razlog})`);
  console.log('Ovo NIJE zeleno. Ponovi poziv; gh na ovoj mrezi zna pasti pa ipak zavrsiti kao uspjeh.');
  process.exit(2);
}

let runovi;
try {
  runovi = JSON.parse(stdout);
} catch {
  console.log('NE ZNAM: gh je vratio nesto sto nije JSON.');
  process.exit(2);
}

const dovrseni = runovi.filter((r) => r.status === 'completed' && r.conclusion);
if (!dovrseni.length) {
  const uTijeku = runovi.filter((r) => r.status !== 'completed').length;
  console.log(`NE ZNAM: nema dovrsenih runova na ${BRANCH} (u tijeku: ${uTijeku}).`);
  process.exit(2);
}

const zadnji = dovrseni[0];
const sha = String(zadnji.headSha).slice(0, 8);
const kada = String(zadnji.createdAt).replace('T', ' ').replace('Z', ' UTC');

// Niz uzastopnih padova je vazniji od jednog: 2026-09-02 ih je bilo cetiri, a nitko nije gledao.
let niz = 0;
for (const r of dovrseni) {
  if (r.conclusion === 'success') break;
  niz += 1;
}

if (zadnji.conclusion === 'success') {
  console.log(`ZELENO: ${BRANCH} ${sha} je prosao CI (${kada}).`);
  process.exit(0);
}

console.log(`CRVENO: ${BRANCH} ${sha} je pao na CI-u (${zadnji.conclusion}, ${kada}).`);
if (niz > 1) console.log(`Uzastopnih padova na vrhu: ${niz}. Grana je crvena duze, ne tek od zadnjeg commita.`);
console.log(`Detalji: ${zadnji.url || '(bez url-a)'}`);
process.exit(1);
