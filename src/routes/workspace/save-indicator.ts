/**
 * INDIKATOR SPREMANJA U ZAGLAVLJU `/rad/` (korak C7, 2026-09-13). JEDINI pisac elementa
 * `#radDocSave`, isti obrazac kao `renderView`: jedan pisac, jedno stanje, bez rucnih dodira.
 *
 * GDJE ZIVI, I ZASTO BAS TAMO. Element stoji u `#radDocBar`, koji `wireDocumentBar` SKRIVA dok
 * dokumenta nema. To je izrecena odluka, ne propust: indikator opisuje zapis RADA, a bez dokumenta
 * nema rada ni zapisa koji bi opisivao. Stanje `off` prije prvog dokumenta korisniku vec kaze
 * jednokratna obavijest `NOTICE_NO_STORAGE` iz `openWorkspace`; cim dokument stigne, traka se
 * pokaze i indikator na njoj pokazuje `off` trajno.
 *
 * NE PISE U `#workspace-status`, ni za jedno stanje. Ta regija je `role=status aria-live=polite` za
 * JEDNOKRATNE obavijesti; trajno stanje koje se mijenja na svaki klik pretvorilo bi je u brbljavu
 * zivu regiju. Uz to SVAKI proizvodjac ishoda vec ima vlastiti jednokratni glas za neuspjeh
 * (`NOTICE_PERSIST_FAILED`, `NOTICE_REVISION_NOT_SAVED`, `NOTICE_PROFILE_NOT_SAVED`,
 * `NOTICE_SELECTION_NOT_SAVED`), pa bi indikatorova obavijest uvijek bila DRUGI glas o istom
 * dogadjaju. Element sam nema `aria-live` ni `role=status` iz istog razloga; gard u
 * `tests/rad-route.test.ts` to tvrdi.
 *
 * BROJACI SU DIO MEHANIZMA, ne test-udobnost: prikaz "Spremljeno" nije dokaz da je upis potvrdjen,
 * jer se moze pojaviti iz drugog razloga. `written` na nuli uz vidljivo "Spremljeno" je kvar, i
 * gard to tvrdi.
 */
import {
  nextSaveState, saveStateLabel, saveStateTone, SAVE_TITLES,
  type SaveEvent, type SaveState,
} from './save-state';

export interface SaveIndicatorDeps {
  mount: () => HTMLElement | null;
  now?: () => number;
}

export interface SaveIndicatorCounters {
  queued: number;
  written: number;
  failures: number;
}

export interface SaveIndicator {
  apply(event: SaveEvent): SaveState;
  state(): SaveState;
  counters(): SaveIndicatorCounters;
}

export function createSaveIndicator(deps: SaveIndicatorDeps): SaveIndicator {
  const now = deps.now ?? (() => Date.now());
  let state: SaveState = 'idle';
  let savedAt: number | undefined;
  const counters: SaveIndicatorCounters = { queued: 0, written: 0, failures: 0 };

  function render(): void {
    const el = deps.mount();
    if (!el) return;
    const label = saveStateLabel(state, savedAt);
    el.dataset.saveState = state;
    el.dataset.saveTone = saveStateTone(state);
    el.textContent = label ?? '';
    const title = SAVE_TITLES[state];
    if (title) el.title = title; else el.removeAttribute('title');
    // `hidden` atribut, ne klasa: reset u `ui-boot` skriva `[hidden]`, a `idle` nema natpis.
    el.hidden = label === null;
  }

  return {
    apply(event: SaveEvent): SaveState {
      if (event.kind === 'queued') counters.queued += 1;
      if (event.kind === 'outcome') {
        if (event.outcome.kind === 'written') counters.written += 1;
        else counters.failures += 1;
      }
      state = nextSaveState(state, event);
      // Vrijeme zapisa dolazi iz ISHODA (pisac ga pecatira), ne iz trenutka crtanja; `now` je
      // rezerva za ishode koji ga nemaju (zapis dokumenta iz `persistAcceptedDocument`).
      if (state === 'saved' && event.kind === 'outcome' && event.outcome.kind === 'written') {
        savedAt = Number.isFinite(event.outcome.at) && event.outcome.at > 0 ? event.outcome.at : now();
      }
      render();
      return state;
    },
    state: () => state,
    counters: () => ({ ...counters }),
  };
}
