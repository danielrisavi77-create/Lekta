import { describe, expect, it } from 'vitest';
import { pilotRepairAllowed, pilotRepairEntryHtml, pilotRepairLockHtml, studentPilotAccess } from '../src/ui/student-pilot-access';

describe('student pilot access is a UI policy, not an entitlement', () => {
  const base = { reportConfigured: true, repairConfigured: true, checkoutConfigured: true, paidOffersLive: true };

  it.each(['none', 'unpaid', 'paid', 'demo'] as const)('separates diagnosis and repair for %s', (kind) => {
    const access = studentPilotAccess({ ...base, pilotEnabled: true, resultKind: kind });
    expect(access.diagnosticsUnlocked).toBe(kind !== 'none');
    expect(access.diagnosticsLocked).toBe(false);
    expect(access.repairLocked).toBe(kind === 'unpaid');
    expect(access.purchaseAvailable).toBe(kind === 'unpaid');
    expect(access.repairAvailable).toBe(kind === 'paid');
  });

  it('preserves the old gate when the flag is off', () => {
    expect(studentPilotAccess({ ...base, pilotEnabled: false, resultKind: 'unpaid' })).toMatchObject({ diagnosticsLocked: true, repairLocked: true });
    expect(studentPilotAccess({ ...base, pilotEnabled: false, resultKind: 'demo' })).toMatchObject({ diagnosticsLocked: false, repairLocked: false });
    expect(studentPilotAccess({ ...base, pilotEnabled: false, resultKind: 'paid' })).toMatchObject({ diagnosticsLocked: false, repairLocked: false });
  });

  it.each(['reportConfigured', 'repairConfigured', 'checkoutConfigured', 'paidOffersLive'] as const)('does not offer purchase when %s is missing', (key) => {
    expect(studentPilotAccess({ ...base, [key]: false, pilotEnabled: true, resultKind: 'unpaid' })).toMatchObject({
      diagnosticsUnlocked: true, repairLocked: true, purchaseAvailable: false, repairAvailable: false,
    });
  });

  it('never turns the pilot flag into a paid result', () => {
    const unpaid = studentPilotAccess({ ...base, pilotEnabled: true, resultKind: 'unpaid' });
    expect(unpaid).not.toHaveProperty('fullReport');
    expect(unpaid).not.toHaveProperty('slotId');
    expect(unpaid).not.toHaveProperty('entitlement');
  });

  it('exposes repair controls only when the pilot allows a purchase or repair', () => {
    const unpaid = studentPilotAccess({ ...base, pilotEnabled: true, resultKind: 'unpaid' });
    const paid = studentPilotAccess({ ...base, pilotEnabled: true, resultKind: 'paid' });
    expect(pilotRepairAllowed(true, unpaid)).toBe(true);
    expect(pilotRepairAllowed(true, paid)).toBe(true);
    expect(pilotRepairAllowed(false, unpaid)).toBe(true);
  });

  it('renders a repair offer only when checkout is actually available', () => {
    const locked = pilotRepairLockHtml({ purchaseAvailable: false, workTypeLabel: 'završni', price: 3.99 });
    expect(locked).toContain('Dijagnoza, dokazi i osnovne upute su besplatni');
    expect(locked).toContain('Kupnja i automatski popravak trenutačno nisu dostupni');
    expect(locked).not.toContain('data-unlock-cta');

    const available = pilotRepairLockHtml({ purchaseAvailable: true, workTypeLabel: 'završni', price: 3.99 });
    expect(available).toContain('data-unlock-cta');
    expect(available).toContain('3,99 €');
    expect(pilotRepairLockHtml({ purchaseAvailable: false, workTypeLabel: '<script>', price: 3.99 })).not.toContain('<script>');
  });

  it('keeps the pilot result entry on the paid-repair flow', () => {
    expect(pilotRepairEntryHtml()).toContain('Pregledaj mogućnost popravka');
    expect(pilotRepairEntryHtml()).not.toContain('automatski besplatni popravak');
  });

  it('keeps the regular repair entry copy and faculty recommendations', () => {
    const html = pilotRepairEntryHtml({ pilotEnabled: false, auto: 2, recommendedCount: 1, serverSide: true });
    expect(html).toContain('Automatski popravak');
    expect(html).toContain('Možeš poslati na popravak 2');
    expect(html).toContain('tvoj fakultet');
    expect(html).toContain('Pošalji na popravak');
  });
});
