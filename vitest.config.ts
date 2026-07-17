import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest NE nasljeduje vite.config.ts pa build-flag mora i ovdje; u testovima su
  // dev alati "ukljuceni" (ponasanje kao lokalni dev build).
  define: { __DEV_TOOLS__: 'true' },
  test: {
    environment: 'happy-dom',
    // Gate MORA pasti ako se ne kolektira nijedan test (npr. loše rješavanje globa ili
    // toolchain regresija koja tiho kolektira 0): inace `npm run check` laže zeleno. Vidi AUD-46.
    passWithNoTests: false,
    setupFiles: ['./tests/setup/xml-dom.ts'],
    // Paralelne sesije drze git worktreeove pod .claude/worktrees/; default exclude ih ne
    // pokriva pa bi parent `npm run check` testirao TUDJU kopiju repoa (duplo testova +
    // tudi crveni padovi). Worktree sesija svoje testove vrti iz vlastitog cwd-a.
    // tests/conformance/** je PUNA matrica (~744 analize, minute) i vrti se ZASEBNO preko
    // `npm run conformance` (vitest.conformance.config.ts); u checku je tripwire uzorak.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/tests/conformance/**'],
  },
});
