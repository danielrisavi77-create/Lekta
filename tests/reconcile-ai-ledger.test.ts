import { describe, expect, it } from 'vitest';
import type { RuleEntry, VerificationLedgerEntry } from '../src/profiles/profile-schema';
import { formatAiLedgerReconciliationPreview, planAiLedgerReconciliation, unreconciledAiConfirmations } from '../src/verification/reconcile-ai-ledger';

const event = (id: string, ruleId: string, profileId = 'profile-a'): VerificationLedgerEntry => ({
  id, ruleId, profileId, action: 'ai-confirmed', actor: 'ai-evidence-audit', timestamp: '2026-09-20',
  sourceId: null, sourcePage: null, quote: null,
});
const entries = [{ ruleId: 'confirmed', confirmedVia: 'ai-evidence-audit' },
  { ruleId: 'orphan', confirmedVia: 'ai-1pass-batch' }] as RuleEntry[];

describe('append-only AI ledger reconciliation', () => {
  it('dry-run preview shows event date and current status and confirmation mode', () => {
    const current = [{ ruleId: 'orphan', status: 'verified', confirmedVia: 'ai-1pass-batch' }] as RuleEntry[];
    const old = event('bad', 'orphan');
    const correction = planAiLedgerReconciliation('profile-a', current, [old], '2026-09-27')[0];
    const line = formatAiLedgerReconciliationPreview(correction, [old], current);
    expect(line).toContain('2026-09-20');
    expect(line).toContain('status=verified');
    expect(line).toContain('confirmedVia=ai-1pass-batch');
    const missing = formatAiLedgerReconciliationPreview(correction, [old], []);
    expect(missing).toContain('status=missing');
  });
  it('planira korekciju samo za staru potvrdu bez dokaznog pravila', () => {
    const ledger = [event('good', 'confirmed'), event('bad', 'orphan'), event('foreign', 'orphan', 'profile-b')];
    const plan = planAiLedgerReconciliation('profile-a', entries, ledger, '2026-09-27');
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ profileId: 'profile-a', ruleId: 'orphan',
      action: 'ai-confirmation-revoked', revokesLedgerId: 'bad' });
    expect(ledger).toEqual([event('good', 'confirmed'), event('bad', 'orphan'), event('foreign', 'orphan', 'profile-b')]);
    expect(unreconciledAiConfirmations('profile-a', entries, [...ledger, ...plan])).toEqual([]);
    expect(planAiLedgerReconciliation('profile-a', entries, [...ledger, ...plan], '2026-09-28')).toEqual([]);
  });

  it('ne prihvaća korekciju koja pokazuje na tuđi profil ili pogrešno pravilo', () => {
    const orphan = event('bad', 'orphan');
    const other = event('other', 'other', 'profile-b');
    const forged = { ...event('correction', 'other'), action: 'ai-confirmation-revoked' as const,
      revokesLedgerId: orphan.id };
    expect(unreconciledAiConfirmations('profile-a', entries, [orphan, other, forged])).toEqual([orphan]);
  });
});
