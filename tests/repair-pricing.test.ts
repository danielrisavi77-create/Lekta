import { describe, it, expect } from 'vitest';
import { FIXER_IDS, type FixerId } from '../src/repair/apply-fixers';
import {
  FIXER_WEIGHT,
  priceRepairItems,
  priorityOrder,
  itemsForBudgetFraction,
  fractionForItems,
} from '../src/repair/repair-pricing';

// Regresijska mreza za PWYW cjenovni model popravka: "odaberi sve" MORA i dalje dati tocno
// postojecu stropnu cijenu (WORK_TYPE_TIERS), tj. slider ne smije tiho promijeniti cijenu za
// korisnika koji ga ne dira. Isto tako svaki FixerId mora imati tezinu (Record tip to iznudjuje
// vec kroz tsc, ali test dokumentira i namjeru: nula je legalna SAMO za footer-page-fixer).

const item = (fixerId: FixerId) => ({ fixerId });

describe('FIXER_WEIGHT', () => {
  it('pokriva svaki poznati FixerId', () => {
    for (const id of FIXER_IDS) expect(FIXER_WEIGHT[id]).toBeDefined();
  });

  it('samo footer-page-fixer (nikad samostalna stavka) smije imati tezinu 0', () => {
    for (const id of FIXER_IDS) {
      if (id === 'footer-page-fixer') continue;
      expect(FIXER_WEIGHT[id]).toBeGreaterThan(0);
    }
  });
});

describe('priceRepairItems', () => {
  it('suma cijena "odaberi sve" je stropna cijena (do centa)', () => {
    const items = [item('font-fixer'), item('margins-fixer'), item('line-spacing-fixer')];
    const priced = priceRepairItems(items, 9.99);
    const sum = priced.reduce((s, p) => s + p.priceEur, 0);
    expect(Math.abs(sum - 9.99)).toBeLessThan(0.02);
  });

  it('prazan popis stavki daje prazan rezultat', () => {
    expect(priceRepairItems([], 9.99)).toEqual([]);
  });

  it('teza stavka dobiva vecu apsolutnu cijenu', () => {
    const [heavy, light] = priceRepairItems([item('section-insert-fixer'), item('empty-paragraph-fixer')], 10);
    expect(heavy.priceEur).toBeGreaterThan(light.priceEur);
  });
});

describe('priorityOrder', () => {
  it('sortira od najvece prema najmanjoj tezini', () => {
    const items = [item('empty-paragraph-fixer'), item('section-insert-fixer'), item('font-fixer')];
    const ordered = priorityOrder(items);
    expect(ordered[0].fixerId).toBe('section-insert-fixer');
    expect(ordered[ordered.length - 1].fixerId).toBe('empty-paragraph-fixer');
  });

  it('stabilan poredak za jednaku tezinu (izvorni indeks kao tie-breaker)', () => {
    const items = [item('footnote-spacing-fixer'), item('page-number-alignment-fixer')];
    expect(priorityOrder(items)).toEqual(items);
  });
});

describe('itemsForBudgetFraction / fractionForItems (round-trip slidera)', () => {
  const items = [
    item('section-insert-fixer'),
    item('font-fixer'),
    item('margins-fixer'),
    item('line-spacing-fixer'),
    item('empty-paragraph-fixer'),
  ];

  it('fraction=1 vraca sve stavke', () => {
    expect(itemsForBudgetFraction(items, 1)).toHaveLength(items.length);
  });

  it('fraction<=0 vraca prazan popis (bez minCount)', () => {
    expect(itemsForBudgetFraction(items, 0)).toHaveLength(0);
  });

  it('minCount: fraction=0 uz pod od 3 vraca 3 najvaznije stavke', () => {
    const picked = itemsForBudgetFraction(items, 0, 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((i) => i.fixerId)).toEqual(['section-insert-fixer', 'font-fixer', 'margins-fixer']);
  });

  it('minCount ne obara pravi odabir kad fraction vec trazi vise od poda', () => {
    const picked = itemsForBudgetFraction(items, 0.9, 1);
    expect(picked.length).toBeGreaterThan(1);
  });

  it('minCount veci od duljine popisa se ogranicava na duljinu popisa', () => {
    expect(itemsForBudgetFraction(items, 0, 999)).toHaveLength(items.length);
  });

  it('broj ukljucenih stavki raste (nikad ne pada) kako fraction raste', () => {
    let prev = 0;
    for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const n = itemsForBudgetFraction(items, f).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('fractionForItems(sve, sve) je 1, fractionForItems(sve, []) je 0', () => {
    expect(fractionForItems(items, items)).toBe(1);
    expect(fractionForItems(items, [])).toBe(0);
  });

  it('round-trip: itemsForBudgetFraction(f) pa fractionForItems ne pada ispod f', () => {
    for (const f of [0.25, 0.5, 0.75]) {
      const picked = itemsForBudgetFraction(items, f);
      const back = fractionForItems(items, picked);
      // "zaokruzuje prema gore": korisnik dobije barem onoliko koliko slider pokazuje.
      expect(back).toBeGreaterThanOrEqual(f - 1e-9);
    }
  });
});
