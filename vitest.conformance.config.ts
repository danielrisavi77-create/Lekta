import { defineConfig } from 'vitest/config';

// Zaseban config za PUNU conformance matricu (svi profili x uskladjen+neuskladjen docx,
// ~744 analize): `npm run conformance` / .github/workflows/conformance.yml. Redovni
// `npm run check` vrti samo tripwire uzorak (tests/conformance-tripwire.test.ts) i
// exclude-a tests/conformance/** u vitest.config.ts.
export default defineConfig({
  // Vitest NE nasljeduje vite.config.ts pa build-flag mora i ovdje (isto kao glavni config).
  define: { __DEV_TOOLS__: 'true' },
  test: {
    environment: 'happy-dom',
    // Isti AUD-46 razlog kao glavni config: 0 kolektiranih testova = crveno, ne tiho zeleno.
    passWithNoTests: false,
    // xmldom kao globalni DOMParser: happy-dom ne radi XML namespace (ista putanja kao worker).
    setupFiles: ['./tests/setup/xml-dom.ts'],
    include: ['tests/conformance/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // 2 analize po profilu su tipicno <1,5 s; 30 s je velikodusna marza za CPU kontenciju.
    testTimeout: 30000,
  },
});
