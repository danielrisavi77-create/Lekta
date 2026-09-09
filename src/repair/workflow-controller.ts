/**
 * Kontroler toka popravka: JEDAN vlasnik odabira i zivotnog ciklusa (plan T08).
 *
 * Granica je namjerno uska: kontroler upravlja ODABIROM zahvata, FAZOM i PRIJELAZIMA. Stvarni popravak,
 * validaciju parametara (serverski autoritet), privolu i naplatu i dalje provode postojeci servis i Edge
 * funkcija; kontroler ih zove kroz adapter (`RepairWorkflowAdapter`) s postojecim tipovima zahtjeva i
 * rezultata, i ne uvodi drugi protokol.
 *
 * Pravila prijelaza (tablica, ne `switch` koji sve propusta):
 *   idle -> planning -> ready -> running -> verifying -> complete | failed
 * `running` je dopusten SAMO iz `ready`; dok traje, novo pokretanje istog zahtjeva se odbija (servis se ne
 * zove dvaput). Promjena dokumenta ili profila (`resetForSession`) ponistava nevazeci plan i vezuje novi uz
 * aktualnu sesiju; zakasnjeli rezultat stare sesije se ODBACUJE po tokenu sesije. Povratak na plan iz
 * `complete`/`failed` cuva valjan odabir.
 */

export type RepairPhase = 'idle' | 'planning' | 'ready' | 'running' | 'verifying' | 'complete' | 'failed';
export type RepairSelection = ReadonlySet<string>;

export interface RepairWorkflowState {
  phase: RepairPhase;
  sessionToken: string;
  selection: RepairSelection;
  /** Zahvati koje plan nudi u ovoj sesiji; odabir je uvijek podskup. */
  offered: ReadonlySet<string>;
  lastError: string | null;
  result: unknown | null;
}

export interface RepairWorkflowAdapter<TRequest, TResult> {
  /** Sastavi zahtjev iz odabira POSTOJECIM tipovima (npr. buildDefaultRepairRequests / repair-items). */
  buildRequest(selection: RepairSelection, sessionToken: string): TRequest;
  /** Pozovi postojeci servis; ovdje zive privola, prava pristupa i serverski autoritet, ne u kontroleru. */
  run(request: TRequest): Promise<TResult>;
  /** Ponovna analiza i provjera ishoda (T10); vraca je li rezultat valjan za isporuku. */
  verify(result: TResult): Promise<{ ok: boolean; error?: string }>;
}

const TRANSITIONS: Readonly<Record<RepairPhase, readonly RepairPhase[]>> = {
  idle: ['planning'],
  planning: ['ready', 'idle'],
  ready: ['running', 'planning', 'idle'],
  running: ['verifying', 'failed'],
  verifying: ['complete', 'failed'],
  complete: ['planning', 'idle'],
  failed: ['planning', 'ready', 'idle'],
};

/** `null` za nedozvoljen prijelaz; nikad ne baca, da ga sucelje moze prikazati kao razlog. */
export function transition(from: RepairPhase, to: RepairPhase): RepairPhase | null {
  return TRANSITIONS[from].includes(to) ? to : null;
}

export class RepairWorkflowController<TRequest, TResult> {
  private state: RepairWorkflowState;
  private runId = 0;

  constructor(private readonly adapter: RepairWorkflowAdapter<TRequest, TResult>, sessionToken: string) {
    this.state = { phase: 'idle', sessionToken, selection: new Set(), offered: new Set(), lastError: null, result: null };
  }

  getState(): RepairWorkflowState {
    return { ...this.state, selection: new Set(this.state.selection), offered: new Set(this.state.offered) };
  }

  private go(to: RepairPhase): boolean {
    const next = transition(this.state.phase, to);
    if (!next) return false;
    this.state = { ...this.state, phase: next };
    return true;
  }

  /** Nov plan za aktualnu sesiju: ponudjeni zahvati i (zadani) odabir. Odabir se rezze na ponudjeno. */
  plan(offered: Iterable<string>, preselected: Iterable<string> = offered): boolean {
    if (!this.go('planning')) return false;
    const offer = new Set(offered);
    const selection = new Set([...preselected].filter((id) => offer.has(id)));
    this.state = { ...this.state, offered: offer, selection, result: null, lastError: null };
    return this.go('ready');
  }

  /** Odabir mijenja SAMO kontroler; nepoznat zahvat se odbija, a tijekom izvrsenja odabir je zamrznut. */
  setSelected(id: string, selected: boolean): boolean {
    if (this.state.phase === 'running' || this.state.phase === 'verifying') return false;
    if (!this.state.offered.has(id)) return false;
    const selection = new Set(this.state.selection);
    if (selected) selection.add(id); else selection.delete(id);
    this.state = { ...this.state, selection };
    return true;
  }

  /**
   * Promjena dokumenta ili profila: sve sto je bilo planirano vise ne vrijedi. Rezultat koji stigne za stari
   * token se poslije odbacuje.
   */
  resetForSession(sessionToken: string): void {
    this.runId += 1;
    this.state = { phase: 'idle', sessionToken, selection: new Set(), offered: new Set(), lastError: null, result: null };
  }

  /** Pokreni popravak: dopusteno SAMO iz `ready`, s nepraznim odabirom; drugi poziv tijekom rada se odbija. */
  async start(): Promise<RepairWorkflowState> {
    if (this.state.phase !== 'ready') return this.getState();
    if (this.state.selection.size === 0) {
      this.state = { ...this.state, lastError: 'nema odabranih zahvata' };
      return this.getState();
    }
    const token = this.state.sessionToken;
    const runId = ++this.runId;
    this.go('running');
    let result: TResult;
    try {
      result = await this.adapter.run(this.adapter.buildRequest(this.state.selection, token));
    } catch (error) {
      if (this.isStale(runId, token)) return this.getState();
      this.state = { ...this.state, lastError: error instanceof Error ? error.message : String(error) };
      this.go('failed');
      return this.getState();
    }
    if (this.isStale(runId, token)) return this.getState(); // zakasnjeli rezultat stare sesije: odbacen
    this.go('verifying');
    const verified = await this.adapter.verify(result);
    if (this.isStale(runId, token)) return this.getState();
    if (verified.ok) {
      this.state = { ...this.state, result };
      this.go('complete');
    } else {
      this.state = { ...this.state, result, lastError: verified.error ?? 'provjera ishoda nije prosla' };
      this.go('failed');
    }
    return this.getState();
  }

  /** Povratak na plan nakon zavrsetka ili greske: odabir se CUVA. */
  backToPlan(): boolean {
    if (!this.go('planning')) return false;
    return this.go('ready');
  }

  private isStale(runId: number, token: string): boolean {
    return runId !== this.runId || token !== this.state.sessionToken;
  }
}
