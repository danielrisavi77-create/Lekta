import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest NE nasljeduje vite.config.ts pa build-flag mora i ovdje; u testovima su
  // dev alati "ukljuceni" (ponasanje kao lokalni dev build).
  define: { __DEV_TOOLS__: 'true' },
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
    setupFiles: ['./tests/setup/xml-dom.ts'],
    // Paralelne sesije drze git worktreeove pod .claude/worktrees/; default exclude ih ne
    // pokriva pa bi parent `npm run check` testirao TUDJU kopiju repoa (duplo testova +
    // tudi crveni padovi). Worktree sesija svoje testove vrti iz vlastitog cwd-a.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
});
