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
    settings: [],
    customXml: [],
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
