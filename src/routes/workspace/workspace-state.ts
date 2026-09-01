/**
 * STROJ STANJA RADNOG PROSTORA (`/rad/`).
 *
 * Specifikacija zadaje tok:
 *
 *   empty -> validating -> sessionReady -> profile -> analyzing -> results
 *         -> repairPlan -> repairing -> comparison -> submission
 *
 * plus `restoring` na pocetku, jer se ruta moze otvoriti s postojecom sesijom u fragmentu.
 *
 * ZASTO ODMAH, A NE POSLIJE: naknadno podmetanje stroja pod zivu rutu puno je gore od pocetka s
 * njim. Stanje koje je do tada zivjelo raspoređeno po zastavicama i `classList` pozivima vise se
 * ne da izvuci bez mijenjanja ponasanja, pa se stroj u praksi nikad ne uvede.
 *
 * MODUL JE CIST: bez DOM-a, bez mreze, bez uvoza. Prelazak je funkcija `(stanje, dogadjaj) ->
 * stanje`, pa se svako pravilo da provjeriti bez montaze.
 *
 * TRI PRAVILA KOJA NISU KOZMETIKA:
 *
 * 1. POGRESKA NE BRISE ONO STO NE MORA. Specifikacija to trazi doslovno. Zato `error` pamti
 *    posljednji SIGURAN korak i vraca se na njega, a ne na pocetak. Dokument i potvrdjen profil
 *    prezive gresku analize; nema razloga tjerati korisnika da ponovno ucitava rad zato sto je
 *    analiza pukla.
 *
 * 2. ANALIZA NE POCINJE PRIJE POTVRDE PROFILA. Bez toga bi se rad mjerio po profilu koji korisnik
 *    nije vidio, a ocjena bi se odnosila na pravila drugog studija.
 *
 * 3. BEZ ZAPISA NEMA POVEZNICE. Kad pohrana sesije ne uspije, rad ostaje u kartici, ali se
 *    poveznica na sesiju NE SMIJE ponuditi: vodila bi na sesiju koja ne postoji. Zato stanje nosi
 *    `canLinkSession`, a ne samo ime.
 *
 * Nepoznat prijelaz se ODBIJA i imenuje, nikad tiho primjenjuje: tiho ignoriran dogadjaj je kvar
 * koji se vidi tek kao zaglavljeno sucelje.
 */

export type WorkspaceState =
  | 'restoring'
  | 'empty'
  | 'validating'
  | 'sessionReady'
  | 'profile'
  | 'analyzing'
  | 'results'
  | 'repairPlan'
  | 'repairing'
  | 'comparison'
  | 'submission'
  | 'error';

export type WorkspaceEvent =
  | 'restoreFound'
  | 'restoreEmpty'
  | 'restoreFailed'
  | 'documentOffered'
  | 'documentAccepted'
  | 'documentRejected'
  | 'sessionPersisted'
  | 'sessionPersistFailed'
  | 'profileConfirmed'
  | 'analysisCompleted'
  | 'analysisFailed'
  | 'repairPlanOpened'
  | 'repairStarted'
  | 'repairCompleted'
  | 'repairFailed'
  | 'submissionOpened'
  | 'documentReplaced'
  | 'recover';

/** Stanja iz kojih se vrijedi vratiti nakon greske: rad do njih nije izgubljen. */
const SAFE_STATES: ReadonlySet<WorkspaceState> = new Set<WorkspaceState>([
  'empty', 'sessionReady', 'profile', 'results', 'comparison',
]);

/** Stanja u kojima dokument POSTOJI. `validating` jos nije prihvatio, pa ga nema. */
const STATES_WITH_DOCUMENT: ReadonlySet<WorkspaceState> = new Set<WorkspaceState>([
  'sessionReady', 'profile', 'analyzing', 'results', 'repairPlan', 'repairing', 'comparison', 'submission',
]);

/** Stanja u kojima je profil POTVRDJEN. Analiza smije krenuti tek odavde nadalje. */
const STATES_WITH_PROFILE: ReadonlySet<WorkspaceState> = new Set<WorkspaceState>([
  'analyzing', 'results', 'repairPlan', 'repairing', 'comparison', 'submission',
]);

const TRANSITIONS: Readonly<Record<WorkspaceState, Partial<Record<WorkspaceEvent, WorkspaceState>>>> = {
  restoring: { restoreFound: 'sessionReady', restoreEmpty: 'empty', restoreFailed: 'empty' },
  empty: { documentOffered: 'validating' },
  validating: { documentAccepted: 'sessionReady', documentRejected: 'empty' },
  // Zapis sesije nije uvjet za rad: neuspjeh vodi dalje na profil, samo bez poveznice.
  sessionReady: { sessionPersisted: 'profile', sessionPersistFailed: 'profile', documentReplaced: 'validating' },
  profile: { profileConfirmed: 'analyzing', documentReplaced: 'validating' },
  analyzing: { analysisCompleted: 'results', analysisFailed: 'error', documentReplaced: 'validating' },
  results: { repairPlanOpened: 'repairPlan', documentReplaced: 'validating' },
  repairPlan: { repairStarted: 'repairing', documentReplaced: 'validating' },
  repairing: { repairCompleted: 'comparison', repairFailed: 'error' },
  comparison: { submissionOpened: 'submission', documentReplaced: 'validating' },
  submission: { documentReplaced: 'validating' },
  // `recover` se rjesava prije tablice, jer mu odrediste ovisi o `lastSafe`, ne o imenu stanja.
  error: { documentReplaced: 'validating' },
};

export interface WorkspaceContext {
  readonly state: WorkspaceState;
  /** Korak na koji se `recover` vraca. `null` izvan greske. */
  readonly lastSafe: WorkspaceState | null;
  /** Je li sesija stvarno zapisana; jedini uvjet pod kojim se poveznica smije ponuditi. */
  readonly sessionPersisted: boolean;
  /** Zasto je posljednji dogadjaj odbijen; `null` kad je prihvacen. */
  readonly rejected: string | null;
}

export function initialContext(hasSessionFragment: boolean): WorkspaceContext {
  return {
    state: hasSessionFragment ? 'restoring' : 'empty',
    lastSafe: null,
    sessionPersisted: false,
    rejected: null,
  };
}

export function hasDocument(state: WorkspaceState, lastSafe: WorkspaceState | null = null): boolean {
  if (state === 'error') return lastSafe !== null && STATES_WITH_DOCUMENT.has(lastSafe);
  return STATES_WITH_DOCUMENT.has(state);
}

export function hasConfirmedProfile(state: WorkspaceState, lastSafe: WorkspaceState | null = null): boolean {
  if (state === 'error') return lastSafe !== null && STATES_WITH_PROFILE.has(lastSafe);
  return STATES_WITH_PROFILE.has(state);
}

/** Smije li sucelje ponuditi poveznicu na sesiju. Ime stanja nije dovoljno: treba i zapis. */
export function canLinkSession(context: WorkspaceContext): boolean {
  return context.sessionPersisted && context.state !== 'error';
}

/**
 * Prelazak. Nepoznat par (stanje, dogadjaj) NE mijenja stanje nego vraca kontekst s razlogom, pa
 * se zaglavljeno sucelje vidi kao podatak, a ne kao tisina.
 */
export function transition(context: WorkspaceContext, event: WorkspaceEvent): WorkspaceContext {
  // Povratak iz greske ide na posljednji siguran korak, ne na pocetak: dokument i potvrdjen
  // profil nema razloga bacati zato sto je analiza ili popravak pukao. Rjesava se PRIJE tablice,
  // jer odrediste ovisi o `lastSafe`, a ne o imenu stanja.
  if (context.state === 'error' && event === 'recover') {
    return { ...context, state: context.lastSafe ?? 'empty', lastSafe: null, rejected: null };
  }

  const next = TRANSITIONS[context.state]?.[event];
  if (!next) {
    return { ...context, rejected: `${context.state} ne prihvaca dogadjaj ${event}` };
  }

  if (next === 'error') {
    // Posljednji siguran korak je onaj PRIJE koraka koji je pukao: analiza pukla -> profil je i
    // dalje potvrdjen; popravak pukao -> rezultati stoje.
    const safe = lastSafeBefore(context.state);
    return { ...context, state: 'error', lastSafe: safe, rejected: null };
  }

  // Zamjena dokumenta je jedina radnja koja SMIJE odbaciti zapis: stara sesija vise ne opisuje
  // ono sto korisnik gleda, pa bi poveznica na nju vodila na krivi dokument.
  const persisted = event === 'documentReplaced' ? false : (event === 'sessionPersisted' ? true : context.sessionPersisted);
  return { ...context, state: next, lastSafe: null, sessionPersisted: persisted, rejected: null };
}

/** Najblizi siguran korak unatrag od stanja koje je puklo. */
function lastSafeBefore(failed: WorkspaceState): WorkspaceState {
  if (failed === 'analyzing') return 'profile';
  if (failed === 'repairing') return 'results';
  return SAFE_STATES.has(failed) ? failed : 'empty';
}

/** Popis stanja; koristi ga gard koji tvrdi da je tablica prijelaza potpuna. */
export const WORKSPACE_STATES: readonly WorkspaceState[] = Object.keys(TRANSITIONS) as WorkspaceState[];
