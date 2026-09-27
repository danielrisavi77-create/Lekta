/**
 * T64 UI: redak o tome sto analiza nije provjerila, u prikazu rezultata (cockpit). Crta se samo
 * kad status nije `fullyChecked`, s tocnim brojevima, hrvatski i bez em/en crtica.
 *
 * Krug 2: redak za svaki dio kaze TKO ga nije procitao. Tvrdnja "nije provjereno" bez dosega
 * bila je lazna za font, velicinu, prored i poravnanje, koje te odlomke citaju.
 */
import { describe, it, expect, vi } from 'vitest';
import { inspectionCoverageText } from '../src/ui/results/inspection-coverage-line';
import { renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import type { InspectionCoverage, InspectionScope, InspectionSkipKind } from '../src/analysis/inspection-coverage';

const T = ['format.typography.consistency'];
const partial: InspectionCoverage = {
  version: 1,
  status: 'partiallyChecked',
  skippedParagraphs: 15,
  totalParagraphs: 200,
  skippedParts: [
    { kind: 'citationField', count: 3, scope: 'typographyCheck', reason: 'r', affectedCheckIds: T },
    { kind: 'textBox', count: 12, scope: 'typographyCheck', reason: 'r', affectedCheckIds: T },
    { kind: 'legalFootnote', count: 1, scope: 'repairSuggestions', reason: 'r', affectedCheckIds: [] },
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

describe('T64 redak o neprovjerenim dijelovima', () => {
  it('tekst s tocnim brojevima, hrvatskim mnozinama i dosegom svake tvrdnje', () => {
    expect(inspectionCoverageText(partial)).toBe(
      'Provjera tehničko-tipografske dosljednosti nije obuhvatila 3 odlomka s poljima upravitelja literature (Zotero, Mendeley, EndNote), 12 odlomaka u tekstnim okvirima; '
      + 'provjere fonta, veličine, proreda i poravnanja pročitale su i te odlomke. '
      + 'Prijedlozi popravka ne obuhvaćaju 1 fusnotu bez pouzdane pravne strukture.',
    );
  });

  it('nista preskoceno od tipografske provjere: nema tvrdnje o fontu ni proredu', () => {
    const repairOnly: InspectionCoverage = { ...partial, skippedParagraphs: 0, skippedParts: [{ kind: 'complexTable', count: 2, scope: 'repairSuggestions', reason: 'r', affectedCheckIds: [] }] };
    expect(inspectionCoverageText(repairOnly)).toBe('Prijedlozi popravka ne obuhvaćaju 2 složene tablice.');
  });

  it('sadrzaj ugradjenih objekata ne cita nijedna provjera', () => {
    const objects = (count: number): InspectionCoverage => ({ ...partial, skippedParagraphs: 0, skippedParts: [{ kind: 'embeddedObject', count, scope: 'noCheck', reason: 'r', affectedCheckIds: [] }] });
    expect(inspectionCoverageText(objects(1))).toBe('Sadržaj 1 ugrađenog objekta ne čita nijedna provjera.');
    expect(inspectionCoverageText(objects(3))).toBe('Sadržaj 3 ugrađena objekta ne čita nijedna provjera.');
    expect(inspectionCoverageText(objects(5))).toBe('Sadržaj 5 ugrađenih objekata ne čita nijedna provjera.');
  });

  it('rucna provjera imenuje provjeru na koju se odnosi; nepoznato stanje ima vlastitu recenicu', () => {
    const manual: InspectionCoverage = { ...partial, status: 'manualReviewRequired', skippedParts: [{ kind: 'analysisUnavailable', count: 2, scope: 'unknown', reason: 'r', affectedCheckIds: T }] };
    expect(inspectionCoverageText(manual)).toBe('Potrebna je ručna provjera tehničko-tipografske dosljednosti. Dio analize nije izračunat.');
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

  it('bez em i en crtica ni u jednoj vrsti; svaka prebrojiva vrsta ispise svoj broj', () => {
    const kinds: Array<[InspectionSkipKind, InspectionScope]> = [
      ['citationField', 'typographyCheck'], ['textBox', 'typographyCheck'], ['nestedTable', 'typographyCheck'], ['tableCell', 'typographyCheck'],
      ['contentControl', 'typographyCheck'], ['trackedChange', 'typographyCheck'], ['equation', 'typographyCheck'], ['fieldOrHyperlink', 'typographyCheck'],
      ['otherStructure', 'typographyCheck'], ['embeddedObject', 'noCheck'], ['legalFootnote', 'repairSuggestions'], ['complexTable', 'repairSuggestions'],
      ['analysisUnavailable', 'unknown'],
    ];
    const all: InspectionCoverage = { ...partial, skippedParts: kinds.map(([kind, scope]) => ({ kind, count: 5, scope, reason: 'r', affectedCheckIds: [] })) };
    const text = inspectionCoverageText(all) ?? '';
    expect(text).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
    expect(text).not.toContain('undefined');
    // `analysisUnavailable` nema broj.
    expect(text.match(/\b5 /g) ?? []).toHaveLength(kinds.length - 1);
  });
});
