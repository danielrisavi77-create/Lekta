import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    include: [
      './tests/local-repair-runner-download.test.ts',
      './tests/repair-contract-*.test.ts',
      './tests/repair-local-*.test.ts',
      './tests/repair-package-integrity.test.ts',
      './tests/repair-integration-gate.test.ts',
      './tests/repository-hygiene.test.ts',
    ],
  },
}));
