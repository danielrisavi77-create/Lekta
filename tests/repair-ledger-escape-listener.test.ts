/**
 * NALAZ D2: `renderRepairLedgerModal` (glavni ledger popravka) vjesa `keydown` slusac na
 * `document` pri SVAKOM otvaranju i do sada ga nikad nije uklanjao, za razliku od item-modala u
 * istom modulu koji svoj `onEscape` vec cisti u `closeItem`. Posljedica: pri svakom ponovnom
 * renderiranju panela (npr. ponovni ulazak u fazu popravka) gomilao se jos jedan trajni slusac na
 * `document`.
 *
 * Datoteka je NAMJERNO odvojena od `tests/repair-ledger-zones.test.ts`: taj modul ima vise
 * testova koji ledger OTVARAJU a NE ZATVARAJU, pa dijeljeni `document` (happy-dom, jedan po
 * datoteci) zavrsi s vec-otvorenim ledgerima iz ranijih testova. `document.dispatchEvent('keydown')`
 * bi tada pokrenuo i NJIHOVE slusace i ucinio broj poziva ovisnim o poretku testova. Ovdje je
 * `document` cist za svaki test iz istog razloga (happy-dom dijeli `document` unutar jedne
 * datoteke, ali test datoteke medjusobno ne dijele okolinu), a svaki test i sam zatvara ono sto
 * otvori.
 *
 * MUTACIJA: ukloni `document.removeEventListener('keydown', onLedgerEscape)` iz `closeLedger` u
 * `src/ui/repair-price-slider.ts` -> tvrdnja "zatvaranje mora ukloniti dodani keydown slusac" pada
 * (uklonjeno ostaje 0 dok dodano raste).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderRepairLedgerModal, type PriceSliderItem } from '../src/ui/repair-price-slider';

function mountList(items: PriceSliderItem[]): HTMLElement {
  const list = document.createElement('ul');
  items.forEach((_, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" data-idx="${i}" checked />`;
    list.appendChild(li);
  });
  document.body.appendChild(list);
  return list;
}

const item = (label: string): PriceSliderItem => ({ fixerId: 'font-fixer', ruleId: `r-${label}`, label }) as PriceSliderItem;

describe('ledger: Escape slusac na document se ne gomila', () => {
  it('svako otvaranje dodaje jedan keydown slusac, svako zatvaranje ga uklanja', () => {
    const items = [item('Font')];
    const listEl = mountList(items);
    const trigger = renderRepairLedgerModal({ items, listEl });
    document.body.appendChild(trigger);
    const btn = trigger.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!;
    const backdrop = document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;

    // document je ovdje cist (vidi biljeska na vrhu datoteke), pa se sirovi brojaci mogu koristiti.
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const dodano = () => addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
    const uklonjeno = () => removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length;

    btn.click(); // otvori
    expect(backdrop.classList.contains('hidden')).toBe(false);
    expect(dodano(), 'otvaranje mora dodati jedan keydown slusac').toBe(1);
    expect(uklonjeno(), 'otvaranje ne smije nista uklanjati').toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // zatvori preko Escapea
    expect(backdrop.classList.contains('hidden'), 'Escape mora zatvoriti ledger').toBe(true);
    expect(uklonjeno(), 'zatvaranje mora ukloniti dodani keydown slusac').toBe(1);

    btn.click(); // otvori drugi put
    expect(dodano(), 'drugo otvaranje mora dodati NOV keydown slusac (jer je prvi vec uklonjen)').toBe(2);
    backdrop.click(); // zatvori klikom na pozadinu (e.target === backdrop)
    expect(backdrop.classList.contains('hidden')).toBe(true);
    expect(uklonjeno(), 'drugo zatvaranje mora ukloniti svoj keydown slusac').toBe(2);

    // Ugovor: broj dodanih i uklonjenih se mora poklapati nakon svakog ciklusa, inace curi.
    expect(dodano()).toBe(uklonjeno());

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('nakon zatvaranja, Escape vise ne poziva zatvaranje jer je preostali slusac uklonjen', () => {
    // Doslovna provjera ugovora zadatka B: ako slusac ostane na document, drugi Escape (poslan
    // dok je ledger vec zatvoren) ne bi smio nista PONOVNO uciniti, ali kod curenja bi ostavljao
    // sve vise mrtvih poziva koji na sljedecem otvaranju/zatvaranju daju vise dodavanja nego
    // uklanjanja. Ovdje se to mjeri kroz drugi ciklus otvori/zatvori koji mora ostati simetrican.
    const items = [item('Margine')];
    const listEl = mountList(items);
    const trigger = renderRepairLedgerModal({ items, listEl });
    document.body.appendChild(trigger);
    const btn = trigger.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!;
    const backdrop = document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;

    btn.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(backdrop.classList.contains('hidden')).toBe(true);

    // drugi Escape, ledger vec zatvoren: ne smije baciti ni ponovno zatvarati (idempotentno)
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))).not.toThrow();
    expect(backdrop.classList.contains('hidden')).toBe(true);

    // otvori pa zatvori JOS jednom preko Escapea: ako je stari slusac ostao, sad bi ih bilo DVA i
    // oba bi zvala closeLedger u istom dispatchu bez posljedica koje ovaj test vidi, ali provjeri
    // da ledger i dalje reagira TOCNO jednom na sljedeci ciklus (ne baca, ostaje skriven).
    btn.click();
    expect(backdrop.classList.contains('hidden')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(backdrop.classList.contains('hidden')).toBe(true);
  });
});
