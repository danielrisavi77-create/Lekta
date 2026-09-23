import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  inspectRouteShellBudget,
  type RouteShellBudgetIssue,
} from './helpers/route-shell-budget';

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
 * imenovanu iznimku (`src/report/pricing.ts`, obrazlozena u helperu). Izmjereno 2026-09-23:
 * 5020 B JS i 2168 B CSS gzip, dakle traka ima zraka, ali ne i dopustenje da uvuce feature graf.
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
      outdir: 'site-chrome-budget',
    });
    const jsFiles = result.outputFiles.filter((file) => file.path.endsWith('.js'));
    const cssFiles = result.outputFiles.filter((file) => file.path.endsWith('.css'));
    expect(jsFiles, 'esbuild mora emitirati tocno jedan chrome JS izlaz').toHaveLength(1);
    expect(cssFiles, 'esbuild mora emitirati tocno jedan chrome CSS izlaz').toHaveLength(1);
    expect(result.metafile, 'esbuild mora vratiti potpuni metafile import grafa').toBeDefined();
    if (jsFiles.length !== 1 || cssFiles.length !== 1 || !result.metafile) return;

    // Sentinel: prazan graf bi ucinio "nula zabranjenih ulaza" vakuumskim nalazom.
    const inputPaths = Object.keys(result.metafile.inputs);
    expect(inputPaths.length, 'graf trake je prazan; mjerenje ne mjeri nista').toBeGreaterThan(3);
    expect(inputPaths.map((p) => p.replaceAll('\\', '/')))
      .toContain('src/shared/site-chrome.ts');

    const issues = inspectRouteShellBudget({
      jsGzipBytes: gzipSync(jsFiles[0].contents).byteLength,
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
