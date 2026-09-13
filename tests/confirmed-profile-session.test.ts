import { describe, expect, it } from 'vitest';
import {
  createConfirmedProfile, NOTICE_PROFILE_CONFLICT, NOTICE_PROFILE_NOT_SAVED,
} from '../src/routes/workspace/confirmed-profile';
import { emitProfileConfirmed, subscribeProfileConfirmed, type ProfileConfirmed } from '../src/ui/profile-confirmed-events';
import type { LocalDocumentSessionStore, LocalDocumentSessionUpdate, LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * POTVRDJENI PROFIL SE PAMTI UZ SESIJU (korak C4, 2026-09-12).
 *
 * Gard mjeri MEHANIZAM vlastitim brojacima, ne nizvodnim ucinkom: da potvrda stigne do modula
 * (`confirmations`), da je modul preda pisacu (`writes`), da pisac napravi tocno jedan `update` u
 * polje `profile` (brojac lazne pohrane), i da se "spremljeno" tvrdi SAMO na `written`.
 */

const ID = 'e2b0c7a4-1111-4222-8333-444455556666';

const IDS = {
  institution: 'unizg', unit: 'fpzg', program: 'Politologija', workType: 'graduate',
  variant: 'default', department: 'general', methodology: 'auto', citation: 'apa7',
};

function potvrda(over: Partial<ProfileConfirmed> = {}): ProfileConfirmed {
  return { profileDefinitionId: 'fpzg-politologija-diplomski', selectionIds: { ...IDS }, confirmedAt: 1_000, ...over };
}

/** Lazna pohrana s brojacima; `fail` podmece kod greske na SVAKI `update`. */
function fakeStore(fail?: string) {
  let revision = 0;
  const updates: LocalDocumentSessionUpdate[] = [];
  let profile: unknown = undefined;
  const store = {
    brojaci: { update: 0 },
    updates,
    profil: () => profile,
    async update(_id: string, update: LocalDocumentSessionUpdate) {
      store.brojaci.update += 1;
      if (fail) throw Object.assign(new Error(fail), { code: fail });
      updates.push(update);
      if (update.profile !== undefined) profile = update.profile;
      revision += 1;
      return { revision, profile } as unknown as LocalDocumentSessionV1;
    },
    async get() { return { revision, profile } as unknown as LocalDocumentSessionV1; },
  };
  return store;
}

function rucniTajmeri() {
  const zakazano: Array<() => void> = [];
  return {
    setTimeoutImpl: (fn: () => void) => { zakazano.push(fn); return zakazano.length; },
    clearTimeoutImpl: (h: unknown) => { zakazano[(h as number) - 1] = () => {}; },
  };
}

function modul(store: ReturnType<typeof fakeStore> | null, sessionId: () => string | null = () => ID) {
  const statusi: Array<string | null> = [];
  const events: string[] = [];
  const p = createConfirmedProfile({
    store: () => store as unknown as LocalDocumentSessionStore | null,
    sessionId,
    apply: () => 'fpzg-politologija-diplomski',
    status: (t) => statusi.push(t),
    track: (e) => events.push(e),
    now: () => 5_000,
    ...rucniTajmeri(),
  });
  return { p, statusi, events };
}

describe('potvrdjeni profil: zapis uz sesiju', () => {
  it('CIST BASELINE: potvrda kroz dogadjaj daje TOCNO JEDAN zapis u polje profile, i tek tada claimedSaved', async () => {
    const store = fakeStore();
    const { p, events } = modul(store);
    const off = subscribeProfileConfirmed((e) => p.onConfirmed(e));
    try {
      emitProfileConfirmed(potvrda());
    } finally { off(); }

    // SENTINEL: prazna populacija nije prolaz. Da emisija nije stigla do modula, sve tvrdnje ispod
    // bile bi tvrdnje o nicemu.
    expect(p.state.confirmations, 'prazna populacija nije prolaz: nijedna potvrda nije stigla do modula').toBeGreaterThan(0);

    // PRIJE flusha: snimka je vec predana pisacu (a ne ostavljena da ceka), ali se jos ne tvrdi
    // spremljeno. `flush()` bi cekajucu snimku sam predao, pa bi tvrdnja poslije njega bila slijepa
    // na potvrdu koja nikad ne stigne do pisaca.
    expect(p.state.writes, 'potvrda mora biti predana pisacu odmah, ne ostavljena u memoriji').toBe(1);
    expect(p.state.pending).toBeNull();
    expect(p.state.claimedSaved, 'prije flusha se NE tvrdi spremljeno').toBe(false);
    const out = await p.flush();
    expect(out?.kind).toBe('written');
    expect(p.state.writes).toBe(1);
    expect(store.brojaci.update, 'vlastiti brojac pohrane: tocno jedan update').toBe(1);
    expect(store.updates[0], 'patch nosi SAMO profile, nikad workspace').toEqual({
      profile: { profileDefinitionId: 'fpzg-politologija-diplomski', selectionIds: IDS, confirmedAt: 1_000 },
    });
    expect(Object.keys(store.updates[0])).toEqual(['profile']);
    expect(Object.keys((store.profil() as { selectionIds: object }).selectionIds)).toHaveLength(8);
    expect(p.state.claimedSaved).toBe(true);
    expect(events).toContain('session_profile_written');
  });

  it('dvije potvrde zaredom daju jedan zapis s NOVIJOM (koalescencija + veci confirmedAt)', async () => {
    const store = fakeStore();
    const { p } = modul(store);
    p.onConfirmed(potvrda({ confirmedAt: 1_000, profileDefinitionId: 'a' }));
    p.onConfirmed(potvrda({ confirmedAt: 2_000, profileDefinitionId: 'b' }));
    await p.flush();
    expect(store.brojaci.update).toBe(1);
    expect((store.profil() as { profileDefinitionId: string }).profileDefinitionId).toBe('b');
  });

  it('conflict i quota NE daju claimedSaved, i javljaju postenu poruku', async () => {
    for (const [kod, poruka] of [['quota', NOTICE_PROFILE_NOT_SAVED], ['conflict', NOTICE_PROFILE_CONFLICT]] as const) {
      const store = fakeStore(kod);
      const { p, statusi } = modul(store);
      p.onConfirmed(potvrda());
      const out = await p.flush();
      expect(out?.kind, kod).toBe(kod);
      expect(p.state.claimedSaved, `${kod} ne smije tvrditi spremljeno`).toBe(false);
      expect(statusi.at(-1), kod).toBe(poruka);
    }
  });

  it('bez sessionId snimka CEKA u memoriji bez tvrdnje, a flush je preda cim adresa postoji', async () => {
    const store = fakeStore();
    let id: string | null = null;
    const { p } = modul(store, () => id);
    p.onConfirmed(potvrda());
    expect(p.state.pending).not.toBeNull();
    expect(p.state.writes).toBe(0);
    expect(p.state.claimedSaved).toBe(false);

    id = ID;
    const out = await p.flush();
    expect(out?.kind).toBe('written');
    expect(p.state.pending).toBeNull();
    expect(store.brojaci.update).toBe(1);
  });

  it('bez pohrane se nista ne ceka i nista ne obecava', async () => {
    const { p } = modul(null);
    p.onConfirmed(potvrda());
    expect(p.state.pending).toBeNull();
    expect(p.state.writes).toBe(0);
    expect(await p.flush()).toBeNull();
    expect(p.state.claimedSaved).toBe(false);
  });

  it('potvrda bez verificiranog profila se broji kao nezapisiva, ne skriva', async () => {
    const store = fakeStore();
    const { p } = modul(store);
    p.onConfirmed(potvrda({ profileDefinitionId: null }));
    await p.flush();
    expect(p.state.unwritable).toBe(1);
    expect(store.brojaci.update).toBe(0);
  });

  it('pisac se mijenja kad se sessionId promijeni (nova datoteka = nova sesija)', async () => {
    const store = fakeStore();
    let id: string | null = ID;
    const { p } = modul(store, () => id);
    p.onConfirmed(potvrda());
    await p.flush();
    id = 'f3c1d8b5-2222-4333-9444-555566667777';
    p.onConfirmed(potvrda({ confirmedAt: 3_000 }));
    await p.flush();
    expect(store.brojaci.update).toBe(2);
    expect(p.state.writes).toBe(2);
  });

  /**
   * Baseline garda (mehanizam/potvrda-bez-zapisa): jedna potvrda kroz stvarni modul daje TOCNO jedan
   * zapis, pa `onConfirmed` koji snimku samo zabiljezi u memoriju i ne preda je pisacu ovdje pada
   * na `writes === 0`. Stvarna mutacija ovog garda izvodi se na izvoru i dokumentirana je u commit
   * poruci, ne u ovom testu.
   */
  it('baseline: isti ulaz kroz stvarni modul daje tocno jedan zapis', async () => {
    const store = fakeStore();
    const { p } = modul(store);
    p.onConfirmed(potvrda());
    expect(p.state.writes, 'stvarni modul predaje pisacu').toBe(1);
  });
});
