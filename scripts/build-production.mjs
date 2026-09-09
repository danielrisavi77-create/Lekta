// scripts/build-production.mjs
//
// JEDNA naredba izgradnje produkcijskog artefakta, ista za Netlify i CI (plan T03).
//
// Do sada je lanac zivio na DVA mjesta kao doslovno prepisan niz `npm run ...` naredbi: `netlify.toml`
// (`[build].command`) i `.github/workflows/check.yml` (job `dist-gate`). Dvije kopije se raziđu tiho:
// generator dodan u jednu a ne u drugu znaci da CI gradi drukciji `dist/` od hostinga, a bas tu razliku
// je vanjski audit 2026-09-08 (nalaz 3) imenovao kao "javno naspram master". Ovdje je popis koraka
// JEDAN, a oba potrosaca zovu `node scripts/build-production.mjs`.
//
// REDOSLIJED JE UGOVOR: `vite build` prazni `dist/`, pa svi generatori idu POSLIJE njega; `build-info`
// pise identitet builda koji smoke cita sa zive stranice; `verify-deploy-dist` je ZADNJI jer provjerava
// ono sto su generatori stvarno ostavili. `--skip-verify` postoji za CI koji provjeru vrti kao zaseban,
// imenovan korak (da pad dobije vlastito ime u logu), ne da bi se provjera izostavila.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Koraci u redoslijedu; `npm run <ime>` osim zadnjeg, koji je izravno node skripta. */
export const BUILD_STEPS = Object.freeze([
  'build',
  'build-info',
  'generate-citation-tools',
  'generate-legal-pages',
  'generate-coverage-page',
  'generate-faculty-pages',
  'generate-title-page-tools',
  'generate-competitor-pages',
]);
export const VERIFY_STEP = 'node scripts/verify-deploy-dist.mjs';

/** Doslovan shell niz, isti koji je do sada stajao u netlify.toml; testovi ga usporedjuju s tom datotekom. */
export function buildCommandLine({ verify = true } = {}) {
  const parts = BUILD_STEPS.map((step) => `npm run ${step}`);
  if (verify) parts.push(VERIFY_STEP);
  return parts.join(' && ');
}

export function runBuild({ verify = true, cwd = process.cwd(), log = console.log } = {}) {
  const steps = BUILD_STEPS.map((step) => ({ label: `npm run ${step}`, cmd: 'npm', args: ['run', step] }));
  if (verify) steps.push({ label: VERIFY_STEP, cmd: process.execPath, args: ['scripts/verify-deploy-dist.mjs'] });
  for (const step of steps) {
    log(`[build-production] ${step.label}`);
    const started = Date.now();
    // `shell: true` je nuzan za `npm` na Windowsu (npm.cmd); argumenti su konstante iz ove datoteke,
    // ne korisnicki ulaz, pa interpolacija ne otvara nista.
    const r = spawnSync(step.cmd, step.args, { cwd, stdio: 'inherit', shell: step.cmd === 'npm' });
    if (r.status !== 0) {
      log(`[build-production] PAD u koraku "${step.label}" (kod ${r.status ?? r.signal}) nakon ${Math.round((Date.now() - started) / 1000)} s`);
      return r.status ?? 1;
    }
  }
  log('[build-production] OK: produkcijski artefakt u dist/');
  return 0;
}

// STRAZA IDE PREKO `pathToFileURL`, NIKAD PREKO `file://` + staze (vidi post-deploy-smoke.mjs i CLAUDE.md).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verify = !process.argv.includes('--skip-verify');
  if (process.argv.includes('--print')) {
    console.log(buildCommandLine({ verify }));
  } else {
    process.exitCode = runBuild({ verify });
  }
}
