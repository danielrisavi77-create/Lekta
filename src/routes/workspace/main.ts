import {
  initAnalyzerApp, loadAnalyzerDocument, trackWorkspaceEvent, applyConfirmedProfileSelection,
  subscribeAnalyzerDocumentAccepted, subscribeAnalyzerDocumentSettled,
} from '../../ui/app';
import { subscribeAnalyzerResultReady, subscribeRepairPanelReady } from '../../ui/analyzer-document-events';
import { subscribeProfileConfirmed } from '../../ui/profile-confirmed-events';
import { createRevisions } from './revisions';
import { createConfirmedProfile } from './confirmed-profile';
import { createRepairSelectionMemory } from './repair-selection';
import { mountMentorTasks } from '../../ui/results/mentor-tasks';
import {
  openWorkspace, persistAcceptedDocument, restoreDocument, afterDocumentAccepted, afterPersist,
  type StorageAvailability,
} from './bootstrap';
import { emptyLedger, type WorkspaceLedger } from './workspace-state';
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

/**
 * TRAKA DOKUMENTA U ZAGLAVLJU: `Lekta | <ime> | Lokalno`.
 *
 * ZIVI U RUTI, NE U `app.ts`, i to je odluka o sloju. Zaglavlje je oprema `/rad/`, a analizator
 * vec objavljuje prihvat dokumenta kao ugovor (`analyzer-document-events`), pa oprema rute ne
 * mora posezati u njegovu unutrasnjost. Prva izvedba je pisala izravno u `setFile`; radila je,
 * ali je rasla u `app.ts`, koji ratchet `tests/ui-module-budget.test.ts` gura prema DOLJE.
 *
 * SVA TRI ISHODA, jer bi dva ostavila traku da tvrdi neistinu:
 *   accepted    dokument je prosao intake gate; ime na ekran
 *   rejected    `admitFile` je vec pozvao `setFile(null)`, dakle nema dokumenta; traka odlazi
 *   superseded  u letu je NOVIJI dokument; ovaj se ignorira, inace bi stariji pregazio noviji
 *
 * Ime se namjerno pojavljuje tek NA PRIHVAT, ne na odabir: traka govori na cemu Lekta radi, a
 * ne koju je datoteku korisnik dotaknuo. Odbijen dokument tako nikad ne provede trenutak u
 * zaglavlju kao da je prihvacen.
 */
function wireDocumentBar(onNewVersion: (file: File) => void): void {
  const bar = document.getElementById('radDocBar');
  const name = document.getElementById('radDocName');
  if (!bar || !name) return;
  const newVersionBtn = document.getElementById('radDocNewVersion') as HTMLButtonElement | null;
  const newVersionInput = document.getElementById('radDocNewVersionInput') as HTMLInputElement | null;
  subscribeAnalyzerDocumentSettled((event) => {
    if (event.kind === 'superseded') return;
    const file = event.kind === 'accepted' ? event.file : null;
    name.textContent = file ? file.name : '';
    name.title = file ? file.name : '';
    bar.classList.toggle('hidden', !file);
    // T12: nova verzija ima smisla tek kad postoji dokument s kojim se usporedjuje.
    newVersionBtn?.classList.toggle('hidden', !file);
  });
  if (newVersionBtn && newVersionInput) {
    newVersionBtn.addEventListener('click', () => newVersionInput.click());
    newVersionInput.addEventListener('change', () => {
      const file = newVersionInput.files?.[0] ?? null;
      newVersionInput.value = '';
      if (file) onNewVersion(file);
    });
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
  // Knjiga sesije. Do 2026-09-12 je ovdje zivio i upis `data-workspace-state` na <html>; atribut
  // je uklonjen jer NIJEDAN citatelj nije postojao (ni CSS, ni test, ni kod), pa je bio trosak bez
  // korisnika. Stanje koje korisnik vidi pise `wizard-view.ts`.
  let context: WorkspaceLedger = emptyLedger();
  const upisi = (next: WorkspaceLedger): void => { context = next; };

  // OBNOVLJEN DOKUMENT SE NE ZAPISUJE PONOVNO. Do 2026-09-05 je i on prolazio kroz zapis, pa je
  // svako otvaranje `/rad/#session=X` stvaralo NOVU sesiju Y i brisalo X: poveznica iz
  // `/moji-radovi/` i tiha poveznica "nastavi" na `/` vrijedile su tocno jedno otvaranje, a
  // zatim su vodile u "sesija vise ne postoji". Dokument koji je dosao iz pohrane vec IMA sesiju;
  // zapis pripada samo dokumentu koji je korisnik sam ubacio.
  let restoredFile: File | null = null;

  // ZAPIS: tek kad je dokument STVARNO prihvacen. Pretplata se postavlja PRIJE obnove, jer i
  // obnovljen dokument prolazi kroz prijem (odbijanje se postuje), ali se on ovdje prepozna i
  // preskoci.
  // Pretplata mora postojati prije nego `restoreDocument` pozove `loadAnalyzerDocument`:
  // `emitAnalyzerDocumentSettled` obavjescuje nad KOPIJOM skupa pretplatnika, pa pretplatnik
  // dodan poslije prijem obnovljenog dokumenta ne vidi, i zaglavlje na `/rad/#session=...`
  // ostaje prazno iznad uredno ucitanog rada.
  //
  // GRANICA JE IZMJERENA, ne procijenjena, jer je prva verzija ovog komentara promasila:
  //   tik prije `openWorkspace`   i dalje radi  (taj poziv je await-an, ucitavanje je iza njega)
  //   iza `restoreDocument`       pada
  // Vrh `start()` je zato jedini polozaj koji ne trazi da citatelj drzi taj redoslijed u glavi.
  // T12: verzije rada. Snimka tekuce analize ide u sesiju; "Ucitaj novu verziju" prenosi je kao prethodnu.
  const revisions = createRevisions({
    store: () => (storage.kind === 'available' ? storage.store : null),
    sessionId: () => sessionId,
    mount: () => document.getElementById('revisionSummary'),
    esc: (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    status: showStatus,
    track: trackWorkspaceEvent,
  });
  // C4: potvrdjeni profil se pamti uz sesiju i vraca pri obnovi. Pretplata ide PRIJE
  // `openWorkspace` iz istog razloga kao gore: objava ide nad kopijom skupa pretplatnika.
  const profil = createConfirmedProfile({
    store: () => (storage.kind === 'available' ? storage.store : null),
    sessionId: () => sessionId,
    apply: applyConfirmedProfileSelection,
    status: showStatus,
    track: trackWorkspaceEvent,
  });
  subscribeProfileConfirmed((event) => profil.onConfirmed(event));
  // C6: odabir popravaka se pamti po identitetu (`fixerId|ruleId`) i vraca na PRVI panel ciji se
  // otisak ponude poklapa sa zapisanim. Panel se gradi tek nakon analize, pa pretplata prije
  // `openWorkspace` ne moze zakasniti; stoji ovdje iz istog razloga kao ostale.
  const odabir = createRepairSelectionMemory({
    store: () => (storage.kind === 'available' ? storage.store : null),
    sessionId: () => sessionId,
    status: showStatus,
    track: trackWorkspaceEvent,
  });
  subscribeRepairPanelReady((event) => odabir.onPanel(event));
  subscribeAnalyzerResultReady((event) => {
    revisions.onResult(event.result);
    // T13: komentari iz paketa postaju lokalni zadaci; bez komentara sekcija ostaje skrivena. Citanje paketa je lokalno.
    const mentorMount = document.getElementById('mentorTasks');
    if (mentorMount && event.file) {
      void event.file.arrayBuffer()
        .then((buf) => mountMentorTasks(mentorMount, new Uint8Array(buf), ((event.result as { checks?: unknown[] } | null)?.checks ?? []) as never))
        .catch((error) => { console.warn('Mentorovi komentari:', error); mentorMount.classList.add('hidden'); });
    }
  });
  wireDocumentBar((file) => {
    revisions.beginNewVersion();
    void loadAnalyzerDocument(file);
  });

  subscribeAnalyzerDocumentAccepted((event) => {
    upisi(afterDocumentAccepted(context));
    if (restoredFile !== null && event.file === restoredFile) {
      upisi(afterPersist(context, true));
      showStatus(null);
      return;
    }
    // Drugi dokument: snimka odabira iz sesije opisuje ponudu koja za njega nikad nece nastati.
    odabir.forget();
    void (async () => {
      const out = await persistAcceptedDocument(event.file, event.verdict, storage, sessionId);
      upisi(afterPersist(context, out.kind === 'persisted'));
      if (out.kind !== 'persisted') { showStatus(out.notice); return; }
      sessionId = out.sessionId;
      // `replaceState`, ne `pushState`: zapis sesije nije korisnikova navigacija, pa ne smije
      // dodati korak u povijest kroz koji se "natrag" vraca na praznu radnu povrsinu.
      history.replaceState(history.state, '', location.pathname + location.search + out.fragment);
      showStatus(null);
      // Potvrda koja je stigla dok sesija jos nije imala adresu sada dobiva kamo ici.
      void profil.flush();
    })();
  });

  const outcome = await openWorkspace(location.hash, storage);
  showStatus(outcome.notice);
  upisi(outcome.context);

  if (outcome.session) {
    sessionId = outcome.session.id;
    // Spremljen verdikt je samo predmemorija: dokument ide PONOVNO kroz prijem, pa se odbijanje
    // postuje umjesto da se vjeruje zapisu.
    // Isti `File` objekt koji ulazi u prijem pamti se PRIJE poziva, jer pretplata iznad gleda
    // identitet objekta, ne ime ili velicinu (dva razlicita ubacivanja iste datoteke su dva rada).
    restoredFile = fileFromLocalDocumentSession(outcome.session);
    // Snimke revizija iz sesije (stariji zapisi ih nemaju): usporedba prezivi ponovno ucitavanje stranice.
    revisions.restore(outcome.session.workspace?.revision, outcome.session.workspace?.previousRevision);
    // REDOSLIJED JE UGOVOR (gard: tests/thin-route-mount.test.ts). Profil sesije ide POSLIJE
    // `initAnalyzerApp` (koje kroz `restorePreferences` vraca globalne postavke, koje bi ga inace
    // pregazile) i PRIJE `restoreDocument` (cija detekcija iz dokumenta bi ga inace pregazila).
    profil.restore(outcome.session.profile);
    odabir.restore(outcome.session.workspace?.repairSelection);
    const restored = await restoreDocument(outcome.session, () => loadAnalyzerDocument(restoredFile!));
    if (restored.kind === 'refused') { odabir.forget(); showStatus(restored.notice); }
  }
}

void start();
