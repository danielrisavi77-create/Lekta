/**
 * Jedinicni testovi mjere koju `bundleSizeGuard` (vite.config.ts) koristi za budzet ulaza.
 *
 * Zasto uopce postoje: guard je do 2026-08-31 mjerio VLASTITI kod entry chunka. Ta je mjera
 * tocna samo dok entry nema zajednickih siblinga. Cim drugi HTML ulaz staticki uveze isti
 * modul, Rollup zajednicki dio hoista u zajednicki chunk, entry se urusi u stub, a guard
 * prolazi zauvijek mjereci nista. Sinteticki bundle ispod podmece tocno taj oblik, pa mjera
 * ima dokaz da grize (a ne samo da postoji).
 */
import { describe, it, expect } from 'vitest';
import {
  describeEntryGraph,
  measureEntryGraphBytes,
  type BundleLike,
} from '../src/build/bundle-entry-graph';

/** Kratica za sintetski chunk; `code` je jedini nositelj bajtova. */
function chunk(options: {
  name?: string;
  isEntry?: boolean;
  code?: string;
  imports?: readonly string[];
}) {
  return { type: 'chunk', ...options } as const;
}

const encoder = new TextEncoder();
const bytes = (text: string): number => encoder.encode(text).length;

describe('measureEntryGraphBytes', () => {
  it('sam entry bez uvoza: graf je jednak vlastitom kodu', () => {
    const bundle: BundleLike = {
      'assets/index-aaa.js': chunk({ name: 'index', isEntry: true, code: 'a'.repeat(100) }),
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured).not.toBeNull();
    expect(measured?.entryFileName).toBe('assets/index-aaa.js');
    expect(measured?.entryOwnBytes).toBe(100);
    expect(measured?.totalBytes).toBe(100);
    expect(measured?.reachableFileNames).toEqual(['assets/index-aaa.js']);
    expect(measured?.missingFileNames).toEqual([]);
  });

  it('entry + zajednicki chunk: zbraja se CIJELI staticki graf, ne samo stub', () => {
    // Ovo je tocan oblik kvara zbog kojeg mjera postoji: entry ima 20 B, a stvarni pocetni
    // trosak je 20 + 5000 + 900 B. Stara mjera bi ovdje prijavila 20 B i prolazila zauvijek.
    const bundle: BundleLike = {
      'assets/index-aaa.js': chunk({
        name: 'index',
        isEntry: true,
        code: 'x'.repeat(20),
        imports: ['assets/shared-bbb.js'],
      }),
      'assets/shared-bbb.js': chunk({
        name: 'shared',
        code: 'y'.repeat(5000),
        imports: ['assets/deep-ccc.js'],
      }),
      'assets/deep-ccc.js': chunk({ name: 'deep', code: 'z'.repeat(900) }),
      // Drugi ulaz i njegov ekskluzivni chunk NE smiju uci u mjeru prvog ulaza.
      'assets/rad-ddd.js': chunk({ name: 'rad', isEntry: true, code: 'q'.repeat(7777) }),
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured?.entryOwnBytes).toBe(20);
    expect(measured?.totalBytes).toBe(20 + 5000 + 900);
    expect(measured?.reachableFileNames).toEqual([
      'assets/index-aaa.js',
      'assets/shared-bbb.js',
      'assets/deep-ccc.js',
    ]);
  });

  it('ciklicki uvozi ne vrte beskonacno i svaki chunk se broji tocno jednom', () => {
    const bundle: BundleLike = {
      'a.js': chunk({ name: 'index', isEntry: true, code: 'a'.repeat(10), imports: ['b.js', 'c.js'] }),
      'b.js': chunk({ name: 'b', code: 'b'.repeat(20), imports: ['c.js', 'a.js'] }),
      'c.js': chunk({ name: 'c', code: 'c'.repeat(30), imports: ['b.js', 'a.js', 'c.js'] }),
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured?.totalBytes).toBe(60);
    expect(measured?.reachableFileNames).toEqual(['a.js', 'b.js', 'c.js']);
    expect(measured?.missingFileNames).toEqual([]);
  });

  it('uvoz koji nije u bundle mapi se IMENUJE umjesto da se tiho preskoci', () => {
    const bundle: BundleLike = {
      'index.js': chunk({
        name: 'index',
        isEntry: true,
        code: 'a'.repeat(10),
        imports: ['nema-me.js', 'nema-me.js', 'ima-me.js'],
      }),
      'ima-me.js': chunk({ name: 'ima', code: 'b'.repeat(5) }),
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured?.totalBytes).toBe(15);
    expect(measured?.missingFileNames).toEqual(['nema-me.js']);
    expect(describeEntryGraph(measured!)).toContain('nema-me.js');
  });

  it('asset (ne-chunk) unos se ne broji ni kad ga entry navodi kao uvoz', () => {
    const bundle: BundleLike = {
      'index.js': chunk({ name: 'index', isEntry: true, code: 'a'.repeat(10), imports: ['style.css'] }),
      'style.css': { type: 'asset' },
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured?.totalBytes).toBe(10);
    expect(measured?.missingFileNames).toEqual(['style.css']);
  });

  it('nepostojeci ili neentry ulaz vraca null, da pozivatelj mora odluciti (a ne tiho prosao)', () => {
    const bundle: BundleLike = {
      'index.js': chunk({ name: 'index', isEntry: false, code: 'a'.repeat(10) }),
      'demo.js': chunk({ name: 'demo', isEntry: true, code: 'b'.repeat(10) }),
    };

    expect(measureEntryGraphBytes(bundle, 'index')).toBeNull();
    expect(measureEntryGraphBytes(bundle, 'nepostojeci')).toBeNull();
    expect(measureEntryGraphBytes({}, 'index')).toBeNull();
  });

  it('mjeri BAJTOVE, ne znakove: hrvatska dijakritika je dvobajtna u UTF-8', () => {
    const croatian = 'čćžšđ';
    const bundle: BundleLike = {
      'index.js': chunk({ name: 'index', isEntry: true, code: croatian, imports: ['b.js'] }),
      'b.js': chunk({ name: 'b', code: croatian }),
    };

    expect(bytes(croatian)).toBe(10);
    expect(measureEntryGraphBytes(bundle, 'index')?.totalBytes).toBe(20);
  });

  it('chunk bez koda (prazan stub) doprinosi nulom, ali ostaje u dosezivom skupu', () => {
    const bundle: BundleLike = {
      'index.js': chunk({ name: 'index', isEntry: true, imports: ['b.js'] }),
      'b.js': chunk({ name: 'b', code: 'b'.repeat(7) }),
    };

    const measured = measureEntryGraphBytes(bundle, 'index');

    expect(measured?.entryOwnBytes).toBe(0);
    expect(measured?.totalBytes).toBe(7);
    expect(measured?.reachableFileNames).toEqual(['index.js', 'b.js']);
  });
});

describe('describeEntryGraph', () => {
  it('sazetak imenuje entry, obje mjere i broj chunkova', () => {
    const bundle: BundleLike = {
      'assets/index-aaa.js': chunk({
        name: 'index',
        isEntry: true,
        code: 'x'.repeat(2048),
        imports: ['assets/shared-bbb.js'],
      }),
      'assets/shared-bbb.js': chunk({ name: 'shared', code: 'y'.repeat(1024) }),
    };

    const summary = describeEntryGraph(measureEntryGraphBytes(bundle, 'index')!);

    expect(summary).toContain('assets/index-aaa.js');
    expect(summary).toContain('2 KB');
    expect(summary).toContain('3 KB');
    expect(summary).toContain('2 chunk(ova)');
    expect(summary).not.toContain('neizmjereni');
  });
});
