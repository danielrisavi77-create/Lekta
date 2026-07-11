/**
 * Jedinicni testovi memorijskog proracuna analize (BL-P0-05-7). Ciste funkcije: granica uploada
 * i dekompresijski budzet ovisno o (deviceMemory, coarsePointer). Cilj: slab uredaj dobije nizu
 * granicu i budzet (ranije jasno odbijanje umjesto tihog OOM-a), jaci uredaj ponasanje kao dosad.
 */
import { describe, it, expect } from 'vitest';
import { uploadCapBytes, decompressionBudgetBytes } from '../src/analysis/memory-budget';

const MB = 1024 * 1024;

describe('uploadCapBytes', () => {
  it('desktop bez signala uredaja: 50 MB', () => {
    expect(uploadCapBytes()).toBe(50 * MB);
    expect(uploadCapBytes({ deviceMemory: 8 })).toBe(50 * MB);
    expect(uploadCapBytes({ deviceMemory: null, coarsePointer: false })).toBe(50 * MB);
  });

  it('mobilni (coarse pointer ili <=4 GB): 20 MB', () => {
    expect(uploadCapBytes({ coarsePointer: true })).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: 4 })).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: 3 })).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: 8, coarsePointer: true })).toBe(20 * MB);
  });

  it('vrlo slab uredaj (<=2 GB) ima prednost: 12 MB i uz coarse pointer', () => {
    expect(uploadCapBytes({ deviceMemory: 2 })).toBe(12 * MB);
    expect(uploadCapBytes({ deviceMemory: 1 })).toBe(12 * MB);
    expect(uploadCapBytes({ deviceMemory: 2, coarsePointer: true })).toBe(12 * MB);
  });

  it('nevaljan deviceMemory (0, negativan) tretira se kao nedostupan', () => {
    expect(uploadCapBytes({ deviceMemory: 0 })).toBe(50 * MB);
    expect(uploadCapBytes({ deviceMemory: -1, coarsePointer: false })).toBe(50 * MB);
  });
});

describe('decompressionBudgetBytes', () => {
  it('jaci uredaj ili nepoznato: null (ZipReader koristi puni 200 MB, kao golden)', () => {
    expect(decompressionBudgetBytes()).toBeNull();
    expect(decompressionBudgetBytes(null)).toBeNull();
    expect(decompressionBudgetBytes(8)).toBeNull();
    expect(decompressionBudgetBytes(0)).toBeNull();
  });

  it('slab uredaj dobije tvrdi budzet: <=2 GB -> 100 MB, <=4 GB -> 150 MB', () => {
    expect(decompressionBudgetBytes(2)).toBe(100 * MB);
    expect(decompressionBudgetBytes(1)).toBe(100 * MB);
    expect(decompressionBudgetBytes(4)).toBe(150 * MB);
    expect(decompressionBudgetBytes(3)).toBe(150 * MB);
  });
});
