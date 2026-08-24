import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';

const analysisClient = vi.hoisted(() => ({
  analyze: vi.fn(),
  cancel: vi.fn(),
}));
const intakeControl = vi.hoisted(() => ({
  override: null as null | ((file: File) => Promise<unknown>),
}));
const quickStatsControl = vi.hoisted(() => ({ disabled: false }));
const repairControl = vi.hoisted(() => ({
  capture: false,
  reanalyze: null as null | ((bytes: Uint8Array) => Promise<unknown>),
}));

vi.mock('../src/analysis/analyze-docx-client', () => ({
  analyzeDocxOffThread: analysisClient.analyze,
  cancelActiveAnalysis: analysisClient.cancel,
  isAnalysisCancelled: () => false,
}));
vi.mock('../src/docx/intake-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/docx/intake-gate')>();
  return {
    ...actual,
    inspectDocxIntake: (file: File) => intakeControl.override
      ? intakeControl.override(file)
      : actual.inspectDocxIntake(file),
  };
});
vi.mock('../src/docx/quick-stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/docx/quick-stats')>();
  return {
    ...actual,
    docxQuickStats: (file: File) => quickStatsControl.disabled
      ? Promise.resolve(null)
      : actual.docxQuickStats(file),
  };
});
vi.mock('../src/report/profile-rules-client', () => ({
  fetchProfileRulesWithRetry: async (_config: unknown, profileId: string) => {
    const artifact = JSON.parse(readFileSync(
      resolve(process.cwd(), 'data/generated/profile-rules-server.json'),
      'utf8',
    )) as { datasetVersion: string; profiles: Record<string, { profile: Record<string, unknown>; repairEntries: unknown[] }> };
    const entry = artifact.profiles[profileId];
    return entry
      ? { kind: 'ok' as const, record: { v: 1 as const, profileId, datasetVersion: artifact.datasetVersion, ...entry } }
      : { kind: 'not_found' as const };
  },
}));
vi.mock('../src/ui/repair-items', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/repair-items')>();
  return {
    ...actual,
    buildRepairableItems: (...args: Parameters<typeof actual.buildRepairableItems>) => repairControl.capture
      ? [{ fixerId: 'font-fixer', ruleId: 'format.font', label: 'Testni popravak', params: {}, violated: true }]
      : actual.buildRepairableItems(...args),
  };
});
vi.mock('../src/ui/repair-panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/repair-panel')>();
  return {
    ...actual,
    renderRepairPanel: (options: Parameters<typeof actual.renderRepairPanel>[0]) => {
      if (!repairControl.capture) return actual.renderRepairPanel(options);
      repairControl.reanalyze = options.reanalyze;
      const marker = options.mountEl.ownerDocument.createElement('div');
      marker.dataset.testRepairPanel = 'true';
      options.mountEl.replaceChildren(marker);
    },
  };
});

type AnalyzerModule = typeof import('../src/ui/app');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function analyzerOnlyFixture(policy = 'after-profile-confirmation', target = document): void {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const start = source.indexOf('<section class="section section-soft" id="analyzer">');
  const end = source.indexOf('<section class="ks-marquee"', start);
  if (start < 0 || end < 0) throw new Error('index.html nema #analyzer fixture');
  const markup = source.slice(start, end);
  const host = target.createElement('div');
  host.innerHTML = markup;
  const analyzer = host.querySelector<HTMLElement>('#analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer fixture');
  analyzer.dataset.analysisStart = policy;
  target.body.replaceChildren(target.importNode(analyzer, true));
}

function fullPageFixture(target: Document): void {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const bodyStart = source.indexOf('<body');
  const bodyOpenEnd = source.indexOf('>', bodyStart);
  const bodyEnd = source.lastIndexOf('</body>');
  if (bodyStart < 0 || bodyOpenEnd < 0 || bodyEnd < 0) throw new Error('index.html nema valjani <body> fixture');
  const host = target.createElement('div');
  host.innerHTML = source.slice(bodyOpenEnd + 1, bodyEnd);
  target.body.replaceChildren(...Array.from(host.childNodes));
}

async function mountPartialPage(
  missingLegacyRoot: string,
  config: Record<string, unknown> = {},
  prepare?: (target: Document) => void,
): Promise<Document> {
  document.body.replaceChildren();
  localStorage.clear();
  localStorage.setItem('lekta.production.v2.1', JSON.stringify({
    repairEndpoint: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    ...config,
  }));
  const supplied = document.implementation.createHTMLDocument(`Partial route without ${missingLegacyRoot}`);
  fullPageFixture(supplied);
  const missing = supplied.getElementById(missingLegacyRoot);
  if (!missing) throw new Error(`index.html nema #${missingLegacyRoot} fixture`);
  missing.remove();
  prepare?.(supplied);
  vi.resetModules();
  const isolatedApp = await import('../src/ui/app');
  isolatedApp.initAnalyzerApp(supplied);
  return supplied;
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
    fullReport: true,
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
      profileDefinitionId: 'fer-diplomski',
    },
  };
}

describe.sequential('supplied Document mount boundary', () => {
  it('retries a failed supplied-document mount and installs one handler without touching the global document', async () => {
    const globalSentinel = document.createElement('div');
    globalSentinel.className = 'lek-col-form';
    document.body.replaceChildren(globalSentinel);
    const supplied = document.implementation.createHTMLDocument('Analyzer runtime');
    analyzerOnlyFixture('after-profile-confirmation', supplied);
    vi.resetModules();
    const isolatedApp = await import('../src/ui/app');
    const input = supplied.getElementById('fileInput') as HTMLInputElement;
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    const realGetById = supplied.getElementById.bind(supplied);
    const lookup = vi.spyOn(supplied, 'getElementById')
      .mockImplementationOnce(() => { throw new Error('namjerni mount kvar'); })
      .mockImplementation((id: string) => realGetById(id));

    expect(() => isolatedApp.initAnalyzerApp(supplied)).toThrow('namjerni mount kvar');
    lookup.mockRestore();
    expect(() => isolatedApp.initAnalyzerApp(supplied)).not.toThrow();
    isolatedApp.initAnalyzerApp(supplied);
    supplied.getElementById('browseBtn')?.click();

    expect(inputClick).toHaveBeenCalledTimes(1);
    supplied.getElementById('demoBtn')?.click();
    expect(supplied.querySelector('.lek-col-form')?.classList.contains('lek-engaged')).toBe(true);
    expect(globalSentinel.classList.contains('lek-engaged')).toBe(false);
    expect(document.getElementById('lekResultProgress')).toBeNull();
    expect(document.getElementById('analyzer')).toBeNull();
    expect(Array.from(document.body.children, (element) => `${element.tagName}#${element.id}.${element.className}`))
      .toEqual(['DIV#.lek-col-form']);

    const second = document.implementation.createHTMLDocument('Drugi analyzer runtime');
    analyzerOnlyFixture('after-profile-confirmation', second);
    expect(() => isolatedApp.initAnalyzerApp(second)).toThrow(/jedan aktivni Document/i);
  }, 180_000);
});

describe.sequential('root-aware mount domain regressions', () => {
  afterAll(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  describe('analyzer, profile and result controls on a partial analyzer route', () => {
    let supplied: Document;

    beforeAll(async () => {
      supplied = await mountPartialPage('checkGrid');
    }, 180_000);

    it('institution change repopulates the unit select through the profile cascade handler', () => {
      const institution = supplied.getElementById('institutionSelect') as HTMLSelectElement;
      const unit = supplied.getElementById('unitSelect') as HTMLSelectElement;

      institution.value = 'unios';
      institution.dispatchEvent(new Event('change', { bubbles: true }));

      expect(Array.from(unit.options, (option) => option.value)).toContain('efos');
    });

    it('detailsToggle reveals the detailed result tabs through the result-controls handler', () => {
      const details = supplied.getElementById('tabDetails') as HTMLElement;

      expect(details.hasAttribute('hidden')).toBe(true);
      supplied.getElementById('detailsToggle')?.click();

      expect(details.hasAttribute('hidden')).toBe(false);
    });
  });

  describe('landing controls on a route without commerce', () => {
    let supplied: Document;

    beforeAll(async () => {
      supplied = await mountPartialPage('orderModal');
    }, 180_000);

    it('landing mount populates both the check and pricing grids', () => {
      expect(supplied.getElementById('checkGrid')?.childElementCount).toBeGreaterThan(0);
      expect(supplied.getElementById('pricingGrid')?.childElementCount).toBeGreaterThan(0);
    });

    it('uploadCtaBtn engages the analyzer form and invokes the real file-input click boundary', () => {
      const form = supplied.querySelector<HTMLElement>('.lek-col-form');
      const input = supplied.getElementById('fileInput') as HTMLInputElement;
      const inputClick = vi.spyOn(input, 'click').mockImplementation(() => undefined);

      supplied.getElementById('uploadCtaBtn')?.click();

      expect(form?.classList.contains('lek-engaged')).toBe(true);
      expect(inputClick).toHaveBeenCalledTimes(1);
      inputClick.mockRestore();
    });
  });

  describe('commerce, legal and auth controls on a route without history', () => {
    let supplied: Document;

    beforeAll(async () => {
      supplied = await mountPartialPage('historyModal', {
        enabled: true,
        orderEndpoint: '/orders',
      }, (target) => {
        const orderButton = target.createElement('button');
        orderButton.id = 'partialOrderButton';
        orderButton.className = 'order-btn';
        orderButton.dataset.package = 'format';
        target.body.append(orderButton);
      });
    }, 180_000);

    it('order-btn opens orderModal and closeModal closes it through commerce handlers', () => {
      const modal = supplied.getElementById('orderModal') as HTMLElement;

      supplied.getElementById('partialOrderButton')?.click();
      expect(modal.classList.contains('hidden')).toBe(false);

      supplied.getElementById('closeModal')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('delegated legal-open click opens legalModal and closeLegal closes it', () => {
      const modal = supplied.getElementById('legalModal') as HTMLElement;
      const trigger = supplied.querySelector<HTMLButtonElement>('#orderModal .legal-open');

      trigger?.click();
      expect(modal.classList.contains('hidden')).toBe(false);

      supplied.getElementById('closeLegal')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('closeAuth closes an open authModal through the auth-controls handler', () => {
      const modal = supplied.getElementById('authModal') as HTMLElement;

      modal.classList.remove('hidden');
      supplied.getElementById('closeAuth')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });
  });

  describe('history controls without an optional history badge', () => {
    let supplied: Document;

    beforeAll(async () => {
      supplied = await mountPartialPage('orderModal', {}, (target) => {
        target.getElementById('historyCount')?.remove();
      });
    }, 180_000);

    it('historyBtn opens historyModal and closeHistory closes it without historyCount', () => {
      const modal = supplied.getElementById('historyModal') as HTMLElement;

      supplied.getElementById('historyBtn')?.click();
      expect(modal.classList.contains('hidden')).toBe(false);

      supplied.getElementById('closeHistory')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('repairHistoryBtn opens repairHistoryModal and closeRepairHistory closes it', () => {
      const modal = supplied.getElementById('repairHistoryModal') as HTMLElement;

      supplied.getElementById('repairHistoryBtn')?.click();
      expect(modal.classList.contains('hidden')).toBe(false);

      supplied.getElementById('closeRepairHistory')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('historyBtn still opens historyModal when the optional history list is absent', () => {
      const modal = supplied.getElementById('historyModal') as HTMLElement;
      supplied.getElementById('historyList')?.remove();

      expect(() => supplied.getElementById('historyBtn')?.click()).not.toThrow();
      expect(modal.classList.contains('hidden')).toBe(false);
    });
  });

  describe('dev controls on a partial route', () => {
    let supplied: Document;

    beforeAll(async () => {
      supplied = await mountPartialPage('orderModal');
    }, 180_000);

    it('qaBtn opens qaModal and closeQa closes it through the dev binder', () => {
      const modal = supplied.getElementById('qaModal') as HTMLElement;

      supplied.getElementById('qaBtn')?.click();
      expect(modal.classList.contains('hidden')).toBe(false);

      supplied.getElementById('closeQa')?.click();
      expect(modal.classList.contains('hidden')).toBe(true);
    });
  });
});

describe('mountable analyzer runtime', () => {
  let app: AnalyzerModule;

  beforeAll(async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('lekta.production.v2.1', JSON.stringify({ repairEndpoint: '' }));
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

  afterEach(() => {
    intakeControl.override = null;
    quickStatsControl.disabled = false;
    repairControl.capture = false;
    repairControl.reanalyze = null;
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
    document.getElementById('historyCount')?.remove();

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

  it('ne emitira rezultat kada stvarna analiza završi greškom', async () => {
    const listener = vi.fn();
    const unsubscribe = app.subscribeAnalyzerResult(listener);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    analysisClient.analyze.mockClear();
    analysisClient.analyze.mockRejectedValueOnce(new Error('namjerna analiza greška'));
    const file = validDocx('errored.docx');

    try {
      await app.loadAnalyzerDocument({ file, source: 'memory-only' });
      document.getElementById('workType')?.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('analyzeBtn')?.click();
      await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      await vi.waitFor(() => expect(document.getElementById('wizardView')?.classList.contains('hidden')).toBe(false));
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      consoleError.mockRestore();
      analysisClient.analyze.mockImplementation(async (input: File) => completedResult(input));
      document.getElementById('newAnalysis')?.click();
    }
  }, 30_000);

  it('ne emitira rezultat kada korisnik otkaže aktivnu analizu', async () => {
    const listener = vi.fn();
    const unsubscribe = app.subscribeAnalyzerResult(listener);
    const pending = deferred<Record<string, unknown>>();
    analysisClient.analyze.mockClear();
    analysisClient.analyze.mockImplementationOnce(() => pending.promise);
    const file = validDocx('canceled.docx');

    try {
      await app.loadAnalyzerDocument({ file, source: 'memory-only' });
      document.getElementById('workType')?.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('analyzeBtn')?.click();
      await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      document.getElementById('cancelAnalysisBtn')?.click();
      pending.resolve(completedResult(file));
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      pending.resolve(completedResult(file));
      unsubscribe();
      analysisClient.analyze.mockImplementation(async (input: File) => completedResult(input));
      document.getElementById('newAnalysis')?.click();
    }
  }, 30_000);

  it('ne emitira zastarjeli rezultat nakon što drugi dokument postane aktivan', async () => {
    const listener = vi.fn();
    const unsubscribe = app.subscribeAnalyzerResult(listener);
    const pendingA = deferred<Record<string, unknown>>();
    analysisClient.analyze.mockClear();
    analysisClient.analyze.mockImplementationOnce(() => pendingA.promise);
    const fileA = validDocx('stale-a.docx');
    const fileB = validDocx('stale-b.docx');

    try {
      await app.loadAnalyzerDocument({ file: fileA, source: 'memory-only' });
      document.getElementById('workType')?.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('analyzeBtn')?.click();
      await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      await app.loadAnalyzerDocument({ file: fileB, source: 'memory-only' });
      pendingA.resolve(completedResult(fileA));
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      pendingA.resolve(completedResult(fileA));
      unsubscribe();
      analysisClient.analyze.mockImplementation(async (input: File) => completedResult(input));
      document.getElementById('newAnalysis')?.click();
    }
  }, 30_000);

  it('repair reanalysis koristi worker bez emitiranja novog AnalyzerResultEventa', async () => {
    const listener = vi.fn();
    const unsubscribe = app.subscribeAnalyzerResult(listener);
    repairControl.capture = true;
    analysisClient.analyze.mockClear();
    const file = validDocx('repair-source.docx');

    try {
      await app.loadAnalyzerDocument({ file, source: 'memory-only' });
      document.getElementById('workType')?.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('analyzeBtn')?.click();
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1), { timeout: 15_000 });
      await vi.waitFor(() => expect(repairControl.reanalyze).toBeTypeOf('function'), { timeout: 15_000 });
      listener.mockClear();
      analysisClient.analyze.mockClear();
      await repairControl.reanalyze!(new Uint8Array([80, 75, 3, 4]));

      expect(analysisClient.analyze).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      document.getElementById('newAnalysis')?.click();
    }
  }, 45_000);

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

  it('stale admission A ne mijenja profil niti analizira B prije B intake verdicta', async () => {
    document.getElementById('newAnalysis')?.click();
    delete document.getElementById('analyzer')!.dataset.analysisStart;
    quickStatsControl.disabled = true;
    analysisClient.analyze.mockClear();

    const institution = document.getElementById('institutionSelect') as HTMLSelectElement;
    institution.value = 'unios';
    expect(institution.value).toBe('unios');

    const fileA = buildDocxFile({
      paragraphs: [
        { text: 'Sveučilište u Zagrebu Fakultet političkih znanosti Diplomski rad' },
        ...Array.from({ length: 45 }, () => ({ text: 'Akademski odlomak za detekciju profila. '.repeat(8) })),
      ],
    }, 'a-fpzg.docx');
    const fileB = validDocx('b-current.docx');
    const fileABytes = await fileA.arrayBuffer();
    const detectionA = deferred<ArrayBuffer>();
    const intakeB = deferred<any>();
    const intakeBStarted = deferred<void>();
    vi.spyOn(fileA, 'arrayBuffer').mockImplementation(() => detectionA.promise);
    intakeControl.override = async (file: File) => {
      if (file === fileA) return { kind: 'ok' };
      if (file === fileB) {
        intakeBStarted.resolve();
        return intakeB.promise;
      }
      return { kind: 'ok' };
    };

    const loadA = app.loadAnalyzerDocument({ file: fileA, source: 'memory-only' });
    let loadB: Promise<void> | null = null;
    try {
      await vi.waitFor(() => expect(fileA.arrayBuffer).toHaveBeenCalledTimes(1), { timeout: 15_000 });
      loadB = app.loadAnalyzerDocument({ file: fileB, source: 'memory-only' });
      await intakeBStarted.promise;
      detectionA.resolve(fileABytes);
      await loadA;

      expect(institution.value).toBe('unios');
      expect(analysisClient.analyze).not.toHaveBeenCalled();

      intakeB.resolve({ kind: 'ok' });
      await loadB;
      await vi.waitFor(() => expect(analysisClient.analyze).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      expect(analysisClient.analyze.mock.calls[0][0]).toBe(fileB);
    } finally {
      detectionA.resolve(fileABytes);
      intakeB.resolve({ kind: 'reject', message: 'test cleanup' });
      await Promise.allSettled([loadA, ...(loadB ? [loadB] : [])]);
    }
  }, 60_000);

  it('rani nevaljani load ne čeka prethodni aktivni admission promise', async () => {
    document.getElementById('newAnalysis')?.click();
    quickStatsControl.disabled = true;
    const valid = validDocx('pending-valid.docx');
    const validIntake = deferred<any>();
    const validStarted = deferred<void>();
    const inspect = vi.fn(async (file: File) => {
      if (file === valid) {
        validStarted.resolve();
        return validIntake.promise;
      }
      return { kind: 'ok' };
    });
    intakeControl.override = inspect;

    const validLoad = app.loadAnalyzerDocument({ file: valid, source: 'memory-only' });
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledWith(valid), { timeout: 15_000 });
    await validStarted.promise;
    let invalidSettled = false;
    const invalidLoad = app.loadAnalyzerDocument({
      file: new File(['nije docx'], 'pogresan.txt', { type: 'text/plain' }),
      source: 'workspace-session',
    }).then(() => { invalidSettled = true; });

    await Promise.resolve();
    await Promise.resolve();
    try {
      expect(invalidSettled).toBe(true);
    } finally {
      validIntake.resolve({ kind: 'reject', message: 'namjerni završetak testa' });
      await Promise.allSettled([validLoad, invalidLoad]);
    }
  }, 60_000);
});
