// scripts/write-build-info.mjs
//
// Zapisuje `dist/build-info.json`: KOJI commit je ovaj build, i kad je nastao.
//
// ZASTO (vanjski audit 2026-09-08, nalaz 3): javna stranica je danima stajala na commitu od 2026-09-06
// (objava zakljucana, noviji buildovi padaju na gardu dokaza), a nista nad zivom stranicom to nije moglo
// reci: `post-deploy-smoke` je provjeravao stranice, resurse i zaglavlja, ali ne i identitet builda.
// Razlika "javno naspram master" se tako vidjela samo usporedbom ponasanja u pregledniku.
//
// Datoteka je javna i nosi samo sha commita i vrijeme; oboje je vec javno u repozitoriju.
// `COMMIT_REF` postavlja Netlify; lokalno se cita `git rev-parse HEAD`. Bez ijednog od ta dva izvora
// skripta PADA, jer `build-info.json` s izmisljenim commitom bi bio gori od nikakvog.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'build-info.json');
const SHA = /^[0-9a-f]{40}$/;

export function resolveCommit(env = process.env, exec = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' })) {
  const fromEnv = String(env.COMMIT_REF ?? '').trim();
  if (SHA.test(fromEnv)) return fromEnv;
  try {
    const head = exec('git rev-parse HEAD').trim();
    if (SHA.test(head)) return head;
  } catch {
    // pada nize
  }
  return null;
}

export function buildInfo(commit, now = new Date()) {
  if (!commit || !SHA.test(commit)) throw new Error('build-info: commit nije 40-znamenkasti sha (nema COMMIT_REF ni gita)');
  return { commit, builtAt: now.toISOString() };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(path.join(ROOT, 'dist'))) {
    console.error('[build-info] FAIL: dist/ ne postoji; pokreni poslije `vite build`.');
    process.exitCode = 1;
  } else {
    try {
      const info = buildInfo(resolveCommit());
      fs.writeFileSync(OUT, JSON.stringify(info, null, 2) + '\n', 'utf8');
      console.log(`[build-info] dist/build-info.json: ${info.commit.slice(0, 12)} @ ${info.builtAt}`);
    } catch (e) {
      console.error(`[build-info] FAIL: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }
}
