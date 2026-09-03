import { describe, expect, it } from 'vitest';
import { openWorkspace, persistAcceptedDocument, restoreDocument, afterDocumentAccepted, afterPersist, type StorageAvailability } from '../src/routes/workspace/bootstrap';
import { initialContext } from '../src/routes/workspace/workspace-state';
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

/* ------------------------------------------------------------------------------------- *
 * ZAPIS I OBNOVA
 * ------------------------------------------------------------------------------------- */

/** Najmanji verdikt koji sanitizer prihvaca; `capability: null` je dopusteno stanje. */
const OK_VERDICT = { kind: 'ok', suspicious: false, suspicionReason: null, capability: null, quickStats: null };
const docxFile = () => new File([new Uint8Array([80, 75, 3, 4, 9, 9])], 'rad.docx');

function trackingStore(over: Partial<LocalDocumentSessionStore> = {}) {
  const calls: string[] = [];
  const store: LocalDocumentSessionStore = {
    async put() { calls.push('put'); },
    async get() { return null; },
    async update() { return null as never; },
    async list() { return []; },
    async delete() { calls.push('delete'); },
    async deleteExpired() { return 0; },
    ...over,
  };
  return { store, calls };
}

describe('zapis prihvacenog dokumenta', () => {
  it('BEZ POHRANE se preskace, uz poruku, i to nije greska', async () => {
    const out = await persistAcceptedDocument(docxFile(), OK_VERDICT, unavailable);
    expect(out.kind).toBe('skipped');
    if (out.kind === 'skipped') expect(out.notice).toMatch(/ostaje samo u ovoj kartici/i);
  });

  it('uspjesan zapis vraca id i fragment', async () => {
    const { store } = trackingStore();
    const out = await persistAcceptedDocument(docxFile(), OK_VERDICT, { kind: 'available', store });
    expect(out.kind).toBe('persisted');
    if (out.kind === 'persisted') {
      expect(out.sessionId.length).toBeGreaterThan(10);
      expect(out.fragment).toContain(out.sessionId);
    }
  });

  it('PRETHODNA SESIJA SE BRISE TEK NAKON uspjesnog zapisa nove', async () => {
    // Obrnut redoslijed znaci prozor u kojem stara vise ne postoji a nova jos nije zapisana;
    // prekid u tom trenutku gubi oboje.
    const { store, calls } = trackingStore();
    await persistAcceptedDocument(docxFile(), OK_VERDICT, { kind: 'available', store }, 'stara-sesija');
    expect(calls).toEqual(['put', 'delete']);
  });

  it('neuspjelo brisanje pretecene NE obara zapis koji je upravo uspio', async () => {
    // Zaostala sesija je smece koje istekne samo; izgubljen zapis je izgubljen rad.
    const { store } = trackingStore({ async delete() { throw new Error('nema'); } });
    const out = await persistAcceptedDocument(docxFile(), OK_VERDICT, { kind: 'available', store }, 'stara');
    expect(out.kind).toBe('persisted');
  });

  it('kvar pohrane vraca `failed` s porukom, ne baca', async () => {
    const { store } = trackingStore({ async put() { throw new Error('puna pohrana'); } });
    const out = await persistAcceptedDocument(docxFile(), OK_VERDICT, { kind: 'available', store });
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') expect(out.notice).toMatch(/nije uspjelo spremiti/i);
  });

  it('neispravan verdikt ne stvara sesiju nego uredno pada', async () => {
    const { store, calls } = trackingStore();
    const out = await persistAcceptedDocument(docxFile(), { kind: 'reject' }, { kind: 'available', store });
    expect(out.kind).toBe('failed');
    expect(calls).toEqual([]);
  });
});

describe('obnova dokumenta', () => {
  const session = {
    document: { name: 'rad.docx', type: '', lastModified: 0, bytes: new Uint8Array([1, 2, 3]).buffer },
  } as unknown as Parameters<typeof restoreDocument>[0];

  it('prihvacen dokument znaci obnovljen rad', async () => {
    const out = await restoreDocument(session, async () => ({ kind: 'accepted' }));
    expect(out.kind).toBe('loaded');
  });

  it('SPREMLJEN VERDIKT NIJE DOKAZ: odbijanje pri ponovnom prijemu se postuje', async () => {
    // Granice i pravila su se mogli promijeniti od zapisa. Vjerovati zapisanom verdiktu znacilo
    // bi vratiti dokument koji analizator vise ne prima, i to bez ijedne poruke.
    const out = await restoreDocument(session, async () => ({ kind: 'rejected' }));
    expect(out.kind).toBe('refused');
    if (out.kind === 'refused') expect(out.notice).toMatch(/ne prolazi provjeru/i);
  });

  it('pretecen dokument se takodjer ne racuna kao obnovljen', async () => {
    const out = await restoreDocument(session, async () => ({ kind: 'superseded' }));
    expect(out.kind).toBe('refused');
  });

  it('greska pri ucitavanju ne rusi rutu', async () => {
    const out = await restoreDocument(session, async () => { throw new Error('pukao prijem'); });
    expect(out.kind).toBe('refused');
  });
});


describe('stanje prati stvarne dogadjaje', () => {
  it('PRVI dokument je ponuda, pa se stanje makne s `empty`', () => {
    // Bez ovoga atribut tvrdi `empty` dok dokument postoji, a netko ga procita i povjeruje.
    const out = afterDocumentAccepted(initialContext(false));
    expect(out.state).toBe('sessionReady');
    expect(out.rejected).toBeNull();
  });

  it('SLJEDECI dokument je ZAMJENA, ne ponuda', () => {
    // Iz `profile` stroj ne prihvaca `documentOffered`; kriva rijec znaci ODBIJEN prijelaz i
    // stanje koje ostane na starom, dakle tocno onaj tihi kvar koji ovo popravlja.
    const prvi = afterPersist(afterDocumentAccepted(initialContext(false)), true);
    expect(prvi.state).toBe('profile');
    const drugi = afterDocumentAccepted(prvi);
    expect(drugi.state).toBe('sessionReady');
    expect(drugi.rejected).toBeNull();
  });

  it('zamjena dokumenta ponistava zapis prethodne sesije', () => {
    const prvi = afterPersist(afterDocumentAccepted(initialContext(false)), true);
    expect(prvi.sessionPersisted).toBe(true);
    expect(afterDocumentAccepted(prvi).sessionPersisted).toBe(false);
  });

  it('neuspjeh zapisa vodi dalje, ali bez poveznice', () => {
    const out = afterPersist(afterDocumentAccepted(initialContext(false)), false);
    expect(out.state).toBe('profile');
    expect(out.sessionPersisted).toBe(false);
  });

  it('obnovljena sesija prihvaca dokument bez odbijenog prijelaza', () => {
    // Obnova zavrsi u `sessionReady`, a obnovljen dokument prolazi kroz prijem pa opet stize
    // ovamo. Bez grane za zamjenu, taj prijelaz bi bio odbijen.
    const obnovljen = { ...initialContext(true), state: 'sessionReady' as const };
    const out = afterDocumentAccepted(obnovljen);
    expect(out.rejected).toBeNull();
    expect(out.state).toBe('sessionReady');
  });
});
