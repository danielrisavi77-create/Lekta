import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const configPath = join(root, 'vitest.repair-integration.config.ts');

describe('brzi WordReplica-Lekta integracijski gate', () => {
  it('ima zaseban typecheck, fokusirani testni skup i produkcijski build', () => {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['check:repair-integration']).toBe(
      'tsc --noEmit && vitest run --config vitest.repair-integration.config.ts && vite build',
    );
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, 'utf8');
    for (const required of [
      './tests/local-repair-runner-download.test.ts',
      './tests/repair-contract-*.test.ts',
      './tests/repair-local-*.test.ts',
      './tests/repair-package-integrity.test.ts',
      './tests/repair-integration-gate.test.ts',
    ]) {
      expect(config).toContain(required);
    }
    expect(config).not.toContain('repair-closed-loop');
  });
});
