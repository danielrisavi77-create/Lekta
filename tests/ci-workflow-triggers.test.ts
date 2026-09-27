import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  findBarePushWorkflows,
  findJobsRunningOnEdited,
  findPullRequestWithoutConcurrency,
  findSelfHostedProblems,
  WORD_PROOF_FILE,
  type NamedWorkflow,
  type WorkflowFile,
} from './helpers/ci-workflow-triggers';

// Gard za vlasnikov zadatak "CI minute" (2026-09-26): PR nikad ne smije pokrenuti
// isti workflow dvaput (push + pull_request na istoj grani). Vidi
// docs/roadmap/PRODUCTION_BACKLOG.md i .github/workflows/*.yml.

const root = join(import.meta.dirname, '..');
const workflowsDir = join(root, '.github', 'workflows');

function loadWorkflows(): NamedWorkflow[] {
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((file) => {
      const raw = readFileSync(join(workflowsDir, file), 'utf8');
      const doc = parse(raw) as WorkflowFile;
      return { file, doc, raw };
    });
}

// Workflowi kojima je "push bez branches:[master]" NAMJERNO ispravan, s razlogom:
const PUSH_EXCEPTIONS = new Set<string>([
  'foundation-check.yml',
  // push je vezan iskljucivo uz gransku spike-granu
  // (architecture/lekta-katedra-foundation-v0.1), ne uz master; pull_request grana pokriva master.
  'word-proof.yml',
  // push na master i release/** (T80): Word dokaz na self-hosted runneru nema pull_request
  // trigera, pa nema ni dvostrukog runa; dopustene grane provjerava zaseban test ispod.
]);

// Jedini workflow koji smije ciljati vlasnikov Word stroj (repo je javan; vidi
// docs/verification/WORD_PROOF_RUNNER.md). Njegov tocan oblik i GitHub-hosted runs-on svih
// ostalih jobova provjerava findSelfHostedProblems.
const SELF_HOSTED_ALLOWED = new Set<string>([WORD_PROOF_FILE]);

// Workflowi bez pull_request trigera uopce (samo schedule/workflow_dispatch/druga grana push),
// pa im koncurencija po PR-u nije primjenjiva.
const NO_PULL_REQUEST_TRIGGER = new Set<string>(['post-deploy-smoke.yml', 'training-pipeline.yml']);

describe('CI workflowi ne vrte se dvaput po istom pushu na PR (CI minute)', () => {
  const workflows = loadWorkflows();

  it('ucita barem jedan workflow (dokaz da parser i putanja rade)', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('nijedan workflow nema push bez branches filtra na master (osim imenovanih iznimaka)', () => {
    const problems = findBarePushWorkflows(workflows, PUSH_EXCEPTIONS);
    expect(
      problems,
      `Ovi workflowi imaju 'push' bez branches: [master], sto duplicira svaki PR run ` +
        `(push + pull_request na istoj grani): ${problems.join(', ')}. Ako je namjerno, ` +
        `dodaj datoteku u PUSH_EXCEPTIONS s obrazlozenjem.`,
    ).toEqual([]);
  });

  it('svaki workflow s pull_request ima concurrency grupu (osim onih bez tog trigera)', () => {
    const problems = findPullRequestWithoutConcurrency(workflows, NO_PULL_REQUEST_TRIGGER);
    expect(
      problems,
      `Ovi workflowi nemaju concurrency grupu ovisnu o grani za pull_request: ${problems.join(', ')}.`,
    ).toEqual([]);
  });

  for (const exceptionFile of PUSH_EXCEPTIONS) {
    it(`imenovana iznimka ${exceptionFile} stvarno postoji medju workflowima`, () => {
      expect(workflows.some((w) => w.file === exceptionFile)).toBe(true);
    });
  }

  it('word-proof.yml ima tocan propisani oblik, a svi ostali jobovi GitHub-hosted runs-on', () => {
    const problems = findSelfHostedProblems(workflows, SELF_HOSTED_ALLOWED);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('word-proof.yml stvarno trazi self-hosted runner (gard iznad nije vakuumski)', () => {
    const wordProof = workflows.find((w) => w.file === 'word-proof.yml');
    expect(wordProof).toBeDefined();
    const runsOn = wordProof?.doc.jobs?.['word-proof']?.['runs-on'];
    expect(runsOn).toEqual(['self-hosted', 'windows', 'word']);
  });

  it('required job imena postoje: conformance-matrix, build-gate/ux-gate, unittest', () => {
    const check = readFileSync(join(workflowsDir, 'check.yml'), 'utf8');
    const conformance = readFileSync(join(workflowsDir, 'conformance.yml'), 'utf8');
    const autonomy = readFileSync(join(workflowsDir, 'autonomy-tests.yml'), 'utf8');

    expect(check).toContain('build-gate:');
    expect(check).toContain('ux-gate:');
    expect(check).toMatch(/node:\s*\[20,\s*24\]/);
    expect(conformance).toContain('conformance-matrix:');
    expect(autonomy).toContain('unittest:');
    expect(autonomy).toMatch(/python:\s*\['3\.12'\]/);
  });
});

describe('uredjivanje opisa PR-a (edited) pokrece SAMO provjeru opisa', () => {
  const workflows = loadWorkflows();

  it('pr-opis je jedini job koji reagira na edited; puni CI se na uredjivanje ne vrti', () => {
    expect(findJobsRunningOnEdited(workflows)).toEqual(['pr-opis.yml#pr-opis']);
  });

  it('pr-opis reagira na opened, synchronize, reopened, edited i ready_for_review', () => {
    const wf = workflows.find((w) => w.file === 'pr-opis.yml');
    expect(wf).toBeTruthy();
    const on = wf!.doc.on as Record<string, { types?: string[]; branches?: string[] } | null>;
    expect(on.push).toBeUndefined();
    expect(on.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review']);
    expect(on.pull_request?.branches).toEqual(['master']);
  });

  it('foundation-check.yml vise nema pr-opis job ni edited', () => {
    const wf = workflows.find((w) => w.file === 'foundation-check.yml');
    expect(Object.keys(wf!.doc.jobs ?? {})).toEqual(['check']);
    const on = wf!.doc.on as Record<string, { types?: string[] } | null>;
    expect(on.pull_request?.types ?? []).not.toContain('edited');
  });
});
