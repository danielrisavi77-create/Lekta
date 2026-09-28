import { describe, expect, it } from 'vitest';
import { buildVisualResultModel, type VisualResultInput } from '../src/ui/results/visual-result-model';
import type { FindingSessionState } from '../src/ui/finding-view-model';

const baseResult: VisualResultInput = {
  score: 82,
  generatedAt: '2026-08-29T10:00:00.000Z',
  profileStatus: 'verified',
  details: {
    ruleAuthority: 'official-source',
    sources: [{ title: 'Generic profile context', url: 'https://example.test/context' }],
    verifiedAt: '2026-08-01',
    triage: {
      counts: { auto: 1, assisted: 0, manual: 3, total: 4 },
      findings: [
        { id: 'margins', category: 'formatting', title: 'Margine', severity: 'warning', fixability: 'auto', fixId: 'margins-fixer', locations: [] },
        { id: 'title', category: 'structure', title: 'Naslov', severity: 'error', fixability: 'manual', locations: [] },
        { id: 'package', category: 'submission', title: 'Paket', severity: 'error', fixability: 'manual', locations: [] },
        { id: 'citation', category: 'citations', title: 'Citati', severity: 'warning', fixability: 'manual', locations: [] },
      ],
    },
  },
  checks: [
    { id: 'page.margins', category: 'formatting', title: 'Margine', status: 'warn', earned: 2, max: 6, detail: '2,0 cm', scored: true, issue: null },
    { id: 'structure.title', category: 'structure', title: 'Naslov', status: 'fail', earned: 0, max: 5, detail: 'preskocena razina', scored: true, issue: null },
    { id: 'submission.package', category: 'submission', title: 'Paket', status: 'fail', earned: 0, max: 5, detail: 'nije spreman', scored: true, issue: null },
    { id: 'citation.required', category: 'citations', title: 'Citati', status: 'warn', earned: 1, max: 4, detail: 'nedostaje izvor', scored: true, issue: null },
  ],
  issues: [
    { severity: 'warning', category: 'formatting', title: 'Margine', detail: 'Margine odstupaju.', where: 'Postavke stranice' },
    { severity: 'error', category: 'structure', title: 'Naslov', detail: 'Naslov preskace razinu.', where: 'Odlomak 7' },
    { severity: 'error', category: 'submission', title: 'Paket', detail: 'Paket nije spreman i blokira predaju.', where: 'Predajni paket' },
    { severity: 'warning', category: 'citations', title: 'Citati', detail: 'Nedostaje izvor.', where: 'Fusnote' },
  ],
};

describe('VisualResultModel', () => {
  it('builds a scored state with bounded value, scored check count, readiness and verified authority', () => {
    const model = buildVisualResultModel(baseResult);

    expect(model.score).toEqual({ kind: 'scored', value: 82, max: 100, scoredChecks: 4, authority: 'verified' });
    expect(model.readiness.kind).toBe('blocked');
    expect(model.readiness.authoritative).toBe(true);
    expect(model.authority.kind).toBe('verified');
    expect(model.authority.label).toBe('Provjereni fakultetski izvor');
    expect(model.authority.description).toBe('Rezultat se oslanja na provjereni fakultetski izvor.');
    expect(model.authority.label).not.toContain('Verified faculty authority');
  });

  it('keeps unscored results from pretending they are 0 of 100', () => {
    const model = buildVisualResultModel({ issues: [], checks: [] });

    expect(model.score.kind).toBe('unscored');
    expect(model.score).toEqual({ kind: 'unscored', label: 'Nije bodovano', reason: 'Rezultat nema bodovanu tehničku ocjenu.' });
    expect('value' in model.score).toBe(false);
    expect('max' in model.score).toBe(false);
  });

  it('separates limitations from document findings and excludes them from readiness blockers', () => {
    const model = buildVisualResultModel({
      profileStatus: 'verified',
      details: { ruleAuthority: 'official-source' },
      issues: [
        { severity: 'error', category: 'profile', title: 'Profil ograniceno terenski testiran', detail: 'Ogranicenje profila.', where: 'Terenska verifikacija' },
        { severity: 'warning', category: 'formatting', title: 'Margine', detail: 'Margine odstupaju.', where: 'Postavke stranice' },
      ],
    });

    expect(model.findings.limitations.map((finding) => finding.title)).toEqual(['Profil ograniceno terenski testiran']);
    expect(model.findings.document.map((finding) => finding.title)).toEqual(['Margine']);
    expect(model.readiness.kind).toBe('needs-work');
    expect(model.readiness.blockers).toBe(0);
  });

  it('uses deterministic topFindings semantics, caps at 3 and excludes ignored findings', () => {
    const states = new Map<string, FindingSessionState>([
      ['finding:submission:paket', { status: 'ignored', ignoredReason: 'Mentor je odobrio iznimku' }],
    ]);

    const model = buildVisualResultModel(baseResult, { states });

    expect(model.findings.top.map((finding) => finding.title)).toEqual(['Naslov', 'Margine', 'Citati']);
    expect(model.findings.top).toHaveLength(3);
    expect(model.findings.top.some((finding) => finding.title === 'Paket')).toBe(false);
  });

  it('accepts exact evidence only from a fully verified explicit entry', () => {
    const model = buildVisualResultModel(baseResult, {
      exactEvidence: {
        'finding:formatting:margine': {
          verified: true,
          sourceId: 'fpzg-upute',
          title: 'Sluzbene upute',
          url: 'https://example.test/upute',
          quote: 'Margine su propisane u pravilniku.',
          page: 12,
          expected: 'Lijeva margina 3 cm.',
        },
        'finding:structure:naslov': {
          verified: false,
          sourceId: 'fpzg-upute',
          title: 'Sluzbene upute',
          url: 'https://example.test/upute',
          quote: 'Naslovi su opisani.',
          page: null,
          expected: 'Naslovi po razinama.',
        },
        'finding:submission:paket': {
          verified: true,
          sourceId: 'fpzg-upute',
          title: 'Sluzbene upute',
          url: 'https://example.test/upute',
          quote: 'Predajni paket.',
        },
      },
    });

    const margins = model.findings.document.find((finding) => finding.id === 'finding:formatting:margine');
    const title = model.findings.document.find((finding) => finding.id === 'finding:structure:naslov');
    const pack = model.findings.document.find((finding) => finding.id === 'finding:submission:paket');

    expect(margins?.exactEvidence).toEqual({
      verified: true,
      sourceId: 'fpzg-upute',
      title: 'Sluzbene upute',
      url: 'https://example.test/upute',
      quote: 'Margine su propisane u pravilniku.',
      page: 12,
      // `pageLabel` nosi DOSLOVNU formulaciju izvora o mjestu, jer `sourcePage` u pravilima nije
      // broj nego slobodan tekst ("str. 9 (odjeljak 2.4 ...)"). Ovdje ga ulaz ne daje, pa je null.
      // Numericki `page` ostaje strogo cuvan testom ispod; ovo je dodatak, ne popustanje.
      pageLabel: null,
    });
    expect(margins?.source?.exact).toBe(true);
    expect(margins?.expected).toBe('Lijeva margina 3 cm.');
    expect(title?.exactEvidence).toBeUndefined();
    expect(pack?.exactEvidence).toBeUndefined();
    expect(model.capabilities.exactEvidence).toBe(true);
  });

  it('accepts only null or whole explicit evidence pages from 1 onward', () => {
    const withNullPage = buildVisualResultModel(baseResult, {
      exactEvidence: {
        'finding:formatting:margine': {
          verified: true,
          sourceId: 'fpzg-upute',
          title: 'Sluzbene upute',
          url: 'https://example.test/upute',
          quote: 'Margine su propisane u pravilniku.',
          page: null,
        },
      },
    });

    expect(withNullPage.findings.document.find((finding) => finding.id === 'finding:formatting:margine')?.exactEvidence?.page).toBeNull();

    for (const invalidPage of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0, 1.5]) {
      const model = buildVisualResultModel(baseResult, {
        exactEvidence: {
          'finding:formatting:margine': {
            verified: true,
            sourceId: 'fpzg-upute',
            title: 'Sluzbene upute',
            url: 'https://example.test/upute',
            quote: 'Margine su propisane u pravilniku.',
            page: invalidPage,
          },
        },
      });

      expect(model.findings.document.find((finding) => finding.id === 'finding:formatting:margine')?.exactEvidence).toBeUndefined();
    }
  });

  it('does not infer exact evidence or expected values from generic profile context', () => {
    const [finding] = buildVisualResultModel(baseResult).findings.document;

    expect(finding.source).toEqual({
      title: 'Generic profile context',
      url: 'https://example.test/context',
      date: '2026-08-01',
      exact: false,
    });
    expect(finding.exactEvidence).toBeUndefined();
    expect(finding.expected).toBeUndefined();
  });

  it('requires an actual fix id or repair item signal before enabling repair CTA eligibility', () => {
    const noSignal = buildVisualResultModel({ ...baseResult, capabilities: { repair: true }, details: { ...baseResult.details, triage: undefined } });
    const withTriageFixId = buildVisualResultModel({ ...baseResult, capabilities: { repair: true } });
    const withRepairItem = buildVisualResultModel(
      { ...baseResult, capabilities: { repair: true }, details: { ...baseResult.details, triage: undefined } },
      { repairItems: [{ fixerId: 'margins-fixer', matchKeys: ['Margine'] }] },
    );

    expect(noSignal.capabilities.repair).toBe(false);
    expect(noSignal.findings.document.find((finding) => finding.title === 'Margine')?.capabilities.repair).toBe(false);
    expect(withTriageFixId.findings.document.find((finding) => finding.title === 'Margine')?.capabilities.repair).toBe(true);
    expect(withRepairItem.findings.document.find((finding) => finding.title === 'Margine')?.capabilities.repair).toBe(true);
  });

  it('keeps content-free metadata free of document text, source quotes and storage payloads', () => {
    const model = buildVisualResultModel(
      {
        ...baseResult,
        issues: [
          { severity: 'warning', category: 'formatting', title: 'Margine', detail: 'TAJNI TEKST RADA iz odlomka.', where: 'Odlomak 9, jos teksta rada' },
        ],
        checks: [
          { id: 'page.margins', category: 'formatting', title: 'Margine', status: 'warn', earned: 2, max: 6, detail: 'MJERENI DETALJ RADA', scored: true, issue: null },
        ],
      },
      {
        exactEvidence: {
          'finding:formatting:margine': {
            verified: true,
            sourceId: 'fpzg-upute',
            title: 'Sluzbene upute',
            url: 'https://example.test/upute',
            quote: 'SLUZBENI CITAT PRAVILA',
            page: null,
          },
        },
      },
    );

    const safeJson = JSON.stringify(model.contentFreeMetadata);
    expect(safeJson).not.toContain('TAJNI TEKST RADA');
    expect(safeJson).not.toContain('Odlomak 9');
    expect(safeJson).not.toContain('MJERENI DETALJ RADA');
    expect(safeJson).not.toContain('SLUZBENI CITAT PRAVILA');
    expect(Object.keys(model.contentFreeMetadata).sort()).toEqual([
      'authorityKind',
      'capabilities',
      'documentFindingCount',
      'documentFindingIds',
      'limitationFindingCount',
      'readinessKind',
      'score',
     'signals',
      'topFindingIds',
    ]);
  });

  it('inspectionCoverage je transparentna ograda i ne mijenja score ni readiness', () => {
    const baseline = buildVisualResultModel(baseResult);
    const partial = buildVisualResultModel({
      ...baseResult,
      details: {
        ...baseResult.details,
        inspectionCoverage: {
          version: 1,
          status: 'partial',
          items: [
            { kind: 'content-control', count: 2 },
            { kind: 'tracked-change', count: 1 },
          ],
          analyzerSkips: [{ analyzer: 'typography', count: 3 }],
          summary: { limitedKinds: 2, limitedOccurrences: 3, analyzerSkips: 3 },
        },
      },
    });

    expect(partial.score).toEqual(baseline.score);
    expect(partial.readiness).toEqual(baseline.readiness);
    expect(partial.signals).toEqual(baseline.signals);
    expect(partial.inspectionCoverage).toEqual({
      status: 'partial',
      limitedOccurrences: 3,
      analyzerSkips: 3,
      labels: ['strukturirane kontrole', 'praćene izmjene'],
      analyzerLabels: ['tipografija'],
    });
  });

  it('M3: imenuje provjere s preskocima iz fiksnog mapiranja, nikad iz slobodnog teksta', () => {
    const model = buildVisualResultModel({
      ...baseResult,
      details: {
        ...baseResult.details,
        inspectionCoverage: {
          version: 1,
          status: 'partial',
          items: [
            { kind: 'unbalanced-field', count: 1 },
            // Nepoznat ili prototipni kljuc iz nepouzdanog ulaza ne smije postati oznaka.
            { kind: 'toString', count: 1 },
            { kind: 'Tajni tekst rada', count: 1 },
          ],
          analyzerSkips: [
            { analyzer: 'typography', count: 1 },
            { analyzer: 'consistency', count: 2 },
            { analyzer: 'link-doi', count: 1 },
            { analyzer: 'required-sections', count: 1 },
            { analyzer: 'legal-footnotes', count: 1 },
            { analyzer: 'constructor', count: 1 },
            { analyzer: 'Tajni tekst rada', count: 4, reason: 'Tajni reason' },
            { analyzer: 'typography', count: 0 },
          ],
          summary: { limitedKinds: 1, limitedOccurrences: 1, analyzerSkips: 6 },
        } as any,
      },
    });
    expect(model.inspectionCoverage?.labels).toEqual(['nezatvorena Word polja']);
    expect(model.inspectionCoverage?.analyzerLabels).toEqual([
      'tipografija',
      'dosljednost',
      'poveznice i DOI',
      'obvezni dijelovi',
      'pravne fusnote',
    ]);
    const json = JSON.stringify(model.inspectionCoverage);
    expect(json).not.toContain('Tajni');
    expect(json).not.toMatch(/[\u2013\u2014]/);
  });

  it('complete inspection coverage ostaje eksplicitno complete bez izmisljene granice', () => {
    const model = buildVisualResultModel({
      ...baseResult,
      details: {
        ...baseResult.details,
        inspectionCoverage: {
          version: 1,
          status: 'no-known-limits',
          items: [],
          analyzerSkips: [],
          summary: { limitedKinds: 0, limitedOccurrences: 0, analyzerSkips: 0 },
        },
      },
    });
    expect(model.inspectionCoverage).toEqual({
      status: 'no-known-limits',
      limitedOccurrences: 0,
      analyzerSkips: 0,
      labels: [],
      analyzerLabels: [],
    });
  });

});
