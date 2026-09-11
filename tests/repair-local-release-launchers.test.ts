import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const releaseEntrypoint = 'run-local-repair-release.mts';
const launchConsumers = [
  'scripts/run-repair-runner-e2e.mts',
  'tests/repair-runner-executable-e2e.test.ts',
  'tests/repair-local-release-entrypoint.test.ts',
] as const;

function releaseLaunchArguments(source: string): string[] {
  return [...source.matchAll(
    /(?:spawnSync|runCaptured)\(\s*process\.execPath,\s*\[([\s\S]{0,1200}?run-local-repair-release\.mts[\s\S]{0,1200}?)\]\s*,/g,
  )].map((match) => match[1] ?? '');
}

describe('interna pokretanja local-repair release entrypointa', () => {
  it.each(launchConsumers)('%s koristi TSX prije .mts skripte', (relativePath) => {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const launches = releaseLaunchArguments(source);

    expect(
      launches.length,
      `${relativePath} mora imati barem jedno stvarno pokretanje ${releaseEntrypoint}`,
    ).toBeGreaterThan(0);
    expect(source).toContain("'node_modules', 'tsx', 'dist', 'cli.mjs'");

    for (const launch of launches) {
      const tsxIndex = launch.search(/\btsxEntrypoint\b/i);
      const releaseIndex = launch.indexOf(releaseEntrypoint);
      expect(
        tsxIndex,
        `${relativePath} izravno predaje .mts Nodeu bez TSX launchera`,
      ).toBeGreaterThanOrEqual(0);
      expect(tsxIndex).toBeLessThan(releaseIndex);
    }
  });
});
