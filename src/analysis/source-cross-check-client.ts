/**
 * Most glavne niti prema Web Workeru cross-checka protiv izvorne gradje
 * (source-cross-check.worker.ts). Isti obrazac kao analyze-docx-client.ts: pad INFRASTRUKTURE
 * workera (spawn/ucitavanje/clone) pada na inline (glavna nit) fallback; greska SAME OBRADE
 * (npr. nepodrzan format izvorne datoteke) se NE ponavlja inline nego putuje s izvornom porukom.
 */
import type { SourceCrossCheckResult } from './source-cross-check';

/** Pad worker infrastrukture (spawn, ucitavanje, postMessage clone); nije greska obrade. */
class SourceCrossCheckWorkerInfraError extends Error {}

const SOURCE_CROSS_CHECK_TIMEOUT_MS = 60_000;

let workerBroken = false; // nakon prvog infra pada ova sesija trajno radi inline
let activeWorker: Worker | null = null;

function canUseWorker(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

/** Prekid tekuce provjere s izvorima (gasi worker); vraca true ako je nesto stvarno prekinuto. */
export function cancelActiveSourceCrossCheck(): boolean {
  if (activeWorker) {
    try { activeWorker.terminate(); } catch { /* vec ugasen */ }
    activeWorker = null;
    return true;
  }
  return false;
}

function runInWorker(
  thesisParagraphs: Array<{ index: number; text: string }>,
  sourceFiles: File[],
  options: unknown,
): Promise<SourceCrossCheckResult> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./source-cross-check.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(new SourceCrossCheckWorkerInfraError(String(e)));
      return;
    }
    if (activeWorker) { try { activeWorker.terminate(); } catch { /* vec ugasen */ } }
    activeWorker = w;
    let settled = false;
    let started = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const done = (finish: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      try { w.terminate(); } catch { /* vec ugasen */ }
      if (activeWorker === w) activeWorker = null;
      finish();
    };
    timeoutTimer = setTimeout(() => done(() => reject(new Error(
      'Provjera s izvorima je trajala predugo i prekinuta je. Pokušaj s manje ili manjim izvornim datotekama.',
    ))), SOURCE_CROSS_CHECK_TIMEOUT_MS);
    w.onerror = (ev: any) => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      done(() => reject(started
        ? new Error('Provjera s izvorima je neočekivano prekinuta.')
        : new SourceCrossCheckWorkerInfraError((ev && ev.message) || 'Worker skripta se nije učitala.')));
    };
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data || {};
      started = true;
      if (d.type === 'result') { done(() => resolve(d.result)); return; }
      if (d.type === 'error') {
        const err = new Error(d.message || 'Provjera s izvorima nije uspjela.');
        err.name = d.name || 'Error';
        done(() => reject(err));
      }
    };
    try {
      w.postMessage({ thesisParagraphs, sourceFiles, options });
    } catch (e) {
      done(() => reject(new SourceCrossCheckWorkerInfraError(String(e))));
    }
  });
}

/** U pregledniku radi u workeru, inace (ili nakon slomljene infrastrukture) na glavnoj niti. */
export async function analyzeSourceCrossCheckOffThread(
  thesisParagraphs: Array<{ index: number; text: string }>,
  sourceFiles: File[],
  options?: unknown,
): Promise<SourceCrossCheckResult> {
  if (canUseWorker()) {
    try {
      return await runInWorker(thesisParagraphs, sourceFiles, options);
    } catch (e) {
      if (!(e instanceof SourceCrossCheckWorkerInfraError)) throw e;
      workerBroken = true;
      console.warn('Worker za cross-check s izvorima nije dostupan; nastavljam na glavnoj niti:', e.message);
    }
  }
  const [{ extractSourceMaterialText }, { analyzeSourceCrossCheck }] = await Promise.all([
    import('./source-material-text'),
    import('./source-cross-check'),
  ]);
  const sourceDocs = await Promise.all(sourceFiles.map((f) => extractSourceMaterialText(f)));
  return analyzeSourceCrossCheck({ thesisParagraphs, sourceDocs, options: options as any });
}
