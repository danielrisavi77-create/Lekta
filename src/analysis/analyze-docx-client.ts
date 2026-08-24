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

import { captureKatedraHandoffCandidate } from '../integration/katedra-capture';

/** Pad worker infrastrukture (spawn, ucitavanje, postMessage clone); nije greska analize. */
class WorkerInfraError extends Error {}

/** Korisnicki prekid tekuce analize (Prekini/Escape); NIJE greska dokumenta ni infrastrukture. */
class AnalysisCancelledError extends Error {
  constructor(message = 'Analiza je prekinuta.') {
    super(message);
    this.name = 'AnalysisCancelledError';
  }
}

/**
 * Analiza koju je zamijenila novija (korisnik je ucitao drugi dokument ili promijenio profil).
 *
 * Do 2026-08-20 taj se promise NIJE odbacivao: stari worker se gasio `terminate()`-om, ali
 * `onmessage`/`onerror` mu vise nisu mogli okinuti (terminate ne emitira `error`), a `cancelActive`
 * se bezuvjetno prepisivao na novu analizu. Promise je zato visio punih 180 s pa se odbacio
 * porukom o TIMEOUTU, sto je dijagnosticki lazno: analiza nije istekla nego je zamijenjena.
 *
 * Nasljedjuje `AnalysisCancelledError` da ga postojeci `isAnalysisCancelled` guardovi u sucelju
 * i dalje tiho progutaju (zamjena, kao ni prekid, nije greska koju korisnik treba vidjeti).
 */
class AnalysisSupersededError extends AnalysisCancelledError {
  constructor() {
    super('Analiza je zamijenjena novijom.');
    this.name = 'AnalysisSupersededError';
  }
}

import { attachHeadingStructure } from './heading-structure';

/** Je li greska posljedica korisnickog prekida (pa je pozivatelj tiho proguta, bez toast greske). */
export function isAnalysisCancelled(e: unknown): boolean {
  return e instanceof AnalysisCancelledError
    || (e as { name?: string } | null)?.name === 'AnalysisCancelledError'
    || (e as { name?: string } | null)?.name === 'AnalysisSupersededError';
}

/**
 * Tvrdi timeout jedne analize u workeru. Tipicna analiza je 0,3-0,8 s, veliki realni radovi
 * par sekundi, slab mobitel 10-30x sporije; 180 s je vise od 100x tipicnog stropa i hvata
 * samo patoloske slucajeve (dokument koji parser melje minutama). Timeout je obicna greska
 * analize, NE WorkerInfraError: NIKAD ne smije pasti na inline fallback (isti princip kao
 * AUD-02, bomba bi na glavnoj niti zamrznula karticu).
 */
const ANALYSIS_TIMEOUT_MS = 180_000;

let workerBroken = false; // nakon prvog infra pada ova sesija trajno radi inline
let activeWorker: Worker | null = null;
// Odbacivac tekuce worker-analize: postavljen dok analiza traje, gasi worker i rejecta promise.
// Prima gresku da ista putanja posluzi i korisnickom prekidu i zamjeni novijom analizom;
// bez argumenta je prekid (AnalysisCancelledError).
let cancelActive: ((reason?: Error) => void) | null = null;

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

function analyzeInWorker(file: File, profile: any, settings: any, onProgress: any, options?: AnalyzeOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./analyze-docx.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(new WorkerInfraError(String(e)));
      return;
    }
    // Starija analiza u tijeku vise nikoga ne zanima. Odbaci je UREDNO, ne samo `terminate()`:
    // gasenje workera ne okida ni `onmessage` ni `onerror`, pa bi njezin promise ostao neposlozen
    // do vlastitog timeouta i tek onda lagao da je analiza "trajala predugo".
    // Poziv usput cisti i njezin `timeoutTimer` (vidi `done`).
    if (cancelActive) cancelActive(new AnalysisSupersededError());
    if (activeWorker) { try { activeWorker.terminate(); } catch { /* vec ugasen */ } }
    activeWorker = w;
    let settled = false;
    // Je li analiza VEC ZAPOCELA (stigao prvi progress od workera). Ako worker padne (onerror)
    // NAKON pocetka, to je gotovo sigurno pad SAME ANALIZE (OOM na velikom/zlonamjernom docx-u),
    // a NE infrastrukture, pa se NE smije ponoviti inline (bomba bi tamo zamrznula karticu). AUD-02.
    let started = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const done = (finish: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      try { w.terminate(); } catch { /* vec ugasen */ }
      if (activeWorker === w) activeWorker = null;
      // Vlasnistvo, kao i redak iznad. Bez ovog uvjeta zakasnjeli `done` STARE analize nulira
      // `cancelActive` NOVE, aktivne analize, pa `cancelActiveAnalysis()` padne na granu koja
      // worker ugasi ali promise ne odbaci: gumb Prekid tiho prestane raditi.
      if (cancelActive === myCancel) cancelActive = null;
      finish();
    };
    // Izlozi prekid: cancelActiveAnalysis() ovo pozove pa se worker ugasi i promise odbaci.
    // Zamjena novijom analizom ide ISTIM putem, samo s drugim razlogom.
    const myCancel = (reason?: Error) => done(() => reject(reason ?? new AnalysisCancelledError()));
    cancelActive = myCancel;
    // Tvrdi timeout: obican Error (ne WorkerInfraError) da se patoloska analiza ne ponovi inline.
    timeoutTimer = setTimeout(() => done(() => reject(new Error(
      'Analiza je trajala predugo i prekinuta je radi zaštite uređaja. Pokušaj ponovno; ako se ponovi, dokument je vjerojatno prevelik za ovaj uređaj.',
    ))), ANALYSIS_TIMEOUT_MS);
    w.onerror = (ev: any) => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      // Pad PRIJE prvog progressa = infra (spawn/ucitavanje) -> smije na inline fallback.
      // Pad NAKON pocetka = pad analize (npr. OOM) -> obicna greska, bez inline ponavljanja.
      done(() => reject(started
        ? new Error('Analiza u pozadini je neočekivano prekinuta; dokument je možda prevelik ili oštećen.')
        : new WorkerInfraError((ev && ev.message) || 'Worker skripta se nije ucitala.')));
    };
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.type === 'progress') { started = true; if (!settled) onProgress(d.pct, d.msg); return; }
      if (d.type === 'result') { done(() => resolve(d.result)); return; }
      if (d.type === 'error') {
        const err = new Error(d.message || 'Analiza nije uspjela.');
        err.name = d.name || 'Error';
        done(() => reject(err));
      }
    };
    try {
      w.postMessage({ file, profile, settings, options });
    } catch (e) {
      done(() => reject(new WorkerInfraError(String(e))));
    }
  });
}

/** Postavke analize koje se prosljedjuju do analyzeDocx (i kroz worker protokol). */
export interface AnalyzeOptions { skipFinalDelay?: boolean }

function finalizeAnalysisForIntegrations(result: any, profile: any, settings: any): any {
  // No-op for ordinary Lekta users. If this session entered from Katedra, the
  // helper stores only the sanitized shared result needed for the return link.
  captureKatedraHandoffCandidate(result, profile, settings);
  return result;
}

/** Isti ugovor kao analyzeDocx; u pregledniku radi u workeru, inace na glavnoj niti. */
export async function analyzeDocxOffThread(file: File, profile: any, settings: any, onProgress: any, options?: AnalyzeOptions): Promise<any> {
  if (canUseWorker()) {
    try {
      const result = await analyzeInWorker(file, profile, settings, onProgress, options);
      // BACKLOG (faza D): attachHeadingStructure trci NA GLAVNOJ NITI nad preview.paragraphs,
      // dakle izvan worker granice; kad sav 2 uvede heading measurements, ovo se moze preseliti
      // u internal. Zaseban problem od evaluacijskog sava; ne dirati usput.
      // Obje strane su omotavale isti return: grana obogacuje rezultat strukturom naslova,
      // master ga hvata za povratak u Katedru. Redoslijed je bitan, ne proizvoljan: Katedra
      // mora vidjeti KONACAN rezultat, pa obogacivanje ide prvo.
      return finalizeAnalysisForIntegrations(attachHeadingStructure(result, profile?.headingRules || {}), profile, settings);
    } catch (e) {
      if (!(e instanceof WorkerInfraError)) throw e;
      workerBroken = true;
      console.warn('Worker analiza nije dostupna; nastavljam na glavnoj niti:', e.message);
    }
  }
  // Lijeno: motor se dohvaca samo kad zaista treba (nema/slomljen worker), pa ne opterecuje
  // glavni entry chunk. U testovima (bez Workera) ovaj put je uvijek aktivan.
  // Napomena (AUD-08): inline put koristi nativni preglednicki DOMParser, dok worker i golden
  // korpus koriste @xmldom/xmldom. Ovo je rijedak fallback (nema/slomljen worker), pa se svjesno
  // prihvaca moguca sitna razlika u parsiranju umjesto globalnog override-a DOMParsera na glavnoj niti.
  const { analyzeDocx } = await import('./analyze-docx');
  const result = await analyzeDocx(file, profile, settings, onProgress, options);
  return finalizeAnalysisForIntegrations(attachHeadingStructure(result, profile?.headingRules || {}), profile, settings);
}
