import { defineConfig } from 'vitest/config';
import { resolveMaxWorkers } from './scripts/agents/resolve-max-workers.mjs';

// Zadani broj radnika (Vitest 2.1.9, `minWorkers`/`maxWorkers` su generalizirani preko `threads`
// i `forks` poola; ovaj repo ne postavlja `pool` pa vrijedi Vitestov zadani `forks`).
// VLASNIK 2026-09-26: default podignut s 1 na 2 (optimizacijski popis, stavka 9), s eksplicitnom
// mogucnoscu nadjacavanja kroz env varijablu kad je stroj uzak. `VITEST_MAX_THREADS` nadjacava
// SAMO kad je postavljena i parsira se kao pozitivan cijeli broj; inace vrijedi zadano 2.
// POVIJEST: prijasnja vrijednost 1 je bila izmjerena mjera protiv OOM-a i sporih testova na
// 4-thread/8 GB hostu (vidi git povijest ovog retka). Ako se 2 radnika pokazu preteskim na
// istom stroju, pokreni gate s `VITEST_MAX_THREADS=1 npm run check` umjesto trajne izmjene ovog
// fajla. Racunanje je izdvojeno u `resolveMaxWorkers` da bi test mogao provjeriti logiku bez
// oslanjanja na ponovni import ovog config modula (Vite ne uvijek ponovno izvrsi vec ucitan
// config modul za istu putanju u istom procesu).
export const resolvedMaxWorkers = resolveMaxWorkers(process.env.VITEST_MAX_THREADS);

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
    // Ovaj paket istodobno drži stvarne DOCX ZIP-ove, happy-dom i esbuild procese. Broj radnika
    // je zadano 2 (vidi `resolvedMaxWorkers` iznad), s nadjacavanjem kroz `VITEST_MAX_THREADS`
    // kad je stroj uzak (npr. `VITEST_MAX_THREADS=1`).
    minWorkers: 1,
    maxWorkers: resolvedMaxWorkers,
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
    // `.artifacts/` je gitignorirano radno smetliste (sonde, privremene skripte, jednokratni
    // mjerni testovi). Vitest ga je svejedno kolektirao, pa je `npm run check` padao na tudjim
    // nedovrsenim sondama: izmjereno 2026-08-31, `.artifacts/probe/rss-mutated.test.ts` je bio
    // jedan od dva pada punog gatea. Isti razred kao `visual-system-v2/` iznad: LAZNO CRVENO iz
    // koda koji nije nicija odgovornost u ovom stablu, i koji git ionako ne prati.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/visual-system-v2/**', '**/.artifacts/**', '**/tests/conformance/**', '**/tests/ux/**', '**/tests/ux-dist/**'],
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
