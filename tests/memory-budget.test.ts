/**
 * Jedinicni testovi memorijskog proracuna analize (BL-P0-05-7). Ciste funkcije: granica uploada
 * i dekompresijski budzet ovisno o (deviceMemory, coarsePointer). Cilj: slab uredaj dobije nizu
 * granicu i budzet (ranije jasno odbijanje umjesto tihog OOM-a), jaci uredaj ponasanje kao dosad.
 */
import { describe, it, expect } from 'vitest';
import { uploadCapBytes, decompressionBudgetBytes } from '../src/analysis/memory-budget';
import {
  DOCX_MAX_UPLOAD_BYTES,
  uploadCapBytes as uploadCapBytesFromBudget,
  uploadCapBytesForSharedCap,
} from '../src/repair/docx-budget';

const MB = 1024 * 1024;

describe('uploadCapBytes', () => {
  it('desktop bez signala uredaja: 20 MB (zajednicka granica s popravkom)', () => {
    expect(uploadCapBytes()).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: 8 })).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: null, coarsePointer: false })).toBe(20 * MB);
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
    expect(uploadCapBytes({ deviceMemory: 0 })).toBe(20 * MB);
    expect(uploadCapBytes({ deviceMemory: -1, coarsePointer: false })).toBe(20 * MB);
  });
});

describe('decompressionBudgetBytes', () => {
  it('jaci uredaj ili nepoznato (bez coarse pointera): null (puni 200 MB, kao golden)', () => {
    expect(decompressionBudgetBytes()).toBeNull();
    expect(decompressionBudgetBytes({ deviceMemory: null })).toBeNull();
    expect(decompressionBudgetBytes({ deviceMemory: 8 })).toBeNull();
    expect(decompressionBudgetBytes({ deviceMemory: 0 })).toBeNull();
    expect(decompressionBudgetBytes({ deviceMemory: 8, coarsePointer: false })).toBeNull();
  });

  it('slab uredaj dobije tvrdi budzet: <=2 GB -> 100 MB, <=4 GB -> 150 MB', () => {
    expect(decompressionBudgetBytes({ deviceMemory: 2 })).toBe(100 * MB);
    expect(decompressionBudgetBytes({ deviceMemory: 1 })).toBe(100 * MB);
    expect(decompressionBudgetBytes({ deviceMemory: 4 })).toBe(150 * MB);
    expect(decompressionBudgetBytes({ deviceMemory: 3 })).toBe(150 * MB);
  });

  it('AUD-03: coarse pointer bez deviceMemory (iOS Safari, Firefox) stegne na 150 MB', () => {
    expect(decompressionBudgetBytes({ coarsePointer: true })).toBe(150 * MB);
    expect(decompressionBudgetBytes({ deviceMemory: null, coarsePointer: true })).toBe(150 * MB);
    expect(decompressionBudgetBytes({ deviceMemory: 8, coarsePointer: true })).toBe(150 * MB);
    // vrlo slab uredaj i dalje ima prednost (100 MB) i uz coarse pointer
    expect(decompressionBudgetBytes({ deviceMemory: 2, coarsePointer: true })).toBe(100 * MB);
  });
});

/**
 * SELIDBA `uploadCapBytes` u `src/repair/docx-budget.ts` (2026-08-31).
 *
 * Razlog selidbe je granica bundlea: minimalni intake put mora moci odbiti prevelik dokument bez
 * povlacenja cijelog analitickog grafa. Selidba je ipak promjena SIGURNOSNE brojke (granica
 * uploada), pa se ekvivalencija DOKAZUJE tablicom, ne tvrdnjom u poruci commita.
 *
 * `uploadCapBytesBeforeMove` je DOSLOVAN prijepis funkcije prije selidbe. Usporedjuje se na
 * svakom paru (deviceMemory, coarsePointer) koji pozivatelj moze proizvesti, ukljucujuci
 * degenerirane vrijednosti (NaN, Infinity, nula, negativno) koje `navigator.deviceMemory` u
 * praksi zna vratiti ili izostaviti.
 */
const MOVED_MB = 1024 * 1024;

function uploadCapBytesBeforeMove(
  sharedCapBytes: number,
  opts: { deviceMemory?: number | null; coarsePointer?: boolean } = {},
): number {
  const dm = typeof opts.deviceMemory === 'number' && opts.deviceMemory > 0 ? opts.deviceMemory : null;
  if (dm !== null && dm <= 2) return 12 * MOVED_MB;
  if (opts.coarsePointer || (dm !== null && dm <= 4)) return 20 * MOVED_MB;
  return sharedCapBytes;
}

/** Zajednicke granice nad kojima se tablica vrti; samo prva je danasnja stvarnost. */
const SHARED_CAP_INPUTS: readonly number[] = [20 * MOVED_MB, 30 * MOVED_MB, 50 * MOVED_MB];

const DEVICE_MEMORY_INPUTS: ReadonlyArray<number | null | undefined> = [
  undefined, null, -1, 0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 6, 8, 12, 16, 32, 64,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];
const COARSE_POINTER_INPUTS: ReadonlyArray<boolean | undefined> = [undefined, false, true];

describe('uploadCapBytes: selidba u docx-budget', () => {
  it('tablica (zajednicka granica x deviceMemory x coarsePointer): nijedan ulaz se ne preslikava drukcije nego prije selidbe', () => {
    const differing: string[] = [];
    let compared = 0;
    for (const sharedCap of SHARED_CAP_INPUTS) {
      for (const deviceMemory of DEVICE_MEMORY_INPUTS) {
        for (const coarsePointer of COARSE_POINTER_INPUTS) {
          const opts = { deviceMemory, coarsePointer };
          const before = uploadCapBytesBeforeMove(sharedCap, opts);
          const after = uploadCapBytesForSharedCap(sharedCap, opts);
          compared += 1;
          if (before !== after) {
            differing.push(`cap=${sharedCap} dm=${String(deviceMemory)} coarse=${String(coarsePointer)}: prije=${before} poslije=${after}`);
          }
        }
      }
    }

    // Prazna tablica bi "prosla" bez ijedne usporedbe, pa se broj parova tvrdi izrijekom.
    expect(compared).toBe(SHARED_CAP_INPUTS.length * DEVICE_MEMORY_INPUTS.length * COARSE_POINTER_INPUTS.length);
    expect(differing, differing.join(' | ')).toEqual([]);
  });

  it('javni potpis i re-export vode na ISTU odluku kao seam uz stvarnu zajednicku granicu', () => {
    for (const deviceMemory of DEVICE_MEMORY_INPUTS) {
      for (const coarsePointer of COARSE_POINTER_INPUTS) {
        const opts = { deviceMemory, coarsePointer };
        const expected = uploadCapBytesForSharedCap(DOCX_MAX_UPLOAD_BYTES, opts);
        expect(uploadCapBytesFromBudget(opts), JSON.stringify(opts)).toBe(expected);
        expect(uploadCapBytes(opts), JSON.stringify(opts)).toBe(expected);
      }
    }
    expect(uploadCapBytesFromBudget()).toBe(uploadCapBytesForSharedCap(DOCX_MAX_UPLOAD_BYTES));
    expect(uploadCapBytes).toBe(uploadCapBytesFromBudget);
  });

  /**
   * GARD PROTIV SKRACIVANJA MOBILNE GRANE.
   *
   * Dok je zajednicka granica bila zakucana, brisanje reda
   * `if (opts.coarsePointer || dm <= 4) return 20 * MB;` nije rusilo NIJEDAN test u repozitoriju
   * (izmjereno adversarijalno 2026-08-31: 69 zelenih). Ovdje se zajednicka granica podigne, pa se
   * skraceni oblik razilazi od ispravnog i test pada.
   */
  it('mobilna granica NE prati zajednicku granicu kad se ona podigne', () => {
    for (const sharedCap of [30 * MOVED_MB, 50 * MOVED_MB, 64 * MOVED_MB]) {
      // Mobitel ostaje na 20 MB (ovo pada cim se mobilna grana obrise).
      expect(uploadCapBytesForSharedCap(sharedCap, { coarsePointer: true }), `cap=${sharedCap}`).toBe(20 * MOVED_MB);
      expect(uploadCapBytesForSharedCap(sharedCap, { deviceMemory: 4 }), `cap=${sharedCap}`).toBe(20 * MOVED_MB);
      expect(uploadCapBytesForSharedCap(sharedCap, { deviceMemory: 3, coarsePointer: true }), `cap=${sharedCap}`).toBe(20 * MOVED_MB);
      // Desktop I DALJE prati zajednicku granicu: bez ovoga bi prosla i funkcija koja uvijek
      // vraca 20 MB, dakle gard koji vristi na sve.
      expect(uploadCapBytesForSharedCap(sharedCap), `cap=${sharedCap}`).toBe(sharedCap);
      expect(uploadCapBytesForSharedCap(sharedCap, { deviceMemory: 8 }), `cap=${sharedCap}`).toBe(sharedCap);
      // Vrlo slab uredaj ostaje na 12 MB bez obzira na sve.
      expect(uploadCapBytesForSharedCap(sharedCap, { deviceMemory: 2 }), `cap=${sharedCap}`).toBe(12 * MOVED_MB);
    }
  });

  it('BASELINE: uz danasnju zajednicku granicu (20 MB) skraceni oblik JE ekvivalentan', () => {
    // Zato skracivanje i prolazi neopazeno bez gornjeg testa: razlika je nevidljiva na 20 MB.
    const shortened = (opts: { deviceMemory?: number | null; coarsePointer?: boolean }): number => {
      const dm = typeof opts.deviceMemory === 'number' && opts.deviceMemory > 0 ? opts.deviceMemory : null;
      if (dm !== null && dm <= 2) return 12 * MOVED_MB;
      return DOCX_MAX_UPLOAD_BYTES;
    };
    expect(DOCX_MAX_UPLOAD_BYTES).toBe(20 * MOVED_MB);
    for (const deviceMemory of DEVICE_MEMORY_INPUTS) {
      for (const coarsePointer of COARSE_POINTER_INPUTS) {
        const opts = { deviceMemory, coarsePointer };
        expect(shortened(opts), JSON.stringify(opts)).toBe(uploadCapBytes(opts));
      }
    }
  });
});
