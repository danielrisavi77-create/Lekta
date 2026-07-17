/**
 * Timeout zastita mosta prema workeru (analyzeDocxOffThread): worker koji nikad ne
 * odgovori (patoloska analiza, zamrznut runtime) prekida se nakon ANALYSIS_TIMEOUT_MS
 * i NE pada na inline fallback (bomba bi na glavnoj niti zamrznula karticu, AUD-02).
 *
 * Zasebna datoteka (ne prosirenje analyze-docx-client.test.ts) NAMJERNO: tamosnji test
 * slomljenog spawna postavlja modul-level `workerBroken` pa bi svaki kasniji test u istoj
 * datoteci zauvijek isao inline putem i timeout se ne bi ni aktivirao.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeDocxOffThread } from '../src/analysis/analyze-docx-client';

/** Worker koji primi posao i zauvijek suti (nikad progress/result/error). */
class SilentWorker {
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  postMessage(): void { /* suti */ }
  terminate(): void { /* nista */ }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('analyzeDocxOffThread: tvrdi timeout', () => {
  it('worker koji suti se prekida porukom "trajala predugo" bez inline fallbacka', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', SilentWorker);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const junk = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'x.docx');
      const p = analyzeDocxOffThread(junk, {}, {}, () => {});
      const expectation = expect(p).rejects.toThrow(/trajala predugo/);
      await vi.advanceTimersByTimeAsync(180_000);
      await expectation;
      // Nije infra pad: most NE smije logirati "nastavljam na glavnoj niti" niti ponoviti inline.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
