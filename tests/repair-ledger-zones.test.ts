/**
 * DVIJE ZONE + DOKAZNI CIP u ledgeru (P2-2, P2-4).
 *
 * Ledger je JEDINI vidljivi prikaz stavki (checkbox lista je skrivena), pa je sve sto korisnik
 * zna o popravku ono sto pise ovdje. Prije ovoga je nosio jedan ravan popis i oznaku
 * "Preporučeno", koja nije razlikovala PREPORUKU FAKULTETA od NASE opce higijene, ni popravak
 * koji ide bez pitanja od onoga koji mijenja strukturu.
 *
 * Zone se izvode iz `requiresConfirmation`, iste zastavice koju panel vec koristi da prisili
 * potvrdni korak, pa ne uvode novu klasifikaciju nego imenuju postojecu.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderRepairLedgerModal, type PriceSliderItem } from '../src/ui/repair-price-slider';

interface TestItem extends PriceSliderItem {
  requiresConfirmation?: boolean;
  authority?: string;
}

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

function openLedger(items: TestItem[]): HTMLElement {
  const listEl = mountList(items);
  const trigger = renderRepairLedgerModal({ items, listEl });
  document.body.appendChild(trigger);
  trigger.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!.click();
  return document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;
}

const safe = (label: string, over: Partial<TestItem> = {}): TestItem =>
  ({ fixerId: 'font-fixer', ruleId: `r-${label}`, label, ...over }) as TestItem;
const advanced = (label: string, over: Partial<TestItem> = {}): TestItem =>
  ({ fixerId: 'toc-field-fixer', ruleId: `r-${label}`, label, requiresConfirmation: true, ...over }) as TestItem;

beforeEach(() => { document.body.innerHTML = ''; });

describe('ledger: dvije zone umjesto ravnog popisa', () => {
  it('kad postoje obje vrste, prikazuju se dva naslova s tocnim brojevima', () => {
    const ledger = openLedger([safe('Font'), safe('Margine'), advanced('Sadržaj')]);
    const zones = [...ledger.querySelectorAll('.lekta-repair-ledger-zone strong')].map((z) => z.textContent);
    expect(zones).toEqual(['Sigurni automatski popravci (2)', 'Napredni popravci (1)']);
  });

  it('sigurni dolaze PRIJE naprednih, bez obzira na ulazni poredak', () => {
    const ledger = openLedger([advanced('Sadržaj'), safe('Font')]);
    const text = ledger.textContent ?? '';
    expect(text.indexOf('Sigurni automatski popravci')).toBeLessThan(text.indexOf('Napredni popravci'));
  });

  it('napredna zona kaze ZASTO trazi potvrdu', () => {
    const ledger = openLedger([safe('Font'), advanced('Sadržaj')]);
    expect(ledger.textContent).toContain('Traže tvoju potvrdu');
  });

  it('kad postoji samo jedna vrsta, naslova NEMA (jedan naslov nad jedinim popisom je sum)', () => {
    expect(openLedger([safe('Font'), safe('Margine')]).querySelectorAll('.lekta-repair-ledger-zone')).toHaveLength(0);
    document.body.innerHTML = '';
    expect(openLedger([advanced('Sadržaj')]).querySelectorAll('.lekta-repair-ledger-zone')).toHaveLength(0);
  });

  it('naslov zone nije izbor (role=presentation), da ga citac ekrana ne broji kao stavku', () => {
    const ledger = openLedger([safe('Font'), advanced('Sadržaj')]);
    for (const zone of ledger.querySelectorAll('.lekta-repair-ledger-zone')) {
      expect(zone.getAttribute('role')).toBe('presentation');
      expect(zone.querySelector('input,button')).toBeNull();
    }
  });
});

describe('ledger: dokazni cip razlikuje pravilo od preporuke', () => {
  it('pravilo fakulteta, preporuka fakulteta i opca preporuka imaju RAZLICIT tekst', () => {
    const ledger = openLedger([
      safe('Font', { authority: 'faculty-rule' }),
      safe('Natpisi', { authority: 'faculty-recommendation' }),
      safe('Prazni odlomci', { authority: 'lekta-recommendation' }),
    ]);
    const chips = [...ledger.querySelectorAll('.lekta-repair-ledger-authority')].map((c) => c.textContent);
    expect(chips).toEqual([
      'Pravilo fakulteta',
      'Preporuka fakulteta, ne ulazi u ocjenu',
      'Opća preporuka Lekte, nije pravilo fakulteta',
    ]);
    expect(new Set(chips).size, 'tri kategorije moraju biti nezamjenjive').toBe(3);
  });

  it('BEZ oznake pada na opcu preporuku, nikad na pravilo fakulteta', () => {
    // Kljucni smjer greske: zaboravljena oznaka ne smije tvrditi vise nego sto smijemo.
    const ledger = openLedger([safe('Nesto neoznaceno')]);
    const chip = ledger.querySelector('.lekta-repair-ledger-authority')!;
    expect(chip.textContent).toContain('Opća preporuka Lekte');
    expect(chip.textContent).not.toContain('Pravilo fakulteta');
  });

  it('svaka stavka dobiva tocno jedan cip', () => {
    const ledger = openLedger([safe('Font'), safe('Margine'), advanced('Sadržaj')]);
    expect(ledger.querySelectorAll('.lekta-repair-ledger-authority')).toHaveLength(3);
  });

  it('cip je IZVAN klikabilnog retka (inace postaje dio oznake izbora)', () => {
    const ledger = openLedger([safe('Font')]);
    const chip = ledger.querySelector('.lekta-repair-ledger-authority')!;
    expect(chip.closest('.lekta-repair-ledger-row')).toBeNull();
  });
});
