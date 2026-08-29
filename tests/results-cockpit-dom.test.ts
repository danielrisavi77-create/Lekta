import { describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import {
  renderResultsCockpit,
  resultRendererFor,
  type ResultsCockpitAction,
} from '../src/ui/results/results-cockpit';

function result(overrides: Record<string, unknown> = {}) {
  return {
    score: 87,
    scoredChecks: 12,
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      {
        severity: 'error',
        category: 'citations',
        title: 'Citirano nije prona\u0111eno u literaturi',
        detail: 'Provjeri navod Novak 2022 u popisu literature.',
        where: 'Odlomak 42',
      },
      {
        severity: 'warning',
        category: 'formatting',
        title: 'Desna margina odstupa od profila',
        detail: 'Izmjereno 2,0 cm, o\u010Dekivano pribli\u017Eno 2,5 cm.',
        where: 'Postavke stranice',
      },
      {
        severity: 'info',
        category: 'structure',
        title: 'Naslov mo\u017Eda koristi ru\u010Dno oblikovanje',
        detail: 'Provjeri Word stil naslova.',
        where: 'Odlomak 71',
      },
      {
        severity: 'warning',
        category: 'elements',
        title: 'Tablica nema prepoznat naslov',
        detail: 'Provjeri oznaku tablice.',
        where: 'Tablica 4',
      },
    ],
    checks: [],
    categories: {
      formatting: { earned: 20, max: 24 },
      structure: { earned: 18, max: 20 },
      citations: { earned: 19, max: 28 },
    },
    capabilities: { repair: true, preview: true },
    details: { ruleAuthority: 'official-source', triage: { counts: { auto: 1, assisted: 0, manual: 0, total: 1 }, findings: [{ id: 'citation', category: 'citations', title: 'Citirano nije prona\u0111eno u literaturi', severity: 'error', fixability: 'auto', fixId: 'citation-fixer', locations: [{ paragraphIndex: 42 }] }] } },
    ...overrides,
  } as never;
}

describe('Results Cockpit V1', () => {
  it('renders one clear status, one technical score and at most three priority findings', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction: vi.fn(),
      onAdvancedToggle: vi.fn(),
    });

    expect(mount.querySelector('[data-cockpit-status]')).toBeTruthy();
    expect(mount.querySelectorAll('[data-cockpit-score]')).toHaveLength(1);
    expect(mount.querySelectorAll('[data-cockpit-finding]')).toHaveLength(3);
    expect(mount.textContent).toContain('Nije spremno za predaju');
    expect(mount.textContent).toContain('87');
    expect(mount.textContent).toContain('Citirano nije prona\u0111eno u literaturi');
    expect(mount.textContent).toContain('Za\u0161to');
    expect(mount.textContent).toContain('\u0160to napraviti');
  });

  it('keeps advanced checks behind one explicit disclosure', () => {
    const mount = document.createElement('section');
    renderResultsCockpit(mount, buildVisualResultModel(result()), {
      repairAvailable: false,
      onAction: vi.fn(),
      onAdvancedToggle: vi.fn(),
    });

    const advanced = mount.querySelector<HTMLElement>('[data-cockpit-advanced]');
    expect(advanced).toBeTruthy();
    expect(advanced?.getAttribute('aria-expanded')).toBe('false');
    expect(mount.querySelector('[data-cockpit-action="advanced"]')).toBeTruthy();
  });

  it('routes primary action to the first actionable finding', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const model = buildVisualResultModel(result());
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction,
      onAdvancedToggle: vi.fn(),
    });

    mount.querySelector<HTMLButtonElement>('[data-cockpit-primary]')?.click();

    expect(onAction).toHaveBeenCalledWith({
      kind: 'repair',
      findingId: model.findings.top[0]?.id,
    });
  });

  it('lets the user open a finding location and the advanced layer', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const onAdvancedToggle = vi.fn();
    const model = buildVisualResultModel(result());
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction,
      onAdvancedToggle,
    });

    mount.querySelector<HTMLButtonElement>('[data-finding-jump]')?.click();
    mount.querySelector<HTMLButtonElement>('[data-cockpit-advanced]')?.click();

    expect(onAction).toHaveBeenCalledWith({
      kind: 'preview',
      findingId: model.findings.top[0]?.id,
    });
    expect(onAdvancedToggle).toHaveBeenCalledWith(true);
  });

  it('zadrzava rucne odluke na prioritetnom nalazu', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, { repairAvailable: true, onAction });
    mount.querySelector<HTMLButtonElement>('[data-finding-confirm]')?.click();
    expect(onAction).toHaveBeenCalledWith({ kind: 'confirm', findingId: model.findings.top[0]?.id });
    mount.querySelector<HTMLButtonElement>('[data-finding-ignore]')?.click();
    const input = mount.querySelector<HTMLInputElement>('[data-finding-ignore-reason]');
    if (input) input.value = 'Potvrdeno s mentorom';
    mount.querySelector<HTMLButtonElement>('[data-finding-ignore-save]')?.click();
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'ignore', findingId: model.findings.top[0]?.id, reason: 'Potvrdeno s mentorom' });
  });

  it('prikazuje kategorije kao sekundarne trake bez drugog glavnog indikatora', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, { repairAvailable: true });

    expect(model.categories).toHaveLength(3);
    expect(mount.querySelectorAll('[data-cockpit-category]')).toHaveLength(3);
    expect(mount.querySelectorAll('[data-cockpit-score]')).toHaveLength(1);
    expect(mount.textContent).toContain('Oblikovanje');
    expect(mount.querySelector('[data-cockpit-category="formatting"] [role="progressbar"]')).toBeTruthy();
  });

  it('uses cockpit by default and allows an explicit legacy opt-out', () => {
    expect(resultRendererFor(document)).toBe('legacy');
    const cockpitView = document.implementation.createHTMLDocument('cockpit');
    cockpitView.documentElement.dataset.resultRenderer = 'cockpit';
    Object.defineProperty(cockpitView, 'defaultView', { value: { location: { search: '' } } });
    expect(resultRendererFor(cockpitView)).toBe('cockpit');
    const legacyView = document.implementation.createHTMLDocument('legacy');
    legacyView.documentElement.dataset.resultRenderer = 'cockpit';
    Object.defineProperty(legacyView, 'defaultView', { value: { location: { search: '?resultRenderer=legacy' } } });
    expect(resultRendererFor(legacyView)).toBe('legacy');
  });
});
