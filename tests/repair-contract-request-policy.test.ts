import { describe, expect, it } from 'vitest';
import { FIXER_IDS, type FixerId } from '../src/repair/apply-fixers';
import { buildRecipe } from '../src/repair/recipe';
import {
  CONTRACT_FIXER_IDS,
  TEXT_MUTATING_FIXERS,
  parseContractRequests,
  requestRequiresException,
  requiredExceptionScope,
} from '../src/repair/contract';

const minimalParams: Record<Exclude<FixerId, 'footer-page-fixer'>, Record<string, unknown>> = {
  'margins-fixer': { top: 2.5 },
  'paper-size-fixer': { w: 11906, h: 16838 },
  'font-fixer': { fontName: 'Arial' },
  'line-spacing-fixer': { multiplier: 1.5 },
  'alignment-fixer': { val: 'both' },
  'paragraph-spacing-fixer': { deep: true },
  'page-numbering-fixer': { targets: [] },
  'section-insert-fixer': { target: { introParagraphIndex: 1 } },
  'empty-paragraph-fixer': {},
  'footnote-spacing-fixer': { deep: true },
  'page-number-alignment-fixer': { align: 'right' },
  'toc-field-fixer': { target: { sadrzajParagraphIndex: 1 } },
  'heading-format-fixer': { targets: [] },
  'heading-style-fixer': { targets: [] },
  'title-page-fixer': { paragraphCount: 1, lines: [{ text: 'Naslov' }], ensureTitlePageNoNumber: true },
  'footnote-typography-fixer': { fontName: 'Arial' },
  'heading-case-fixer': { levels: [1] },
  'element-caption-fixer': { version: 1, elements: [] },
  'bibliography-repair-fixer': { version: 1, entries: [] },
  'citation-bibliography-sync-fixer': { version: 1, citations: [], entries: [], mappings: [] },
  'legal-footnote-repair-fixer': { version: 1, markers: [], operations: [], bibliographyLinks: [] },
  'final-document-inspector-fixer': {
    version: 1,
    revisions: [],
    comments: [],
    metadata: [],
    hiddenText: [],
  },
  'table-figure-rescue-fixer': { version: 1, tables: [], figures: [] },
  'section-surgery-fixer': { version: 1, operations: [] },
  'field-integrity-fixer': { version: 1, fields: [] },
  'croatian-typography-fixer': { version: 1, categories: [], operations: [] },
  'consistency-fixer': { version: 1, groups: [], replacements: [] },
  'required-section-fixer': { version: 1, sections: [] },
  'link-doi-fixer': { version: 1, operations: [] },
  'submission-metadata-fixer': { version: 1, fields: [] },
};

const assistedSamples = [
  ['element-caption-fixer', 'elements', {
    version: 1,
    elements: [{
      id: 'element-1',
      kind: 'table',
      anchor: { bodyChildIndex: 1, tableIndex: 0 },
      anchorFingerprint: 'element-a1',
      description: 'Rezultati',
      position: 'above',
      replaceManualCaption: false,
    }],
  }],
  ['bibliography-repair-fixer', 'entries', {
    version: 1,
    entries: [{ id: 'entry-1', paragraphIndices: [10], anchorFingerprint: 'bibliography-a1', normalizeText: true }],
  }],
  ['citation-bibliography-sync-fixer', 'citations', {
    version: 1,
    citations: [{ id: 'citation-1', paragraphIndex: 2, start: 0, end: 8, anchorFingerprint: 'citation-a1', replacementText: '(Autor, 2026)', reason: 'godina' }],
    entries: [{ id: 'entry-1', paragraphIndices: [10], anchorFingerprint: 'bibliography-a1', action: 'replace', replacementText: 'Autor (2026).' }],
    mappings: [{ citationId: 'citation-1', bibliographyEntryId: 'entry-1', confirmed: true }],
  }],
  ['legal-footnote-repair-fixer', 'operations', {
    version: 1,
    markers: [{ paragraphIndex: 2, start: 4, end: 5, footnoteId: 1, anchorFingerprint: 'marker-a1', confirmed: true }],
    operations: [{ id: 'footnote-1', footnoteId: 1, kind: 'replace-text', anchorFingerprint: 'footnote-a1', start: 0, end: 4, replacementText: 'Ibid.', confirmed: true, reason: 'format' }],
    bibliographyLinks: [{ footnoteId: 1, bibliographyEntryId: 'entry-1', confirmed: true }],
  }],
  ['final-document-inspector-fixer', 'revisions', {
    version: 1,
    revisions: [{ part: 'word/document.xml', revisionId: 'revision-1', action: 'accept', anchorFingerprint: 'revision-a1', confirmed: true }],
    comments: [], metadata: [], hiddenText: [],
  }],
  ['table-figure-rescue-fixer', 'tables', {
    version: 1,
    tables: [{ id: 'table-1', bodyChildIndex: 3, anchorFingerprint: 'table-a1', actions: { fitToTextWidth: true, repeatHeader: true } }],
    figures: [],
  }],
  ['section-surgery-fixer', 'operations', {
    version: 1,
    operations: [{ id: 'section-1', kind: 'set-geometry', sectionOrdinal: 0, anchorFingerprint: 'section-a1', confirmed: true, orientation: 'portrait' }],
  }],
  ['field-integrity-fixer', 'fields', {
    version: 1,
    fields: [{ id: 'field-1', part: 'word/document.xml', anchorFingerprint: 'field-a1', action: 'mark-dirty', confirmed: true }],
  }],
  ['croatian-typography-fixer', 'operations', {
    version: 1,
    categories: [{ category: 'ellipsis', consent: true }],
    operations: [{ id: 'typography-1', category: 'ellipsis', paragraphIndex: 2, textNodeIndex: 0, nodeKind: 'text', start: 0, end: 3, before: '...', replacementText: '…', anchorFingerprint: 'paragraph-a1', confirmed: true }],
  }],
  ['consistency-fixer', 'replacements', {
    version: 1,
    groups: [{ id: 'group-1', zone: 'terminology', canonicalText: 'Europska unija', confirmed: true }],
    replacements: [{ id: 'replacement-1', groupId: 'group-1', part: 'word/document.xml', paragraphIndex: 2, start: 0, end: 2, before: 'EU', replacementText: 'Europska unija', anchorFingerprint: 'paragraph-a1', confirmed: true }],
  }],
  ['required-section-fixer', 'sections', {
    version: 1,
    sections: [{ id: 'abstract-1', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 2, anchorFingerprint: 'paragraph-a1', position: 'before' }, headingLevel: 1, numbered: false, confirmed: true }],
  }],
  ['link-doi-fixer', 'operations', {
    version: 1,
    operations: [{ id: 'link-1', part: 'word/document.xml', paragraphIndex: 2, start: 0, end: 3, anchorFingerprint: 'paragraph-a1', before: 'doi', replacementText: 'https://doi.org/10.1/test', targetUrl: 'https://doi.org/10.1/test', action: 'make-hyperlink', confirmed: true }],
  }],
  ['submission-metadata-fixer', 'fields', {
    version: 1,
    fields: [{ field: 'title', part: 'docProps/core.xml', before: 'Stari naslov', replacementText: 'Novi naslov', fingerprint: 'submission-a1', confirmed: true }],
  }],
] as const;

function request(fixerId: Exclude<FixerId, 'footer-page-fixer'>, params = minimalParams[fixerId]) {
  return { requestId: 'req-0001', fixerId, ruleId: `rule.${fixerId}`, params };
}

function expectRejected(params: unknown, fixerId: Exclude<FixerId, 'footer-page-fixer'> = 'margins-fixer') {
  expect(parseContractRequests([{ ...request(fixerId), params }])).toMatchObject({ ok: false });
}

describe('Repair Contract request policy', () => {
  it('pokriva svaki poznati fixer i zabranjuje samo samostalni footer', () => {
    expect(new Set([...CONTRACT_FIXER_IDS, 'footer-page-fixer'])).toEqual(new Set(FIXER_IDS));
    expect(CONTRACT_FIXER_IDS).not.toContain('footer-page-fixer');
  });

  it('prihvaca minimalni valjani zahtjev za svaki od 30 dopustenih fixera', () => {
    for (const fixerId of CONTRACT_FIXER_IDS) {
      expect(parseContractRequests([request(fixerId)]), fixerId).toEqual({
        ok: true,
        requests: [request(fixerId)],
      });
    }
  });

  it('prihvaca valjane profilne UI parametre i fail-closed odbija legacy 15pt kao multiplier', () => {
    const allowed = new Set<string>(CONTRACT_FIXER_IDS);
    const profileItems = buildRecipe().flatMap((profile) => profile.items).filter((item) =>
      allowed.has(item.fixerId)
      && item.fixerId !== 'toc-field-fixer',
    );
    expect(profileItems.length).toBeGreaterThan(100);
    const rejected: string[] = [];
    for (const item of profileItems) {
      const result = parseContractRequests([{
        requestId: 'req-0001',
        fixerId: item.fixerId,
        ruleId: item.ruleId,
        params: item.params,
      }]);
      if (!result.ok) rejected.push(`${item.fixerId}/${item.ruleId}`);
    }
    expect(rejected).toEqual([
      'line-spacing-fixer/pmf-matematika-graduate--line-spacing',
    ]);
  });

  it('odbija nepoznati fixer, samostalni footer i izvrsivi payload', () => {
    expect(parseContractRequests([{ ...request('empty-paragraph-fixer'), fixerId: 'powershell-fixer' }]))
      .toMatchObject({ ok: false, issues: [{ code: 'unknown-fixer' }] });
    expect(parseContractRequests([{ ...request('empty-paragraph-fixer'), fixerId: 'footer-page-fixer' }]))
      .toMatchObject({ ok: false, issues: [{ code: 'standalone-fixer-denied' }] });
    expectRejected({ command: 'Start-Process' });
  });

  it('zahtijeva niz od 1 do 64 zahtjeva s tocnim kljucevima', () => {
    expect(parseContractRequests(null)).toMatchObject({ ok: false, issues: [{ code: 'requests-not-array' }] });
    expect(parseContractRequests([])).toMatchObject({ ok: false, issues: [{ code: 'request-count' }] });
    expect(parseContractRequests(Array.from({ length: 65 }, (_, index) => ({
      ...request('empty-paragraph-fixer'),
      requestId: `req-${String(index).padStart(4, '0')}`,
    })))).toMatchObject({ ok: false, issues: [{ code: 'request-count' }] });
    expect(parseContractRequests([{ ...request('empty-paragraph-fixer'), extra: true }]))
      .toMatchObject({ ok: false, issues: [{ code: 'request-not-object' }] });
  });

  it('odbija nevaljane i duple identitete te netrimani ruleId', () => {
    expect(parseContractRequests([{ ...request('empty-paragraph-fixer'), requestId: 'req-1' }]))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-request-id' }] });
    const duplicate = request('empty-paragraph-fixer');
    expect(parseContractRequests([duplicate, duplicate]))
      .toMatchObject({ ok: false, issues: [{ index: 1, code: 'duplicate-request-id' }] });
    expect(parseContractRequests([{ ...duplicate, ruleId: ' nije-trimano ' }]))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-rule-id' }] });
  });

  it('odbija params koji nisu obican JSON objekt ili sadrze opasan kljuc', () => {
    expectRejected([]);
    expectRejected(JSON.parse('{"__proto__":{"polluted":true}}'));
  });

  it('odbija nepoznati parametar, nevaljani enum, broj i prevelik string', () => {
    expectRejected({ top: 2.5, command: 'Start-Process' });
    expectRejected({ val: 'diagonal' }, 'alignment-fixer');
    expectRejected({ top: Number.NaN });
    expectRejected({ fontName: 'a'.repeat(101) }, 'font-fixer');
  });

  it('odbija prevelik niz, predubok objekt i preveliki params zapis', () => {
    expectRejected({ levels: Array.from({ length: 2001 }, () => 1) }, 'heading-case-fixer');
    let nested: Record<string, unknown> = { value: true };
    for (let depth = 0; depth < 13; depth += 1) nested = { nested };
    expectRejected({ styleRules: [nested] }, 'paragraph-spacing-fixer');
    expectRejected({ fontName: 'a'.repeat(262_145) }, 'font-fixer');
  });

  it('odbija pogresnu assisted verziju i nepotvrdenu operaciju', () => {
    expectRejected({ version: 2, elements: [] }, 'element-caption-fixer');
    expectRejected({
      version: 1,
      groups: [{ id: 'g1', zone: 'terminology', canonicalText: 'ispravno', confirmed: false }],
      replacements: [],
    }, 'consistency-fixer');
  });

  it('odbija izvrsiva i nepoznata polja unutar assisted operacije', () => {
    expectRejected({
      version: 1,
      operations: [{
        id: 'link-1',
        part: 'C:/Windows/System32',
        paragraphIndex: 1,
        start: 0,
        end: 3,
        anchorFingerprint: 'link-abc123',
        before: 'doi',
        action: 'run',
        command: 'Start-Process',
        confirmed: true,
      }],
    }, 'link-doi-fixer');
  });

  it('prihvaca stvarne neprazne oblike svih 13 assisted fixera i svakome odbija dodatni ugnijezdeni kljuc', () => {
    expect(assistedSamples).toHaveLength(13);
    for (const [fixerId, operationKey, params] of assistedSamples) {
      expect(parseContractRequests([request(fixerId, params)]), fixerId).toMatchObject({ ok: true });

      const injected = structuredClone(params) as Record<string, unknown>;
      const operations = injected[operationKey] as Array<Record<string, unknown>>;
      operations[0].command = 'Start-Process';
      expect(parseContractRequests([request(fixerId, injected)]), fixerId).toMatchObject({ ok: false });
    }
  });

  it('odbija traversal segmente u svakoj package part putanji', () => {
    const params = structuredClone(assistedSamples.find(([fixerId]) => fixerId === 'final-document-inspector-fixer')![2]) as any;
    params.revisions[0].part = '../word/document.xml';

    expectRejected(params, 'final-document-inspector-fixer');
  });

  it('citation schema prati action invarijante i dopusta mapiranje na postojeci bibliography ID', () => {
    const base = structuredClone(assistedSamples.find(([fixerId]) => fixerId === 'citation-bibliography-sync-fixer')![2]) as any;
    base.entries = [{
      id: 'entry-add',
      paragraphIndices: [],
      anchorFingerprint: 'bibliography-add',
      action: 'add',
    }];
    base.mappings = [];
    expectRejected(base, 'citation-bibliography-sync-fixer');

    const existing = structuredClone(assistedSamples.find(([fixerId]) => fixerId === 'citation-bibliography-sync-fixer')![2]) as any;
    existing.entries = [];
    existing.mappings = [{ citationId: 'citation-1', bibliographyEntryId: 'bibliography-3', confirmed: true }];
    expect(parseContractRequests([request('citation-bibliography-sync-fixer', existing)]))
      .toMatchObject({ ok: true });
  });

  it('citation schema odbija raspone i mapping mete koje executor ne moze primijeniti', () => {
    const invalidMutations = [
      (params: any) => { params.citations[0].paragraphIndex = 0; },
      (params: any) => { params.citations[0].end = params.citations[0].start; },
      (params: any) => { params.citations[0].end = params.citations[0].start + 1_001; },
      (params: any) => { params.mappings[0].bibliographyEntryId = 'not-an-entry'; },
    ];

    for (const mutate of invalidMutations) {
      const params = structuredClone(assistedSamples.find(([fixerId]) => fixerId === 'citation-bibliography-sync-fixer')![2]) as any;
      mutate(params);
      expectRejected(params, 'citation-bibliography-sync-fixer');
    }
  });

  it('customXml uklanjanje prihvaca samo canonical customXml package parts', () => {
    const params = structuredClone(minimalParams['final-document-inspector-fixer']) as any;
    params.customXml = [{
      part: 'word/document.xml',
      fingerprint: 'package-part-a1',
      action: 'remove-unreferenced',
      confirmed: true,
    }];

    expectRejected(params, 'final-document-inspector-fixer');

    params.customXml[0].part = 'customXml/item1.xml';
    expect(parseContractRequests([request('final-document-inspector-fixer', params)]))
      .toMatchObject({ ok: true });
  });

  it('oznacava tocno 13 mutirajucih fixera i njihov obavezni exception scope', () => {
    expect(TEXT_MUTATING_FIXERS.size).toBe(13);
    for (const fixerId of CONTRACT_FIXER_IDS) {
      expect(requestRequiresException(fixerId)).toBe(TEXT_MUTATING_FIXERS.has(fixerId));
    }
    expect(requiredExceptionScope('submission-metadata-fixer')).toBe('metadata');
    expect(requiredExceptionScope('field-integrity-fixer')).toBe('structure');
    expect(requiredExceptionScope('title-page-fixer')).toBe('visible-text');
    expect(requiredExceptionScope('margins-fixer')).toBeNull();
  });
});
