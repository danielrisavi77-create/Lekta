import { beforeEach, describe, expect, it } from 'vitest';
import { bindRepairWorkflow } from '../src/ui/repair-workflow-binding';

/**
 * T08: kontroler toka je JEDINI vlasnik odabira i zivotnog ciklusa; veza ga spaja na skrivenu checkbox listu.
 * Tvrdnje: zadani odabir jednak dosadasnjem DOM defaultu; promjena checkboxa mijenja kontroler; tijekom izvrsenja
 * odabir je zamrznut (checkbox se vraca); odabir iz plana pise u kontroler i odraz; drugi `start` tijekom rada ne
 * poziva servis drugi put; zakasnjeli rezultat stare sesije se odbacuje.
 */
const ITEMS = [
  { ruleId: 'a', violated: true },
  { ruleId: 'b', violated: false },
  { ruleId: 'c', violated: true },
];

let list: HTMLElement;

function lista(): HTMLElement {
  const ul = document.createElement('ul');
  ITEMS.forEach((it, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<label><input type="checkbox" ${it.violated ? 'checked' : ''} data-idx="${idx}" /></label>`;
    ul.appendChild(li);
  });
  document.body.appendChild(ul);
  return ul;
}

const cb = (idx: number) => list.querySelector<HTMLInputElement>(`input[data-idx="${idx}"]`)!;
const promjena = (el: HTMLInputElement) => el.dispatchEvent(new Event('change', { bubbles: true }));

beforeEach(() => {
  document.body.innerHTML = '';
  list = lista();
});

describe('veza kontrolera i liste', () => {
  it('zadani odabir je isti kao DOM default (prekrseno predodabrano)', () => {
    const b = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    expect(b.selectedItems(ITEMS).map((i) => i.ruleId)).toEqual(['a', 'c']);
    expect(b.getState().phase).toBe('ready');
  });

  it('promjena checkboxa mijenja kontroler; ledger koji pise `checked` bez dogadjaja se uskladi pri citanju', () => {
    const b = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    cb(1).checked = true;
    promjena(cb(1));
    expect(b.getState().selection.has('b')).toBe(true);
    cb(0).checked = false; // bez dogadjaja, kao ledger prije T08
    expect(b.selectedItems(ITEMS).map((i) => i.ruleId)).toEqual(['b', 'c']);
  });

  it('tijekom izvrsenja odabir je ZAMRZNUT: checkbox se vraca, servis se zove jednom', async () => {
    let calls = 0;
    let resolveRun: (v: string[]) => void = () => {};
    const b = bindRepairWorkflow<string[]>({
      items: ITEMS, listEl: list, sessionToken: 's1',
      run: (ids) => { calls += 1; return new Promise((r) => { resolveRun = r; void ids; }); },
      verify: async () => ({ ok: true }),
    });
    const p1 = b.controller.start();
    expect(b.getState().phase).toBe('running');
    cb(1).checked = true;
    promjena(cb(1));
    expect(cb(1).checked, 'checkbox se vraca dok popravak traje').toBe(false);
    expect(b.getState().selection.has('b')).toBe(false);
    const p2 = b.controller.start(); // drugi klik dok traje
    resolveRun(['a', 'c']);
    const [s1, s2] = await Promise.all([p1, p2]);
    expect(calls, 'drugi start tijekom rada NE poziva servis').toBe(1);
    expect(s1.phase).toBe('complete');
    expect(s2.phase === 'running' || s2.phase === 'complete').toBe(true);
    expect(s1.result).toEqual(['a', 'c']);
  });

  it('odabir iz plana ide u kontroler i u checkboxove; nepoznat ruleId se ignorira', () => {
    const b = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    expect(b.applySelection(['b', 'nepoznat'])).toBe(1);
    expect(b.selectedItems(ITEMS).map((i) => i.ruleId)).toEqual(['b']);
    expect([cb(0).checked, cb(1).checked, cb(2).checked]).toEqual([false, true, false]);
  });

  it('neuspjela provjera ishoda zavrsava u `failed`, a povratak na plan CUVA odabir', async () => {
    const b = bindRepairWorkflow<string[]>({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: false, error: 'integritet' }) });
    const s = await b.controller.start();
    expect(s.phase).toBe('failed');
    expect(s.lastError).toBe('integritet');
    expect(b.controller.backToPlan()).toBe(true);
    expect(b.selectedItems(ITEMS).map((i) => i.ruleId)).toEqual(['a', 'c']);
  });

  it('nakon `complete` isti posao se ne moze poslati drugi put bez izricitog povratka na plan', async () => {
    let calls = 0;
    const b = bindRepairWorkflow<string[]>({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => { calls += 1; return ids; }, verify: async () => ({ ok: true }) });
    await b.controller.start();
    const again = await b.controller.start();
    expect(again.phase).toBe('complete');
    expect(calls, 'nema drugog poziva servisa iz faze complete').toBe(1);
  });

  it('dispose skida slusac, pa kasnija promjena checkboxa ne dira kontroler', () => {
    const b = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    b.dispose();
    cb(1).checked = true;
    promjena(cb(1));
    expect(b.getState().selection.has('b')).toBe(false);
  });

  /**
   * C6: pretplata na promjenu javlja TOCNO JEDNOM po STVARNOJ promjeni skupa, i NIJEDNOM kad se
   * postavi ista vrijednost. Bez toga bi ledger (koji salje `change` i kad se nista nije promijenilo)
   * i `applySelection` s istim skupom proizvodili zapise u sesiju bez ijedne stvarne promjene.
   */
  it('onSelectionChanged: jednom po stvarnoj promjeni, nijednom za istu vrijednost, nikad poslije dispose', () => {
    const b = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's1', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    let poziva = 0;
    const off = b.onSelectionChanged(() => { poziva += 1; });
    // Ista vrijednost kroz dogadjaj: `a` je vec odabran.
    cb(0).checked = true;
    promjena(cb(0));
    expect(poziva, 'ista vrijednost nije promjena').toBe(0);
    cb(1).checked = true;
    promjena(cb(1));
    expect(poziva).toBe(1);
    // Ista vrijednost kroz plan: skup {a,b,c} je vec postavljen.
    b.applySelection(['a', 'b', 'c']);
    expect(poziva, 'applySelection s istim skupom ne javlja').toBe(1);
    b.applySelection(['a']);
    expect(poziva).toBe(2);
    // Ledger pise `checked` bez dogadjaja; `syncFromList` (kroz selectedItems) javlja jednom.
    cb(2).checked = true;
    b.selectedItems(ITEMS);
    expect(poziva).toBe(3);
    b.selectedItems(ITEMS);
    expect(poziva, 'ponovno citanje bez promjene ne javlja').toBe(3);
    off();
    b.applySelection(['b']);
    expect(poziva, 'odjavljen slusac se ne zove').toBe(3);
    const b2 = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's2', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    let poziva2 = 0;
    b2.onSelectionChanged(() => { poziva2 += 1; });
    b2.dispose();
    b2.applySelection(['b']);
    expect(poziva2, 'poslije dispose se ne javlja ni kroz applySelection').toBe(0);
  });
});
