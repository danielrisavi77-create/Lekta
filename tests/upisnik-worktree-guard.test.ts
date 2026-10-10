// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { changedAuthoritativePaths } from '../scripts/check-upisnik-readonly';

let repoDir: string | null = null;
function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repoDir!, stdio: 'pipe' });
}
function repo(): { path: string; file: string } {
  repoDir = mkdtempSync(join(tmpdir(), 'lekta-upisnik-readonly-'));
  git('init', '-q');
  const dir = join(repoDir, 'data', 'programs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'registry.json');
  writeFileSync(file, '{"safe":true}\n');
  git('add', 'data/programs/registry.json');
  git('-c', 'user.name=CI Guard', '-c', 'user.email=guard@example.invalid', 'commit', '-qm', 'fixture');
  return { path: repoDir, file };
}
afterEach(() => { if (repoDir) rmSync(repoDir, { recursive: true, force: true }); repoDir = null; });

describe('read-only Upisnik guard mjeri stvarno radno stablo', () => {
  it('baseline: cisti checkout nema nalaza', () => {
    const r = repo();
    expect(changedAuthoritativePaths(r.path)).toEqual([]);
  });
  it('mutant: nestaged promjena autoritativnog zapisa pada', () => {
    const r = repo();
    writeFileSync(r.file, '{"unsafe":true}\n');
    expect(changedAuthoritativePaths(r.path)).toContain('data/programs/registry.json');
  });
  it('mutant: staged promjena autoritativnog zapisa pada', () => {
    const r = repo();
    writeFileSync(r.file, '{"unsafe":true}\n');
    git('add', 'data/programs/registry.json');
    expect(changedAuthoritativePaths(r.path)).toContain('data/programs/registry.json');
  });
  it('mutant: nova nepracena datoteka autoritativnog registra pada', () => {
    const r = repo();
    writeFileSync(join(r.path, 'data', 'programs', 'invented.json'), '{}\n');
    expect(changedAuthoritativePaths(r.path)).toContain('data/programs/invented.json');
  });
  it('izvan autoritativnih putanja ne stvara lazni nalaz', () => {
    const r = repo();
    writeFileSync(join(r.path, 'scratch.md'), 'temporary');
    expect(changedAuthoritativePaths(r.path)).toEqual([]);
  });
  it('workflow doista koristi ovaj guard, umjesto starog git diff', () => {
    const yml = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'upisnik-resync-check.yml'), 'utf8');
    expect(yml).toContain('npx tsx scripts/check-upisnik-readonly.mts');
    expect(yml).not.toContain('git diff --exit-code -- data/programs/');
  });
});
