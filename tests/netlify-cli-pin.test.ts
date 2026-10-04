import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NETLIFY_CLI_PIN, releaseInvocation } from '../scripts/run-local-repair-release';
import { netlifyPinProblems } from './helpers/netlify-cli-pin';

/** Popravak A: netlify-cli van ovisnosti, rucna objava kroz pinani npx. Mutacije su u gate-mutations. */
const read = (...p: string[]) => readFileSync(resolve(process.cwd(), ...p), 'utf8').replace(/\r\n?/g, '\n');

describe('Popravak A: netlify-cli pin', () => {
  it('package.json, lockfile, release skripta i dokument su uskladjeni (baseline)', () => {
    expect(netlifyPinProblems({
      packageJson: read('package.json'),
      packageLock: read('package-lock.json'),
      releaseScript: read('scripts', 'run-local-repair-release.mts'),
      releaseDoc: read('docs', 'deploy', 'RELEASE_PROOF_WORKFLOW.md'),
    })).toEqual([]);
  });

  it('netlify ide kroz npx --yes s tocnom verzijom; ostale naredbe se ne mijenjaju', () => {
    expect(NETLIFY_CLI_PIN).toMatch(/^netlify-cli@\d+\.\d+\.\d+$/);
    expect(releaseInvocation('netlify', ['deploy', '--prod'], '/r', 'win32'))
      .toEqual({ executable: 'npx.cmd', args: ['--yes', NETLIFY_CLI_PIN, 'deploy', '--prod'] });
    expect(releaseInvocation('netlify', ['status', '--json'], '/r', 'linux'))
      .toEqual({ executable: 'npx', args: ['--yes', NETLIFY_CLI_PIN, 'status', '--json'] });
    expect(releaseInvocation('npm', ['run', 'x'], '/r', 'win32')).toEqual({ executable: 'npm.cmd', args: ['run', 'x'] });
    expect(releaseInvocation('supabase', ['link'], '/r', 'win32').args).toEqual(['link']);
    expect(() => releaseInvocation('curl', [], '/r')).toThrow(/Nepodrzana/);
  });
});
