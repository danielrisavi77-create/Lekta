/**
 * VERZIJE RADA U RADNOM PROSTORU (plan T12). Sve sto ruta `/rad/` radi s revizijama, izdvojeno iz `main.ts` da ostane
 * tanak: pamcenje snimke tekuce analize u lokalnu sesiju, radnja "Ucitaj novu verziju ovog rada", odluka o
 * povezivanju (jak / slab / razlicit identitet) i prikaz razlike.
 *
 * Granice iz plana: nema novog sinkronizacijskog sustava (sve je u postojecoj IndexedDB sesiji), dokument ne napusta
 * uredjaj, stara sesija ostaje citljiva (polja su neobavezna, stariji zapisi ih nemaju), a puna kvota ne prekida analizu
 * nego samo kaze da revizija nije spremljena.
 */
import { compareFindingRevisions, type RevisionDelta } from '../../history/finding-revisions';
import {
  linkVerdict,
  newDocumentGroupId,
  storedRevisionFromResult,
  type StoredRevision,
} from '../../history/revision-snapshot';
import type { LocalDocumentSessionStore } from '../../session/local-document-session';
import { revisionLinkPromptHtml, revisionSummaryHtml } from '../../ui/results/revision-summary';

export interface RevisionsDeps {
  /** Pohrana sesija; `null` kad nije dostupna (tada usporedba zivi samo u memoriji ove stranice). */
  store: () => LocalDocumentSessionStore | null;
  sessionId: () => string | null;
  mount: () => HTMLElement | null;
  esc: (v: string) => string;
  status: (text: string | null) => void;
  track?: (event: string, data?: Record<string, unknown>) => void;
}

export interface RevisionsState {
  /** Snimka analize dokumenta koji je trenutno otvoren. */
  current: StoredRevision | null;
  /** Snimka prethodne verzije, prenesena kad korisnik ucita novu verziju (ili obnovljena iz sesije). */
  previous: StoredRevision | null;
  /** Identitet skupine verzija; nova verzija ga nasljedjuje kad je povezana. */
  groupId: string;
  /** Odluka o povezivanju kad identitet nije siguran: `null` dok korisnik ne odgovori. */
  linkDecision: 'linked' | 'separate' | null;
}

export const NOTICE_REVISION_NOT_SAVED = 'Revizija nije spremljena (nema dovoljno prostora u lokalnoj pohrani). Analiza je dovršena i vidljiva; usporedba verzija radi samo dok je ova stranica otvorena.';

export function createRevisions(deps: RevisionsDeps) {
  const state: RevisionsState = { current: null, previous: null, groupId: newDocumentGroupId(), linkDecision: null };

  function render(html: string | null): void {
    const el = deps.mount();
    if (!el) return;
    if (!html) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.querySelector<HTMLButtonElement>('[data-revision-link-yes]')?.addEventListener('click', () => decide('linked'));
    el.querySelector<HTMLButtonElement>('[data-revision-link-no]')?.addEventListener('click', () => decide('separate'));
  }

  async function persist(): Promise<void> {
    const store = deps.store();
    const id = deps.sessionId();
    if (!store || !id || !state.current) return;
    try {
      await store.update(id, { workspace: { stage: 'results', revision: state.current, previousRevision: state.previous ?? undefined } });
    } catch {
      // Kvota ili druga greska pohrane: analiza ostaje, korisnik dobiva jasnu poruku (plan T12).
      deps.status(NOTICE_REVISION_NOT_SAVED);
    }
  }

  function titleOf(key: string): string {
    const ruleId = key.split('@')[0];
    return state.current?.checkTitles[ruleId] ?? state.previous?.checkTitles[ruleId] ?? key;
  }

  function compareAndRender(): RevisionDelta | null {
    if (!state.current || !state.previous) return null;
    const delta = compareFindingRevisions(state.previous.snapshot, state.current.snapshot);
    const hasOpenBlocker = state.current.snapshot.findings.some((f) => f.outcome === 'fail');
    render(revisionSummaryHtml({ delta, titleOf, previousAt: state.previous.createdAt, hasOpenBlocker }, deps.esc));
    deps.track?.('revision_compared', { count: delta.resolved.length, total: delta.introduced.length, kind: delta.comparable ? 'comparable' : 'not-comparable' });
    return delta;
  }

  function decide(decision: 'linked' | 'separate'): void {
    state.linkDecision = decision;
    if (decision === 'separate' || !state.current) {
      // Drugi rad: prethodna snimka se ne nosi dalje; nova skupina, bez usporedbe.
      state.previous = null;
      state.groupId = newDocumentGroupId();
      if (state.current) state.current = { ...state.current, snapshot: { ...state.current.snapshot, documentGroupId: state.groupId } };
      render(null);
      void persist();
      return;
    }
    state.current = { ...state.current, snapshot: { ...state.current.snapshot, documentGroupId: state.groupId } };
    compareAndRender();
    void persist();
  }

  return {
    state,
    /** Obnova iz sesije: stariji zapisi nemaju ova polja, pa je sve neobavezno. */
    restore(revision: StoredRevision | null | undefined, previous: StoredRevision | null | undefined): void {
      if (revision) { state.current = revision; state.groupId = revision.snapshot.documentGroupId; }
      if (previous) state.previous = previous;
    },
    /** Korisnik ucitava novu verziju: tekuca snimka postaje prethodna, skupina ostaje ista (do odluke o povezivanju). */
    beginNewVersion(): void {
      if (state.current) state.previous = state.current;
      state.current = null;
      state.linkDecision = null;
      render(null);
    },
    /** Rezultat analize je tu: snimi, usporedi ako ima s cime, ili pitaj o povezivanju. */
    onResult(result: unknown, now = Date.now()): void {
      // Nova verzija nasljedjuje skupinu prethodne (i nakon obnove iz sesije); odluka "drugi rad" je mijenja u decide().
      if (state.previous) state.groupId = state.previous.snapshot.documentGroupId;
      state.current = storedRevisionFromResult(result as never, state.groupId, now);
      if (!state.previous) { render(null); void persist(); return; }
      const verdict = state.linkDecision === 'linked' ? 'same' : linkVerdict(state.previous.fingerprint, state.current.fingerprint);
      if (verdict === 'same') {
        compareAndRender();
      } else {
        // Slab ili razlicit identitet: bez potvrde se ne spaja. Snimka se cuva, usporedba ceka odluku.
        render(revisionLinkPromptHtml(verdict, deps.esc));
      }
      void persist();
    },
    /** Brisanje lokalnog rada odnosi i snimke: one zive u istoj sesiji, pa ih `delete` sesije brise; ovdje samo memorija. */
    clear(): void {
      state.current = null;
      state.previous = null;
      state.linkDecision = null;
      render(null);
    },
  };
}
