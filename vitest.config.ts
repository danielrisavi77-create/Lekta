import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
    setupFiles: ['./tests/setup/xml-dom.ts'],
  },
});
