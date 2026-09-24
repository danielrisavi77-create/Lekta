// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { manualWordInstruction } from '../src/ui/manual-word-instructions';
import { priorityFindingHtml } from '../src/ui/results/priority-findings';
import { findingCardHtml } from '../src/ui/finding-view-model';

const ids = ['format.font.dominant', 'format.size.body', 'format.spacing.body', 'format.justify.body', 'page.margins', 'structure.heading.word-styles', 'toc.present', 'page.numbers.present'];

describe('manual Word instructions', () => {
  it('covers the eight known check IDs with concrete Word actions', () => {
    for (const id of ids) expect(manualWordInstruction(id), id).toMatch(/Word|Raspored|Reference|Umetanje/);
    expect(manualWordInstruction('toc.present')).toContain('Sadržaj');
    expect(manualWordInstruction('page.margins')).toContain('sekcije');
    for (const id of ids) expect(manualWordInstruction(id), id).not.toContain('Očekivano');
  });

  it('does not infer an instruction from a title or unknown ID', () => {
    expect(manualWordInstruction('')).toBeNull();
    expect(manualWordInstruction('Dominantni font')).toBeNull();
    expect(manualWordInstruction('format.font.unrelated')).toBeNull();
  });

  it('shows manual guidance alongside an automatic repair offer and escapes result text', () => {
    const html = priorityFindingHtml({
      id: 'f1', checkId: 'page.margins', originalIndex: 0, category: 'formatting', severity: 'warning', kind: 'document',
      title: '<img src=x>', explanation: 'Provjeri', measured: '<script>x</script>', expected: '2,5 cm',
      scope: { kind: 'document' }, fixability: 'auto', autoRepairable: true, matchKeys: [], status: 'open', priorityRank: 1,
      capabilities: { preview: false, repair: true, exactEvidence: false },
    }, true);
    expect(html).toContain('Prilagođene margine');
    expect(html).toContain('Popravi automatski');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
  });

  it('states missing expected value and does not invent official evidence', () => {
    const html = priorityFindingHtml({
      id: 'f2', checkId: 'format.size.body', originalIndex: 0, category: 'formatting', severity: 'warning', kind: 'document',
      title: 'Veličina', explanation: 'Provjeri', scope: { kind: 'document' }, fixability: 'manual',
      autoRepairable: false, matchKeys: [], status: 'open', priorityRank: 1,
      capabilities: { preview: false, repair: false, exactEvidence: false },
    }, false);
    expect(html).toContain('službenu uputu');
    expect(html).not.toContain('Dokaz iz izvora');
  });

  it('shows the same guidance in the detailed finding card', () => {
    const html = findingCardHtml({
      id: 'f3', checkId: 'toc.present', originalIndex: 0, category: 'structure', severity: 'warning', kind: 'document',
      title: 'Sadržaj dokumenta', explanation: 'Nedostaje sadržaj.', scope: { kind: 'document' }, fixability: 'manual',
      autoRepairable: false, matchKeys: [], status: 'open', priorityRank: 1,
    }, false);
    expect(html).toContain('Reference &gt; Sadržaj');
    expect(html).not.toContain('Dokaz iz izvora');
  });

  it('detailed DOM shows an escaped expected value only when supplied', () => {
    const finding = {
      id: 'f4', checkId: 'format.font.dominant', originalIndex: 0, category: 'formatting', severity: 'warning' as const,
      kind: 'document' as const, title: 'Font', explanation: 'Odstupa.', scope: { kind: 'document' as const },
      fixability: 'manual' as const, autoRepairable: false, matchKeys: [], status: 'open' as const, priorityRank: 1,
    };
    const card = document.createElement('div');
    card.innerHTML = findingCardHtml({ ...finding, expected: 'TNR <img src=x onerror=alert(1)>' }, false);
    const expected = Array.from(card.querySelectorAll('.finding-evidence')).find((el) => el.querySelector('span')?.textContent === 'Očekivano');
    expect(expected?.querySelector('p')?.textContent).toBe('TNR <img src=x onerror=alert(1)>');
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).not.toContain('Očekivana vrijednost nije prikazana');

    card.innerHTML = findingCardHtml(finding, false);
    expect(Array.from(card.querySelectorAll('.finding-evidence')).some((el) => el.querySelector('span')?.textContent === 'Očekivano')).toBe(false);
    expect(card.textContent).toContain('Očekivana vrijednost nije prikazana');
  });
});
