import { initAnalyzerApp, loadAnalyzerDocument, subscribeAnalyzerDocumentAccepted } from '../../ui/app';
import {
  openWorkspace, persistAcceptedDocument, restoreDocument, afterDocumentAccepted, afterPersist,
  type StorageAvailability,
} from './bootstrap';
import { initialContext, type WorkspaceContext } from './workspace-state';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import { fileFromLocalDocumentSession } from '../../session/local-document-session';
import '../../shared/fonts-document'; // podatkovni glasovi (Source Serif 4 za dokument-preglede, IBM Plex Mono za brojke)
import '../../shared/ui-boot';
import '../../shared/page-chrome.css';
import '../../shared/page-app.css';  // stil stranice; bez njega je ruta goli HTML
// Paritet s bivsom naslovnicom (2026-09-05): Katedra dolazni kontekst i CTA nakon nalaza, te demo
// scena i sloj dubine radne povrsine. Do reza su zivjeli samo u `src/main.ts`, pa je `/rad/` imao
// staticnu, neanimiranu demo scenu i nije razumio `?workType=`/`#handoff=` s Katedre.
import '../../integration/katedra-entry';
import '../../integration/katedra-result-cta';
import '../../ui/hero-demo';
import '../../ui/hero-depth';

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

  // OBNOVLJEN DOKUMENT SE NE ZAPISUJE PONOVNO. Do 2026-09-05 je i on prolazio kroz zapis, pa je
  // svako otvaranje `/rad/#session=X` stvaralo NOVU sesiju Y i brisalo X: poveznica iz
  // `/moji-radovi/` i tiha poveznica "nastavi" na `/` vrijedile su tocno jedno otvaranje, a
  // zatim su vodile u "sesija vise ne postoji". Dokument koji je dosao iz pohrane vec IMA sesiju;
  // zapis pripada samo dokumentu koji je korisnik sam ubacio.
  let restoredFile: File | null = null;

  // ZAPIS: tek kad je dokument STVARNO prihvacen. Pretplata se postavlja PRIJE obnove, jer i
  // obnovljen dokument prolazi kroz prijem (odbijanje se postuje), ali se on ovdje prepozna i
  // preskoci.
  subscribeAnalyzerDocumentAccepted((event) => {
    showState(afterDocumentAccepted(context));
    if (restoredFile !== null && event.file === restoredFile) {
      showState(afterPersist(context, true));
      showStatus(null);
      return;
    }
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
    // Isti `File` objekt koji ulazi u prijem pamti se PRIJE poziva, jer pretplata iznad gleda
    // identitet objekta, ne ime ili velicinu (dva razlicita ubacivanja iste datoteke su dva rada).
    restoredFile = fileFromLocalDocumentSession(outcome.session);
    const restored = await restoreDocument(outcome.session, () => loadAnalyzerDocument(restoredFile!));
    if (restored.kind === 'refused') showStatus(restored.notice);
  }
}

void start();
