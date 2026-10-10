// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();

describe('repository hygiene', () => {
  test('lokalni cross-repo smoke paket ne ulazi u Git checkpoint', () => {
    const result = spawnSync(
      'git',
      ['check-ignore', '--no-index', '-q', '.tmp-local-repair-cross-repo-smoke.mts'],
      { cwd: ROOT, shell: false },
    );

    expect(result.status).toBe(0);
  });

  test('Firecrawl cache (sirovi web sadrzaj, mogu biti osobni podaci/tokeni) ne ulazi u Git checkpoint', () => {
    const result = spawnSync(
      'git',
      ['check-ignore', '--no-index', '-q', '.firecrawl/search-primjer.json'],
      { cwd: ROOT, shell: false },
    );

    expect(result.status).toBe(0);
  });
});
