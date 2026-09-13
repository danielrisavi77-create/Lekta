/**
 * ODABIR POPRAVAKA UZ SESIJU (korak C6, 2026-09-12). Sve sto ruta `/rad/` radi s odabirom zahvata,
 * izdvojeno iz `main.ts` da ostane tanak, po uzoru na `confirmed-profile.ts` i `revisions.ts`.
 *
 * DVA SMJERA, dva ugovora:
 *
 *  1. ZAPIS. Panel popravka javlja izgradnju (`RepairPanelReady`), ruta se kroz handle pretplati
 *     na promjenu odabira i preklopnika dubinskog ciscenja, i svaku promjenu preda
 *     `createSessionWriter`-u (koalescirano: dvadeset kucica je jedan zapis). Pise se SAMO
 *     `workspace.repairSelection` uz `stage: 'repairPlan'` (stage je obavezno polje snimke, a odabir
 *     se mijenja iskljucivo u fazi popravka); analizu, snimke verzija i profil ne dira, jer
 *     `store.update` spaja workspace po polju (korak W). NE TVRDI SE SPREMLJENO DOK NIJE:
 *     `claimedSaved` postaje istinit samo na `SessionWriteOutcome.kind === 'written'`.
 *
 *  2. OBNOVA. Snimka iz sesije ceka u memoriji do PRVOG izgradjenog panela. Tada se otisak
 *     ponude (`repairItemsDigest`) usporedi sa zapisanim: uz isti otisak odabir se vraca kroz
 *     `handle.applySelection` PRIJE pretplate (obnova ne smije proizvesti zapis), a uz razlicit se
 *     ODBACUJE i to se korisniku KAZE. Stavke s naprednom formom vracaju se NEOZNACENE i to se
 *     kaze jednom recenicom, iz brojaca, nikad bezuvjetno. C6 NE OVISI o spremljenom nalazu (C5):
 *     analiza se pri obnovi pokrece iznova, popis se ponovno slaze, otisak se racuna iz NJEGA.
 *
 * BROJACI SU DIO STANJA, ne test-udobnost: broj oznacenih kucica moze biti isti i bez obnove
 * (predodabir), a `state.writes` na nuli znaci mrtav kod bez obzira na to sto pohrana sadrzi.
 */
import type { RepairPanelReady } from '../../ui/analyzer-document-events';
import type { RepairPanelHandle, RepairableItem } from '../../ui/repair-panel';
import { advancedFormFor } from '../../ui/repair-panel';
import {
  applyRepairSelectionSnapshot, buildRepairSelectionSnapshot, repairSelectionKey,
  type RepairSelectionRestore,
} from '../../ui/repair-selection';
import type { LocalDocumentSessionStore, RepairSelectionSnapshot } from '../../session/local-document-session';
import { createSessionWriter, type SessionWriteOutcome, type SessionWriter } from '../../session/session-writer';

export interface RepairSelectionMemoryDeps {
  /** Pohrana sesija; `null` kad nije dostupna (tada se nista ne ceka ni ne obecava). */
  store: () => LocalDocumentSessionStore | null;
  sessionId: () => string | null;
  status: (text: string | null) => void;
  track?: (event: string, data?: Record<string, unknown>) => void;
  now?: () => number;
  /** Tajmeri pisaca, injektirani radi testova bez cekanja. */
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  /** Ima li stavka naprednu formu; zadano `advancedFormFor(item) !== null`. Injektirano radi testova. */
  isAdvanced?: (item: RepairableItem) => boolean;
}

export type RepairSelectionRestoreOutcome = 'none' | 'applied' | 'digest-mismatch' | 'schema';

export interface RepairSelectionMemoryState {
  /** Koliko je panela stiglo do modula. Nula znaci da emisija nikad nije dosla ovamo. */
  panels: number;
  /** Koliko je promjena odabira javljeno kroz handle. */
  changes: number;
  /** Koliko je snimki predano pisacu. */
  writes: number;
  /** Snimka iz sesije koja ceka prvi panel; `null` kad nista ne ceka. */
  pendingRestore: RepairSelectionSnapshot | null;
  /** Ishod zadnje obnove, s brojacima iz `applyRepairSelectionSnapshot`. */
  restored: RepairSelectionRestoreOutcome;
  lastRestore: RepairSelectionRestore | null;
  /** Istinito SAMO nakon `written`. Svaki drugi ishod ga vraca na `false`. */
  claimedSaved: boolean;
  lastOutcome: SessionWriteOutcome | null;
}

export const NOTICE_SELECTION_NOT_SAVED =
  'Odabir popravaka nije spremljen uz rad (lokalna pohrana ga je odbila). Popravak radi normalno; '
  + 'pri sljedecem otvaranju ovog rada odabir ce trebati napraviti ponovno.';
export const NOTICE_SELECTION_CONFLICT =
  'Odabir popravaka nije spremljen uz rad: rad je istodobno mijenjan u drugoj kartici. '
  + 'Provjeri odabir jos jednom.';
export const NOTICE_SELECTION_DISCARDED =
  'Spremljeni odabir popravaka je odbacen jer se ponuda popravaka za ovaj rad promijenila. '
  + 'Provjeri odabir prije popravka.';
export const NOTICE_SELECTION_ADVANCED =
  'Odabir je vracen, osim stavki s vlastitim postavkama (naslovnica, literatura, citati i slicno): '
  + 'one se racunaju iz aktualne analize, pa ih prije popravka otvori i provjeri.';

export function createRepairSelectionMemory(deps: RepairSelectionMemoryDeps) {
  const now = deps.now ?? (() => Date.now());
  const isAdvanced = deps.isAdvanced ?? ((item: RepairableItem) => advancedFormFor(item) !== null);
  const state: RepairSelectionMemoryState = {
    panels: 0, changes: 0, writes: 0, pendingRestore: null, restored: 'none', lastRestore: null,
    claimedSaved: false, lastOutcome: null,
  };

  // Isti obrazac kao u `confirmed-profile.ts`: pisac se veze uz `sessionId`, koji se mijenja kad
  // korisnik ucita novu datoteku, pa se stvara lijeno i id se usporedjuje na svaki poziv.
  let writer: SessionWriter | null = null;
  let writerFor: string | null = null;
  let offPanel: (() => void) | null = null;

  function onOutcome(outcome: SessionWriteOutcome): void {
    state.lastOutcome = outcome;
    state.claimedSaved = outcome.kind === 'written';
    if (outcome.kind === 'written') { deps.track?.('session_repair_selection_written'); return; }
    deps.track?.('session_repair_selection_not_saved', { kind: outcome.kind });
    deps.status(outcome.kind === 'conflict' ? NOTICE_SELECTION_CONFLICT : NOTICE_SELECTION_NOT_SAVED);
  }

  function writerNow(): SessionWriter | null {
    const store = deps.store();
    const id = deps.sessionId();
    if (!store || !id) return null;
    if (writer && writerFor === id) return writer;
    writer?.dispose();
    writer = createSessionWriter(id, {
      store, now, onOutcome,
      ...(deps.setTimeoutImpl ? { setTimeoutImpl: deps.setTimeoutImpl } : {}),
      ...(deps.clearTimeoutImpl ? { clearTimeoutImpl: deps.clearTimeoutImpl } : {}),
    });
    writerFor = id;
    return writer;
  }

  /** Projekcija zivog odabira u snimku; vlasnik odabira ostaje DOM plus kontroler u panelu. */
  function snapshotOf(handle: RepairPanelHandle, items: readonly RepairableItem[]): RepairSelectionSnapshot | null {
    const selected = new Set(handle.selectedRuleIds());
    return buildRepairSelectionSnapshot({
      items,
      keys: items.filter((i) => selected.has(i.ruleId)).map(repairSelectionKey),
      // Panel bez preklopnika ne pamti `deep`; zadana vrijednost je ona koju motor tada i salje.
      deep: handle.deep() ?? false,
      now: now(),
    });
  }

  function persist(handle: RepairPanelHandle, items: readonly RepairableItem[]): void {
    state.changes += 1;
    const snapshot = snapshotOf(handle, items);
    if (!snapshot) return;
    // Bez pohrane ili adrese sesije se nista ne ceka ni ne obecava: sljedeca promjena ce donijeti
    // svjezu projekciju, pa cuvanje ove u memoriji ne bi imalo sto dodati.
    const w = writerNow();
    if (!w) return;
    state.writes += 1;
    w.enqueue({ workspace: { stage: 'repairPlan', repairSelection: snapshot } });
  }

  return {
    state,
    /** Snimka iz sesije ceka prvi panel; zove se PRIJE `restoreDocument`, kao i profil. */
    restore(snapshot: RepairSelectionSnapshot | null | undefined): void {
      state.pendingRestore = snapshot ?? null;
      state.restored = 'none';
      state.lastRestore = null;
    },
    /** Drugi dokument ili odbijena obnova: snimka opisuje ponudu koja nikad nece nastati. */
    forget(): void {
      state.pendingRestore = null;
    },
    onPanel(event: RepairPanelReady): void {
      state.panels += 1;
      // Prethodni panel je app.ts vec uklonio kroz `dispose()`; odjava je svejedno ovdje, da
      // ovaj modul ne ovisi o tudjem redoslijedu.
      offPanel?.();
      offPanel = null;
      const { handle, items } = event;

      if (state.pendingRestore) {
        const snapshot = state.pendingRestore;
        state.pendingRestore = null;
        const restore = applyRepairSelectionSnapshot(items, snapshot, { isAdvanced });
        state.lastRestore = restore;
        if (restore.rejected) {
          state.restored = restore.rejected;
          deps.status(NOTICE_SELECTION_DISCARDED);
        } else {
          // Obnova ide PRIJE pretplate: vraceni odabir nije nova promjena i ne smije proizvesti zapis.
          handle.applySelection(restore.ruleIds);
          handle.setDeep(snapshot.deep);
          state.restored = 'applied';
          if (restore.advancedNeedsReview > 0) deps.status(NOTICE_SELECTION_ADVANCED);
        }
        deps.track?.('session_repair_selection_restored', {
          outcome: state.restored, applied: restore.applied, advanced: restore.advancedNeedsReview,
        });
      }

      offPanel = handle.onSelectionChange(() => persist(handle, items));
    },
    /** Zapisi odmah sto ceka (npr. na odlasku sa stranice). */
    async flush(): Promise<SessionWriteOutcome | null> {
      return writer ? writer.flush() : null;
    },
    dispose(): void {
      offPanel?.();
      offPanel = null;
      writer?.dispose();
      writer = null;
      writerFor = null;
      state.pendingRestore = null;
    },
  };
}
