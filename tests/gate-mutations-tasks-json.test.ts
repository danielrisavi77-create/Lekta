// @vitest-environment node
/**
 * Gard DAN-79: PR zadatka ne dira `docs/agents/tasks.json` uz drugi kod
 * (`scripts/agents/tasks-json-opseg.mjs`, CI korak u `.github/workflows/pr-opis.yml`).
 *
 * Tri signala: presuda ciste funkcije nad tablicom scenarija, stvarni CLI nad privremenim git
 * repozitorijem i registracija koraka u workflowu. Mutacija mijenja IZVOR presude u privremenoj
 * kopiji i mora oboriti tocno scenarij koji gard stiti.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provjeriOpsegTasksJson, TASKS_JSON } from '../scripts/agents/tasks-json-opseg.mjs';

const root = join(import.meta.dirname, '..');
const SKRIPTA = join(root, 'scripts', 'agents', 'tasks-json-opseg.mjs');
const IZVOR = readFileSync(SKRIPTA, 'utf8');

type Presuda = (putanje: string[]) => string[];

const SCENARIJI: { ime: string; putanje: string[]; pada: boolean }[] = [
  { ime: 'samo kod', putanje: ['src/a.ts', 'tests/a.test.ts'], pada: false },
  { ime: 'samo tasks.json (koordinatorov skupni PR)', putanje: [TASKS_JSON], pada: false },
  { ime: 'prazan diff', putanje: [], pada: false },
  { ime: 'tasks.json uz kod', putanje: ['src/a.ts', TASKS_JSON], pada: true },
  { ime: 'tasks.json uz drugi docs', putanje: [TASKS_JSON, 'docs/agents/README.md'], pada: true },
  { ime: 'ime s vodecim razmakom nije tasks.json', putanje: [` ${TASKS_JSON}`, 'src/a.ts'], pada: false },
  { ime: 'ime s CR na kraju nije tasks.json', putanje: [`${TASKS_JSON}\r`, 'src/a.ts'], pada: false },
  { ime: 'tasks.json uz ime samo od razmaka', putanje: [TASKS_JSON, ' '], pada: true },
];

function problemiTablice(presuda: Presuda): string[] {
  return SCENARIJI.filter((s) => (presuda(s.putanje).length > 0) !== s.pada).map((s) => s.ime);
}

describe('tasks-json-opseg: presuda', () => {
  it('baseline: svaki scenarij dobiva ocekivanu presudu', () => {
    expect(problemiTablice(provjeriOpsegTasksJson)).toEqual([]);
  });

  it('poruka imenuje tasks.json i drugu putanju', () => {
    const [poruka] = provjeriOpsegTasksJson(['src/a.ts', TASKS_JSON]);
    expect(poruka).toContain(TASKS_JSON);
    expect(poruka).toContain('src/a.ts');
  });

  it('ulaz koji nije niz putanja rusi provjeru', () => {
    expect(() => provjeriOpsegTasksJson('src/a.ts' as unknown as string[])).toThrow(TypeError);
  });

  it('mutacija: presuda koja propusta tasks.json uz drugi kod obara tocno te scenarije', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-tasks-json-mut-'));
    try {
      const mutant = IZVOR.replace('if (ostale.length === 0) return [];', 'if (ostale.length >= 0) return [];');
      expect(mutant).not.toBe(IZVOR);
      const put = join(dir, 'mutant.mjs');
      writeFileSync(put, mutant);
      const modul = (await import(pathToFileURL(put).href)) as { provjeriOpsegTasksJson: Presuda };
      expect(problemiTablice(modul.provjeriOpsegTasksJson)).toEqual([
        'tasks.json uz kod',
        'tasks.json uz drugi docs',
        'tasks.json uz ime samo od razmaka',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mutacija: presuda koja rezanjem imena brise razmake obara tocno scenarije s razmacima', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-tasks-json-mut-'));
    try {
      const mutant = IZVOR.replace("putanje.filter((p) => p !== '')", "putanje.map((p) => p.trim()).filter(Boolean)");
      expect(mutant).not.toBe(IZVOR);
      const put = join(dir, 'mutant.mjs');
      writeFileSync(put, mutant);
      const modul = (await import(pathToFileURL(put).href)) as { provjeriOpsegTasksJson: Presuda };
      expect(problemiTablice(modul.provjeriOpsegTasksJson)).toEqual([
        'ime s vodecim razmakom nije tasks.json',
        'ime s CR na kraju nije tasks.json',
        'tasks.json uz ime samo od razmaka',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function git(repo: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=test@lekta.invalid', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    stdio: 'ignore',
  });
}

describe('tasks-json-opseg: CLI nad git repozitorijem', () => {
  let repo = '';

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'lekta-tasks-json-cli-'));
    git(repo, 'init', '-q');
    mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, TASKS_JSON), '{"tasks":[]}\n');
    writeFileSync(join(repo, 'src', 'a.ts'), 'export {};\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'baza');
    git(repo, 'tag', 'baza');
    const grana = (ime: string, promjena: () => void) => {
      git(repo, 'checkout', '-q', '-b', ime, 'baza');
      promjena();
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', ime);
    };
    grana('kod', () => writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n'));
    grana('skupni', () => writeFileSync(join(repo, TASKS_JSON), '{"tasks":[1]}\n'));
    grana('mijesano', () => {
      writeFileSync(join(repo, TASKS_JSON), '{"tasks":[2]}\n');
      writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2;\n');
    });
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  const pokreni = (...args: string[]) => spawnSync(process.execPath, [SKRIPTA, ...args], { cwd: repo, encoding: 'utf8' });

  it('kod bez tasks.json i skupni PR samo s tasks.json prolaze (izlaz 0)', () => {
    expect(pokreni('baza', 'kod').status).toBe(0);
    expect(pokreni('baza', 'skupni').status).toBe(0);
  });

  it('tasks.json uz kod pada s izlazom 1 i GitHub ::error retkom', () => {
    const ishod = pokreni('baza', 'mijesano');
    expect(ishod.status).toBe(1);
    expect(ishod.stdout).toContain('::error title=tasks-json-opseg::');
  });

  it('ime datoteke s razmakom uz tasks.json cita se tocno (git -z)', () => {
    git(repo, 'checkout', '-q', '-b', 'razmak', 'baza');
    writeFileSync(join(repo, TASKS_JSON), '{"tasks":[3]}\n');
    writeFileSync(join(repo, ' '), 'x\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'razmak');
    expect(pokreni('baza', 'razmak').status).toBe(1);
  });

  it('nepostojeci ref rusi provjeru (izlaz 2), ne prolazi tiho', () => {
    expect(pokreni('baza', 'nema-te-grane').status).toBe(2);
    expect(pokreni().status).toBe(2);
  });
});

describe('tasks-json-opseg: registracija u CI-ju', () => {
  type Korak = { name?: string; if?: string; run?: string; env?: Record<string, string> };
  const wf = parse(readFileSync(join(root, '.github', 'workflows', 'pr-opis.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Korak[] }>;
  };

  it('job pr-opis pokrece gard nad bazom i headom PR-a i kad raniji korak padne', () => {
    const koraci = wf.jobs['pr-opis'].steps.filter((k) => k.run?.trim() === 'node scripts/agents/tasks-json-opseg.mjs "$BASE_SHA" "$HEAD_SHA"');
    expect(koraci).toHaveLength(1);
    expect(koraci[0].env).toEqual({
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    expect(koraci[0].if).toBe('${{ !cancelled() }}');
  });
});
