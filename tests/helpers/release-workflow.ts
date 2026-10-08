/**
 * Gard objave jednim gumbom (.github/workflows/release.yml, odluka vlasnika 2026-10-08).
 *
 * Workflow vrijedi samo dok cuva cetiri tvrdnje, i svaka je ovdje presuda nad PARSIRANIM YAML-om:
 *   1. pokrece ga samo covjek (`workflow_dispatch`), nikad push, PR ni raspored;
 *   2. produkcija ide tek iza zelenog staginga i iza GitHub environmenta `production` (odobrenje);
 *   3. u svakoj okolini redoslijed je ulazi, build, migracije (citanje), upload klijenta (neobjavljen),
 *      Edge, objava klijenta, strogi smoke, pa klijent nikad ne ode van bez funkcija s kojima dijeli
 *      ugovor o privoli, a pad uploada ne ostavlja nove funkcije uz stari klijent. Pokrece samo vlasnik;
 *   4. produkcijski build trazi tvrdi dokaz izdanja; migracije (`supabase db push`) workflow primjenjuje
 *      SAMO na staging (odluka vlasnika 2026-10-08), poslije builda i prije provjere migracija i Edgea.
 *      Prije db push Katedrine verzije samo u bazi dobivaju privremeni placeholder
 *      (scripts/release-staging-history.mjs). Produkcijske migracije ostaju vlasnikov rucni korak.
 *
 * Baseline je u tests/release-workflow.test.ts, mutacije u tests/gate-mutations-release.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const RELEASE_WORKFLOW_PATH = join(import.meta.dirname, '..', '..', '.github', 'workflows', 'release.yml');

interface Step { name?: string; run?: string; uses?: string; env?: Record<string, unknown> }
interface Job { needs?: string | string[]; if?: string; environment?: string | { name?: string }; steps?: Step[] }
interface Workflow { on?: unknown; jobs?: Record<string, Job> }

/** Faze objave redom kojim moraju doci; svaka se prepoznaje po naredbi, ne po imenu koraka. */
const PHASES: { id: string; test: (run: string) => boolean }[] = [
  { id: 'ulazi', test: (r) => /\bnode scripts\/release-inputs\.mjs\b/.test(r) },
  { id: 'cli', test: (r) => /\bnetlify-cli@[\d.]+ --version\b/.test(r) },
  { id: 'build', test: (r) => /\bnode scripts\/build-production\.mjs\b/.test(r) },
  { id: 'migracije', test: (r) => /\bnode scripts\/release-migration-check\.mjs\b/.test(r) },
  { id: 'upload', test: (r) => /\bnetlify-cli@[\d.]+ deploy\b/.test(r) && !/--prod\b/.test(r) },
  { id: 'edge', test: (r) => /\bsupabase functions deploy\b/.test(r) },
  { id: 'objava', test: (r) => /\bnetlify-cli@[\d.]+ api restoreSiteDeploy\b/.test(r) },
  { id: 'smoke', test: (r) => /\bscripts\/post-deploy-smoke\.mjs\b/.test(r) && /--strict-commit\b/.test(r) },
];

const OWNER_ONLY = "github.actor == 'danielrisavi77-create' && github.triggering_actor == 'danielrisavi77-create'";
const FORBIDDEN_RUN = /\bnetlify-cli@[\d.]+ deploy\b[^\n]*--prod\b|\bsupabase\s+(?:db\s+reset|migration\s+(?:up|repair))\b|\bsecrets\s+set\b/;
const DB_PUSH = /\bsupabase\s+db\s+push\b/;
const HISTORY = /\bnode scripts\/release-staging-history\.mjs\b/;

function envName(job: Job): string | undefined {
  return typeof job.environment === 'string' ? job.environment : job.environment?.name;
}

function triggers(on: unknown): string[] {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  return on && typeof on === 'object' ? Object.keys(on) : [];
}

function jobProblems(name: string, job: Job | undefined, expectedEnv: string): string[] {
  if (!job) return [`job ${name} ne postoji`];
  const out: string[] = [];
  if (envName(job) !== expectedEnv) out.push(`job ${name} nije u environmentu ${expectedEnv}`);
  if (job.if !== OWNER_ONLY) out.push(`job ${name} ne ogranicava pokretaca na vlasnika`);
  const steps = job.steps ?? [];
  const runs = steps.map((s) => s.run ?? '');
  const positions = PHASES.map((p) => runs.findIndex((r) => p.test(r)));
  const at = (id: string) => positions[PHASES.findIndex((p) => p.id === id)];
  const cli = steps[at('cli')];
  if (cli && cli.env !== undefined) out.push(`job ${name}: instalacija Netlify CLI-ja ima env (tajne ne smiju biti uz instalaciju)`);
  PHASES.forEach((p, i) => { if (positions[i] < 0) out.push(`job ${name} nema korak faze ${p.id}`); });
  for (let i = 1; i < PHASES.length; i += 1) {
    if (positions[i] >= 0 && positions[i - 1] >= 0 && positions[i] < positions[i - 1]) {
      out.push(`job ${name}: faza ${PHASES[i].id} dolazi prije faze ${PHASES[i - 1].id}`);
    }
  }
  runs.forEach((r) => { if (FORBIDDEN_RUN.test(r)) out.push(`job ${name} mijenja bazu ili tajne: "${r.trim()}"`); });
  const pushes = runs.map((r, i) => (DB_PUSH.test(r) ? i : -1)).filter((i) => i >= 0);
  if (name !== 'staging') {
    for (const i of pushes) out.push(`job ${name} primjenjuje migracije: "${runs[i].trim()}"`);
  } else {
    if (pushes.length === 0) out.push('job staging ne primjenjuje migracije (db push)');
    for (const i of pushes) {
      if (i < at('build') || (at('migracije') >= 0 && i > at('migracije'))) out.push('job staging: db push nije izmedju builda i provjere migracija');
      // Bez uskladjivanja Katedrine povijesti db push pada, a CLI predlaze `migration repair` koji brise tudje retke.
      const hist = runs[i].search(HISTORY);
      if (hist < 0 || hist > runs[i].search(DB_PUSH)) out.push('job staging: db push bez prethodnog release-staging-history');
    }
  }
  return out;
}

function buildProof(job: Job | undefined): string | undefined {
  const build = PHASES.find((p) => p.id === 'build')!;
  const step = (job?.steps ?? []).find((s) => build.test(s.run ?? ''));
  const v = step?.env?.LEKTA_REQUIRE_RELEASE_PROOF;
  return v === undefined ? undefined : String(v);
}

/** Problemi workflowa objave; prazan popis znaci da cuva sve cetiri tvrdnje. */
export function releaseWorkflowProblems(text: string = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8')): string[] {
  const wf = parse(text) as Workflow;
  const out: string[] = [];
  const on = triggers(wf.on);
  if (on.length !== 1 || on[0] !== 'workflow_dispatch') out.push(`okidaci nisu samo workflow_dispatch: ${on.join(', ')}`);
  const jobs = wf.jobs ?? {};
  const extra = Object.keys(jobs).filter((j) => j !== 'staging' && j !== 'production');
  if (extra.length > 0) out.push(`neocekivani jobovi: ${extra.join(', ')}`);
  out.push(...jobProblems('staging', jobs.staging, 'staging'));
  out.push(...jobProblems('production', jobs.production, 'production'));
  const needs = jobs.production?.needs;
  const needList = Array.isArray(needs) ? needs : needs ? [needs] : [];
  if (!needList.includes('staging')) out.push('job production ne ceka zeleni staging');
  if (buildProof(jobs.production) !== '1') out.push('produkcijski build ne trazi tvrdi dokaz izdanja (LEKTA_REQUIRE_RELEASE_PROOF=1)');
  return out;
}
