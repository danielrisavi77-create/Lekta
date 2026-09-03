// scripts/projection-verify.mjs
//
// Sadrzajna presuda o pecenim projekcijama: REGENERIRA pa usporedi bajtove.
// Sva logika presude je u `projection-verify-core.mjs`; ovdje je samo orkestracija.
//
//   npm run projection-verify              samo ono sto screening prijavi (jeftino suzavanje)
//   npm run projection-verify -- --all     sve projekcije, bez obzira na screening
//   npm run projection-verify -- --only closed-loop
//
// Traje desetak minuta po projekciji, pa NIJE gate. Zamisljeno je kao nocni/rucni posao koji
// presudjuje ono sto je `projection-freshness` samo posumnjao.
//
// Regeneracija IDE U IZOLIRAN WORKTREE, nikad u radno stablo: generatori pisu u `docs/generated/**`
// i `data/generated/**`, pa bi u dijeljenom stablu pregazili tudji necommitan rad. To je izricito
// pravilo ovog repozitorija i vec je jednom kostalo dan posla.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Sadrzaj jednog artefakta, gdje artefakt smije biti DATOTEKA ili DIREKTORIJ.
 *
 * Dvije projekcije (`worklist`, `citation-dossiers`) ne pisu jednu datoteku nego 21 odnosno 72
 * markdowna u direktorij, pa se njihov izlaz ne moze procitati iz koda nego samo izmjeriti. Za
 * direktorij se gradi kanonski niz `staza
---
sadrzaj`, sortiran po stazi, pa dodana ili
 * uklonjena datoteka izlazi kao sadrzajna razlika, kako i treba.
 */
function citajArtefakt(abs) {
  if (!fs.existsSync(abs)) return null;
  if (!fs.statSync(abs).isDirectory()) return fs.readFileSync(abs, 'utf8');
  // Razdjelnici se grade bez escapea: obrazac koji ih pise kroz alat danas je vise puta izgubio
  // backslash i prelomio niz preko dva retka.
  const NL = String.fromCharCode(10);
  const dijelovi = [];
  const hodaj = (dir, prefiks) => {
    const unosi = fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name));
    for (const d of unosi) {
      const p = path.join(dir, d.name);
      const rel = prefiks ? prefiks + '/' + d.name : d.name;
      if (d.isDirectory()) hodaj(p, rel);
      else dijelovi.push(rel + NL + '---' + NL + fs.readFileSync(p, 'utf8'));
    }
  };
  hodaj(abs, '');
  return dijelovi.join(NL + '=====' + NL);
}
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTIONS } from './projection-freshness-core.mjs';
import { classifyArtifact, projectionVerdict, formatVerdict, exitCodeFor } from './projection-verify-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// stderr se HVATA, ne ispisuje: `git worktree add` na stderr baca stotinjak redaka napretka
// checkouta, sto zatrpa presudu zbog koje se alat i pokrece. Pri gresci execFileSync ionako baci.
const git = (args, cwd = ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const argv = process.argv.slice(2);
const wantAll = argv.includes('--all');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

// --- 1. koga uopce provjeravamo -------------------------------------------------------------
let targets = PROJECTIONS;
if (only) {
  targets = PROJECTIONS.filter((p) => p.id === only);
  if (!targets.length) {
    console.error(`nepoznata projekcija: ${only}`);
    process.exit(2);
  }
} else if (!wantAll) {
  // Screening suzava skup. Njegov izlazni kod 1 znaci "ima kandidata", ne "ima kvara".
  const probe = spawnSync(process.execPath, [path.join(ROOT, 'scripts/projection-freshness.mjs')], { encoding: 'utf8' });
  const flagged = new Set(
    (probe.stdout || '').split('\n').filter((l) => l.includes('PROVJERI')).map((l) => l.trim().split(/\s+/)[1]),
  );
  targets = PROJECTIONS.filter((p) => flagged.has(p.id));
  if (!targets.length) {
    console.log('screening nije prijavio nijednu projekciju; nema sto presudjivati.');
    console.log('(za bezuvjetnu provjeru: `npm run projection-verify -- --all`)');
    process.exit(0);
  }
}

// --- 2. izoliran worktree na trenutnom HEAD-u ------------------------------------------------
const head = git(['rev-parse', 'HEAD']);
const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'lekta-projverify-'));
console.log(`HEAD:     ${head.slice(0, 8)}`);
console.log(`worktree: ${wt}`);
console.log(`provjera: ${targets.map((t) => t.id).join(', ')}\n`);

let verdicts = [];
try {
  git(['worktree', 'add', '--detach', wt, head]);
  // node_modules kao junction: bez njega generatori padnu na "'vite-node' is not recognized", sto
  // izgleda kao kvar koda a nije.
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(wt, 'node_modules'), os.platform() === 'win32' ? 'junction' : 'dir');

  for (const proj of targets) {
    // Bajtovi PRIJE: cist checkout HEAD-a, dakle upravo ono sto je commitano.
    const before = new Map();
    for (const rel of proj.artifacts) {
      before.set(rel, citajArtefakt(path.join(wt, rel)));
    }

    const started = Date.now();
    const run = spawnSync(proj.regenerate, { cwd: wt, shell: true, encoding: 'utf8', stdio: 'pipe' });
    const secs = Math.round((Date.now() - started) / 1000);

    const artifacts = proj.artifacts.map((rel) => {
      if (run.status !== 0) {
        const tail = (run.stderr || run.stdout || '').trim().split('\n').slice(-3).join(' | ');
        return { path: rel, status: 'neprovjereno', reason: `regeneracija pala (exit ${run.status}): ${tail.slice(0, 160)}` };
      }
      const after = citajArtefakt(path.join(wt, rel));
      if (after === null) return { path: rel, status: 'neprovjereno', reason: 'artefakt ne postoji nakon regeneracije' };
      const b = before.get(rel);
      if (b === null) return { path: rel, status: 'neprovjereno', reason: 'artefakt nije bio commitan' };
      return { path: rel, status: classifyArtifact(b, after) };
    });

    const v = projectionVerdict(proj.id, artifacts);
    verdicts.push(v);
    console.log(`${formatVerdict(v)}   (${secs} s)`);
    for (const d of v.drifted) console.log(`             RAZLIKA: ${d}`);
  }
} finally {
  try { git(['worktree', 'remove', '--force', wt]); } catch { /* ostavljamo trag, ne rusimo presudu */ }
  try { git(['worktree', 'prune']); } catch { /* nebitno */ }
}

const code = exitCodeFor(verdicts);
console.log('');
if (code === 0) {
  console.log('PRESUDA: nijedna provjerena projekcija se sadrzajno ne razlikuje od svog izvora.');
  console.log('(screening je, dakle, bio lazno pozitivan; artefakte NE treba commitati)');
} else {
  console.log('PRESUDA: postoji STVARAN raskorak ili neuspjela provjera. Ovo je nalaz, ne sumnja.');
  console.log('Regeneriraj u izoliranom worktreeu i commitaj artefakte iz njega.');
}
process.exit(code);
