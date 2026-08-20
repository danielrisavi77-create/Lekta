/**
 * DOCX-05: analiza koju zamijeni novija mora se odbaciti ODMAH i tocnim razlogom.
 *
 * Zatecen kvar: nova analiza je staru gasila `activeWorker.terminate()`-om, ali njezin promise
 * nije dirala. `terminate()` ne emitira `error`, pa stari `onmessage`/`onerror` vise nikad nisu
 * mogli okinuti, a `cancelActive` se bezuvjetno prepisivao na novu analizu. Stari promise je zato
 * visio punih 180 s pa se odbacio porukom "Analiza je trajala predugo", sto je dijagnosticki
 * LAZNO: analiza nije istekla nego je zamijenjena.
 *
 * Drugi kvar (nije bio prijavljen): `done()` je nulirao `cancelActive` BEZ provjere vlasnistva, za
 * razliku od susjednog `if (activeWorker === w)`. Zakasnjeli `done()` stare analize time je ubijao
 * gumb Prekid NOVE, aktivne analize.
 *
 * happy-dom nema Worker, pa se stubira worker koji nikad ne odgovori (analiza "u tijeku"),
 * jednako kao u tests/analyze-docx-cancel.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeDocxOffThread, cancelActiveAnalysis, isAnalysisCancelled } from '../src/analysis/analyze-docx-client';

/** Worker koji se uspjesno spawna ali nikad ne posalje 'result'. Biljezi je li ugasen. */
class HangingWorker {
  static spawned: HangingWorker[] = [];
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  terminated = false;
  constructor() { HangingWorker.spawned.push(this); }
  postMessage(): void { /* namjerno bez odgovora */ }
  terminate(): void { this.terminated = true; }
}

const docx = () => new File([new Uint8Array([1, 2, 3])], 'x.docx');
const start = () => analyzeDocxOffThread(docx(), {} as any, {} as any, () => {});

afterEach(() => { vi.unstubAllGlobals(); HangingWorker.spawned = []; });

describe('zamjena analize novijom', () => {
  it('promise stare analize se odbacuje ODMAH, ne tek na timeout', async () => {
    // Laznim tajmerima koje NIKAD ne pomicemo: ako bi odbacivanje ovisilo o 180 s timeoutu,
    // `await` nize se nikad ne bi razrijesio i test bi istekao. Prolaz dokazuje da razrjesenje
    // ne treba nijedan tajmer.
    vi.useFakeTimers();
    try {
      vi.stubGlobal('Worker', HangingWorker);
      const first = start();
      const second = start();

      await expect(first).rejects.toThrow();

      cancelActiveAnalysis();
      await second.catch(() => {});
    } finally {
      vi.useRealTimers();
    }
  });

  it('razlog je zamjena, a NE timeout ni greska dokumenta', async () => {
    vi.stubGlobal('Worker', HangingWorker);
    const first = start();
    const second = start();

    let err: any;
    await first.catch((e) => { err = e; });

    expect(err?.name).toBe('AnalysisSupersededError');
    // Sucelje takvu gresku mora tiho progutati, kao i korisnicki prekid.
    expect(isAnalysisCancelled(err)).toBe(true);
    // Kljucno: poruka NE smije tvrditi da je analiza trajala predugo.
    expect(String(err?.message)).not.toMatch(/predugo/i);

    cancelActiveAnalysis();
    await second.catch(() => {});
  });

  it('stari worker je ugasen, novi ostaje aktivan', async () => {
    vi.stubGlobal('Worker', HangingWorker);
    const first = start();
    const second = start();
    await first.catch(() => {});

    expect(HangingWorker.spawned.length).toBe(2);
    expect(HangingWorker.spawned[0].terminated, 'stari worker nije ugasen').toBe(true);
    expect(HangingWorker.spawned[1].terminated, 'novi worker je ugasen prerano').toBe(false);

    cancelActiveAnalysis();
    await second.catch(() => {});
  });

  it('Prekid i dalje radi na NOVOJ analizi nakon sto je stara odbacena', async () => {
    vi.stubGlobal('Worker', HangingWorker);
    const first = start();
    const second = start();
    await first.catch(() => {});

    // Ovo je drugi kvar: zakasnjeli done() stare analize nulirao je tudji cancelActive.
    expect(cancelActiveAnalysis(), 'nema odbacivaca za aktivnu analizu').toBe(true);

    let err: unknown;
    await second.catch((e) => { err = e; });
    expect(isAnalysisCancelled(err)).toBe(true);
    expect((err as { name?: string })?.name).toBe('AnalysisCancelledError');
  });

  it('nakon sto obje zavrse nema zaostalog odbacivaca', async () => {
    vi.stubGlobal('Worker', HangingWorker);
    const first = start();
    const second = start();
    await first.catch(() => {});
    cancelActiveAnalysis();
    await second.catch(() => {});

    expect(cancelActiveAnalysis()).toBe(false);
  });
});
