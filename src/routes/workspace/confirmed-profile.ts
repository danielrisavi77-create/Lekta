/**
 * POTVRDJENI PROFIL UZ SESIJU (korak C4, 2026-09-12). Sve sto ruta `/rad/` radi s potvrdjenim
 * profilom, izdvojeno iz `main.ts` da ostane tanak, po uzoru na `revisions.ts`.
 *
 * DVA SMJERA, dva ugovora:
 *
 *  1. ZAPIS. Potvrda profila u carobnjaku (`ProfileConfirmed`) ide kroz `createSessionWriter`, ne
 *     kroz `store.update`. Potvrda je korisnicki dogadjaj koji se ponavlja (svaki povratak medju
 *     fazama), pa koalescencija i uvjetovana generacija postoje bas za nju. Pise se SAMO polje
 *     `profile`, nikad `workspace`: snimke verzija (T12) i profil ostaju razdvojeni pisci.
 *     NE TVRDI SE SPREMLJENO DOK NIJE: `claimedSaved` postaje istinit samo na
 *     `SessionWriteOutcome.kind === 'written'`. Dok `sessionId` jos ne postoji (zapis dokumenta
 *     je asinkron, a korisnik moze kliknuti prije njega), snimka ceka u memoriji i o njoj se ne
 *     tvrdi nista; `flush()` je preda cim sesija dobije adresu.
 *
 *  2. OBNOVA. Zapisani odabir se vraca u obrazac kroz JEDAN put (`deps.apply`, u produkciji
 *     `applyConfirmedProfileSelection` iz `app.ts`), a onda se RAZRJESENI profil usporedi sa
 *     zapisanim `profileDefinitionId`. Razlika (profil uklonjen, studij preimenovan, varijanta
 *     nestala) je `mismatch`: sucelje to kaze i trazi provjeru odabira, umjesto da tiho boduje po
 *     necemu trecemu. Ta grana je jedina razlika izmedju obnove i tihog bodovanja po krivom
 *     pravilu, pa se ne izostavlja.
 *
 * BROJACI SU DIO STANJA, ne test-udobnost: nizvodna mjera ("u pohrani ima profil") moze se
 * popraviti iz drugog razloga, a `state.writes` na nuli znaci mrtav kod bez obzira na nju.
 */
import type { ProfileConfirmed } from '../../ui/profile-confirmed-events';
import type { ConfirmedProfileSnapshot, LocalDocumentSessionStore } from '../../session/local-document-session';
import { createSessionWriter, type SessionWriteOutcome, type SessionWriter } from '../../session/session-writer';

export interface ConfirmedProfileDeps {
  /** Pohrana sesija; `null` kad nije dostupna (tada se nista ne ceka ni ne obecava). */
  store: () => LocalDocumentSessionStore | null;
  sessionId: () => string | null;
  /** Vrati odabir u obrazac i javi RAZRJESENI id profila (`null` kad odabir ne daje verificiran profil). */
  apply: (ids: Record<string, string>) => string | null;
  status: (text: string | null) => void;
  track?: (event: string, data?: Record<string, unknown>) => void;
  now?: () => number;
  /** Tajmeri pisaca, injektirani radi testova bez cekanja. */
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
}

export type ConfirmedProfileRestore = 'none' | 'applied' | 'mismatch';

export interface ConfirmedProfileState {
  /** Koliko je potvrda stiglo do modula. Nula znaci da emisija nikad nije dosla ovamo. */
  confirmations: number;
  /** Koliko je snimki predano pisacu. */
  writes: number;
  /** Potvrde bez verificiranog profila: nema sto zapisati, i to se broji umjesto da se skrije. */
  unwritable: number;
  /** Snimka koja ceka `sessionId`; `null` kad nista ne ceka. */
  pending: ConfirmedProfileSnapshot | null;
  /** Istinito SAMO nakon `written`. Svaki drugi ishod ga vraca na `false`. */
  claimedSaved: boolean;
  lastOutcome: SessionWriteOutcome | null;
  restored: ConfirmedProfileRestore;
}

export const NOTICE_PROFILE_NOT_SAVED =
  'Odabrani profil nije spremljen uz rad (lokalna pohrana ga je odbila). Analiza radi normalno; '
  + 'pri sljedecem otvaranju ovog rada profil ce trebati odabrati ponovno.';
export const NOTICE_PROFILE_CONFLICT =
  'Odabrani profil nije spremljen uz rad: rad je istodobno mijenjan u drugoj kartici. '
  + 'Potvrdi profil jos jednom.';
export const NOTICE_PROFILE_MISMATCH =
  'Spremljeni profil za ovaj rad vise nije dostupan (pravila su u medjuvremenu promijenjena). '
  + 'Provjeri odabir fakulteta, studija i vrste rada prije analize.';

export function createConfirmedProfile(deps: ConfirmedProfileDeps) {
  const now = deps.now ?? (() => Date.now());
  const state: ConfirmedProfileState = {
    confirmations: 0, writes: 0, unwritable: 0, pending: null, claimedSaved: false, lastOutcome: null, restored: 'none',
  };

  // PISAC SE VEZE UZ `sessionId`, koji se mijenja kad korisnik ucita novu datoteku (nova sesija,
  // stara se brise). Pisac koji se ne obnovi pisao bi u sesiju koje vise nema i dobivao
  // `not-found`; zato se stvara lijeno i id se usporedjuje na svaki poziv.
  let writer: SessionWriter | null = null;
  let writerFor: string | null = null;

  function onOutcome(outcome: SessionWriteOutcome): void {
    state.lastOutcome = outcome;
    state.claimedSaved = outcome.kind === 'written';
    if (outcome.kind === 'written') { deps.track?.('session_profile_written'); return; }
    deps.track?.('session_profile_not_saved', { kind: outcome.kind });
    deps.status(outcome.kind === 'conflict' ? NOTICE_PROFILE_CONFLICT : NOTICE_PROFILE_NOT_SAVED);
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

  /** Preda snimku pisacu ako sesija postoji; inace je ostavi da ceka (bez ikakve tvrdnje). */
  function handOver(snapshot: ConfirmedProfileSnapshot): void {
    if (!deps.store()) { state.pending = null; return; } // bez pohrane nema ni cekanja ni obecanja
    const w = writerNow();
    if (!w) { state.pending = snapshot; return; }
    state.pending = null;
    state.writes += 1;
    w.enqueue({ profile: snapshot });
  }

  return {
    state,
    onConfirmed(event: ProfileConfirmed): void {
      state.confirmations += 1;
      if (!event.profileDefinitionId) { state.unwritable += 1; return; }
      // Kopija odabira: dogadjaj nosi zivi objekt iz obrasca, a snimka ide u pohranu i u spajanje.
      handOver({
        profileDefinitionId: event.profileDefinitionId,
        selectionIds: { ...event.selectionIds },
        confirmedAt: event.confirmedAt,
      });
    },
    /**
     * Obnova iz sesije. Zove se POSLIJE montaze (koja kroz `restorePreferences` vraca globalne
     * postavke) i PRIJE ubacivanja dokumenta (cija detekcija bi inace pregazila odabir).
     */
    restore(snapshot: ConfirmedProfileSnapshot | null | undefined): ConfirmedProfileRestore {
      if (!snapshot) { state.restored = 'none'; return 'none'; }
      let resolved: string | null = null;
      // Iznimka pri primjeni (obrazac bez kontrola profila) je isto nesukladnost: odabir nije vracen.
      try { resolved = deps.apply(snapshot.selectionIds); } catch { resolved = null; }
      const outcome: ConfirmedProfileRestore = resolved === snapshot.profileDefinitionId ? 'applied' : 'mismatch';
      state.restored = outcome;
      if (outcome === 'mismatch') deps.status(NOTICE_PROFILE_MISMATCH);
      deps.track?.('session_profile_restored', { outcome });
      return outcome;
    },
    /** Sesija je dobila adresu (ili se odlazi): preda sto ceka i zapisi odmah. */
    async flush(): Promise<SessionWriteOutcome | null> {
      if (state.pending) handOver(state.pending);
      return writer ? writer.flush() : null;
    },
    dispose(): void {
      writer?.dispose();
      writer = null;
      writerFor = null;
      state.pending = null;
    },
  };
}
