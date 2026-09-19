import { describe, expect, it } from 'vitest';

import { parseRepairConfirmationReceipts } from '../src/repair/local-runner/confirmation-receipts.ts';

describe('local repair confirmation receipts', () => {
  it('prihvaca samo kanonske, jedinstvene potvrde vezane uz indeks zahtjeva', () => {
    expect(parseRepairConfirmationReceipts([
      { requestIndex: 1, confirmationText: 'Potvrđujem promjenu.', confirmedAt: '2026-08-24T19:00:00.000Z' },
    ], 3, new Date('2026-08-24T19:01:00.000Z'))).toEqual([
      { requestIndex: 1, confirmationText: 'Potvrđujem promjenu.', confirmedAt: new Date('2026-08-24T19:00:00.000Z') },
    ]);
  });

  it('odbija buducu, dupliciranu ili izvan-dosega potvrdu', () => {
    const now = new Date('2026-08-24T19:01:00.000Z');
    expect(parseRepairConfirmationReceipts([
      { requestIndex: 0, confirmationText: 'x', confirmedAt: '2026-08-24T19:02:00.000Z' },
    ], 1, now)).toBeNull();
    expect(parseRepairConfirmationReceipts([
      { requestIndex: 0, confirmationText: 'x', confirmedAt: '2026-08-24T19:00:00.000Z' },
      { requestIndex: 0, confirmationText: 'y', confirmedAt: '2026-08-24T19:00:00.000Z' },
    ], 1, now)).toBeNull();
    expect(parseRepairConfirmationReceipts([
      { requestIndex: 2, confirmationText: 'x', confirmedAt: '2026-08-24T19:00:00.000Z' },
    ], 1, now)).toBeNull();
  });

  it('stari klijent bez potvrda ostaje kompatibilan', () => {
    expect(parseRepairConfirmationReceipts(undefined, 2, new Date())).toEqual([]);
  });
});
