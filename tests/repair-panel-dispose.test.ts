import { beforeEach, describe, expect, it } from 'vitest';
import { buildRepairPanelHandle, renderRepairPanel, type RepairableItem } from '../src/ui/repair-panel';
import { bindRepairWorkflow } from '../src/ui/repair-workflow-binding';

/**
 * STARI PANEL POSLIJE dispose() NE JAVLJA PROMJENE (korak C6, 2026-09-12).
 *
 * Zasto gard postoji: `renderRepairSection` u app.ts je do C6 radio `mount.innerHTML=''`, sto
 * mice DOM a pretplate ostavlja zive. Cim se odabir pocne pamtiti, stari panel bi kroz zivu
 * pretplatu prepisivao odabir NOVOG panela u sesiji. Kvar nastaje tek u ovom koraku, pa ga
 * dokazuje ovaj korak.
 *
 * Brojac je VLASTITI (broj poziva slusaca), a sentinel trazi da PRIJE dispose bude tocno jedan
 * poziv: inace bi gard prolazio i nad panelom koji uopce nije bio pretplacen.
 */

const item = (ruleId: string, over: Partial<RepairableItem> = {}): RepairableItem =>
  ({ ruleId, fixerId: 'margins-fixer', label: ruleId, params: {}, violated: true, ...over });

const ITEMS = [item('a'), item('b', { violated: false }), item('c')];

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const cb = (root: ParentNode, idx: number) => root.querySelector<HTMLInputElement>(`input[data-idx="${idx}"]`)!;
const promjena = (el: HTMLInputElement) => el.dispatchEvent(new Event('change', { bubbles: true }));

beforeEach(() => { document.body.innerHTML = ''; });

describe('RepairPanelHandle.dispose()', () => {
  it('render, dispose, render, jedna promjena u starom -> 0 poziva; u novom -> tocno 1', () => {
    const mountEl = mount();
    const ctx = { items: ITEMS, getDocxBytes: async () => new Uint8Array(0), originalFileName: 'rad.docx', mountEl };
    const stari = renderRepairPanel(ctx)!;
    const stariList = mountEl.querySelector('.lekta-repair-panel__list')!;
    let pozivaStari = 0;
    stari.onSelectionChange(() => { pozivaStari += 1; });

    // SENTINEL: prije dispose promjena kucice daje TOCNO jedan poziv.
    cb(stariList, 1).checked = true;
    promjena(cb(stariList, 1));
    expect(pozivaStari, 'panel prije dispose mora javljati promjene, inace gard mjeri nepretplacen panel').toBe(1);

    stari.dispose();
    expect(mountEl.querySelector('[data-testid="repair-workflow"]'), 'dispose uklanja panel iz mounta').toBeNull();

    const novi = renderRepairPanel(ctx)!;
    const noviList = mountEl.querySelector('.lekta-repair-panel__list')!;
    let pozivaNovi = 0;
    novi.onSelectionChange(() => { pozivaNovi += 1; });

    // Promjena u STAROJ listi (odvojenoj od DOM-a, ali s vlastitim checkboxovima) ne javlja nista.
    cb(stariList, 2).checked = false;
    promjena(cb(stariList, 2));
    expect(pozivaStari, 'poslije dispose se onSelectionChange NE zove').toBe(1);
    // Ni `applySelection` kroz stari handle ne javlja (binding je odjavljen, slusaci obrisani).
    stari.applySelection(['a']);
    expect(pozivaStari).toBe(1);
    // Odabir novog panela ostaje netaknut: predodabir je [a, c].
    expect(novi.selectedRuleIds()).toEqual(['a', 'c']);
    expect(pozivaNovi).toBe(0);

    cb(noviList, 1).checked = true;
    promjena(cb(noviList, 1));
    expect(pozivaNovi, 'novi panel javlja tocno jednom po promjeni').toBe(1);
    expect(novi.selectedRuleIds()).toEqual(['a', 'b', 'c']);
    // Pretplata nakon dispose je no-op i vraca bezopasnu odjavu.
    expect(typeof stari.onSelectionChange(() => {})).toBe('function');
  });

  it('deep preklopnik: promjena javlja, setDeep vraca true samo kad preklopnik postoji i javlja samo na promjenu', () => {
    const mountEl = mount();
    const withDeep = renderRepairPanel({ items: [item('a', { fixerId: 'font-fixer' })], getDocxBytes: async () => new Uint8Array(0), originalFileName: 'rad.docx', mountEl })!;
    let poziva = 0;
    withDeep.onSelectionChange(() => { poziva += 1; });
    expect(withDeep.deep()).toBe(true); // zadano ukljucen, isto kao buildDefaultRepairRequests
    expect(withDeep.setDeep(true)).toBe(true);
    expect(poziva, 'ista vrijednost nije promjena').toBe(0);
    expect(withDeep.setDeep(false)).toBe(true);
    expect(poziva).toBe(1);
    expect(withDeep.deep()).toBe(false);
    const toggle = mountEl.querySelector<HTMLInputElement>('.lekta-repair-panel__deep input')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(poziva, 'korisnikov klik na preklopnik javlja promjenu').toBe(2);
    withDeep.dispose();
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(poziva, 'poslije dispose preklopnik vise ne javlja').toBe(2);

    // Panel bez DEEP_CAPABLE fixera nema preklopnik: deep() je null, setDeep() false.
    const bez = renderRepairPanel({ items: [item('b')], getDocxBytes: async () => new Uint8Array(0), originalFileName: 'rad.docx', mountEl: mount() })!;
    expect(bez.deep()).toBeNull();
    expect(bez.setDeep(true)).toBe(false);
  });

  it('buildRepairPanelHandle nad golim bindingom: isti ugovor kao kroz renderRepairPanel', () => {
    // Serverski panel u app.ts gradi handle ovim putem; ako se ugovor ovdje slomi, pamcenje je
    // mrtvo bas na putu koji korisnik s repairEndpointom vidi.
    const list = document.createElement('ul');
    ITEMS.forEach((it, idx) => { list.innerHTML += `<li><input type="checkbox" ${it.violated !== false ? 'checked' : ''} data-idx="${idx}"></li>`; });
    const wrap = document.createElement('div');
    wrap.appendChild(list);
    document.body.appendChild(wrap);
    const binding = bindRepairWorkflow({ items: ITEMS, listEl: list, sessionToken: 's', run: async (ids) => ids, verify: async () => ({ ok: true }) });
    const handle = buildRepairPanelHandle(binding, ITEMS, null, wrap);
    let poziva = 0;
    handle.onSelectionChange(() => { poziva += 1; });
    expect(handle.applySelection(['b'])).toBe(1);
    expect(poziva).toBe(1);
    expect(handle.selectedRuleIds()).toEqual(['b']);
    handle.dispose();
    expect(document.body.contains(wrap)).toBe(false);
    cb(list, 0).checked = true;
    promjena(cb(list, 0));
    expect(poziva).toBe(1);
  });
});
