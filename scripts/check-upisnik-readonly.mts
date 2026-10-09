/**
 * Fails closed if a read-only Upisnik preflight changed any authoritative data.
 * Unlike bare git diff, porcelain status observes staged, unstaged AND untracked files.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const protectedPaths = ['data/programs/', 'data/coverage/', 'data/profiles/', 'docs/generated/'] as const;

export function changedAuthoritativePaths(repoDir: string): string[] {
  const status = execFileSync('git', [
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...protectedPaths,
  ], { cwd: repoDir, encoding: 'utf8' });
  return status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const root = resolve(dirname(scriptPath), '..');
    const changes = changedAuthoritativePaths(root);
    if (changes.length) {
      console.error('UPISNIK_READONLY_VIOLATION: authoritative paths changed:');
      for (const path of changes) console.error('  ' + path);
      process.exitCode = 1;
    } else {
      console.log('UPISNIK_READONLY_OK: tracked, staged and untracked authoritative paths unchanged');
    }
  } catch (error) {
    console.error('UPISNIK_READONLY_UNKNOWN: git status failed', error);
    process.exitCode = 1;
  }
}
