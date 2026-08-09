/**
 * Testovi mosta analyzeDocxOffThread (Web Worker s inline fallbackom, S2).
 *
 * U vitest okruzenju nema Workera (happy-dom ga ne definira), pa se ovdje pokriva
 * ugovor mosta: fallback daje IDENTICAN rezultat kao izravni analyzeDocx, slomljena
 * worker infrastruktura pada na inline umjesto da rusi analizu, a greska same analize
 * putuje s izvornom porukom. Parsiranje unutar PRAVOG workera pokriva golden korpus:
 * worker instalira isti @xmldom/xmldom DOMParser kojim su snimljeni snapshoti
 * (src/docx/xml-dom-install.ts, tests/setup/xml-dom.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { analyzeDocxOffThread } from '../src/analysis/analyze-docx-client';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { normalizeResult } from './helpers/golden-normalize';

const TNR = 'Times New Roman';

function smallDoc(): ParaSpec[] {
  return [
    { text: 'Uvod', font: TNR, sizePt: 12, styleId: 'Heading1' },
    { text: 'Ovo je kratak sintetički odlomak za provjeru mosta prema workeru. '.repeat(4), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    { text: 'Zaključak', font: TNR, sizePt: 12, styleId: 'Heading1' },
    { text: 'Literatura', font: TNR, sizePt: 12, styleId: 'Heading1' },
  ];
}

function fixtureArgs() {
  const profileId = VERIFIED_PROFILE_REGISTRY[0].id;
  const profile = resolveProfile(profileId);
  const settings = {
    profileId,
    workType: profile.selection.workType,
    citationStyle: 'fpzg',
    language: 'hr',
    strictness: 'standard',
    methodology: 'auto',
    selectionIds: {},
  };
  return { profile, settings };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeDocxOffThread: inline fallback', () => {
  it('bez Workera vraca identican rezultat kao izravni analyzeDocx', async () => {
    const file = buildDocxFile({ paragraphs: smallDoc() });
    const a = fixtureArgs();
    const direct = await analyzeDocx(file, resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id), a.settings, () => {});
    expect(Array.isArray(direct.findings)).toBe(true);
    const canonicalCheckIds = direct.findings
      .map((finding: { checkId: string | null }) => finding.checkId)
      .filter((checkId: string | null): checkId is string => checkId !== null);
    const checkIds = direct.checks.map((check: { id: string }) => check.id);
    expect(canonicalCheckIds).toHaveLength(checkIds.length);
    expect(new Set(canonicalCheckIds)).toHaveLength(canonicalCheckIds.length);
    expect([...new Set(canonicalCheckIds)].sort()).toEqual([...checkIds].sort());
    expect(direct.findings.some((finding: { checkId: string | null }) => finding.checkId === direct.checks[0].id)).toBe(true);
    const bridged = await analyzeDocxOffThread(file, a.profile, a.settings, () => {});
    expect(normalizeResult(bridged)).toEqual(normalizeResult(direct));
  });

  it('slomljen Worker spawn pada na inline i analiza svejedno uspijeva', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('sinteticki pad worker spawna'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const file = buildDocxFile({ paragraphs: smallDoc() });
      const a = fixtureArgs();
      const result = await analyzeDocxOffThread(file, a.profile, a.settings, () => {});
      expect(result.score).not.toBeUndefined();
      expect(Array.isArray(result.checks)).toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('greska same analize putuje s izvornom porukom (nevaljan ZIP)', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'nije.docx');
    const a = fixtureArgs();
    await expect(analyzeDocxOffThread(junk, a.profile, a.settings, () => {})).rejects.toThrow(/ZIP\/DOCX arhiva/);
  });
});
