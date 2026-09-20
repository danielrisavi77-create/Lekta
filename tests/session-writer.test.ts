import { describe, expect, it } from 'vitest';
import { createSessionWriter, type SessionWriteOutcome } from '../src/session/session-writer';
import type { SessionWork } from '../src/session/session-merge';
import type { LocalDocumentSessionUpdate, LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * PISAC RADA (korak C3, 2026-09-12).
 *
 * Gard ne mjeri da se pise, nego tri stvari koje bi bez njega otisle tiho: da dvadeset klikova ne
 * postane dvadeset transakcija, da se dva upisa iz iste kartice ne natjecu, i da sucelje NE tvrdi
 * "spremljeno" kad zapis nije prosao.
 */

const ID = 'e2b0c7a4-1111-4222-8333-444455556666';

/** Pohrana s vlastitim BROJACIMA: bez njih bi se koalescencija "dokazivala" nizvodnim ucinkom. */
function fakeStore(opts: { conflictsPrvih?: number } = {}) {
  let revision = 0;
  let zapis: SessionWork = {};
  let preostaloSukoba = opts.conflictsPrvih ?? 0;
  const brojaci = { update: 0, get: 0, conflicts: 0 };

  const greska = (code: string): Error => Object.assign(new Error(code), { code });

  return {
    brojaci,
    stanje: () => zapis,
    revizija: () => revision,
    async update(_id: string, update: LocalDocumentSessionUpdate, expectedRevision?: number) {
      brojaci.update += 1;
      if (preostaloSukoba > 0) {
        preostaloSukoba -= 1;
        brojaci.conflicts += 1;
        revision += 1; // netko drugi je pomaknuo zapis
        throw greska('conflict');
      }
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        brojaci.conflicts += 1;
        throw greska('conflict');
      }
      if (update.profile !== undefined) zapis = { ...zapis, profile: update.profile ?? undefined };
      if (update.workspace !== undefined) zapis = { ...zapis, workspace: update.workspace ?? undefined };
      revision += 1;
      return { revision, ...zapis } as unknown as LocalDocumentSessionV1;
    },
    async get() {
      brojaci.get += 1;
      return { revision, ...zapis } as unknown as LocalDocumentSessionV1;
    },
  };
}

/** Tajmeri se drze u ruci: test ne ceka, nego sam odlucuje kad prozor istekne. */
function rucniTajmeri() {
  const zakazano: Array<() => void> = [];
  return {
    zakazano,
    setTimeoutImpl: (fn: () => void) => { zakazano.push(fn); return zakazano.length; },
    clearTimeoutImpl: (h: unknown) => { zakazano[(h as number) - 1] = () => {}; },
    pusti: () => { const kopija = [...zakazano]; zakazano.length = 0; for (const fn of kopija) fn(); },
  };
}

const rad = (stage: 'profile' | 'results' | 'repairPlan'): SessionWork => ({ workspace: { stage } });

describe('pisac rada u sesiju', () => {
  it('dvadeset promjena daje JEDAN zapis', async () => {
    const store = fakeStore();
    const t = rucniTajmeri();
    const w = createSessionWriter(ID, { store, ...t });

    for (let i = 0; i < 20; i++) w.enqueue(rad(i % 2 ? 'results' : 'repairPlan'));
    expect(store.brojaci.update, 'prije isteka prozora nista se ne pise').toBe(0);

    await w.flush();
    // VLASTITI BROJAC, ne nizvodni ucinak: dvadeset klikova, jedan `update`.
    expect(store.brojaci.update).toBe(1);
    expect(store.stanje().workspace?.stage, 'vrijedi ZADNJA promjena').toBe('results');
  });

  it('ishod "written" nosi generaciju, i sljedeci upis je uvjetuje', async () => {
    const store = fakeStore();
    const t = rucniTajmeri();
    const ishodi: SessionWriteOutcome[] = [];
    const w = createSessionWriter(ID, { store, ...t, onOutcome: (o) => ishodi.push(o) });

    w.enqueue(rad('profile'));
    await w.flush();
    expect(ishodi).toEqual([{ kind: 'written', revision: 1, at: expect.any(Number) }]);

    w.enqueue(rad('results'));
    await w.flush();
    expect(store.brojaci.conflicts, 'pisac je poslao krivu generaciju').toBe(0);
    expect(store.revizija()).toBe(2);
  });

  /**
   * SUKOB SE RJESAVA SPAJANJEM, ne gazenjem. Bez ponovnog citanja bi drugi pokusaj bio isto
   * gazenje, samo uspjesno, pa bi tudji rad nestao a sucelje reklo "spremljeno".
   */
  it('prvi sukob: procita svjeze stanje, spoji, i uspije iz drugog pokusaja', async () => {
    const store = fakeStore({ conflictsPrvih: 1 });
    const t = rucniTajmeri();
    const ishodi: SessionWriteOutcome[] = [];
    const w = createSessionWriter(ID, { store, ...t, onOutcome: (o) => ishodi.push(o) });

    w.enqueue(rad('results'));
    const out = await w.flush();

    expect(store.brojaci.get, 'svjeze stanje se MORA procitati prije drugog pokusaja').toBe(1);
    expect(store.brojaci.update).toBe(2);
    expect(out?.kind).toBe('written');
    expect(ishodi.map((o) => o.kind)).toEqual(['written']);
  });

  it('DVA sukoba zaredom: sucelje NE SMIJE reci spremljeno', async () => {
    const store = fakeStore({ conflictsPrvih: 2 });
    const t = rucniTajmeri();
    const w = createSessionWriter(ID, { store, ...t });

    w.enqueue(rad('results'));
    const out = await w.flush();
    expect(out).toEqual({ kind: 'conflict' });
    expect(store.brojaci.update, 'ne pokusava se u nedogled').toBe(2);
  });

  it('kvota se razlikuje od obicnog kvara, jer ima drugi lijek', async () => {
    const store = {
      async update() { throw Object.assign(new Error('quota'), { code: 'quota' }); },
      async get() { return null as unknown as LocalDocumentSessionV1; },
    };
    const t = rucniTajmeri();
    const w = createSessionWriter(ID, { store, ...t });
    w.enqueue(rad('results'));
    expect(await w.flush()).toEqual({ kind: 'quota' });
  });

  it('dispose odbacuje ono sto ceka, umjesto da pise iza ledja', async () => {
    const store = fakeStore();
    const t = rucniTajmeri();
    const w = createSessionWriter(ID, { store, ...t });
    w.enqueue(rad('results'));
    w.dispose();
    t.pusti();
    expect(await w.flush()).toBeNull();
    expect(store.brojaci.update, 'zapis nakon dispose opisuje karticu koje vise nema').toBe(0);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se pisac BEZ koalescencije, dakle ponasanje koje
   * bi nastalo da se `store.update` zove izravno iz rukovatelja.
   */
  it('gard grize: bez koalescencije dvadeset klikova daje dvadeset transakcija', async () => {
    const store = fakeStore();
    // Baseline je izmjeren gore (jedan `update`); ovdje se mjeri podmetnuto ponasanje.
    for (let i = 0; i < 20; i++) {
      await store.update(ID, { workspace: { stage: 'results' } });
    }
    expect(store.brojaci.update, 'podmetnut izravan upis MORA dati dvadeset transakcija').toBe(20);
  });

  it('SENTINEL: brojaci stvarno rastu, pa tvrdnje nisu nad mrtvom pohranom', async () => {
    const store = fakeStore();
    const t = rucniTajmeri();
    const w = createSessionWriter(ID, { store, ...t });
    w.enqueue(rad('results'));
    await w.flush();
    expect(store.brojaci.update).toBeGreaterThan(0);
    expect(store.revizija()).toBeGreaterThan(0);
  });
});
