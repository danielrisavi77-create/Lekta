import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('check workflow koristi projektom zakljucani npm', () => {
  it('instalira isti packageManager prije npm ci u Node matrici', () => {
    const root = join(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      packageManager?: string;
    };
    const workflow = readFileSync(
      join(root, '.github', 'workflows', 'check.yml'),
      'utf8',
    );
    const buildGateStart = workflow.indexOf('  build-gate:');
    const uxGateStart = workflow.indexOf('  ux-gate:', buildGateStart);
    const buildGate = workflow.slice(buildGateStart, uxGateStart);
    const packageManager = pkg.packageManager ?? '';
    const installPinnedNpm = `run: npm install --global ${packageManager}`;

    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(buildGate).toContain(installPinnedNpm);
    expect(buildGate.indexOf(installPinnedNpm)).toBeLessThan(buildGate.indexOf('run: npm ci'));
  });
});
