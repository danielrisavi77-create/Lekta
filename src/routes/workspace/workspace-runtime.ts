import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import {
  createLocalDocumentSession,
  fileFromLocalDocumentSession,
  parseSessionFragment,
  sessionFragment,
  type LocalDocumentSessionV1,
  type LocalDocumentSessionStore,
} from '../../session/local-document-session';
import {
  disposeAnalyzerApp,
  initAnalyzerApp,
  loadAnalyzerDocument,
  subscribeAnalyzerDocumentAccepted,
  type AnalyzerDocumentAcceptedEvent,
} from '../../ui/app';

export interface WorkspaceRuntimeOptions {
  fragment?: string;
  store?: LocalDocumentSessionStore;
  createSession?: typeof createLocalDocumentSession;
  replaceUrl?: (url: string) => void;
  sessionScope?: 'persistent' | 'tab';
}

interface WorkspaceRuntimeState {
  disposed: boolean;
  replacementToken: number;
  persistedSessionId: string | null;
  readonly store: LocalDocumentSessionStore;
  readonly createSession: typeof createLocalDocumentSession;
  readonly replaceUrl: (url: string) => void;
  readonly sessionScope: 'persistent' | 'tab';
  unsubscribeAccepted(): void;
}

const workspaceRuntimeStates = new WeakMap<Document, WorkspaceRuntimeState>();

function isCurrentRuntime(doc: Document, state: WorkspaceRuntimeState): boolean {
  return !state.disposed && workspaceRuntimeStates.get(doc) === state;
}
function isCurrentRestore(doc: Document, state: WorkspaceRuntimeState, token: number): boolean {
  return isCurrentRuntime(doc, state) && token === state.replacementToken;
}


async function bestEffortDelete(store: LocalDocumentSessionStore, id: string): Promise<void> {
  try {
    await store.delete(id);
  } catch {
    // Lokalna sesija ima TTL i cleanup pri sljedećem otvaranju. Kvar brisanja ne smije
    // prekinuti aktivni dokument niti vratiti staru kanonsku poveznicu.
  }
}

function showMemoryOnlyDocument(doc: Document, name: string): void {
  showDocumentName(doc, name);
  setStatus(
    doc,
    'Dokument je spreman samo u ovom tabu',
    'Dokument se može provjeriti, ali ova lokalna sesija ostaje samo u ovom tabu i osvježavanje je neće ponovno otvoriti.',
    'ready',
  );
}

async function persistAcceptedDocument(
  doc: Document,
  state: WorkspaceRuntimeState,
  event: AnalyzerDocumentAcceptedEvent,
): Promise<void> {
  if (!isCurrentRuntime(doc, state) || event.source !== 'user-selection') return;
  const token = ++state.replacementToken;
  let session: LocalDocumentSessionV1;

  try {
    session = await state.createSession(event.file, event.intake);
  } catch {
    if (isCurrentRuntime(doc, state) && token === state.replacementToken) {
      if (state.sessionScope === 'persistent') state.replaceUrl('/rad/');
      showMemoryOnlyDocument(doc, event.file.name);
    }
    return;
  }
  if (!isCurrentRuntime(doc, state) || token !== state.replacementToken) return;

  try {
    await state.store.put(session);
  } catch {
    if (isCurrentRuntime(doc, state) && token === state.replacementToken) {
      if (state.sessionScope === 'persistent') state.replaceUrl('/rad/');
      showMemoryOnlyDocument(doc, event.file.name);
    }
    return;
  }

  if (!isCurrentRuntime(doc, state) || token !== state.replacementToken) {
    await bestEffortDelete(state.store, session.id);
    return;
  }

  const previousSessionId = state.persistedSessionId;
  state.persistedSessionId = session.id;
  if (state.sessionScope === 'persistent') {
    state.replaceUrl(`/rad/${sessionFragment(session.id)}`);
    showDocumentName(doc, session.document.name);
    setStatus(
      doc,
      'Dokument je spreman na korektorskom stolu',
      'Provjeri prepoznati profil prije pokretanja pune lokalne analize.',
      'ready',
    );
  } else {
    showMemoryOnlyDocument(doc, session.document.name);
  }
  if (previousSessionId && previousSessionId !== session.id) {
    await bestEffortDelete(state.store, previousSessionId);
  }
}

function setStatus(doc: Document, titleText: string, detailText: string, tone: 'ready' | 'error'): void {
  const main = doc.querySelector<HTMLElement>('#main-content');
  const status = doc.querySelector<HTMLElement>('#workspace-status');
  if (main) main.dataset.workspaceState = tone === 'ready' ? 'profile' : 'error';
  if (!status) return;
  status.dataset.tone = tone;
  status.setAttribute('aria-busy', 'false');
  const title = status.querySelector<HTMLElement>('[data-workspace-status-title]');
  const detail = status.querySelector<HTMLElement>('[data-workspace-status-detail]');
  if (title) title.textContent = titleText;
  if (detail) detail.textContent = detailText;
}

function showDocumentName(doc: Document, name: string): void {
  const label = doc.querySelector<HTMLElement>('[data-workspace-document-name]');
  if (label) label.textContent = name;
}

export function disposeWorkspaceRuntime(doc: Document = document): void {
  const state = workspaceRuntimeStates.get(doc);
  if (!state) return;
  state.disposed = true;
  state.replacementToken += 1;
  workspaceRuntimeStates.delete(doc);
  try {
    state.unsubscribeAccepted();
  } finally {
    disposeAnalyzerApp(doc);
  }
}

export async function mountWorkspaceRuntime(
  doc: Document = document,
  options: WorkspaceRuntimeOptions = {},
): Promise<void> {
  disposeWorkspaceRuntime(doc);
  const fragment = options.fragment ?? doc.defaultView?.location.hash ?? '';
  const sessionId = parseSessionFragment(fragment);
  const store = options.store ?? new IndexedDbDocumentSessionStore();
  const state: WorkspaceRuntimeState = {
    disposed: false,
    replacementToken: 0,
    persistedSessionId: sessionId,
    store,
    createSession: options.createSession ?? createLocalDocumentSession,
    replaceUrl: options.replaceUrl ?? ((url) => {
      doc.defaultView?.history.replaceState(null, '', url);
    }),
    sessionScope: options.sessionScope ?? 'persistent',
    unsubscribeAccepted: () => undefined,
  };
  workspaceRuntimeStates.set(doc, state);

  try {
    initAnalyzerApp(doc);
    state.unsubscribeAccepted = subscribeAnalyzerDocumentAccepted((event) => {
      void persistAcceptedDocument(doc, state, event);
    });
  } catch (error) {
    state.disposed = true;
    workspaceRuntimeStates.delete(doc);
    disposeAnalyzerApp(doc);
    throw error;
  }

  if (!sessionId) {
    if (!isCurrentRuntime(doc, state)) return;
    showDocumentName(doc, 'Nije odabran dokument');
    setStatus(doc, 'Nema aktivnog dokumenta', 'Vrati se na početnu stranicu i učitaj .docx rad.', 'error');
    return;
  }

  const restoreToken = state.replacementToken;
  let session: LocalDocumentSessionV1 | null;
  try {
    await store.deleteExpired();
    if (!isCurrentRestore(doc, state, restoreToken)) return;
    session = await store.get(sessionId);
  } catch {
    if (!isCurrentRestore(doc, state, restoreToken)) return;
    showDocumentName(doc, 'Dokument nije dostupan');
    setStatus(
      doc,
      'Lokalnu sesiju nije moguće otvoriti',
      'Privatna lokalna pohrana preglednika nije dostupna. Vrati se na početnu stranicu i učitaj dokument ponovno.',
      'error',
    );
    return;
  }
  if (!isCurrentRestore(doc, state, restoreToken)) return;
  if (!session) {
    showDocumentName(doc, 'Lokalna sesija nije pronađena');
    setStatus(
      doc,
      'Lokalna sesija je istekla, oštećena ili ne postoji',
      'Dokument nije poslan na poslužitelj. Učitaj ga ponovno za novu provjeru.',
      'error',
    );
    return;
  }

  showDocumentName(doc, session.document.name);
  try {
    const admission = await loadAnalyzerDocument({
      file: fileFromLocalDocumentSession(session),
      source: 'workspace-session',
    });
    if (!isCurrentRestore(doc, state, restoreToken)) return;
    if (!admission.accepted) {
      if (admission.reason === 'superseded') return;
      showDocumentName(doc, 'Dokument nije aktivan');
      setStatus(doc, 'Dokument nije prihvaćen', admission.message, 'error');
      return;
    }
  } catch {
    if (!isCurrentRestore(doc, state, restoreToken)) return;
    showDocumentName(doc, 'Dokument nije dostupan');
    setStatus(
      doc,
      'Dokument nije moguće otvoriti',
      'Lokalna priprema dokumenta nije uspjela. Vrati se na početnu stranicu i učitaj ga ponovno.',
      'error',
    );
    return;
  }
  if (!isCurrentRestore(doc, state, restoreToken)) return;
  setStatus(
    doc,
    'Dokument je spreman na korektorskom stolu',
    'Provjeri prepoznati profil prije pokretanja pune lokalne analize.',
    'ready',
  );
}
