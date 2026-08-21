/**
 * Ziva procjena ocjene u ledgeru ("Nakon odabranih popravaka: 84 -> do 97 (procjena).").
 *
 * Ugovor: redak postoji SAMO kad pozivatelj da estimateFor i kad procjena pokazuje dobitak;
 * azurira se na svaki klik retka i povlacenje klizaca (renderAll), i na vanjski refresh
 * (refreshHandle, npr. dubinski preklopnik). Copy je "do ... (procjena)" + "potvrdjuje ponovna
 * provjera" - nikad "najmanje" (v1: model flipa samo dobitke, regresije ne modelira).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderRepairLedgerModal, type PriceSliderItem, type ScoreEstimate } from '../src/ui/repair-price-slider';

interface TestItem extends PriceSliderItem { requiresConfirmation?: boolean }

function mountList(items: TestItem[]): HTMLElement {
  const list = document.createElement('ul');
  items.forEach((_, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" data-idx="${i}" checked />`;
    list.appendChild(li);
  });
  document.body.appendChild(list);
  return list;
}

const item = (label: string): TestItem => ({ fixerId: 'font-fixer', ruleId: `r-${label}`, label }) as TestItem;

function openLedger(opts: {
  items: TestItem[];
  estimateFor?: (selected: TestItem[]) => ScoreEstimate | null;
  refreshHandle?: { refresh?: () => void };
}): HTMLElement {
  const listEl = mountList(opts.items);
  const trigger = renderRepairLedgerModal({ items: opts.items, listEl, estimateFor: opts.estimateFor, refreshHandle: opts.refreshHandle });
  document.body.appendChild(trigger);
  trigger.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!.click();
  return document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;
}

const rowOf = (ledger: HTMLElement) => ledger.querySelector<HTMLElement>('.lekta-repair-ledger-estimate')!;

beforeEach(() => { document.body.innerHTML = ''; });

describe('ledger: redak zive procjene', () => {
  it('renderira "do N (procjena)" + recenicu o ponovnoj provjeri; bez rijeci "najmanje"', () => {
    const ledger = openLedger({ items: [item('Font')], estimateFor: () => ({ current: 84, optimistic: 97 }) });
    const row = rowOf(ledger);
    expect(row.hidden).toBe(false);
    expect(row.textContent).toContain('Nakon odabranih popravaka: 84 → do 97 (procjena).');
    expect(row.textContent).toContain('Konačnu ocjenu potvrđuje ponovna provjera.');
    expect(row.textContent).not.toContain('najmanje');
  });

  it('azurira se na klik retka (odabir se mijenja -> estimateFor dobiva novi skup)', () => {
    const est = (selected: TestItem[]): ScoreEstimate => ({ current: 84, optimistic: 84 + selected.length * 5 });
    const ledger = openLedger({ items: [item('Font'), item('Margine')], estimateFor: est });
    expect(rowOf(ledger).textContent).toContain('do 94');
    ledger.querySelector<HTMLButtonElement>('.lekta-repair-ledger-row')!.click();
    expect(rowOf(ledger).textContent).toContain('do 89');
  });

  it('bez dobitka (optimistic === current) redak je skriven, nema praznog obecanja', () => {
    const ledger = openLedger({ items: [item('Font')], estimateFor: () => ({ current: 84, optimistic: 84 }) });
    expect(rowOf(ledger).hidden).toBe(true);
  });

  it('estimateFor koji vrati null skriva redak (profil bez ocjene)', () => {
    const ledger = openLedger({ items: [item('Font')], estimateFor: () => null });
    expect(rowOf(ledger).hidden).toBe(true);
  });

  it('bez estimateFor redak ostaje skriven: stariji pozivatelji netaknuti', () => {
    const ledger = openLedger({ items: [item('Font')] });
    expect(rowOf(ledger).hidden).toBe(true);
  });

  it('refreshHandle: vanjska promjena (deep preklopnik) odmah osvjezava brojku', () => {
    let optimistic = 97;
    const handle: { refresh?: () => void } = {};
    const ledger = openLedger({ items: [item('Font')], estimateFor: () => ({ current: 84, optimistic }), refreshHandle: handle });
    expect(rowOf(ledger).textContent).toContain('do 97');
    optimistic = 90;
    handle.refresh?.();
    expect(rowOf(ledger).textContent).toContain('do 90');
  });
});
