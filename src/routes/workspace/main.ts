import { initAnalyzerApp, loadAnalyzerDocument, subscribeAnalyzerDocumentAccepted } from '../../ui/app';
import {
  openWorkspace, persistAcceptedDocument, restoreDocument, afterDocumentAccepted, afterPersist,
  type StorageAvailability,
} from './bootstrap';
import { initialContext, type WorkspaceContext } from './workspace-state';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import '../../shared/ui-boot';
import '../../shared/page.css';  // stil stranice; bez njega je ruta goli HTML

/**
 * ULAZ RUTE `/rad/`. Tanak namjerno: sve odluke su u `bootstrap.ts`, koji je cist i testabilan
 * bez preglednika. Ovdje ostaje samo dodir DOM-a, montaza i povijest preglednika.
 */

function detectStorage(): StorageAvailability {
  // `indexedDB` moze POSTOJATI a bacati pri otvaranju (privatni prozor, blokirani podaci
  // stranice). Sama prisutnost objekta zato nije dokaz dostupnosti; stvarni kvar hvataju
  // `openWorkspace` i `persistAcceptedDocument`, koji svaki poziv pohrane drze u `try`.
  try {
    const factory = globalThis.indexedDB;
    if (!factory) return { kind: 'unavailable', reason: 'indexedDB nije dostupan' };
    return { kind: 'available', store: new IndexedDbDocumentSessionStore({ indexedDB: factory }) };
  } catch (error) {
    return { kind: 'unavailable', reason: String((error as Error)?.message || error) };
  }
}

function showStatus(text: string | null): void {
  const el = document.getElementById('workspace-status');
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = text;
  el.hidden = false;
}

async function start(): Promise<void> {
  // Montaza ide PRVA: radna povrsina mora biti upotrebljiva i kad pohrana zakaze. Vezanje
  // upotrebljivosti uz pohranu bilo bi tocno obrnuto od ugovora o degradaciji.
  initAnalyzerApp(document);

  const storage = detectStorage();
  let sessionId: string | null = null;
  // Stanje se DRZI i osvjezava. Zapisano jednom pri ucitavanju, tvrdilo bi `empty` i nakon sto
  // korisnik ucita dokument; ustajala tvrdnja o stanju gora je od nikakve, jer je netko procita.
  let context: WorkspaceContext = initialContext(false);
  const showState = (next: WorkspaceContext): void => {
    context = next;
    document.documentElement.dataset.workspaceState = context.state;
  };

  // ZAPIS: tek kad je dokument STVARNO prihvacen. Pretplata se postavlja PRIJE obnove, jer i
  // obnovljen dokument prolazi kroz prijem pa i on zavrsi ovdje.
  subscribeAnalyzerDocumentAccepted((event) => {
    showState(afterDocumentAccepted(context));
    void (async () => {
      const out = await persistAcceptedDocument(event.file, event.verdict, storage, sessionId);
      showState(afterPersist(context, out.kind === 'persisted'));
      if (out.kind !== 'persisted') { showStatus(out.notice); return; }
      sessionId = out.sessionId;
      // `replaceState`, ne `pushState`: zapis sesije nije korisnikova navigacija, pa ne smije
      // dodati korak u povijest kroz koji se "natrag" vraca na praznu radnu povrsinu.
      history.replaceState(history.state, '', location.pathname + location.search + out.fragment);
      showStatus(null);
    })();
  });

  const outcome = await openWorkspace(location.hash, storage);
  showStatus(outcome.notice);
  showState(outcome.context);

  if (outcome.session) {
    sessionId = outcome.session.id;
    // Spremljen verdikt je samo predmemorija: dokument ide PONOVNO kroz prijem, pa se odbijanje
    // postuje umjesto da se vjeruje zapisu.
    const restored = await restoreDocument(outcome.session, loadAnalyzerDocument);
    if (restored.kind === 'refused') showStatus(restored.notice);
  }
}

void start();
