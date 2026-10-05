// @vitest-environment happy-dom
/**
 * T98 pregled #309: R1 ciscenje znacki kartice u alatu Citat i R2 analiticki payload s `retracted`.
 */
import { describe, expect, it } from 'vitest';
import { RETRACTION_BADGE, VERDICT_BADGE, clearVerifyBadges, existenceEventProps } from '../src/citations/verify-badges';
import { sanitizeAnalyticsEventData } from '../src/analytics/event-sanitizer';

/** Ista dva elementa koja verifyBulk dodaje kartici: verdikt i, uz found, oznaka povlacenja. */
function dodajZnacke(card: HTMLElement, verdict: keyof typeof VERDICT_BADGE, povucen: boolean): void {
  const b = document.createElement('div');
  b.className = 'verify-badge ' + VERDICT_BADGE[verdict].cls;
  b.textContent = VERDICT_BADGE[verdict].text;
  card.appendChild(b);
  if (verdict === 'found' && povucen) {
    const r = document.createElement('div');
    r.className = 'verify-badge ' + RETRACTION_BADGE.retracted.cls;
    r.textContent = RETRACTION_BADGE.retracted.text;
    card.appendChild(r);
  }
}

describe('T98 R1: ciscenje znacki kartice prije ponovljene provjere', () => {
  it('ponavljanje: tri provjere povucenog rada ostave tocno jednu oznaku povlacenja', () => {
    const card = document.createElement('div');
    card.innerHTML = '<div class="bulk-card-fields"></div>';
    for (let i = 0; i < 3; i++) {
      clearVerifyBadges(card);
      dodajZnacke(card, 'found', true);
    }
    expect(card.querySelectorAll('.verify-badge').length).toBe(2);
    expect(Array.from(card.querySelectorAll('.verify-badge')).filter((b) => b.textContent === RETRACTION_BADGE.retracted.text).length).toBe(1);
    expect(card.querySelector('.bulk-card-fields')).not.toBeNull();
  });

  it('prijelaz verdikta: found s oznakom pa not-found/weak ne ostavlja staru oznaku', () => {
    const card = document.createElement('div');
    dodajZnacke(card, 'found', true);
    for (const v of ['not-found', 'weak'] as const) {
      expect(clearVerifyBadges(card)).toBeGreaterThan(0);
      dodajZnacke(card, v, true);
      const tekstovi = Array.from(card.querySelectorAll('.verify-badge')).map((b) => b.textContent);
      expect(tekstovi).toEqual([VERDICT_BADGE[v].text]);
    }
  });

  it('negativna kontrola: uklanjanje samo prve znacke ostavi oznaku povlacenja', () => {
    const card = document.createElement('div');
    dodajZnacke(card, 'found', true);
    card.querySelector('.verify-badge')?.remove();
    dodajZnacke(card, 'not-found', false);
    expect(Array.from(card.querySelectorAll('.verify-badge')).some((b) => b.textContent === RETRACTION_BADGE.retracted.text)).toBe(true);
  });
});

describe('T98 R2: retracted prolazi zajednicku allowlistu analitike (browser i Edge)', () => {
  it('saniran payload dogadjaja references_existence_checked nosi retracted', () => {
    const r = { kind: 'retracted' as const, source: 'publisher', noticeDoi: '10.1/r', date: '' };
    const payload = sanitizeAnalyticsEventData(existenceEventProps([{ verdict: 'found', retraction: r }, { verdict: 'not-found' }]));
    expect(payload).toEqual({ total: 2, found: 1, missing: 1, retracted: 1 });
  });
});
