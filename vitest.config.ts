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
    // visual-system-v2/ je git worktree ZA KORIJENOM repozitorija, ne pod .claude/worktrees/, pa
    // ga gornji `.claude/**` ne hvata: izmjereno 2026-08-30, parent `npm run check` je uz vlastite
    // testove kolektirao i svih 342 test datoteke te druge grane. To nije samo dvostruko vrijeme
    // nego LAZNO CRVENO (tudji padovi pod nasim gateom) i OOM (`MarkCompactCollector`) na punom
    // prolazu. Worktree svoje testove vrti iz vlastitog cwd-a.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/visual-system-v2/**', '**/tests/conformance/**', '**/tests/ux/**'],
    // Vitestov default je 5000 ms, sto je mjera za obican jedinicni test. Velik dio ovog
    // paketa gradi, raspakirava i parsira STVARNE .docx pakete (zip + OOXML + puna analiza),
    // pa takav test redovno traje 3-5 s i sam po sebi je zdrav. Uz 5000 ms nekoliko ih je
    // sjedilo tik ispod granice i padalo je samo pod punim opterecenjem, dok su izolirano
    // prolazili: lazno crveno koje ne pokazuje nijedan stvarni kvar.
    // 15000 ms ne skriva zaglavljen test (i dalje pada, samo kasnije), a mice tu klasu flakea.
    // Datoteke kojima treba jos vise (korpusni testovi, golden harness) i dalje deklariraju
    // vlastiti timeout po testu, npr. `}, 30000);` - taj obrazac ostaje mjerodavan.
    testTimeout: 15000,
    // Isto obrazlozenje vrijedi i za HOOKOVE, sto je gore promaknulo: `beforeAll` koji gradi
    // bundle ili raspakirava paket redovno traje vise od zadanih 10000 ms pod punim opterecenjem.
    // Izmjereno 2026-08-20: `tests/title-page-web-bundle.test.ts` pao je s "Hook timed out in
    // 10000ms" iako je svih 31 testova PROSLO, a izolirano prolazi. Lazno crveno koje ne pokazuje
    // nijedan stvarni kvar, a kod golden testova zna i obrisati snapshot kao zastario.
    hookTimeout: 30000,
  },
});
