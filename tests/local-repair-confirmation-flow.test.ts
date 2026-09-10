import { describe, expect, it } from 'vitest';
import {
  collectLocalRepairConfirmationReceipts,
  rememberLocalRepairConfirmations,
  type LocalRepairConfirmationStore,
} from '../src/ui/local-repair-confirmation-flow.ts';

const confirmedAt = '2026-09-10T21:00:00.000Z';

describe('local repair confirmation flow', () => {
  it('veze potvrdu uz tocan tekstualni popravak i zadrzava indeks zahtjeva', () => {
    const store: LocalRepairConfirmationStore = new Map();
    const selected = [
      { fixerId: 'font-fixer', ruleId: 'font', label: 'Font' },
      {
        fixerId: 'heading-case-fixer',
        ruleId: 'heading-case',
        label: 'Velika slova naslova',
        confirmationText: 'Potvrdi promjenu teksta naslova.',
      },
    ];

    rememberLocalRepairConfirmations(store, selected, confirmedAt);

    expect(collectLocalRepairConfirmationReceipts(selected, store)).toEqual([
      {
        requestIndex: 1,
        confirmationText: 'Potvrdi promjenu teksta naslova.',
        confirmedAt,
      },
    ]);
  });

  it('koristi citljiv zadani tekst potvrde', () => {
    const store: LocalRepairConfirmationStore = new Map();
    const selected = [{
      fixerId: 'croatian-typography-fixer',
      ruleId: 'typography',
      label: 'Hrvatska tipografija',
    }];

    rememberLocalRepairConfirmations(store, selected, confirmedAt);

    expect(collectLocalRepairConfirmationReceipts(selected, store)[0]?.confirmationText)
      .toBe('Potvrdi popravak: Hrvatska tipografija');
  });

  it('zaustavlja lokalni Word popravak bez izricite potvrde', () => {
    expect(() => collectLocalRepairConfirmationReceipts([
      { fixerId: 'heading-case-fixer', ruleId: 'heading-case', label: 'Naslov' },
    ], new Map())).toThrow(/Nedostaje izricita potvrda/);
  });
});
