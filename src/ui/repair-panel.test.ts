import { describe, it, expect, beforeEach } from 'vitest';
import { renderRepairPanel, type RepairableItem } from './repair-panel';

// DOM ponasanje panela (happy-dom): sortiranje/mapiranje checkboxa, podnaslov
// grupe, deep-preklopnik, klik s 0 odabranih. Ne pokrece stvarni applyFixers
// (dinamicki import se ne dosegne dok je 0 odabrano ili dok ne kliknemo download).

function item(over: Partial<RepairableItem>): RepairableItem {
  return { ruleId: 'r', fixerId: 'margins-fixer', label: 'L', params: {}, violated: true, ...over };
}

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const ctxBase = {
  getDocxBytes: async () => new Uint8Array(0),
  originalFileName: 'rad.docx',
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderRepairPanel: grupiranje i checkboxi', () => {
  it('prekrsene su predodabrane, neprekrsene odznacene i iza podnaslova', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [
        item({ ruleId: 'v', label: 'Prekrseno', violated: true }),
        item({ ruleId: 'n', label: 'Uredno', violated: false, fixerId: 'font-fixer' }),
      ],
    });
    const boxes = mountEl.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    // data-idx mapira na ORIGINALNI ctx.items indeks (ne poredak u prikazu).
    const byLabel = (t: string) =>
      Array.from(mountEl.querySelectorAll('.lekta-repair-panel__item')).find((li) => li.textContent?.includes(t))!;
    expect(byLabel('Prekrseno').querySelector('input')!.checked).toBe(true);
    expect(byLabel('Uredno').querySelector('input')!.checked).toBe(false);
    expect(mountEl.querySelector('.lekta-repair-panel__subtitle')?.textContent).toContain('Uskladi i ostalo');
  });

  it('kad NISTA nije prekrseno, podnaslov je pozitivan (ne "i ostalo")', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [item({ ruleId: 'n', label: 'Uredno', violated: false })],
    });
    const sub = mountEl.querySelector('.lekta-repair-panel__subtitle');
    expect(sub?.textContent).toContain('Sve prepoznato je usklađeno');
    expect(sub?.textContent).not.toContain('i ostalo');
  });

  it('data-idx pokazuje na tocan ctx.items element nakon sortiranja', () => {
    const mountEl = mount();
    const items = [
      item({ ruleId: 'n', label: 'Uredno', violated: false, fixerId: 'font-fixer' }), // ide DOLJE
      item({ ruleId: 'v', label: 'Prekrseno', violated: true }), // ide GORE
    ];
    renderRepairPanel({ ...ctxBase, mountEl, items });
    const first = mountEl.querySelector<HTMLInputElement>('.lekta-repair-panel__item input')!;
    // Prvi prikazani je "Prekrseno" (originalni indeks 1).
    expect(Number(first.dataset.idx)).toBe(1);
    expect(items[Number(first.dataset.idx)].ruleId).toBe('v');
  });

  it('deep preklopnik postoji samo kad ima DEEP_CAPABLE stavki', () => {
    const withFont = mount();
    renderRepairPanel({ ...ctxBase, mountEl: withFont, items: [item({ fixerId: 'font-fixer' })] });
    expect(withFont.querySelector('.lekta-repair-panel__deep')).not.toBeNull();

    const marginsOnly = mount();
    renderRepairPanel({ ...ctxBase, mountEl: marginsOnly, items: [item({ fixerId: 'margins-fixer' })] });
    expect(marginsOnly.querySelector('.lekta-repair-panel__deep')).toBeNull();
  });
});

describe('renderRepairPanel: klik s 0 odabranih', () => {
  it('prazan odabir daje poruku umjesto tihog no-opa', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [item({ violated: false })], // odznaceno po defaultu
    });
    const btn = mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!;
    btn.click();
    const summary = mountEl.querySelector<HTMLElement>('.lekta-repair-panel__summary')!;
    expect(summary.hidden).toBe(false);
    expect(summary.textContent).toContain('Odaberi barem jednu stavku');
  });
});
