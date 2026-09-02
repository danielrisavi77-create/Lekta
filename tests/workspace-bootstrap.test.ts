import { describe, expect, it } from 'vitest';
import { openWorkspace, type StorageAvailability } from '../src/routes/workspace/bootstrap';
import { sessionFragment } from '../src/session/local-document-session';
import type { LocalDocumentSessionStore, LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * OTVARANJE RADNE POVRSINE. Mjere se ugovori, ne sretan tok.
 *
 * Najvazniji je onaj o degradaciji, jer je jedini u kojem sucelje moze LAGATI: kad pohrana ne
 * radi, ponuda poveznice na sesiju znaci da korisnik vjeruje da mu je rad spremljen, a nije.
 * Izostanak poveznice je neugodan; kriva poveznica je gubitak rada.
 */

const ID = '11111111-2222-4333-8444-555555555555';

function storeWith(session: LocalDocumentSessionV1 | null, opts: { throws?: boolean } = {}): LocalDocumentSessionStore {
  const boom = () => { throw new Error('pohrana nedostupna'); };
  return {
    async put() {}, async update() { return session!; }, async list() { return []; },
    async delete() {}, async deleteExpired() { if (opts.throws) boom(); return 0; },
    async get() { if (opts.throws) boom(); return session; },
  };
}
const available = (session: LocalDocumentSessionV1 | null, opts?: { throws?: boolean }): StorageAvailability =>
  ({ kind: 'available', store: storeWith(session, opts) });
const unavailable: StorageAvailability = { kind: 'unavailable', reason: 'test' };

const session = { id: ID } as unknown as LocalDocumentSessionV1;

describe('otvaranje radne povrsine', () => {
  it('bez fragmenta i s pohranom: prazna povrsina, bez poruke', async () => {
    const out = await openWorkspace('', available(null));
    expect(out.context.state).toBe('empty');
    expect(out.notice).toBeNull();
    expect(out.offerLink).toBe(false);
  });

  it('BEZ POHRANE: rad ostaje u kartici, poruka je izricita, poveznice NEMA', async () => {
    const out = await openWorkspace(sessionFragment(ID), unavailable);
    expect(out.offerLink).toBe(false);
    expect(out.notice).toMatch(/ostaje samo u ovoj kartici/i);
    // Stanje je prazno, ne `restoring`: bez pohrane nema sto obnavljati, pa bi `restoring`
    // bilo obecanje koje nitko ne moze ispuniti.
    expect(out.context.state).toBe('empty');
  });

  it('bez pohrane se poveznica ne nudi NI KAD fragment izgleda valjano', async () => {
    // Fragment je korisnikov, ne nas dokaz. Sesija iza njega mozda nikad nije zapisana.
    const out = await openWorkspace(sessionFragment(ID), unavailable);
    expect(out.context.sessionPersisted).toBe(false);
    expect(out.offerLink).toBe(false);
  });

  it('sesija pronadjena: stanje je `sessionReady`', async () => {
    const out = await openWorkspace(sessionFragment(ID), available(session));
    expect(out.context.state).toBe('sessionReady');
    expect(out.notice).toBeNull();
  });

  it('POVEZNICA SE NE NUDI ni kad je sesija pronadjena, jer zapis nije nas', async () => {
    // `sessionPersisted` postaje `true` tek na dogadjaj `sessionPersisted`, koji dolazi iz
    // zapisa koji smo MI napravili. Pronalazak tudjeg zapisa nije isto.
    const out = await openWorkspace(sessionFragment(ID), available(session));
    expect(out.offerLink).toBe(false);
  });

  it('sesija istekla ili obrisana: prazna povrsina uz jasnu poruku, ne greska', async () => {
    const out = await openWorkspace(sessionFragment(ID), available(null));
    expect(out.context.state).toBe('empty');
    expect(out.notice).toMatch(/nije dostupan|istekla/i);
  });

  it('KVAR POHRANE ne rusi rutu nego degradira, uz poruku', async () => {
    const out = await openWorkspace(sessionFragment(ID), available(session, { throws: true }));
    expect(out.context.state).toBe('empty');
    expect(out.notice).toBeTruthy();
    expect(out.offerLink).toBe(false);
  });

  it('neispravan fragment se ne tumaci kao sesija', async () => {
    for (const bad of ['#session=nije-uuid', '#nesto-drugo', '#session=', '']) {
      const out = await openWorkspace(bad, available(session));
      expect(out.context.state, `fragment ${bad}`).toBe('empty');
    }
  });

  it('istekle sesije se BRISU prije dohvata, ne poslije', async () => {
    // Redoslijed je ugovor: dohvat prije ciscenja mogao bi vratiti sesiju stariju od roka.
    const calls: string[] = [];
    const store: LocalDocumentSessionStore = {
      ...storeWith(session),
      async deleteExpired() { calls.push('deleteExpired'); return 0; },
      async get() { calls.push('get'); return session; },
    };
    await openWorkspace(sessionFragment(ID), { kind: 'available', store });
    expect(calls).toEqual(['deleteExpired', 'get']);
  });
});
