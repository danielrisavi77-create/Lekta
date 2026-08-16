import { describe, expect, it } from 'vitest';
import { buildDefaultRepairRequests, defaultSelectedItems } from '../src/repair/default-selection';

/**
 * Jedini izvor istine za "sto bi STVARNI korisnik popravio kad samo klikne Popravi".
 * UI predodabire tocno `item.violated !== false` (repair-panel.ts), pa i harness i svaki
 * drugi potrosac moraju koristiti isto pravilo. Prije ovoga harness je slao SVE stavke,
 * ukljucujuci advisory `recommended` koje su u UI-u NEoznacene, pa je "real-corpus"
 * izvjestaj opisivao tok koji nijedan korisnik ne izvodi.
 */
const item = (over: Record<string, unknown> = {}) => ({
  ruleId: 'r1',
  fixerId: 'margins-fixer',
  label: 'Margine',
  params: { top: 2 },
  ...over,
});

describe('default repair selection', () => {
  it('ukljucuje prekrsene stavke (violated: true)', () => {
    expect(defaultSelectedItems([item({ violated: true })])).toHaveLength(1);
  });

  it('ukljucuje stavke bez izricitog violated (undefined = predodabrano, kao UI)', () => {
    expect(defaultSelectedItems([item({})])).toHaveLength(1);
  });

  it('IZOSTAVLJA advisory preporuke (violated:false, recommended:true)', () => {
    expect(defaultSelectedItems([item({ violated: false, recommended: true })])).toHaveLength(0);
  });

  it('IZOSTAVLJA neprekrsene bodovane stavke (violated:false)', () => {
    expect(defaultSelectedItems([item({ violated: false })])).toHaveLength(0);
  });

  it('buildDefaultRepairRequests preslikava samo fixerId/ruleId/params odabranih', () => {
    const requests = buildDefaultRepairRequests([
      item({ violated: true }),
      item({ ruleId: 'r2', violated: false, recommended: true }),
    ]);
    expect(requests).toEqual([{ fixerId: 'margins-fixer', ruleId: 'r1', params: { top: 2 } }]);
  });
});
