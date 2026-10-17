// @vitest-environment node
/**
 * P5 read-guard: Read bez limit nad velikom tekstualnom datotekom se odbija, sve ostalo prolazi.
 * Datoteke su sinteticke u privremenom direktoriju.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { brojRedaka, judgeRead, PRAG_BAJTOVA, PRAG_REDAKA } from '../scripts/hooks/read-guard.mjs';

const dir = mkdtempSync(join(tmpdir(), 'read-guard-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const velika = join(dir, 'velika.ts');
writeFileSync(velika, 'x\n'.repeat(PRAG_REDAKA + 1));
const mala = join(dir, 'mala.ts');
writeFileSync(mala, 'x\n'.repeat(PRAG_REDAKA));
const sirokiRedak = join(dir, 'minificirano.js');
writeFileSync(sirokiRedak, 'a'.repeat(PRAG_BAJTOVA + 1));

function hook(input: unknown) {
  return spawnSync(process.execPath, [resolve('scripts/hooks/read-guard.mjs')], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('read-guard: cista presuda', () => {
  it('broji retke s i bez zavrsnog prijeloma, CRLF kao jedan redak', () => {
    expect(brojRedaka('')).toBe(0);
    expect(brojRedaka('a')).toBe(1);
    expect(brojRedaka('a\nb\n')).toBe(2);
    expect(brojRedaka('a\r\nb')).toBe(2);
  });

  it('ugovoreni pragovi su doslovno 300 redaka i 40.000 bajtova', () => {
    expect([PRAG_REDAKA, PRAG_BAJTOVA]).toEqual([300, 40_000]);
    expect(judgeRead({ toolInput: {}, ext: '.ts', redaka: 300, bajtova: 600 }).allow).toBe(true);
    const r = judgeRead({ toolInput: {}, ext: '.ts', redaka: 301, bajtova: 602 });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain('limit: 301');
    expect(judgeRead({ toolInput: {}, ext: '.js', redaka: null, bajtova: 40_000 }).allow).toBe(true);
    expect(judgeRead({ toolInput: {}, ext: '.js', redaka: null, bajtova: 40_001 }).allow).toBe(false);
  });

  it('binarna datoteka prolazi bez obzira na velicinu', () => {
    expect(judgeRead({ toolInput: {}, ext: '', redaka: null, bajtova: 5_000_000, binarna: true }).allow).toBe(true);
  });

  it('izricit limit, netekstualna datoteka i nepoznata velicina uvijek prolaze', () => {
    expect(judgeRead({ toolInput: { limit: 5000 }, ext: '.ts', redaka: 5000, bajtova: 1e6 }).allow).toBe(true);
    expect(judgeRead({ toolInput: {}, ext: '.PDF', redaka: 5000, bajtova: 1e6 }).allow).toBe(true);
    expect(judgeRead({ toolInput: {}, ext: '.ts', redaka: null, bajtova: null }).allow).toBe(true);
  });
});

describe('read-guard: hook kao proces', () => {
  it('odbija veliku datoteku bez limit (exit 2, poruka modelu)', () => {
    const r = hook({ tool_name: 'Read', tool_input: { file_path: velika } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('read-guard:');
  });

  it('odbija jedan dugi redak iznad praga bajtova', () => {
    expect(hook({ tool_name: 'Read', tool_input: { file_path: sirokiRedak } }).status).toBe(2);
  });

  it('limit prolazi prije pristupa disku: i direktorij s limit je exit 0', () => {
    expect(hook({ tool_name: 'Read', tool_input: { file_path: dir, limit: 1 } }).status).toBe(0);
  });

  it('binarna datoteka bez ekstenzije iznad praga prolazi (NUL u uzorku)', () => {
    const blob = join(dir, 'blob');
    const b = Buffer.alloc(PRAG_BAJTOVA * 2, 0xff);
    b[10] = 0;
    writeFileSync(blob, b);
    expect(hook({ tool_name: 'Read', tool_input: { file_path: blob } }).status).toBe(0);
  });

  it('propusta malu datoteku, limit, nepostojecu datoteku i neispravan ulaz (fail-open)', () => {
    expect(hook({ tool_name: 'Read', tool_input: { file_path: mala } }).status).toBe(0);
    expect(hook({ tool_name: 'Read', tool_input: { file_path: velika, offset: 1, limit: 50 } }).status).toBe(0);
    expect(hook({ tool_name: 'Read', tool_input: { file_path: join(dir, 'nema.ts') } }).status).toBe(0);
    expect(hook('nije json').status).toBe(0);
  });
});
