// @vitest-environment node
/** T84 RD-2 (Codex R9 na #294): zaseban razlog i poruka za strop pokusaja bez izmjena. */
import { describe, expect, it } from 'vitest';
import { repairRateLimitMessage } from '../src/report/repair-rate-limit-message';

describe('repairRateLimitMessage', () => {
  it('attempts_daily kaze da besplatna kvota NIJE potrosena i da je prozor 24 sata', () => {
    const msg = repairRateLimitMessage('attempts_daily');
    expect(msg).toContain('pokušaja bez izmjena');
    expect(msg).toContain('besplatna kvota nije potrošena');
    expect(msg).toContain('zahtjev nije uspio');
    expect(msg).toContain('24 sata');
  });

  it('ostali razlozi zadrzavaju dosadasnje poruke', () => {
    expect(repairRateLimitMessage('paid_daily')).toContain('Dnevni limit zahtjeva');
    expect(repairRateLimitMessage('free_ip')).toContain('mrežu/uređaj');
    expect(repairRateLimitMessage('free_user')).toContain('besplatnih popravaka');
    expect(repairRateLimitMessage(undefined)).toContain('besplatnih popravaka');
  });
});
