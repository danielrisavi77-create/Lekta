import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('local-repair release stvarni CLI entrypoint', () => {
  it('fail-closed vraca non-zero kad runner artefakt ne postoji', () => {
    const root = join(import.meta.dirname, '..');
    const missing = join(mkdtempSync(join(tmpdir(), 'lekta-release-entry-')), 'missing.exe');
    const completed = spawnSync(process.execPath, [
      join(root, 'scripts', 'run-local-repair-release.mts'),
      '--artifact', missing,
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    });

    expect(completed.status).not.toBe(0);
    expect(`${completed.stdout}\n${completed.stderr}`).toMatch(/runner artefakt ne postoji/i);
    expect(completed.stdout).not.toContain('generate-citation-tools');
  });
});
