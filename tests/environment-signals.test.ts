import { describe, expect, it } from 'vitest';
import {
  coarsePointer, deviceMemoryGb, effectiveUploadCap, isLikelyMobile, motionReduced, withViewTransition,
} from '../src/ui/environment-signals';

/**
 * SIGNALI OKOLINE. Klaster je do 2026-09-08 zivio u `app.ts` BEZ IJEDNOG TESTA, iako o njemu ovisi
 * kada se mijenja ekran i koliki se dokument uopce prima.
 *
 * Test postoji zato sto je `withViewTransition` istoga dana bio glavni osumnjicenik za crven
 * `browser-matrix` pa oslobodjen krivnje mjerenjem. Tvrdnja koju je tada trebalo imati, a nije je
 * bilo: da `mutate` bude pozvan TOCNO JEDNOM u svakoj grani, ukljucujuci onu u kojoj prijelaz baci.
 */
type Upiti = Record<string, boolean>;
const okolina = (upiti: Upiti, deviceMemory?: number) => ({
  matchMedia: (q: string) => ({ matches: !!upiti[q] }) as MediaQueryList,
  navigator: deviceMemory === undefined ? {} : { deviceMemory },
}) as unknown as Parameters<typeof motionReduced>[0];

const REDUCED = '(prefers-reduced-motion:reduce)';
const COARSE = '(pointer:coarse)';

describe('citanje medijskih upita', () => {
  it('cita reduced motion i grubi pokazivac', () => {
    expect(motionReduced(okolina({ [REDUCED]: true }))).toBe(true);
    expect(motionReduced(okolina({}))).toBe(false);
    expect(coarsePointer(okolina({ [COARSE]: true }))).toBe(true);
  });

  it('okolina bez matchMedia ne rusi nista i ne tvrdi "da"', () => {
    // Odsutnost odgovora NIJE potvrda. Da vraca `true`, svaki bi preglednik bez `matchMedia`
    // dobio mobilne granice i ugasene animacije.
    const prazna = {} as Parameters<typeof motionReduced>[0];
    expect(motionReduced(prazna)).toBe(false);
    expect(coarsePointer(prazna)).toBe(false);
  });

  it('matchMedia koji BACI se tretira kao odsutan odgovor', () => {
    const puca = { matchMedia: () => { throw new Error('stari motor'); } } as unknown as Parameters<typeof motionReduced>[0];
    expect(motionReduced(puca)).toBe(false);
  });
});

describe('procjena uredaja', () => {
  it('memorija je null kad je preglednik ne objavljuje', () => {
    expect(deviceMemoryGb(okolina({}))).toBeNull();
    expect(deviceMemoryGb(okolina({}, 8))).toBe(8);
  });

  it('"vjerojatno mobitel" pali na grubom pokazivacu ILI maloj memoriji', () => {
    expect(isLikelyMobile(okolina({ [COARSE]: true }, 32))).toBe(true);
    expect(isLikelyMobile(okolina({}, 4))).toBe(true);
    expect(isLikelyMobile(okolina({}, 8))).toBe(false);
  });

  it('MUTACIJA: nepoznata memorija NE smije proci kao mala', () => {
    // `null > 0` je `false` u JS-u, ali izraz koji to ne kaze izricito lako se prepise u oblik
    // koji nepoznato tumaci kao 0, dakle kao slab uredaj, i tiho spusta granicu uploada svima
    // kojima preglednik ne objavljuje memoriju.
    expect(deviceMemoryGb(okolina({}))).toBeNull();
    expect(isLikelyMobile(okolina({}))).toBe(false);
  });

  it('granica uploada pada na slabom uredaju', () => {
    const jak = effectiveUploadCap(okolina({}, 32));
    const slab = effectiveUploadCap(okolina({ [COARSE]: true }, 2));
    expect(slab).toBeLessThan(jak);
  });
});

describe('prijelaz vida', () => {
  const dokument = (imaVT: boolean, reduced = false, puca = false): Document => {
    const klase = new Set<string>();
    let callback: (() => void) | null = null;
    const d = {
      documentElement: { classList: { add: (c: string) => klase.add(c), remove: (c: string) => klase.delete(c) } },
      defaultView: { matchMedia: (q: string) => ({ matches: reduced && q === REDUCED }) },
      startViewTransition: imaVT
        ? (cb: () => void) => {
          if (puca) throw new Error('prijelaz odbijen');
          callback = cb;
          return { ready: Promise.resolve(), finished: Promise.resolve() };
        }
        : undefined,
    } as unknown as Document;
    (d as unknown as Record<string, unknown>).__klase = klase;
    (d as unknown as Record<string, unknown>).__pokreni = () => callback?.();
    return d;
  };

  it('bez podrske se mutacija izvodi ODMAH', () => {
    let n = 0;
    withViewTransition(() => { n += 1; }, dokument(false));
    expect(n).toBe(1);
  });

  it('uz reduced motion se prijelaz preskace, a mutacija se svejedno izvodi', () => {
    // Ovo je grana koju je sonda koristila da OSLOBODI prijelaz krivnje: bez nje se ne bi moglo
    // usporediti "s prijelazom" i "bez prijelaza".
    let n = 0;
    withViewTransition(() => { n += 1; }, dokument(true, true));
    expect(n).toBe(1);
  });

  it('uz podrsku mutacija ide UNUTAR callbacka, ne prije njega', () => {
    let n = 0;
    const d = dokument(true);
    withViewTransition(() => { n += 1; }, d);
    expect(n, 'mutacija ne smije poteci prije nego je preglednik snimio staro stanje').toBe(0);
    (d as unknown as { __pokreni: () => void }).__pokreni();
    expect(n).toBe(1);
  });

  it('kad prijelaz BACI, mutacija se svejedno izvede i klasa se pocisti', () => {
    // Najopasnija grana: da se ovdje ne pozove `mutate`, ekran bi tiho ostao na starom stanju.
    let n = 0;
    const d = dokument(true, false, true);
    withViewTransition(() => { n += 1; }, d);
    expect(n).toBe(1);
    expect([...(d as unknown as { __klase: Set<string> }).__klase]).toEqual([]);
  });
});
