/**
 * Cisti HTML sloj triage prikaza (src/ui/triage-view.ts): brojaci-filteri, tri razine,
 * lokacije/skok, manual lijevak, redakcija isjecka izvan otkljucanog recepta.
 */
import { describe, it, expect } from 'vitest';
import { triagePanelHtml } from '../src/ui/triage-view';
import type { TriageModel } from '../src/analysis/triage';

const MODEL: TriageModel = {
  findings: [
    { id: 'chk:formatting:margine', category: 'formatting', title: 'Margine dokumenta', severity: 'error', fixability: 'auto', fixId: 'margins-fixer', locations: [] },
    {
      id: 'chk:elements:naslovi-tablica',
      category: 'elements',
      title: 'Naslovi tablica',
      severity: 'warning',
      fixability: 'assisted',
      groupKey: 'caption.table',
      locations: [{ paragraphIndex: 14, anchorId: 'loc-p14', excerpt: 'Tablica 1 prikazuje' }],
    },
    {
      id: 'chk:citations:citirano-literatura',
      category: 'citations',
      title: 'Citirano → literatura',
      severity: 'error',
      fixability: 'manual',
      locations: [{ paragraphIndex: 12, anchorId: 'loc-p12', excerpt: 'Novak 2022' }],
    },
  ],
  counts: { auto: 1, assisted: 1, manual: 1, total: 3 },
};

describe('triagePanelHtml', () => {
  it('prazan model -> prazan string (panel se skriva)', () => {
    expect(triagePanelHtml(null, { unlocked: false, filter: null })).toBe('');
    expect(triagePanelHtml({ findings: [], counts: { auto: 0, assisted: 0, manual: 0, total: 0 } }, { unlocked: false, filter: null })).toBe('');
  });

  it('prikazuje brojace kao filtere s tocnim vrijednostima', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: null });
    expect(html).toContain('data-triage-level="auto"');
    expect(html).toContain('data-triage-level="assisted"');
    expect(html).toContain('data-triage-level="manual"');
    expect(html).toContain('3 nalaza');
    // brojevi u chipovima
    expect(html).toMatch(/triage-dot--auto"><\/span>Automatski <span class="tc-n">1</);
  });

  it('aktivni filter dobiva aria-pressed i suzava listu', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: 'auto' });
    expect(html).toContain('data-triage-level="auto" aria-pressed="true"');
    expect(html).toContain('Margine dokumenta');
    expect(html).not.toContain('Naslovi tablica');
    expect(html).not.toContain('Citirano');
  });

  it('lokacije daju gumb za skok s odlomkom', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: 'assisted' });
    expect(html).toContain('data-triage-jump="p14"');
    expect(html).toContain('odlomak 14');
  });

  it('isjecak (title atribut) je skriven dok recept nije otkljucan, vidljiv kad jest', () => {
    const locked = triagePanelHtml(MODEL, { unlocked: false, filter: 'manual' });
    expect(locked).not.toContain('Novak 2022');
    const unlocked = triagePanelHtml(MODEL, { unlocked: true, filter: 'manual' });
    expect(unlocked).toContain('title="Novak 2022"');
  });

  it('manual nalaz iz citata vodi na alate + rucnu uslugu (lijevak, uputa prvo)', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: 'manual' });
    expect(html).toContain('href="citat.html"');
    expect(html).toContain('href="literatura.html"');
    expect(html).toContain('data-triage-order');
  });

  it('auto/assisted nalazi nemaju lijevak rucne usluge', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: 'auto' });
    expect(html).not.toContain('data-triage-order');
  });

  it('tri vizualne razine nose ikonu + label (ne samo boju)', () => {
    const html = triagePanelHtml(MODEL, { unlocked: false, filter: null });
    expect(html).toContain('Popravljam automatski');
    expect(html).toContain('Popravi uz pregled');
    expect(html).toContain('Tvoja odluka');
    expect(html).toContain('data-lucide="wand-2"');
  });

  it('nudi CTA na placeni popravak samo kad je repair dostupan (broj = auto bucket)', () => {
    // Bez repairAvailand (default): nema CTA, jer teaser->placeno most nije primjenjiv.
    const off = triagePanelHtml(MODEL, { unlocked: false, filter: null });
    expect(off).not.toContain('data-triage-repair');
    // S repairAvailable: CTA se pojavi i nosi tocan auto brojac (counts.auto === 1).
    const on = triagePanelHtml(MODEL, { unlocked: false, filter: null, repairAvailable: true });
    expect(on).toContain('data-triage-repair');
    expect(on).toContain('Popravi automatski (1)');
  });

  it('nema CTA kad nema auto nalaza iako je repair dostupan', () => {
    const manualOnly: TriageModel = { findings: [MODEL.findings[2]], counts: { auto: 0, assisted: 0, manual: 1, total: 1 } };
    const html = triagePanelHtml(manualOnly, { unlocked: false, filter: null, repairAvailable: true });
    expect(html).not.toContain('data-triage-repair');
  });
});
