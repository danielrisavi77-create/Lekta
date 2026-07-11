/**
 * Most glavne niti prema Web Workeru analize (S2): teska obrada (unzip, XML, auditi)
 * radi u workeru pa golem dokument vise ne zamrzava sucelje. Na okruzenjima bez
 * workera (stariji preglednik, testovi) ili kad se worker skripta ne uspije ucitati,
 * pada natrag na izravni poziv na glavnoj niti, ponasanje identicno povijesnom.
 *
 * Vazno razlikovanje: pad INFRASTRUKTURE workera (spawn/ucitavanje/clone) smije na
 * inline fallback, ali greska SAME ANALIZE (zip bomba, previse odlomaka, korupcija)
 * NE smije se ponoviti inline; bomba bi upravo tamo zamrznula glavnu nit. Takva
 * greska se prosljedjuje s izvornom porukom (analysisErrorMessage mapira po tekstu).
 *
 * Performanse (audit performance-03): jezgra analyzeDocx (parser, auditi, pravni citation
 * engine) NIJE staticki uvezena ovdje, nego se lijeno ucita dinamickim importom TEK u
 * fallback grani. Time motor ispada iz glavnog entry chunka (bio je dvaput isporucen: main +
 * worker); na sretnom putu (worker radi) fallback chunk se nikad ne dohvaca. Golden korpus
 * poziva analyzeDocx izravno preko golden-entry.ts pa je nedirnut.
 */

/** Pad worker infrastrukture (spawn, ucitavanje, postMessage clone); nije greska analize. */
class WorkerInfraError extends Error {}

/** Korisnicki prekid tekuce analize (Prekini/Escape); NIJE greska dokumenta ni infrastrukture. */
class AnalysisCancelledError extends Error {
  constructor(message = 'Analiza je prekinuta.') {
    super(message);
    this.name = 'AnalysisCancelledError';
  }
}

/** Je li greska posljedica korisnickog prekida (pa je pozivatelj tiho proguta, bez toast greske). */
export function isAnalysisCancelled(e: unknown): boolean {
  return e instanceof AnalysisCancelledError || (e as { name?: string } | null)?.name === 'AnalysisCancelledError';
}

let workerBroken = false; // nakon prvog infra pada ova sesija trajno radi inline
let activeWorker: Worker | null = null;
// Odbacivac tekuce worker-analize: postavljen dok analiza traje, gasi worker i rejecta promise.
let cancelActive: (() => void) | null = null;

function canUseWorker(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

/**
 * Prekid tekuce analize u workeru: gasi worker i odbacuje promise s AnalysisCancelledError
 * (runAnalysis to hvata i tiho vraca na wizard). Vraca true ako je nesto stvarno prekinuto.
 * Inline (glavna nit) analiza drzi nit pa se ne moze prekinuti; tamo nema aktivnog workera i
 * kasni rezultat svejedno odbacuje token guard u runAnalysis.
 */
export function cancelActiveAnalysis(): boolean {
  if (cancelActive) { cancelActive(); return true; }
  if (activeWorker) { try { activeWorker.terminate(); } catch { /* vec ugasen */ } activeWorker = null; return true; }
  return false;
}

function analyzeInWorker(file: File, profile: any, settings: any, onProgress: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./analyze-docx.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(new WorkerInfraError(String(e)));
      return;
    }
    // Starija analiza u tijeku vise nikoga ne zanima; ugasi je da ne trosi CPU i ne
    // salje zakasnjeli progress (guard tokena u runAnalysis svejedno odbacuje rezultat).
    if (activeWorker) { try { activeWorker.terminate(); } catch { /* vec ugasen */ } }
    activeWorker = w;
    let settled = false;
    const done = (finish: () => void) => {
      if (settled) return;
      settled = true;
      try { w.terminate(); } catch { /* vec ugasen */ }
      if (activeWorker === w) activeWorker = null;
      cancelActive = null;
      finish();
    };
    // Izlozi prekid: cancelActiveAnalysis() ovo pozove pa se worker ugasi i promise odbaci.
    cancelActive = () => done(() => reject(new AnalysisCancelledError()));
    w.onerror = (ev: any) => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      done(() => reject(new WorkerInfraError((ev && ev.message) || 'Worker skripta se nije ucitala.')));
    };
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.type === 'progress') { if (!settled) onProgress(d.pct, d.msg); return; }
      if (d.type === 'result') { done(() => resolve(d.result)); return; }
      if (d.type === 'error') {
        const err = new Error(d.message || 'Analiza nije uspjela.');
        err.name = d.name || 'Error';
        done(() => reject(err));
      }
    };
    try {
      w.postMessage({ file, profile, settings });
    } catch (e) {
      done(() => reject(new WorkerInfraError(String(e))));
    }
  });
}

/** Isti ugovor kao analyzeDocx; u pregledniku radi u workeru, inace na glavnoj niti. */
export async function analyzeDocxOffThread(file: File, profile: any, settings: any, onProgress: any): Promise<any> {
  if (canUseWorker()) {
    try {
      return await analyzeInWorker(file, profile, settings, onProgress);
    } catch (e) {
      if (!(e instanceof WorkerInfraError)) throw e;
      workerBroken = true;
      console.warn('Worker analiza nije dostupna; nastavljam na glavnoj niti:', e.message);
    }
  }
  // Lijeno: motor se dohvaca samo kad zaista treba (nema/slomljen worker), pa ne opterecuje
  // glavni entry chunk. U testovima (bez Workera) ovaj put je uvijek aktivan.
  const { analyzeDocx } = await import('./analyze-docx');
  return analyzeDocx(file, profile, settings, onProgress);
}
