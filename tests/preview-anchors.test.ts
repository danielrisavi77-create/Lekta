import { describe, it, expect } from 'vitest';
import { collectPreviewFlags } from '../src/preview/preview-anchors';
import { KIND_HOMOGLIF_CIRILICA, KIND_DVOSTRUKI_RAZMAK } from '../src/tools/typo-lint';
import { KIND_PRVO_LICE } from '../src/audits/register';
import { sanitizeAnalysisResult } from '../src/report/report';

describe('collectPreviewFlags: normalizacija sidara', () => {
  it('typoLint 0-based paragraphIndex postaje 1-based (off-by-one)', () => {
    const flags = collectPreviewFlags({
      typoLint: { findings: [{ paragraphIndex: 0, kind: KIND_DVOSTRUKI_RAZMAK, excerpt: 'dva  razmaka' }] },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].paragraphIndex).toBe(1); // 0-based 0 -> 1-based 1
    expect(flags[0].source).toBe('typo');
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].title).toBe('Dvostruki razmak');
    expect(flags[0].excerpt).toBe('dva  razmaka');
  });

  it('ćirilični homoglif je error, ostala tipografija warning', () => {
    const flags = collectPreviewFlags({
      typoLint: {
        findings: [
          { paragraphIndex: 4, kind: KIND_HOMOGLIF_CIRILICA, excerpt: 'Аvion' },
          { paragraphIndex: 4, kind: KIND_DVOSTRUKI_RAZMAK, excerpt: 'x  y' },
        ],
      },
    });
    expect(flags[0].severity).toBe('error');
    expect(flags[0].paragraphIndex).toBe(5);
    expect(flags[1].severity).toBe('warning');
  });

  it('registerLint je informativan (severity info) i 1-based', () => {
    const flags = collectPreviewFlags({
      registerLint: { findings: [{ paragraphIndex: 11, kind: KIND_PRVO_LICE, excerpt: 'smatram da', count: 7 }] },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].paragraphIndex).toBe(12);
    expect(flags[0].severity).toBe('info');
    expect(flags[0].source).toBe('register');
    expect(flags[0].title).toBe('Prvo lice');
  });

  it('missingReferences: .p ostaje 1-based, error, isjecak = raw citatnica', () => {
    const flags = collectPreviewFlags({
      missingReferences: [{ author: 'Barbić', year: '2019', raw: '(Barbić, 2019)', p: 42, kind: 'parenthetical' }],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].paragraphIndex).toBe(42);
    expect(flags[0].severity).toBe('error');
    expect(flags[0].excerpt).toBe('(Barbić, 2019)');
    expect(flags[0].source).toBe('reference-missing');
  });

  it('uncited i incomplete reference su warning i 1-based', () => {
    const flags = collectPreviewFlags({
      uncitedReferences: [{ text: 'Barbić, J. (2019). Pravo društava.', author: 'Barbić', year: '2019', p: 120 }],
      incompleteReferences: [{ text: 'Nešto nepotpuno', author: '', year: '', p: 121 }],
    });
    expect(flags.map((f) => f.source)).toEqual(['reference-uncited', 'reference-incomplete']);
    expect(flags[0].paragraphIndex).toBe(120);
    expect(flags[1].paragraphIndex).toBe(121);
    expect(flags.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('legalCitationEngine.bibliographyUncited: .paragraph 1-based, warning', () => {
    const flags = collectPreviewFlags({
      legalCitationEngine: { bibliographyUncited: [{ paragraph: 88, text: 'Neki pravni izvor' }] },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].paragraphIndex).toBe(88);
    expect(flags[0].source).toBe('legal-uncited');
    expect(flags[0].severity).toBe('warning');
  });

  it('isjecak se skracuje na 80 znakova', () => {
    const long = 'x'.repeat(300);
    const flags = collectPreviewFlags({
      incompleteReferences: [{ text: long, author: '', year: '', p: 3 }],
    });
    expect(flags[0].excerpt.length).toBeLessThanOrEqual(80);
  });

  it('nedostajuci ili nevaljan paragraphIndex se preskace, ne rusi', () => {
    const flags = collectPreviewFlags({
      typoLint: { findings: [{ kind: 'x', excerpt: 'a' }, { paragraphIndex: 'ne-broj', kind: 'y', excerpt: 'b' }] },
      missingReferences: [{ raw: '(A, 2020)', p: null }],
    });
    expect(flags).toHaveLength(0);
  });

  it('prazan ili nedostajuci details vraca praznu listu', () => {
    expect(collectPreviewFlags(null)).toEqual([]);
    expect(collectPreviewFlags(undefined)).toEqual([]);
    expect(collectPreviewFlags({})).toEqual([]);
  });
});

describe('privatnost: preview i tekst dokumenta ne napustaju preglednik', () => {
  it('sanitizeAnalysisResult izbacuje top-level `preview` (puni tekst rada)', () => {
    const secret = 'TAJNI-DOSLOVNI-TEKST-RADA-koji-ne-smije-na-mrezu';
    const result: any = {
      score: 88,
      profile: 'FPZG',
      profileStatus: 'verified',
      stats: { words: 100 },
      checks: [],
      issues: [{ severity: 'warning', category: 'structure', title: 't', where: 'w', detail: `odlomak 12: ${secret}` }],
      preview: { paragraphs: [{ index: 1, text: secret, headingLevel: null }], truncated: false },
      details: { profileFingerprint: 'fp', typoLint: { findings: [{ paragraphIndex: 0, excerpt: secret }] } },
    };
    const out = sanitizeAnalysisResult(result);
    expect('preview' in (out as any)).toBe(false);
    // Nigdje u mreznoj kopiji ne smije biti doslovnog teksta rada (ni u redaktiranim opisima).
    expect(JSON.stringify(out)).not.toContain(secret);
  });
});
