/**
 * Otisak koda popravka (T74). Tvrdnje: otisak prati samo produkcijski .ts u src/repair, deterministican
 * je, a provjera svjezine nikad ne baca nego vraca stanje koje potrosac otvoreno degradira.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  isRepairProductionSource,
  repairSourceFreshness,
  repairSourceHash,
  repairSourceHashFromFiles,
} from '../scripts/lib/repair-source-hash.mjs';

const BASE = [
  { path: 'src/repair/apply-fixers.ts', content: 'export const a = 1;\n' },
  { path: 'src/repair/contract/hash.ts', content: 'export const h = 2;\n' },
  { path: 'src/repair/apply-fixers.test.ts', content: 'it("x", () => {});\n' },
  { path: 'src/repair/CLAUDE.md', content: '# Popravak\n' },
];
const hashOf = (files: typeof BASE) => repairSourceHashFromFiles(files).hash;
const zamijeni = (p: string, content: string) => BASE.map((f) => (f.path === p ? { ...f, content } : f));

describe('repair-source-hash: sto ulazi u otisak', () => {
  it('produkcijski .ts da; test, spec, d.ts, fixture i markdown ne', () => {
    expect(isRepairProductionSource('src/repair/fixers.ts')).toBe(true);
    expect(isRepairProductionSource('src/repair/contract/adapter.ts')).toBe(true);
    expect(isRepairProductionSource('src\\repair\\fixers.ts')).toBe(true);
    expect(isRepairProductionSource('src/repair/fixers.test.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/fixers.spec.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/types.d.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/fixtures/doc.ts')).toBe(false);
    expect(isRepairProductionSource('src/repair/CLAUDE.md')).toBe(false);
    expect(isRepairProductionSource('src/analysis/fixers.ts')).toBe(false);
  });

  it('izmjena CLAUDE.md ili testa ne mijenja otisak, izmjena produkcijskog .ts mijenja', () => {
    const base = hashOf(BASE);
    expect(hashOf(zamijeni('src/repair/CLAUDE.md', '# Popravak\n<!-- komentar -->\n'))).toBe(base);
    expect(hashOf(zamijeni('src/repair/apply-fixers.test.ts', 'it("y", () => {});\n'))).toBe(base);
    expect(hashOf(zamijeni('src/repair/contract/hash.ts', 'export const h = 3;\n'))).not.toBe(base);
  });

  it('deterministican: redoslijed ulaza i CRLF ne mijenjaju otisak, preimenovanje mijenja', () => {
    const base = hashOf(BASE);
    expect(hashOf([...BASE].reverse())).toBe(base);
    expect(hashOf(BASE.map((f) => ({ ...f, content: f.content.replace(/\n/g, '\r\n') })))).toBe(base);
    const preimenovano = BASE.map((f) => (f.path === 'src/repair/apply-fixers.ts' ? { ...f, path: 'src/repair/apply.ts' } : f));
    expect(hashOf(preimenovano)).not.toBe(base);
  });

  it('otisak s diska pokriva tocno produkcijske .ts datoteke iz git indeksa', () => {
    const tracked = execFileSync('git', ['ls-files', 'src/repair'], { encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean);
    const ocekivano = tracked.filter(isRepairProductionSource).sort();
    const { hash, files } = repairSourceHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Generator testa proizvodi ciljanu klasu: repo stvarno ima i datoteke koje otisak MORA preskociti.
    expect(tracked.some((p) => p.endsWith('.test.ts'))).toBe(true);
    expect(tracked).toContain('src/repair/CLAUDE.md');
    expect(ocekivano.length).toBeGreaterThan(0);
    expect(files).toEqual(ocekivano);
    expect(repairSourceHash().hash).toBe(hash);
  });
});

describe('repair-source-hash: svjezina nikad ne baca', () => {
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);

  it('isti otisak je fresh, drugaciji stale', () => {
    expect(repairSourceFreshness(a, a).status).toBe('fresh');
    expect(repairSourceFreshness(a, b).status).toBe('stale');
  });

  it('nedostajuci ili neispravan otisak je missing, bez iznimke', () => {
    for (const recorded of [undefined, null, '', 'abc', 42, {}, a.toUpperCase()]) {
      expect(() => repairSourceFreshness(recorded, b)).not.toThrow();
      expect(repairSourceFreshness(recorded, b).status).toBe('missing');
    }
    expect(repairSourceFreshness(a, undefined).status).toBe('missing');
  });
});
