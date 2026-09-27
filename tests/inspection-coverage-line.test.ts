/**
 * T64 UI: redak "Nije provjereno: ..." u prikazu rezultata (cockpit). Crta se samo kad status
 * nije `fullyChecked`, s tocnim brojevima, hrvatski i bez em/en crtica.
 */
import { describe, it, expect, vi } from 'vitest';
import { inspectionCoverageText } from '../src/ui/results/inspection-coverage-line';
import { renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import type { InspectionCoverage } from '../src/analysis/inspection-coverage';

const partial: InspectionCoverage = {
  version: 1,
  status: 'partiallyChecked',
  skippedParagraphs: 15,
  totalParagraphs: 200,
  skippedParts: [
    { kind: 'citationField', count: 3, reason: 'r', affectedCheckIds: ['format.typography.consistency'] },
    { kind: 'textBox', count: 12, reason: 'r', affectedCheckIds: ['format.typography.consistency'] },
    { kind: 'legalFootnote', count: 1, reason: 'r', affectedCheckIds: [] },
  ],
};
const full: InspectionCoverage = { version: 1, status: 'fullyChecked', skippedParagraphs: 0, totalParagraphs: 200, skippedParts: [] };

function mountWith(coverage: InspectionCoverage | undefined): HTMLElement {
  const mount = document.createElement('section');
  const model = buildVisualResultModel({
    score: 90, profile: 'P', profileStatus: 'verified', issues: [], checks: [], categories: {},
    capabilities: { repair: true, preview: true }, details: {},
  } as never);
  renderResultsCockpit(mount, model, { repairAvailable: true, onAction: vi.fn(), onAdvancedToggle: vi.fn(), inspectionCoverage: coverage });
  return mount;
}

describe('T64 redak "Nije provjereno"', () => {
  it('tekst s tocnim brojevima i hrvatskim mnozinama', () => {
    expect(inspectionCoverageText(partial)).toBe(
      'Nije provjereno: 3 odlomka sa Zotero, Mendeley ili EndNote poljima, 12 odlomaka u tekstnim okvirima, 1 fusnota bez pouzdane pravne strukture.',
    );
  });

  it('rucna provjera ima kratak uvod; nepoznato stanje ima vlastitu frazu', () => {
    const manual: InspectionCoverage = { ...partial, status: 'manualReviewRequired', skippedParts: [{ kind: 'analysisUnavailable', count: 2, reason: 'r', affectedCheckIds: [] }] };
    expect(inspectionCoverageText(manual)).toBe('Potrebna je ručna provjera. Nije provjereno: dio analize nije izračunat.');
  });

  it('nema retka kad je sve provjereno ili polja nema', () => {
    expect(inspectionCoverageText(full)).toBeNull();
    expect(inspectionCoverageText(undefined)).toBeNull();
    expect(inspectionCoverageText(null)).toBeNull();
  });

  it('cockpit crta redak samo kad status nije fullyChecked', () => {
    expect(mountWith(full).querySelector('[data-inspection-coverage]')).toBeNull();
    expect(mountWith(undefined).querySelector('[data-inspection-coverage]')).toBeNull();
    const line = mountWith(partial).querySelectorAll('[data-inspection-coverage]');
    expect(line).toHaveLength(1);
    expect(line[0].getAttribute('data-inspection-coverage')).toBe('partiallyChecked');
    expect(line[0].textContent).toContain('12 odlomaka u tekstnim okvirima');
  });

  it('bez em i en crtica ni u jednoj vrsti', () => {
    const kinds = ['citationField', 'textBox', 'nestedTable', 'tableCell', 'contentControl', 'trackedChange', 'equation', 'embeddedObject', 'fieldOrHyperlink', 'legalFootnote', 'complexTable', 'analysisUnavailable'] as const;
    const all: InspectionCoverage = { ...partial, skippedParts: kinds.map((kind) => ({ kind, count: 5, reason: 'r', affectedCheckIds: [] })) };
    const text = inspectionCoverageText(all) ?? '';
    expect(text).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
    expect(text).not.toContain('undefined');
    // Svaka prebrojiva vrsta ispise svoj broj; `analysisUnavailable` nema broj.
    expect(text.match(/\b5 /g) ?? []).toHaveLength(kinds.length - 1);
  });
});
