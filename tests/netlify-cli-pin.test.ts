import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { NETLIFY_CLI_PIN, RELEASE_COMMAND_TIMEOUT_MS, npxCliPath, releaseInvocation } from '../scripts/run-local-repair-release';
import { netlifyCallProblems, netlifyPinProblems, netlifyPinRealSources } from './helpers/netlify-cli-pin';

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
    expect(netlifyCallProblems('w.yml', 'run: npx netlify-cli@27.0.0 deploy', pin)).toHaveLength(1);
    expect(netlifyCallProblems('w.yml', 'run: npm exec -- netlify-cli@latest deploy', pin)).toHaveLength(1);
    expect(netlifyCallProblems('p', 'netlify deploy --prod', pin)).toEqual(['p: gola netlify naredba "netlify deploy"']);
    expect(netlifyCallProblems('p', 'netlify.toml je izvor; Netlify build koristi vlastiti CLI', pin)).toEqual([]);
  });
});
