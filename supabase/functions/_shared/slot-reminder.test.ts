import { describe, it, expect } from 'vitest';
import { shouldSendSlotReminder } from './slot-reminder';

// P0-02a (security-01): dokaz idempotencije slot-podsjetnika. Drugi cron poziv
// (kad je marker slot_expiry_reminder_sent_at vec postavljen) NE salje isti slot
// dvaput. Plus opt-out i "vec aktivan" grane.

const base = { alreadySentAt: null, remindersEnabled: true, recentGenerationCount: 0 };

describe('shouldSendSlotReminder', () => {
  it('salje kad je svjeze, ukljuceno i bez nedavne aktivnosti', () => {
    expect(shouldSendSlotReminder(base)).toBe(true);
  });

  it('NE salje drugi put kad je marker vec postavljen (idempotencija)', () => {
    expect(shouldSendSlotReminder({ ...base, alreadySentAt: '2026-07-11T08:00:00Z' })).toBe(false);
  });

  it('NE salje ako je korisnik ugasio podsjetnike (opt-out)', () => {
    expect(shouldSendSlotReminder({ ...base, remindersEnabled: false })).toBe(false);
  });

  it('NE salje ako je bilo generacije u zadnja 24h', () => {
    expect(shouldSendSlotReminder({ ...base, recentGenerationCount: 1 })).toBe(false);
  });
});
