import { defineConfig } from 'vitest/config';

// Zaseban config za spori per-profile closed-loop repair test (407 profila, gradi+analizira+
// popravlja+reanalizira DOCX za svaki): `npm run test:slow` / `npm run check:full`. Redovni
// `npm run check` ga exclude-a u vitest.config.ts da tvrdi build gate ostane brz.
export default defineConfig({
  // Vitest NE nasljeduje vite.config.ts pa build-flag mora i ovdje (isto kao glavni config).
  define: { __DEV_TOOLS__: 'true' },
  test: {
    environment: 'happy-dom',
    // Isti AUD-46 razlog kao glavni config: 0 kolektiranih testova = crveno, ne tiho zeleno.
    passWithNoTests: false,
    // xmldom kao globalni DOMParser: happy-dom ne radi XML namespace (ista putanja kao worker).
    setupFiles: ['./tests/setup/xml-dom.ts'],
    // repair-closed-loop.test.ts (5 osnovnih fixera x 367 profila) + repair-closed-loop-*.test.ts
    // (prosirenje na preostalih 26 fixera, batch po batch - vidi docs/FACULTY_MATRIX.md susjedni rad).
    include: ['tests/repair-closed-loop.test.ts', 'tests/repair-closed-loop-*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // 407 profila x build+analiza+popravak+reanaliza; velikodusna marza za CPU kontenciju.
    testTimeout: 60000,
  },
});
