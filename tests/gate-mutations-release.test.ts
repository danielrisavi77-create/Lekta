/**
 * Mutacije garda objave jednim gumbom (tests/helpers/release-workflow.ts). Svaka mutacija mijenja
 * IZVOR, tj. tekst stvarnog .github/workflows/release.yml, i trazi tocan popis problema.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { RELEASE_WORKFLOW_PATH, releaseWorkflowProblems } from './helpers/release-workflow';

const SOURCE = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8').replace(/\r\n?/g, '\n');

function mutiraj(from: string | RegExp, to: string): string {
  const out = SOURCE.replace(from, to);
  if (out === SOURCE) throw new Error(`mutacija nije nasla izvor: ${String(from)}`);
  return out;
}

/** Blok jednog koraka (od `- name: <ime>` do sljedeceg koraka) unutar zadanog joba. */
function stepBlock(text: string, job: string, name: string): string {
  const jobStart = text.indexOf(`\n  ${job}:\n`);
  const start = text.indexOf(`      - name: ${name}\n`, jobStart);
  const next = text.indexOf('\n      - name: ', start + 1);
  const jobEnd = text.indexOf('\n  production:\n', jobStart + 1);
  const end = [next, jobEnd].filter((i) => i > start).reduce((a, b) => Math.min(a, b), text.length);
  return text.slice(start, end + 1);
}

describe('mutacije: objava jednim gumbom', () => {
  it('baseline cisto', () => {
    expect(releaseWorkflowProblems(SOURCE)).toEqual([]);
  });

  it('produkcija bez environmenta (bez odobrenja) obara gard', () => {
    const m = mutiraj('    environment: production\n', '');
    expect(releaseWorkflowProblems(m)).toEqual(['job production nije u environmentu production']);
  });

  it('produkcija koja ne ceka staging obara gard', () => {
    const m = mutiraj('  production:\n    needs: staging\n', '  production:\n');
    expect(releaseWorkflowProblems(m)).toEqual(['job production ne ceka zeleni staging']);
  });

  it('klijent prije Edge funkcija (consent_required prozor) obara gard', () => {
    const edge = stepBlock(SOURCE, 'production', 'Edge funkcije');
    const client = stepBlock(SOURCE, 'production', 'Klijent (Netlify)');
    // Koraci su u oba joba doslovno isti, pa se zamjenjuje ZADNJE pojavljivanje (produkcija).
    const at = SOURCE.lastIndexOf(edge + client);
    expect(at).toBeGreaterThan(SOURCE.indexOf('\n  production:\n'));
    const m = SOURCE.slice(0, at) + client + edge + SOURCE.slice(at + edge.length + client.length);
    expect(releaseWorkflowProblems(m)).toEqual(['job production: faza klijent dolazi prije faze edge']);
  });

  it('deploy prije builda obara gard', () => {
    const build = stepBlock(SOURCE, 'staging', 'Build klijenta (staging)');
    const m = mutiraj(build, '').replace('      - name: Smoke nad stagingom\n', `${build}      - name: Smoke nad stagingom\n`);
    expect(releaseWorkflowProblems(m)).toEqual([
      'job staging: faza migracije dolazi prije faze build',
      'job staging: db push nije izmedju builda i provjere migracija',
    ]);
  });

  it('smoke bez --strict-commit obara gard', () => {
    const m = mutiraj(/(Smoke nad produkcijom[\s\S]*?) --strict-commit/, '$1');
    expect(releaseWorkflowProblems(m)).toEqual(['job production nema korak faze smoke']);
  });

  it('meki dokaz izdanja u produkciji obara gard', () => {
    const m = mutiraj(/(Build klijenta \(produkcija\)[\s\S]*?LEKTA_REQUIRE_RELEASE_PROOF: )'1'/, "$1'0'");
    expect(releaseWorkflowProblems(m)).toEqual(['produkcijski build ne trazi tvrdi dokaz izdanja (LEKTA_REQUIRE_RELEASE_PROOF=1)']);
  });

  it('db push u produkcijskom jobu obara gard', () => {
    const m = mutiraj(
      /(\n {2}production:[\s\S]*?)run: node scripts\/release-migration-check\.mjs[^\n]*/,
      '$1run: npx supabase db push --linked && node scripts/release-migration-check.mjs --ref "$PROJECT_REF" --migrations "$RELEASE_MIGRATIONS"',
    );
    expect(releaseWorkflowProblems(m)).toEqual([
      'job production primjenjuje migracije: "npx supabase db push --linked && node scripts/release-migration-check.mjs --ref "$PROJECT_REF" --migrations "$RELEASE_MIGRATIONS""',
    ]);
  });

  it('staging bez db push obara gard', () => {
    const m = mutiraj(stepBlock(SOURCE, 'staging', 'Migracije na staging (db push)'), '');
    expect(releaseWorkflowProblems(m)).toEqual(['job staging ne primjenjuje migracije (db push)']);
  });

  it('staging db push poslije Edge funkcija obara gard', () => {
    const push = stepBlock(SOURCE, 'staging', 'Migracije na staging (db push)');
    const m = mutiraj(push, '').replace('      - name: Smoke nad stagingom\n', `${push}      - name: Smoke nad stagingom\n`);
    expect(releaseWorkflowProblems(m)).toEqual(['job staging: db push nije izmedju builda i provjere migracija']);
  });

  it('migration repair u stagingu obara gard', () => {
    const m = mutiraj('npx supabase db push --linked --dry-run', 'npx supabase migration repair --status applied 0209\n          npx supabase db push --linked --dry-run');
    const p = releaseWorkflowProblems(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^job staging mijenja bazu ili tajne: "npx supabase link/);
  });

  it('push okidac obara gard', () => {
    const m = mutiraj('on:\n  workflow_dispatch:\n', 'on:\n  push:\n    branches: [master]\n  workflow_dispatch:\n');
    expect(releaseWorkflowProblems(m)).toEqual(['okidaci nisu samo workflow_dispatch: push, workflow_dispatch']);
  });
});
