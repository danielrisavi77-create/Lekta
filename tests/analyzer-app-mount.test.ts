import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';

const analysisClient = vi.hoisted(() => ({
  analyze: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../src/analysis/analyze-docx-client', () => ({
  analyzeDocxOffThread: analysisClient.analyze,
  cancelActiveAnalysis: analysisClient.cancel,
  isAnalysisCancelled: () => false,
}));

type AnalyzerModule = typeof import('../src/ui/app');

function analyzerOnlyFixture(policy = 'after-profile-confirmation'): void {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const start = source.indexOf('<section class="section section-soft" id="analyzer">');
  const end = source.indexOf('<section class="ks-marquee"', start);
  if (start < 0 || end < 0) throw new Error('index.html nema #analyzer fixture');
  const markup = source.slice(start, end);
  const host = document.createElement('div');
  host.innerHTML = markup;
  const analyzer = host.querySelector<HTMLElement>('#analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer fixture');
  analyzer.dataset.analysisStart = policy;
  document.body.replaceChildren(document.importNode(analyzer, true));
}

function validDocx(name: string): File {
  return buildDocxFile({
    paragraphs: [
      { text: '1. Uvod', styleId: 'Heading1' },
      ...Array.from({ length: 45 }, () => ({
        text: 'Ovo je odlomak akademskog rada s dovoljno teksta za sigurnu ulaznu provjeru. '.repeat(4),
      })),
    ],
  }, name);
}

function completedResult(file: File): Record<string, unknown> {
  return {
    version: 'test-real-analysis',
    appVersion: 'test',
    generatedAt: '2026-08-22T12:00:00.000Z',
    file: { name: file.name, size: file.size },
    profile: 'Testni profil',
    profileStatus: 'generic',
    selection: { workType: 'graduate' },
    settings: {
      workType: 'graduate',
      citationStyle: 'harvard',
      language: 'hr',
      submissionPhase: 'document',
      selectionIds: {},
    },
    score: 100,
    checks: [],
    issues: [],
    categories: {
      formatting: { earned: 0, max: 0 },
      structure: { earned: 0, max: 0 },
      citations: { earned: 0, max: 0 },
      elements: { earned: 0, max: 0 },
    },
    stats: {
      words: 1800,
      paragraphs: 46,
      headings: 1,
      references: 0,
      citations: 0,
      tables: 0,
      images: 0,
      sections: 1,
    },
    details: {
      missingReferences: [],
      uncitedReferences: [],
      incompleteReferences: [],
      sections: [],
      sources: [],
      ruleAuthority: 'official-sources-only',
      submissionFacts: [],
      profileFingerprint: 'test-profile',
    },
  };
}

describe('mountable analyzer runtime', () => {
  let app: AnalyzerModule;

  beforeAll(async () => {
    localStorage.clear();
    analyzerOnlyFixture();
    vi.stubGlobal('Worker', class Worker {});
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    analysisClient.analyze.mockImplementation(async (file: File) => completedResult(file));
    app = await import('../src/ui/app');
  }, 180_000);

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('mounta samo #analyzer bez landing, pricing, commerce, history ili dev panela', () => {
    expect(document.getElementById('analyzer')).toBeTruthy();
    expect(document.getElementById('pricingGrid')).toBeNull();
    expect(document.getElementById('orderModal')).toBeNull();
    expect(document.getElementById('historyModal')).toBeNull();
    expect(document.getElementById('qaModal')).toBeNull();
    expect(() => app.initAnalyzerApp(document)).not.toThrow();
  });

  it('ponovni mount ne udvostrucuje listenere, emitira stvarni rezultat i preskace demo', async () => {
    app.initAnalyzerApp(document);
    app.initAnalyzerApp(document);
    const listener = vi.fn();
    const unsubscribe = app.subscribeAnalyzerResult(listener);

    document.getElementById('demoBtn')?.click();
    expect(listener).not.toHaveBeenCalled();
    document.getElementById('newAnalysis')?.click();

    analysisClient.analyze.mockClear();
    const file = validDocx('stvarna-analiza.docx');
    await app.loadAnalyzerDocument({ file, source: 'memory-only' });
    document.getElementById('workType')?.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('analyzeBtn')?.click();

    await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    expect(listener.mock.calls[0][0]).toMatchObject({
      result: { version: 'test-real-analysis', file: { name: file.name } },
    });
    expect(listener.mock.calls[0][0].profile).toBeTruthy();
    unsubscribe();
    document.getElementById('newAnalysis')?.click();
  }, 30_000);

  it('loadAnalyzerDocument ponovno provjerava spremljenu datoteku kroz intake gate', async () => {
    const cachedButInvalid = new File([new Uint8Array(100)], 'cached-session.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await app.loadAnalyzerDocument({ file: cachedButInvalid, source: 'workspace-session' });

    expect(document.getElementById('dropError')?.textContent).toMatch(/premal/i);
    expect((document.getElementById('analyzeBtn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('route policy gata admission, wizard promjenu i povratak iz rezultata, a legacy ruta ostaje spekulativna', async () => {
    analysisClient.analyze.mockClear();
    const analyzer = document.getElementById('analyzer')!;
    analyzer.dataset.analysisStart = 'after-profile-confirmation';
    await app.loadAnalyzerDocument({ file: validDocx('gated.docx'), source: 'memory-only' });
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(analysisClient.analyze).not.toHaveBeenCalled();

    document.getElementById('wizardView')?.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(analysisClient.analyze).not.toHaveBeenCalled();

    document.getElementById('resultBackProfile')?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(analysisClient.analyze).not.toHaveBeenCalled();

    delete analyzer.dataset.analysisStart;
    await app.loadAnalyzerDocument({ file: validDocx('legacy.docx'), source: 'memory-only' });
    await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  }, 30_000);
});
