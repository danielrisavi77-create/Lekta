import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  inspectRouteShellBudget,
  type RouteShellBudgetIssue,
} from './helpers/route-shell-budget';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src', 'routes', 'shared', 'route-shell.ts');

function issueMessage(issue: RouteShellBudgetIssue): string {
  if (issue.kind === 'forbidden-input') return `Shell import gate: forbidden input ${issue.inputPath}`;
  return `Shell ${issue.kind} gzip is ${issue.actualBytes} bytes, budget is ${issue.maxBytes} bytes`;
}

describe('route shell performance budget', () => {
  it('mjeri stvarni shell bundle, CSS i potpuni import graf', async () => {
    // Mutation caught: shell uvozi feature graf ili prelazi fiksni gzip budget.
    const result = await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      minify: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      metafile: true,
      outdir: 'route-shell-budget',
    });
    const jsFiles = result.outputFiles.filter((file) => file.path.endsWith('.js'));
    const cssFiles = result.outputFiles.filter((file) => file.path.endsWith('.css'));
    expect(jsFiles, 'esbuild mora emitirati tocno jedan shell JS izlaz').toHaveLength(1);
    expect(cssFiles, 'esbuild mora emitirati tocno jedan shell CSS izlaz').toHaveLength(1);
    expect(result.metafile, 'esbuild mora vratiti potpuni metafile import grafa').toBeDefined();
    if (jsFiles.length !== 1 || cssFiles.length !== 1 || !result.metafile) return;

    const issues = inspectRouteShellBudget({
      jsGzipBytes: gzipSync(jsFiles[0].contents).byteLength,
      cssGzipBytes: gzipSync(cssFiles[0].contents).byteLength,
      inputPaths: Object.keys(result.metafile.inputs),
    });

    expect(issues, issues.map(issueMessage).join('\n')).toEqual([]);
  }, 60_000);

  it('odbija feature ulaze po putanji bez blokiranja shared shell infrastrukture', () => {
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
        'src/routes/shared/route-shell.ts',
        'src/routes/shared/public-route-directory.ts',
        'src/shared/skip-link.css',
        'src/routes/shared/route-shell.css',
      ],
    })).toEqual([]);
  });
});
