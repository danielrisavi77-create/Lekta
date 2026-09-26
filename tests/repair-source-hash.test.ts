import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashRepairSourceTree } from '../scripts/lib/repair-source-hash.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sourceTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'lekta-repair-source-'));
  roots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, contents);
  }
  return root;
}

describe('repair source fingerprint', () => {
  it('is stable across file creation order and changes when source bytes change', () => {
    const first = sourceTree({ 'fixers/a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' });
    const same = sourceTree({ 'b.ts': 'const b = 2;', 'fixers/a.ts': 'const a = 1;' });
    const changed = sourceTree({ 'fixers/a.ts': 'const a = 3;', 'b.ts': 'const b = 2;' });

    expect(hashRepairSourceTree(first)).toBe(hashRepairSourceTree(same));
    expect(hashRepairSourceTree(first)).not.toBe(hashRepairSourceTree(changed));
  });

  it('includes relative paths so file moves cannot preserve the fingerprint', () => {
    const original = sourceTree({ 'fixers/a.ts': 'same bytes' });
    const moved = sourceTree({ 'other/a.ts': 'same bytes' });

    expect(hashRepairSourceTree(original)).not.toBe(hashRepairSourceTree(moved));
  });
});
