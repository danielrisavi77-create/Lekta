import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NETLIFY_CLI_PIN, RELEASE_COMMAND_TIMEOUT_MS, npxCliPath, releaseInvocation } from '../scripts/run-local-repair-release';
import {
  NETLIFY_SCAN_GITHUB, NETLIFY_SCAN_SCRIPTS, netlifyCallProblems, netlifyPinProblems, netlifyPinRealSources,
} from './helpers/netlify-cli-pin';

/** Popravak A: netlify-cli van ovisnosti, rucna objava kroz pinani npx. Mutacije su u gate-mutations. */
describe('Popravak A: netlify-cli pin', () => {
  it('package.json, lockfile, release skripta, dokument, workflowi i skripte su uskladjeni (baseline)', () => {
    const sources = netlifyPinRealSources();
    expect(sources.files?.some((f) => f.path.startsWith('.github/workflows/'))).toBe(true);
    expect(netlifyPinProblems(sources)).toEqual([]);
  });

  it('netlify ide kroz process.execPath i npx-cli.js s tocnom verzijom, na svakoj platformi', () => {
    expect(NETLIFY_CLI_PIN).toMatch(/^netlify-cli@\d+\.\d+\.\d+$/);
    const cli = () => '/n/npx-cli.js';
    for (const platform of ['win32', 'linux'] as const) {
      expect(releaseInvocation('netlify', ['deploy', '--prod'], '/r', platform, cli))
        .toEqual({ executable: process.execPath, args: ['/n/npx-cli.js', '--yes', NETLIFY_CLI_PIN, 'deploy', '--prod'] });
    }
    expect(releaseInvocation('npm', ['run', 'x'], '/r', 'win32')).toEqual({ executable: 'npm.cmd', args: ['run', 'x'] });
    expect(releaseInvocation('supabase', ['link'], '/r', 'win32').args).toEqual(['link']);
    expect(() => releaseInvocation('curl', [], '/r')).toThrow(/Nepodrzana/);
    expect(RELEASE_COMMAND_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('npxCliPath: npm_execpath, Windows i POSIX raspored; bez ulaza pada (Codex F1 na #283)', () => {
    const has = (set: string[]) => (p: string) => set.includes(p);
    expect(npxCliPath('C:\\nodejs\\node.exe', 'win32', {}, has(['C:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js'])))
      .toBe('C:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js');
    expect(npxCliPath('/usr/local/bin/node', 'linux', {}, has(['/usr/local/lib/node_modules/npm/bin/npx-cli.js'])))
      .toBe('/usr/local/lib/node_modules/npm/bin/npx-cli.js');
    expect(npxCliPath('/x/bin/node', 'linux', { npm_execpath: '/y/npm/bin/npm-cli.js' }, has(['/y/npm/bin/npx-cli.js'])))
      .toBe('/y/npm/bin/npx-cli.js');
    expect(() => npxCliPath('/x/bin/node', 'linux', {}, () => false)).toThrow(/npx-cli\.js nije pronadjen/);
  });

  it('stvarni proces: process.execPath + npxCliPath() pokrece npx bez shella', () => {
    const r = spawnSync(process.execPath, [npxCliPath(), '--version'], { encoding: 'utf8', shell: false, timeout: 60_000, windowsHide: true });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('svaki poziv se provjerava zasebno: pin u komentaru ne pokriva aktivni nepinani poziv (Codex F2 na #283)', () => {
    const pin = NETLIFY_CLI_PIN;
    expect(netlifyCallProblems('d.md', `# npx --yes ${pin} deploy\nnpx --yes ${pin} build\n`, pin)).toEqual([]);
    expect(netlifyCallProblems('d.md', `<!-- npx --yes ${pin} deploy -->\nnpx --yes netlify-cli deploy --prod\n`, pin))
      .toEqual(['d.md: nepinani Netlify CLI poziv "npx --yes netlify-cli"']);
    expect(netlifyCallProblems('w.yml', 'run: npx netlify-cli@27.0.0 deploy', pin)).not.toEqual([]);
    expect(netlifyCallProblems('w.yml', 'run: npm exec -- netlify-cli@latest deploy', pin)).not.toEqual([]);
    expect(netlifyCallProblems('p', 'netlify deploy --prod', pin)).toEqual(['p: gola netlify naredba "netlify deploy"']);
    expect(netlifyCallProblems('p', 'netlify.toml je izvor; Netlify build koristi vlastiti CLI', pin)).toEqual([]);
  });

  it('dinamicni i visheredni pozivi padaju, obicni npx pozivi prolaze (Codex F2a na #283)', () => {
    const pin = NETLIFY_CLI_PIN;
    const fails = {
      varijabla: 'CLI=netlify-cli@latest\nnpx --yes "$CLI" deploy --prod\n',
      githubIzraz: 'run: npx --yes ${{ env.CLI }} deploy\n',
      windowsEnv: 'npx --yes %CLI% deploy\n',
      yamlPresavijeni: '      - run: >\n          npx --yes\n          netlify-cli deploy --prod\n',
      nastavakRetka: 'npx --yes \\\n  netlify-cli deploy\n',
      powershellNastavak: 'npx --yes `\n  netlify-cli@27.10.1 deploy\n',
      latestUEnvu: 'env:\n  NETLIFY_PKG: netlify-cli@latest\n',
    };
    for (const [name, text] of Object.entries(fails)) expect(netlifyCallProblems(name, text, pin), name).not.toEqual([]);
    expect(netlifyCallProblems('ok', `npx --yes ${pin} deploy --prod --dir dist --no-build\nnpx vitest run\nnpx --yes tsx a.ts\n`, pin)).toEqual([]);
  });

  it('skener cita stvarno stablo: sve datoteke iz git ls-files koje pokriva su u izvorima (Codex F2b na #283)', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const expected = tracked.filter((p) =>
      (p.startsWith('.github/') && NETLIFY_SCAN_GITHUB.test(p))
      || (p.startsWith('scripts/') && NETLIFY_SCAN_SCRIPTS.test(p))
      || /^docs\/deploy\/[^/]+\.md$/.test(p)
      || /^netlify(?:\.[\w-]+)?\.toml$/.test(p))
      .filter((p) => p !== 'scripts/run-local-repair-release.mts' && p !== 'docs/deploy/RELEASE_PROOF_WORKFLOW.md');
    const scanned = new Set(netlifyPinRealSources().files?.map((f) => f.path));
    expect(expected.filter((p) => !scanned.has(p))).toEqual([]);
    expect(scanned.has('netlify.staging.toml')).toBe(true);
  });

  it('skener na disku vidi JS lokalne akcije, .cts skriptu i netlify.staging.toml (Codex F2b na #283)', () => {
    const root = mkdtempSync(join(tmpdir(), 'netlify-pin-'));
    try {
      for (const rel of ['package.json', 'package-lock.json', 'scripts/run-local-repair-release.mts', 'docs/deploy/RELEASE_PROOF_WORKFLOW.md']) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        copyFileSync(join(process.cwd(), rel), join(root, rel));
      }
      expect(netlifyPinProblems(netlifyPinRealSources(root))).toEqual([]);
      const planted = {
        '.github/actions/publish/index.js': "execSync('npx --yes netlify-cli deploy --prod');\n",
        'scripts/objava.cts': "spawnSync('npx', ['--yes', 'netlify-cli@latest', 'deploy']);\n",
        'netlify.staging.toml': '[build]\n  command = "npx netlify-cli build"\n',
      };
      for (const [rel, text] of Object.entries(planted)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), text);
      }
      const problems = netlifyPinProblems(netlifyPinRealSources(root));
      for (const rel of Object.keys(planted)) expect(problems.some((x) => x.startsWith(`${rel}:`)), rel).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
