import { describe, expect, it } from 'vitest';
import { linesPerPageCapacity, evaluateLinesPerPage } from '../src/scoring/lines-per-page';
import { evaluateFormatting } from '../src/scoring/evaluate/formatting';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';

const page = { page: { w: 21, h: 29.7 }, margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } };
const capacity = (spacing: number, font = 'Times New Roman', section: any = page) =>
  linesPerPageCapacity({ size: 12, spacing, font, sections: [section] });

describe('kapacitet redaka po stranici', () => {
  it('računa TNR 12 na A4 s rubnicima 2,5 cm', () => {
    expect(capacity(1)).toBe(50);
    expect(capacity(1.5)).toBe(33);
    expect(capacity(2)).toBe(25);
  });
  it('ne nagađa za drugi font ili nepotpune margine', () => {
    expect(capacity(1.5, 'Arial')).toBeNull();
    expect(capacity(1.5, 'Times New Roman', { ...page, margins: { ...page.margins, top: null } })).toBeNull();
  });
  it('syntetičko pravilo opisuje odstupanje i uskladenost', () => {
    const rule = { min: 28, max: 32 };
    const warning = evaluateLinesPerPage({ size: 12, spacing: 1.5, font: 'Times New Roman', sections: [page] }, rule)!;
    expect(warning).toMatchObject({ id: 'format.lines-per-page', status: 'informational', max: 0, scored: false });
    expect(warning.detail).toContain('33');
    expect(warning.detail).toContain('28-32');
    expect(warning.detail).toContain('ne odgovara');
    const matched = evaluateLinesPerPage({ size: 12, spacing: 1.7, font: 'Times New Roman', sections: [page] }, rule)!;
    expect(matched.status).toBe('informational');
    expect(matched.detail).toContain('po stranici odgovara');
  });
  it('bez pravila nema provjere; samo max 33 prolazi', () => {
    expect(evaluateLinesPerPage({ size: 12, spacing: 1.5, font: 'Times New Roman', sections: [page] }, undefined)).toBeNull();
    expect(evaluateLinesPerPage({ size: 12, spacing: 1.5, font: 'Times New Roman', sections: [page] }, { min: null, max: 33 })?.status).toBe('informational');
  });
  it('uzima sekciju koja pokriva najvise odlomaka', () => {
    const cover = { ...page, margins: { ...page.margins, top: 5, bottom: 5 }, paragraphIndex: 1 };
    const body = { ...page, paragraphIndex: 101 };
    expect(linesPerPageCapacity({ size: 12, spacing: 1.5, font: 'Times New Roman', sections: [cover, body] })).toBe(33);
    expect(linesPerPageCapacity({ size: 12, spacing: 1.5, font: 'Times New Roman', sections: [cover, { ...body, margins: null }] })).toBeNull();
  });
  it('draft ne ulazi u effectiveRules, potvrđeno pravilo ulazi', () => {
    const profile = (status: 'draft' | 'verified') => ({ id: 'demo', rules: {}, ruleEntries: [{ ruleId: 'r1', checkId: 'lines-per-page', value: { min: 28, max: 32 }, status, scored: false }] });
    expect(compileEffectiveRules(profile('draft'))).toEqual({});
    expect(compileEffectiveRules(profile('verified'))).toEqual({ linesPerPage: { min: 28, max: 32 } });
  });
  it('formatting emitira provjeru samo kad profil ima pravilo', () => {
    const m: any = {
      body: { font: { value: 'Times New Roman', share: 1 }, size: { value: 12, share: 1 }, spacing: { value: 1.5, share: 1 }, align: { value: 'both', share: 1 } },
      sections: [page], footnotes: { count: 0, endnoteCount: 0, markers: [], dominants: { font: { value: null }, size: { value: null }, spacing: { value: null }, align: { value: null } } },
    };
    const profile: any = { font: ['Times New Roman'], size: [12], spacing: 1.5, margins: page.margins, checkMargins: false };
    expect(evaluateFormatting(m, profile, .12).checks.some(c => c.id === 'format.lines-per-page')).toBe(false);
    const result = evaluateFormatting(m, { ...profile, linesPerPage: { min: 28, max: 32 } }, .12).checks;
    expect(result.find(c => c.id === 'format.lines-per-page')).toMatchObject({ status: 'informational', max: 0, scored: false });
  });
});
