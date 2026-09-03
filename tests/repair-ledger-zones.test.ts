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

  it('naslov zone NIJE izbor, ali JEST stavka liste', () => {
    // Tvrdnja je 2026-09-03 obrnuta u prvom dijelu, i to je ispravak a ne popustanje. Ranije se
    // trazio `role="presentation"`, ali ta uloga izbacuje `<li>` iz semantike liste, pa `<ol>`
    // dobiva dijete koje nije stavka i axe pravilo `list` pada (`ebeaf624`). Izvor je popravljen
    // (`a16470bc`), a ova je tvrdnja ostala iza njega i tvrdila suprotno od koda.
    //
    // NAMJERA GARDA JE OCUVANA i nosi je druga tvrdnja: naslov zone ne smije sadrzavati nijednu
    // kontrolu, dakle citac ekrana ga cita kao tekst u listi, a ne kao nesto sto se bira.
    const ledger = openLedger([safe('Font'), advanced('Sadržaj')]);
    const zones = ledger.querySelectorAll('.lekta-repair-ledger-zone');
    expect(zones.length, 'bez zona bi obje tvrdnje prosle vakuumski').toBeGreaterThan(0);
    for (const zone of zones) {
      expect(zone.getAttribute('role')).toBeNull();
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

describe('dokazni cip nosi DOKAZ, ne samo tvrdnju', () => {
  it('pravilo fakulteta prikazuje stranicu upute i godinu provjere', () => {
    const ledger = openLedger([
      safe('Margine', { authority: 'faculty-rule', provenance: { sourcePage: '14', lastVerified: '2026-03-01' } } as Partial<TestItem>),
    ]);
    expect(ledger.querySelector('.lekta-repair-ledger-authority')!.textContent)
      .toBe('Pravilo fakulteta · str. 14 · provjereno 2026.');
  });

  it('nepotpun dokaz ne izmislja ono cega nema', () => {
    const samoStranica = openLedger([safe('A', { authority: 'faculty-rule', provenance: { sourcePage: '7' } } as Partial<TestItem>)]);
    expect(samoStranica.querySelector('.lekta-repair-ledger-authority')!.textContent).toBe('Pravilo fakulteta · str. 7');
    document.body.innerHTML = '';
    const bezDokaza = openLedger([safe('B', { authority: 'faculty-rule' } as Partial<TestItem>)]);
    expect(bezDokaza.querySelector('.lekta-repair-ledger-authority')!.textContent).toBe('Pravilo fakulteta');
  });

  it('OPCA preporuka nikad ne prikazuje stranicu, ni kad joj se podmetne', () => {
    // Kljucno: nasa higijena nema fakultetski izvor, pa ne smije nalikovati na referencu upute.
    const ledger = openLedger([
      safe('Prazni odlomci', { authority: 'lekta-recommendation', provenance: { sourcePage: '99', lastVerified: '2026-01-01' } } as Partial<TestItem>),
    ]);
    const text = ledger.querySelector('.lekta-repair-ledger-authority')!.textContent ?? '';
    expect(text).toBe('Opća preporuka Lekte, nije pravilo fakulteta');
    expect(text).not.toContain('str.');
  });

  it('preporuka fakulteta smije nositi dokaz (ima izvor, samo ne boduje)', () => {
    const ledger = openLedger([
      safe('Natpisi', { authority: 'faculty-recommendation', provenance: { sourcePage: '5', lastVerified: '2025-11-02' } } as Partial<TestItem>),
    ]);
    expect(ledger.querySelector('.lekta-repair-ledger-authority')!.textContent)
      .toBe('Preporuka fakulteta, ne ulazi u ocjenu · str. 5 · provjereno 2025.');
  });
});

describe('stvaran oblik zapisa iz profila (ne izmisljen testni)', () => {
  /**
   * Profili NE zapisuju goli broj stranice nego puni citat, npr.
   *   "str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada)"
   * Prvi pokusaj cipa je zato prikazivao "str. str. 14, odjeljak ...".
   */
  const STVARNI = "str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada)";

  it('ne udvostrucuje "str." i ne prelijeva cijeli citat u redak', () => {
    const ledger = openLedger([
      safe('Font', { authority: 'faculty-rule', provenance: { sourcePage: STVARNI, lastVerified: '2026-07-02' } } as Partial<TestItem>),
    ]);
    const chip = ledger.querySelector('.lekta-repair-ledger-authority')!;
    expect(chip.textContent).toBe('Pravilo fakulteta · str. 14 · provjereno 2026.');
    expect(chip.textContent).not.toContain('str. str.');
    expect(chip.textContent).not.toContain('odjeljak');
  });

  it('puni citat se NE gubi nego ide u tooltip', () => {
    const ledger = openLedger([
      safe('Font', { authority: 'faculty-rule', provenance: { sourcePage: STVARNI } } as Partial<TestItem>),
    ]);
    expect(ledger.querySelector('.lekta-repair-ledger-authority')!.getAttribute('title')).toBe(STVARNI);
  });

  it('oznaka ODJELJKA se prikazuje kakva jest, bez laznog "str."', () => {
    // 60% zapisa nisu stranice nego odjeljci; prisilni prefiks bi im pripisao stranicu koje nema.
    const ledger = openLedger([
      safe('Font', { authority: 'faculty-rule', provenance: { sourcePage: 'odjeljak Postavke stranice' } } as Partial<TestItem>),
    ]);
    const text = ledger.querySelector('.lekta-repair-ledger-authority')!.textContent ?? '';
    expect(text).toBe('Pravilo fakulteta · odjeljak Postavke stranice');
    expect(text).not.toContain('str.');
  });

  it('predugacka oznaka se skracuje, a puni tekst ostaje u tooltipu', () => {
    const dugo = 'odjeljak 6. Tehnicko oblikovanje rada i oprema';
    const ledger = openLedger([
      safe('Font', { authority: 'faculty-rule', provenance: { sourcePage: dugo } } as Partial<TestItem>),
    ]);
    const chip = ledger.querySelector('.lekta-repair-ledger-authority')!;
    expect(chip.textContent).toContain('…');
    expect((chip.textContent ?? '').length).toBeLessThan('Pravilo fakulteta'.length + 35);
    expect(chip.getAttribute('title')).toBe(dugo);
  });
});
