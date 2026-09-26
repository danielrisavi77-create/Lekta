import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('check workflow koristi projektom zakljucani npm', () => {
  it('prosljedjuje isti packageManager kao npm-version u composite akciju setup-deps', () => {
    // Od CI kesiranja ovisnosti (BL-P3-XX) `npm install --global npm@X` vise NIJE zaseban korak
    // u check.yml: mora ici IZMEDJU setup-nodea i `npm ci`, a oba su sad unutar composite akcije
    // `.github/actions/setup-deps`. Zato se ovdje ne trazi literalni "run:" korak nego `npm-version`
    // ulaz proslijedjen toj akciji, koji akcija (tests/ci-workflow-cache.test.ts) provjerava da
    // stvarno instalira PRIJE svog internog `npm ci` koraka.
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
    const version = packageManager.replace(/^npm@/, '');

    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(buildGate).toContain('uses: ./.github/actions/setup-deps');
    expect(buildGate).toContain(`npm-version: ${version}`);
    expect(buildGate.indexOf('uses: ./.github/actions/setup-deps')).toBeLessThan(
      buildGate.indexOf('run: npm run check'),
    );
  });
});
