import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  inspectRouteShellBudget,
  type RouteShellBudgetIssue,
} from './helpers/route-shell-budget';
import {
  MAX_LAZY_FOOTER_JS_GZIP,
  chromeGraph,
  lazyFooterBudgetProblems,
  lazyFooterProblems,
} from './helpers/site-footer-guards';

/**
 * PRORACUN LJUSKE MJERI TRAKU (Z15), JER `route-shell.ts` VISE NE POSTOJI.
 *
 * `src/routes/shared/route-shell.ts` je bio ljuska ruta koju NIJEDAN ulaz nije montirao: nijedna
 * stranica ga nije uvozila, a jedini citatelji bila su dva testa. Z15 tu ulogu (jedan chrome za sve
 * rute, tema, aktivno odrediste) preuzima kroz `src/shared/site-chrome.ts`, koji je STVARNO ozicen
 * preko `ui-boot.ts`. Dvije ljuske ne smiju stajati jedna uz drugu, pa je mrtva uklonjena, a ovaj
 * proracun je usmjeren na zivu: tvrdnja je time prestala biti o kodu koji korisnik nikad ne skine.
 *
 * Granica je ostala ISTA (8 KB JS / 12 KB CSS gzip) i rjecnik zabranjenih ulaza je isti, uz jednu
 * imenovanu iznimku (`src/report/pricing.ts`, obrazlozena u helperu). Izmjereno u ovom stablu
 * 2026-09-23 (drugi krug popravka, `esbuild` + `gzipSync`): 6418 B JS i 2435 B CSS gzip. JS je
 * PAO s 8001 B: traka od ovog kruga vise ne uvozi cijeli `site-stats.json` (s nazivom svake od 134
 * jedinica) nego mali `data/coverage/unit-kratice.json` (F16/F17). Traka ima zraka, ali ne i
 * dopustenje da uvuce feature graf.
 *
 * DRUGI KRUG Z15 (2026-09-27): MJERI SE ONO STO SVAKA STRANICA SKINE, S RAZDVAJANJEM KOMADA.
 * Puno podnozje (`site-footer-full.ts`, s pecenim brojkama iz `site-stats.json`) treba samo
 * `/saznaj-vise/` i `/alati.html`, pa ga traka uvozi DINAMICKI. Bez `splitting` esbuild dinamicki
 * uvoz upise u isti izlaz i proracun bi mjerio kod koji ostalih jedanaest stranica nikad ne skine
 * (izmjereno: 7783 B bez razdvajanja). Sa `splitting` se zbrajaju gzip velicine ulaza trake i SVIH
 * komada koje on STATICKI uvozi (7008 B: 6299 + 709 zajednickog komada), a lijeni komad ima
 * vlastitu granicu (`MAX_LAZY_FOOTER_JS_GZIP`, 3 KB) i mora biti JEDINI lijeni ulaz trake
 * (`lazyFooterBudgetProblems`). Zabranjeni rjecnik i dalje vrijedi za CIJELI graf, lijeni ukljucivo.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY_JS = join(ROOT, 'src', 'shared', 'site-chrome.ts');
const ENTRY_CSS = join(ROOT, 'src', 'shared', 'site-chrome.css');

function issueMessage(issue: RouteShellBudgetIssue): string {
  if (issue.kind === 'forbidden-input') return `Shell import gate: forbidden input ${issue.inputPath}`;
  return `Shell ${issue.kind} gzip is ${issue.actualBytes} bytes, budget is ${issue.maxBytes} bytes`;
}

describe('site chrome performance budget', () => {
  it('mjeri stvarni chrome bundle, CSS i potpuni import graf', async () => {
    // Mutation caught: traka uvozi feature graf ili prelazi fiksni gzip budget.
    const result = await esbuild.build({
      entryPoints: [ENTRY_JS, ENTRY_CSS],
      bundle: true,
      minify: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      metafile: true,
      splitting: true,
      outdir: 'site-chrome-budget',
    });
    const cssFiles = result.outputFiles.filter((file) => file.path.endsWith('.css'));
    expect(cssFiles, 'esbuild mora emitirati tocno jedan chrome CSS izlaz').toHaveLength(1);
    expect(result.metafile, 'esbuild mora vratiti potpuni metafile import grafa').toBeDefined();
    if (cssFiles.length !== 1 || !result.metafile) return;

    // STATICKI GRAF (uvijek skinut) naspram LIJENOG; izlazi metafilea su relativni na radni direktorij.
    const graf = chromeGraph(result.metafile, 'src/shared/site-chrome.ts');
    expect(lazyFooterProblems(graf)).toEqual([]);
    const gzipOd = (izlazi: readonly string[]): number => izlazi.reduce((zbroj, izlaz) => {
      const datoteka = result.outputFiles.find((f) => f.path.replaceAll('\\', '/').endsWith(izlaz.replaceAll('\\', '/')));
      expect(datoteka, `izlaz ${izlaz} nije emitiran`).toBeDefined();
      return zbroj + (datoteka ? gzipSync(datoteka.contents).byteLength : 0);
    }, 0);
    const statickiJs = gzipOd(graf.staticOutputs);
    // SENTINEL: nula bi znacila da zbrajanje nije naslo nijedan izlaz.
    expect(statickiJs, 'staticki JS trake je 0 B; mjerenje ne mjeri nista').toBeGreaterThan(1000);
    // LIJENI DIO: jedini lijeni ulaz je podnozje, a zbroj svih lijenih izlaza je unutar granice.
    // Gard i granica su u helperu; mutacije `z15b/lijeni-*` u `tests/gate-mutations.test.ts`.
    const lijeneVelicine = Object.fromEntries(graf.lazyOutputs.map((izlaz) => [izlaz, gzipOd([izlaz])]));
    expect(lazyFooterBudgetProblems(result.metafile, graf, lijeneVelicine, MAX_LAZY_FOOTER_JS_GZIP)).toEqual([]);

    // Sentinel: prazan graf bi ucinio "nula zabranjenih ulaza" vakuumskim nalazom.
    const inputPaths = Object.keys(result.metafile.inputs);
    expect(inputPaths.length, 'graf trake je prazan; mjerenje ne mjeri nista').toBeGreaterThan(3);
    expect(inputPaths.map((p) => p.replaceAll('\\', '/')))
      .toContain('src/shared/site-chrome.ts');

    const issues = inspectRouteShellBudget({
      jsGzipBytes: statickiJs,
      cssGzipBytes: gzipSync(cssFiles[0].contents).byteLength,
      inputPaths,
    });

    expect(issues, issues.map(issueMessage).join('\n')).toEqual([]);
  }, 60_000);

  it('odbija feature ulaze po putanji bez blokiranja shared chrome infrastrukture', () => {
    // Mutations caught: singular profile-rules client and scoped Supabase package used to evade token matching.
    const issues = inspectRouteShellBudget({
      jsGzipBytes: 0,
      cssGzipBytes: 0,
      inputPaths: [
        'src/report/profile-rules-client.ts',
        'node_modules\\@supabase\\supabase-js\\dist\\module\\index.js',
        'src/analysis/analyze-docx.ts',
        'src/profiles/profile-index.ts',
      ],
    });

    expect(issues.filter((issue) => issue.kind === 'forbidden-input').map((issue) => issue.inputPath)).toEqual([
      'src/report/profile-rules-client.ts',
      'node_modules/@supabase/supabase-js/dist/module/index.js',
      'src/analysis/analyze-docx.ts',
      'src/profiles/profile-index.ts',
    ]);
    expect(inspectRouteShellBudget({
      jsGzipBytes: 0,
      cssGzipBytes: 0,
      inputPaths: [
        'src/shared/site-chrome.ts',
        'src/shared/site-chrome.css',
        'src/routes/shared/public-route-directory.ts',
        'src/shared/browser-storage.ts',
        'src/shared/display-prefs.ts',
      ],
    })).toEqual([]);
  });

  it('IZNIMKA JE STAZA, NE UZORAK: cjenik prolazi, ostatak `src/report` ne', () => {
    // Bez ove tvrdnje bi iznimka za `src/report/pricing.ts` mogla biti izvedena kao omeksan obrazac
    // (`src/report` vise nije zabranjen), i time otvoriti cijeli izvjestajni graf.
    const dopusten = inspectRouteShellBudget({ jsGzipBytes: 0, cssGzipBytes: 0, inputPaths: ['src/report/pricing.ts'] });
    expect(dopusten).toEqual([]);
    const zabranjen = inspectRouteShellBudget({ jsGzipBytes: 0, cssGzipBytes: 0, inputPaths: ['src/report/repair-history.ts'] });
    expect(zabranjen.map((issue) => issue.kind)).toEqual(['forbidden-input']);
  });
});
