import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

describe('repair-local-status Edge kompozicija', () => {
  it('bundla cijeli lokalni import-graf u samostalni Deno modul', async () => {
    const result = await build({
      entryPoints: [join(root, 'supabase', 'functions', 'repair-local-status', 'index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      write: false,
      external: ['https://*', 'http://*', 'jsr:*', 'npm:*', 'node:*'],
      legalComments: 'none',
      logLevel: 'silent',
    });

    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0].contents.byteLength).toBeGreaterThan(1_000);
  }, 120_000);
});
