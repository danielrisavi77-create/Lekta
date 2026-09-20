import { describe, expect, it } from 'vitest';
import {
  createRepairSelectionMemory, NOTICE_SELECTION_ADVANCED, NOTICE_SELECTION_CONFLICT,
  NOTICE_SELECTION_DISCARDED, NOTICE_SELECTION_NOT_SAVED,
} from '../src/routes/workspace/repair-selection';
import { emitRepairPanelReady, subscribeRepairPanelReady, type RepairPanelReady } from '../src/ui/analyzer-document-events';
import type { RepairPanelHandle, RepairableItem } from '../src/ui/repair-panel';
import { buildRepairSelectionSnapshot, repairItemsDigest } from '../src/ui/repair-selection';
import type { LocalDocumentSessionStore, LocalDocumentSessionUpdate, LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * ODABIR POPRAVAKA SE PAMTI UZ SESIJU I VRACA PO OTISKU (korak C6, 2026-09-12).
 *
 * Gard mjeri MEHANIZAM vlastitim brojacima: da panel stigne do modula (`panels`), da promjena
 * stigne kroz handle (`changes`), da je modul preda pisacu (`writes`), da pisac napravi tocno
 * jedan `update` u `workspace.repairSelection` (brojac lazne pohrane), da se "spremljeno" tvrdi
 * SAMO na `written`, i da se obnova vraca SAMO uz isti otisak, PRIJE pretplate (obnova ne pise).
 */

const ID = 'e2b0c7a4-1111-4222-8333-444455556666';

const item = (ruleId: string, fixerId = 'margins-fixer', over: Partial<RepairableItem> = {}): RepairableItem =>
  ({ ruleId, fixerId, label: ruleId, params: {}, violated: true, ...over });
const ITEMS = [item('a', 'font-fixer'), item('b', 'margins-fixer', { violated: false }), item('c', 'toc-field-fixer')];

/** Lazni handle s vlastitim brojacima; odabir je skup ruleId-eva, deep je preklopnik. */
function fakeHandle(preselected: string[] = ['a', 'c'], hasDeep = true) {
  const sel = new Set(preselected);
  let deep: boolean | null = hasDeep ? true : null;
  const listeners = new Set<() => void>();
  const h: RepairPanelHandle & { brojaci: { applySelection: number; setDeep: number }; promijeni: (id: string, on: boolean) => void; disposed: boolean } = {
    brojaci: { applySelection: 0, setDeep: 0 },
    disposed: false,
    applySelection(ids) { h.brojaci.applySelection += 1; sel.clear(); let n = 0; for (const id of ids) if (ITEMS.some((i) => i.ruleId === id)) { sel.add(id); n += 1; } for (const cb of listeners) cb(); return n; },
    selectedRuleIds: () => ITEMS.map((i) => i.ruleId).filter((id) => sel.has(id)),
    phase: () => 'ready',
    onSelectionChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    deep: () => deep,
    setDeep(v) { h.brojaci.setDeep += 1; if (deep === null) return false; if (deep !== v) { deep = v; for (const cb of listeners) cb(); } return true; },
    dispose() { h.disposed = true; listeners.clear(); },
    promijeni(id, on) { if (on) sel.add(id); else sel.delete(id); for (const cb of listeners) cb(); },
  };
  return h;
}

function fakeStore(fail?: string) {
  let revision = 0;
  const updates: LocalDocumentSessionUpdate[] = [];
  let workspace: unknown = undefined;
  const store = {
    brojaci: { update: 0 },
    updates,
    workspace: () => workspace,
    async update(_id: string, update: LocalDocumentSessionUpdate) {
      store.brojaci.update += 1;
      if (fail) throw Object.assign(new Error(fail), { code: fail });
      updates.push(update);
      if (update.workspace !== undefined) workspace = update.workspace;
      revision += 1;
      return { revision, workspace } as unknown as LocalDocumentSessionV1;
    },
    async get() { return { revision, workspace } as unknown as LocalDocumentSessionV1; },
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

function modul(store: ReturnType<typeof fakeStore> | null, sessionId: () => string | null = () => ID, isAdvanced?: (i: RepairableItem) => boolean) {
  const statusi: Array<string | null> = [];
  const events: Array<{ e: string; d?: Record<string, unknown> }> = [];
  const m = createRepairSelectionMemory({
    store: () => store as unknown as LocalDocumentSessionStore | null,
    sessionId,
    status: (t) => statusi.push(t),
    track: (e, d) => events.push({ e, d }),
    now: () => 5_000,
    isAdvanced: isAdvanced ?? (() => false),
    ...rucniTajmeri(),
  });
  return { m, statusi, events };
}

describe('odabir popravaka: zapis uz sesiju', () => {
  it('CIST BASELINE: panel kroz dogadjaj, jedna promjena -> TOCNO JEDAN zapis u workspace.repairSelection, i tek tada claimedSaved', async () => {
    const store = fakeStore();
    const { m, events } = modul(store);
    const handle = fakeHandle();
    const off = subscribeRepairPanelReady((e: RepairPanelReady) => m.onPanel(e));
    try { emitRepairPanelReady({ handle, items: ITEMS }); } finally { off(); }

    // SENTINEL: prazna populacija nije prolaz.
    expect(m.state.panels, 'nijedan panel nije stigao do modula').toBeGreaterThan(0);
    // Pretplata sama po sebi NE pise: bez promjene nema zapisa.
    expect(m.state.writes).toBe(0);

    handle.promijeni('b', true);
    expect(m.state.changes).toBe(1);
    expect(m.state.writes, 'promjena mora biti predana pisacu odmah').toBe(1);
    expect(m.state.claimedSaved, 'prije flusha se NE tvrdi spremljeno').toBe(false);
    const out = await m.flush();
    expect(out?.kind).toBe('written');
    expect(store.brojaci.update, 'vlastiti brojac pohrane: tocno jedan update').toBe(1);
    expect(store.updates[0]).toEqual({
      workspace: {
        stage: 'repairPlan',
        repairSelection: {
          schemaVersion: 1,
          itemsDigest: repairItemsDigest(ITEMS),
          selected: ['font-fixer|a', 'margins-fixer|b', 'toc-field-fixer|c'],
          deep: true,
          updatedAt: 5_000,
        },
      },
    });
    expect(Object.keys(store.updates[0])).toEqual(['workspace']);
    expect(m.state.claimedSaved).toBe(true);
    expect(events.map((x) => x.e)).toContain('session_repair_selection_written');
  });

  it('vise promjena zaredom daje JEDAN zapis sa zadnjim stanjem (koalescencija)', async () => {
    const store = fakeStore();
    const { m } = modul(store);
    const handle = fakeHandle();
    m.onPanel({ handle, items: ITEMS });
    handle.promijeni('a', false);
    handle.promijeni('b', true);
    handle.setDeep(false);
    expect(m.state.changes).toBe(3);
    await m.flush();
    expect(store.brojaci.update).toBe(1);
    const zapis = (store.workspace() as { repairSelection: { selected: string[]; deep: boolean } }).repairSelection;
    expect(zapis.selected).toEqual(['margins-fixer|b', 'toc-field-fixer|c']);
    expect(zapis.deep).toBe(false);
  });

  it('conflict i quota NE daju claimedSaved, i javljaju postenu poruku', async () => {
    for (const [kod, poruka] of [['quota', NOTICE_SELECTION_NOT_SAVED], ['conflict', NOTICE_SELECTION_CONFLICT]] as const) {
      const store = fakeStore(kod);
      const { m, statusi } = modul(store);
      const handle = fakeHandle();
      m.onPanel({ handle, items: ITEMS });
      handle.promijeni('b', true);
      const out = await m.flush();
      expect(out?.kind, kod).toBe(kod);
      expect(m.state.claimedSaved, `${kod} ne smije tvrditi spremljeno`).toBe(false);
      expect(statusi.at(-1), kod).toBe(poruka);
    }
  });

  it('bez pohrane ili bez sessionId se nista ne obecava (writes 0), a promjene se broje', async () => {
    const { m } = modul(null);
    const handle = fakeHandle();
    m.onPanel({ handle, items: ITEMS });
    handle.promijeni('b', true);
    expect(m.state.changes).toBe(1);
    expect(m.state.writes).toBe(0);
    expect(await m.flush()).toBeNull();
    expect(m.state.claimedSaved).toBe(false);

    const store = fakeStore();
    const bezId = modul(store, () => null);
    const h2 = fakeHandle();
    bezId.m.onPanel({ handle: h2, items: ITEMS });
    h2.promijeni('b', true);
    expect(bezId.m.state.writes).toBe(0);
    expect(store.brojaci.update).toBe(0);
  });

  it('novi panel odjavljuje stari: promjena kroz stari handle vise ne pise', async () => {
    const store = fakeStore();
    const { m } = modul(store);
    const stari = fakeHandle();
    m.onPanel({ handle: stari, items: ITEMS });
    const novi = fakeHandle();
    m.onPanel({ handle: novi, items: ITEMS });
    stari.promijeni('b', true);
    expect(m.state.changes, 'stari panel ne smije javljati u modul nakon zamjene').toBe(0);
    novi.promijeni('b', true);
    expect(m.state.changes).toBe(1);
  });
});

describe('odabir popravaka: obnova po otisku', () => {
  const snimka = (items: RepairableItem[], keys: string[], deep = false) =>
    buildRepairSelectionSnapshot({ items, keys, deep, now: 1 })!;

  it('isti otisak: odabir i deep se vracaju kroz handle PRIJE pretplate (obnova ne pise)', async () => {
    const store = fakeStore();
    const { m, statusi, events } = modul(store);
    m.restore(snimka(ITEMS, ['margins-fixer|b'], false));
    expect(m.state.pendingRestore).not.toBeNull();
    const handle = fakeHandle(['a', 'c'], true);
    m.onPanel({ handle, items: [ITEMS[2], ITEMS[0], ITEMS[1]] }); // preslagan isti skup
    expect(m.state.restored).toBe('applied');
    expect(m.state.lastRestore).toMatchObject({ applied: 1, skippedUnknown: 0, advancedNeedsReview: 0, rejected: null });
    expect(handle.brojaci.applySelection).toBe(1);
    expect(handle.selectedRuleIds()).toEqual(['b']);
    expect(handle.deep()).toBe(false);
    expect(m.state.pendingRestore, 'snimka se trosi na PRVOM panelu').toBeNull();
    expect(m.state.changes, 'obnova NIJE promjena i ne smije pisati').toBe(0);
    expect(m.state.writes).toBe(0);
    expect(statusi).toEqual([]);
    expect(events.at(-1)).toEqual({ e: 'session_repair_selection_restored', d: { outcome: 'applied', applied: 1, advanced: 0 } });
    // Nakon obnove korisnikova promjena normalno pise.
    handle.promijeni('a', true);
    expect(m.state.writes).toBe(1);
  });

  it('drugi otisak: odabir se ODBACUJE, nista se ne preslikava, i korisniku se KAZE', () => {
    const store = fakeStore();
    const { m, statusi } = modul(store);
    m.restore(snimka(ITEMS, ['margins-fixer|b']));
    const handle = fakeHandle(['a', 'c']);
    m.onPanel({ handle, items: [ITEMS[0], ITEMS[1]] }); // ponuda bez `c`
    expect(m.state.restored).toBe('digest-mismatch');
    expect(m.state.lastRestore?.applied).toBe(0);
    expect(handle.brojaci.applySelection, 'uz nesuglasje otiska se applySelection NE zove').toBe(0);
    expect(handle.selectedRuleIds(), 'predodabir ostaje').toEqual(['a', 'c']);
    expect(statusi).toEqual([NOTICE_SELECTION_DISCARDED]);
  });

  it('napredne forme: vracaju se NEOZNACENE i panel to kaze jednom recenicom, iz brojaca', () => {
    const { m, statusi } = modul(fakeStore(), () => ID, (i) => i.ruleId === 'c');
    m.restore(snimka(ITEMS, ['font-fixer|a', 'toc-field-fixer|c']));
    const handle = fakeHandle(['a', 'c']);
    m.onPanel({ handle, items: ITEMS });
    expect(m.state.restored).toBe('applied');
    expect(m.state.lastRestore).toMatchObject({ applied: 1, advancedNeedsReview: 1 });
    expect(handle.selectedRuleIds()).toEqual(['a']);
    expect(statusi).toEqual([NOTICE_SELECTION_ADVANCED]);
    // Bez naprednih stavki u snimci napomena se NE ispisuje.
    const cist = modul(fakeStore(), () => ID, (i) => i.ruleId === 'c');
    cist.m.restore(snimka(ITEMS, ['font-fixer|a']));
    cist.m.onPanel({ handle: fakeHandle(), items: ITEMS });
    expect(cist.statusi).toEqual([]);
  });

  it('forget() prije panela odbacuje snimku (drugi dokument, odbijena obnova), a bez snimke je restored none', () => {
    const { m, statusi } = modul(fakeStore());
    m.restore(snimka(ITEMS, ['margins-fixer|b']));
    m.forget();
    const handle = fakeHandle(['a', 'c']);
    m.onPanel({ handle, items: ITEMS });
    expect(m.state.restored).toBe('none');
    expect(handle.brojaci.applySelection).toBe(0);
    expect(statusi).toEqual([]);
    const bez = modul(fakeStore());
    bez.m.restore(undefined);
    bez.m.onPanel({ handle: fakeHandle(), items: ITEMS });
    expect(bez.m.state.restored).toBe('none');
  });

  /**
   * Baseline garda (odabir/otisak-ne-grize i odabir/mrtav-kljuc-po-polozaju): stvarni modul
   * presudjuje po otisku i po kljucu. Mutacije na izvoru izvedene su rucno i dokumentirane u
   * commit poruci; ovdje stoji cist baseline da gard ne moze prolaziti vakuumski.
   */
  it('baseline: isti skup u drugom poretku daje applied, drugi skup iste duljine daje digest-mismatch', () => {
    const drugi = [ITEMS[0], ITEMS[1], item('d', 'toc-field-fixer')];
    const a = modul(fakeStore());
    a.m.restore(snimka(ITEMS, ['margins-fixer|b']));
    a.m.onPanel({ handle: fakeHandle(), items: [...ITEMS].reverse() });
    expect(a.m.state.restored).toBe('applied');
    const b = modul(fakeStore());
    b.m.restore(snimka(ITEMS, ['margins-fixer|b']));
    b.m.onPanel({ handle: fakeHandle(), items: drugi });
    expect(b.m.state.restored).toBe('digest-mismatch');
  });
});
