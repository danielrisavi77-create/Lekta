import { describe, expect, it } from 'vitest';
import { resultReadiness } from '../src/ui/result-readiness';

describe('spremnost rezultata', () => {
  it('ne mijesa tehnicku ocjenu i blokator predaje', () => {
    const readiness = resultReadiness([{ severity: 'error', category: 'structure', title: 'PAGE', detail: '', where: '' }]);
    expect(readiness.kind).toBe('blocked');
    expect(readiness.label).toBe('Nije spremno za predaju');
    expect(readiness.description).toContain('Tehnička ocjena ne potvrđuje');
  });

  it('razlikuje dorade, rucne provjere i cist automatski nalaz', () => {
    expect(resultReadiness([{ severity: 'warning', category: 'formatting', title: '', detail: '', where: '' }]).kind).toBe('needs-work');
    expect(resultReadiness([{ severity: 'info', category: 'citations', title: '', detail: '', where: '' }]).kind).toBe('manual-review');
    expect(resultReadiness([]).kind).toBe('clear');
  });
});
