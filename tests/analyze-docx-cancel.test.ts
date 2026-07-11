/**
 * Testovi korisnickog prekida analize (BL-P0-05-5): cancelActiveAnalysis() gasi worker
 * i odbacuje tekuci promise kao AnalysisCancelledError, sto runAnalysis tiho proguta
 * (bez toast greske) i vrati na wizard.
 *
 * happy-dom nema Worker, pa se ovdje stubira Worker koji NIKAD ne odgovori (simulira dugu
 * analizu u tijeku); tako se pokriva prava worker-grana prekida, koju inline fallback ne dira.
 * Zaseban file jer analyze-docx-client drzi modularni workerBroken state (prvi infra pad ga
 * trajno pali); ovdje starta cist pa canUseWorker() vrati true.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeDocxOffThread, cancelActiveAnalysis, isAnalysisCancelled } from '../src/analysis/analyze-docx-client';

/** Worker koji se uspjesno spawna ali nikad ne posalje 'result' (analiza "u tijeku"). */
class HangingWorker {
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  terminated = false;
  postMessage(): void { /* namjerno bez odgovora: analiza traje dok je ne prekinemo */ }
  terminate(): void { this.terminated = true; }
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('cancelActiveAnalysis', () => {
  it('prekida tekucu worker-analizu i odbacuje promise kao prekid', async () => {
    vi.stubGlobal('Worker', HangingWorker);
    const file = new File([new Uint8Array([1, 2, 3])], 'x.docx');
    // Izvrsni dio promisea (spawn + postMessage) tekao je sinkrono pri pozivu, pa je prekid
    // dostupan odmah; analiza sama nikad ne zavrsi (HangingWorker suti).
    const p = analyzeDocxOffThread(file, {} as any, {} as any, () => {});

    const cancelled = cancelActiveAnalysis();
    expect(cancelled).toBe(true);

    let err: unknown;
    await p.catch((e) => { err = e; });
    expect(isAnalysisCancelled(err)).toBe(true);
  });

  it('vraca false kad nema aktivne analize', () => {
    expect(cancelActiveAnalysis()).toBe(false);
  });
});
