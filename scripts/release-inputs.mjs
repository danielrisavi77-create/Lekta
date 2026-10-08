#!/usr/bin/env node
// scripts/release-inputs.mjs
//
// Prvi korak objave jednim gumbom (.github/workflows/release.yml): su li ulazi workflowa valjani
// PRIJE nego ista ode van.
//
// Ulazi dolaze iz `workflow_dispatch` forme i iz GitHub environmenta, dakle od covjeka koji tipka.
// Popis funkcija ide u ljusku nerazdvojen (`supabase functions deploy $RELEASE_FUNCTIONS`), pa ime
// mora biti postojeci direktorij u supabase/functions, ne proizvoljan tekst. Commit mora biti
// upravo ono sto je checkoutano i mora biti na masteru: objava grane ili tudjeg commita nije
// "malo drukcija objava", nego objava koda koji nitko nije pregledao.
//
// Izlaz: 0 = ulazi valjani; 1 = barem jedan problem (svi se ispisuju odjednom).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Migracije bez kojih funkcija u objavi ne radi. Ulaz `migrations` ih smije prosiriti, ali ne i
 * izostaviti (Codex na #339): bez 0209 `repair-docx` vraca 503 na svaki popravak, a bez 0207
 * `create-checkout` cita stupce i proizvode koji ne postoje.
 */
export const REQUIRED_MIGRATIONS = {
  'repair-docx': ['0209_repair_limit_po_korisniku'],
  'create-checkout': ['0207_monetizacija_v1'],
};

/**
 * Funkcije koje s klijentom dijele ugovor o privoli (`termsVersion`): svaka objava ih nosi obje,
 * inace novi klijent ode van uz stare funkcije i smoke prolazi na njihovom 401 (Codex na #339).
 */
export const CONTRACT_FUNCTIONS = ['repair-docx', 'create-checkout'];

/**
 * Kanonski ciljevi objave. Environment varijable moraju se poklopiti s njima, pa kopiran ili
 * pogresno uredjen environment ne moze objaviti na krivi projekt ili site (Codex na #339).
 * Produkcijski ref se uz to cita iz src/config/deployment.ts, jer ga klijent odande uzima.
 */
export const TARGETS = {
  staging: {
    projectRef: 'bnyemcnsphlitjradrst',
    netlifySiteId: 'f432ae00-c4f6-4ded-8c22-d4b71c7b8687',
    siteOrigin: 'https://lekta-staging.netlify.app',
  },
  production: {
    projectRef: 'zrrjttizjyfcxmcpgzml',
    netlifySiteId: '1e7526f5-7f0a-480e-8589-d79ee91ff7b0',
    siteOrigin: 'https://lekta.hr',
  },
};

/** Kanonski produkcijski Supabase ref iz izvora klijenta (src/config/deployment.ts). */
export function canonicalProductionRef(deploymentTs) {
  const m = /PRODUCTION_SUPABASE_URL = 'https:\/\/([a-z0-9]{20})\.supabase\.co'/.exec(deploymentTs);
  return m ? m[1] : null;
}

/** Popis problema nad vec prikupljenim cinjenicama; prazan popis znaci valjano. */
export function releaseInputProblems(f) {
  const out = [];
  if (!/^[0-9a-f]{40}$/.test(f.sha)) out.push(`sha "${f.sha}" nije 40-znamenkasti commit`);
  else {
    if (f.head !== f.sha) out.push(`checkoutan je ${f.head}, a trazen ${f.sha}`);
    if (!f.onMaster) out.push(`commit ${f.sha} nije na origin/master`);
  }
  const fns = f.functions.split(/\s+/).filter(Boolean);
  if (fns.length === 0) out.push('popis funkcija je prazan');
  for (const fn of fns) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(fn) || fn === '_shared' || !f.functionDirs.includes(fn)) {
      out.push(`funkcija "${fn}" ne postoji u supabase/functions`);
    }
  }
  const migs = f.migrations.split(/[\s,]+/).filter(Boolean);
  if (migs.length === 0) out.push('popis migracija je prazan');
  for (const m of migs) {
    if (!f.migrationFiles.includes(`${m}.sql`)) out.push(`migracija "${m}" ne postoji u supabase/migrations`);
  }
  for (const fn of fns) {
    for (const m of REQUIRED_MIGRATIONS[fn] ?? []) {
      if (!migs.includes(m)) out.push(`funkcija "${fn}" trazi migraciju "${m}", a nije u popisu migracija`);
    }
  }
  for (const fn of CONTRACT_FUNCTIONS) {
    if (!fns.includes(fn)) out.push(`objava mora nositi funkciju "${fn}" (dijeli ugovor o privoli s klijentom)`);
  }
  const t = TARGETS[f.target];
  if (!t) {
    out.push(`nepoznat cilj objave "${f.target}"`);
    return out;
  }
  // Produkcijski klijent NE cita SUPABASE_PROJECT_REF nego kanonski ref iz src/config/deployment.ts.
  // Krivi ref bi zato objavio funkcije na drugi projekt, a klijent na produkciju (Codex na #339).
  if (f.target === 'production') {
    if (!f.canonicalProdRef) out.push('kanonski produkcijski ref nije procitan iz src/config/deployment.ts');
    else if (f.canonicalProdRef !== t.projectRef) out.push(`src/config/deployment.ts cilja ${f.canonicalProdRef}, a TARGETS.production ${t.projectRef}`);
  }
  if (f.projectRef !== t.projectRef) out.push(`vars.SUPABASE_PROJECT_REF "${f.projectRef}" nije kanonski ${f.target} ref ${t.projectRef}`);
  if (f.netlifySiteId !== t.netlifySiteId) out.push(`vars.NETLIFY_SITE_ID "${f.netlifySiteId}" nije kanonski ${f.target} site ${t.netlifySiteId}`);
  if (f.siteOrigin !== t.siteOrigin) out.push(`vars.SITE_ORIGIN "${f.siteOrigin}" nije kanonski ${f.target} origin ${t.siteOrigin}`);
  return out;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isOnMaster(sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/master'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const root = process.cwd();
  const fnDir = join(root, 'supabase', 'functions');
  const sha = (process.env.RELEASE_SHA ?? '').trim().toLowerCase();
  const facts = {
    sha,
    head: git(['rev-parse', 'HEAD']),
    onMaster: isOnMaster(sha),
    functions: process.env.RELEASE_FUNCTIONS ?? '',
    migrations: process.env.RELEASE_MIGRATIONS ?? '',
    functionDirs: readdirSync(fnDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(fnDir, d.name, 'index.ts')))
      .map((d) => d.name),
    migrationFiles: readdirSync(join(root, 'supabase', 'migrations')),
    projectRef: (process.env.PROJECT_REF ?? '').trim(),
    siteOrigin: (process.env.SITE_ORIGIN ?? '').trim(),
    netlifySiteId: (process.env.NETLIFY_SITE_ID ?? '').trim(),
    target: (process.env.RELEASE_TARGET ?? '').trim(),
    canonicalProdRef: canonicalProductionRef(readFileSync(join(root, 'src', 'config', 'deployment.ts'), 'utf8')),
  };
  const problems = releaseInputProblems(facts);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[release-inputs] ${p}`);
    process.exit(1);
  }
  console.log(`[release-inputs] OK: ${sha} na masteru; funkcije: ${facts.functions.trim()}; cilj ${facts.projectRef}, ${facts.siteOrigin}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
