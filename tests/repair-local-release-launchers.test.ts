import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { auditReleaseLaunchers } from './helpers/release-launcher-audit';

const root = join(import.meta.dirname, '..');
const releaseEntrypoint = 'run-local-repair-release.mts';
const establishedLaunchers = [
  'scripts/run-repair-runner-e2e.mts',
  'tests/repair-local-release-entrypoint.test.ts',
  'tests/repair-runner-executable-e2e.test.ts',
] as const;
const releaseReferencedPaths = execFileSync(
  'git',
  ['grep', '-l', '-z', '-e', releaseEntrypoint, '--', '*.ts', '*.tsx', '*.mts', '*.cts'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
).split('\0').filter(Boolean);
const trackedSources = releaseReferencedPaths.map((relativePath) => {
  const source = readFileSync(join(root, relativePath), 'utf8');
  return { relativePath, source };
});
const audit = auditReleaseLaunchers(trackedSources);

describe('interna pokretanja local-repair release entrypointa', () => {
  it('automatski otkriva svaki Git-praceni TypeScript launcher', () => {
    expect(audit.consumers).toEqual(expect.arrayContaining(establishedLaunchers));
    expect(audit.consumers.length).toBeGreaterThanOrEqual(establishedLaunchers.length);
  });

  it('audit helper nakon commita ne klasificira sam sebe kao launcher', () => {
    const relativePath = 'tests/helpers/release-launcher-audit.ts';
    const helperAudit = auditReleaseLaunchers([{
      relativePath,
      source: readFileSync(join(root, relativePath), 'utf8'),
    }]);
    expect(helperAudit).toEqual({ consumers: [], unsafe: [] });
  });

  it('svako otkriveno pokretanje koristi TSX prije .mts skripte', () => {
    expect(audit.unsafe, `nesigurna pokretanja ${releaseEntrypoint}`).toEqual([]);
  });
});
