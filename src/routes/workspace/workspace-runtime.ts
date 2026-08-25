import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import {
  fileFromLocalDocumentSession,
  parseSessionFragment,
  type LocalDocumentSessionV1,
  type LocalDocumentSessionStore,
} from '../../session/local-document-session';
import { initAnalyzerApp, loadAnalyzerDocument } from '../../ui/app';

export interface WorkspaceRuntimeOptions {
  fragment?: string;
  store?: LocalDocumentSessionStore;
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

export async function mountWorkspaceRuntime(
  doc: Document = document,
  options: WorkspaceRuntimeOptions = {},
): Promise<void> {
  initAnalyzerApp(doc);
  const fragment = options.fragment ?? doc.defaultView?.location.hash ?? '';
  const sessionId = parseSessionFragment(fragment);
  if (!sessionId) {
    showDocumentName(doc, 'Nije odabran dokument');
    setStatus(doc, 'Nema aktivnog dokumenta', 'Vrati se na početnu stranicu i učitaj .docx rad.', 'error');
    return;
  }

  const store = options.store ?? new IndexedDbDocumentSessionStore();
  let session: LocalDocumentSessionV1 | null;
  try {
    await store.deleteExpired();
    session = await store.get(sessionId);
  } catch {
    showDocumentName(doc, 'Dokument nije dostupan');
    setStatus(
      doc,
      'Lokalnu sesiju nije moguće otvoriti',
      'Privatna lokalna pohrana preglednika nije dostupna. Vrati se na početnu stranicu i učitaj dokument ponovno.',
      'error',
    );
    return;
  }
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
    if (!admission.accepted) {
      showDocumentName(doc, 'Dokument nije aktivan');
      setStatus(doc, 'Dokument nije prihvaćen', admission.message, 'error');
      return;
    }
  } catch {
    showDocumentName(doc, 'Dokument nije dostupan');
    setStatus(
      doc,
      'Dokument nije moguće otvoriti',
      'Lokalna priprema dokumenta nije uspjela. Vrati se na početnu stranicu i učitaj ga ponovno.',
      'error',
    );
    return;
  }
  setStatus(
    doc,
    'Dokument je spreman na korektorskom stolu',
    'Provjeri prepoznati profil prije pokretanja pune lokalne analize.',
    'ready',
  );
}
