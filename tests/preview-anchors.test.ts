import { describe, it, expect } from 'vitest';
import { collectPreviewFlags, collectIssueAnchors, collectFootnoteAnchors, collectAllPreviewFlags } from '../src/preview/preview-anchors';
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

describe('collectIssueAnchors: sidrenje iz opisa Issue-a', () => {
  it('parsira "odlomak N: tekst" i uzima tekst kao isjecak', () => {
    const flags = collectIssueAnchors([
      { severity: 'warning', category: 'structure', title: 'Naslovi preskaču razinu', detail: 'odlomak 88: Uvod u temu; odlomak 142: Metodologija' },
    ]);
    expect(flags).toHaveLength(2);
    expect(flags[0]).toMatchObject({ paragraphIndex: 88, excerpt: 'Uvod u temu', severity: 'warning', source: 'issue-anchor', title: 'Naslovi preskaču razinu' });
    expect(flags[1]).toMatchObject({ paragraphIndex: 142, excerpt: 'Metodologija' });
  });

  it('parsira "odlomak N" bez teksta (prazan isjecak, npr. citat bez lokatora)', () => {
    const flags = collectIssueAnchors([
      { severity: 'warning', category: 'citations', title: 'Izravni citati bez broja stranice', detail: 'odlomak 5, odlomak 12' },
    ]);
    expect(flags.map((f) => f.paragraphIndex)).toEqual([5, 12]);
    expect(flags.every((f) => f.excerpt === '')).toBe(true);
  });

  it('preskace kategoriju formatting (globalna pravila, ne inline)', () => {
    const flags = collectIssueAnchors([
      { severity: 'warning', category: 'formatting', title: 'Razmak nije 0', detail: 'odlomak 7: prije 0.5 pt / poslije 0.5 pt' },
    ]);
    expect(flags).toHaveLength(0);
  });

  it('preskace nevaljan/nedostajuci detail i nenumericki odlomak', () => {
    const flags = collectIssueAnchors([
      { severity: 'warning', category: 'structure', title: 'x', detail: 'odlomak fusnota: nesto' },
      { severity: 'warning', category: 'structure', title: 'y' },
      null,
    ]);
    expect(flags).toHaveLength(0);
  });

  it('mapira nepoznatu ozbiljnost na warning, zadrzava error/info', () => {
    const flags = collectIssueAnchors([
      { severity: 'error', category: 'structure', title: 'a', detail: 'odlomak 1: x' },
      { severity: 'nesto', category: 'structure', title: 'b', detail: 'odlomak 2: y' },
    ]);
    expect(flags[0].severity).toBe('error');
    expect(flags[1].severity).toBe('warning');
  });
});

describe('collectAllPreviewFlags: spajanje + deduplikacija', () => {
  it('spaja strukturirane i issue-usidrene nalaze', () => {
    const result = {
      details: { typoLint: { findings: [{ paragraphIndex: 0, kind: 'dvostruki-razmak', excerpt: 'a  b' }] } },
      issues: [{ severity: 'warning', category: 'structure', title: 'Naslov', detail: 'odlomak 9: Neki naslov' }],
    };
    const flags = collectAllPreviewFlags(result);
    expect(flags.map((f) => f.source).sort()).toEqual(['issue-anchor', 'typo']);
  });

  it('deduplicira nepotpunu referencu (strukturirani ostaje, issue-opis se izbaci)', () => {
    const text = 'Barbić, J. (2019). Pravo društava. Zagreb.';
    const result = {
      details: { incompleteReferences: [{ text, author: 'Barbić', year: '2019', p: 120 }] },
      issues: [{ severity: 'warning', category: 'citations', title: 'Mogući nepotpuni izvori u literaturi', detail: `odlomak 120: ${text.slice(0, 70)}` }],
    };
    const flags = collectAllPreviewFlags(result);
    const p120 = flags.filter((f) => f.paragraphIndex === 120);
    expect(p120).toHaveLength(1);
    expect(p120[0].source).toBe('reference-incomplete');
  });

  it('razliciti nalazi bez isjecka na istom odlomku ostaju odvojeni', () => {
    const result = {
      details: {},
      issues: [
        { severity: 'warning', category: 'citations', title: 'Citat bez lokatora', detail: 'odlomak 5' },
        { severity: 'warning', category: 'elements', title: 'Neispravna poveznica', detail: 'odlomak 5' },
      ],
    };
    const flags = collectAllPreviewFlags(result);
    expect(flags.filter((f) => f.paragraphIndex === 5)).toHaveLength(2);
  });
});

describe('collectFootnoteAnchors: sidrenje na fusnote', () => {
  it('parsira "bilj. N" i cilja fusnotu (footnoteId, prazan isjecak, paragraphIndex 0)', () => {
    const flags = collectFootnoteAnchors([
      { severity: 'error', category: 'citations', title: 'Ibid. nema valjanu prethodnu poveznicu', detail: 'bilj. 12: Ibid. nema neposredno prethodnu bilješku' },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ footnoteId: 12, paragraphIndex: 0, excerpt: '', severity: 'error', source: 'footnote-anchor' });
  });

  it('vise "bilj. N" u istom opisu (space-joined) daje vise flagova, bez ponavljanja iste', () => {
    const flags = collectFootnoteAnchors([
      { severity: 'warning', category: 'citations', title: 'op. cit.', detail: 'bilj. 5: poruka jedna bilj. 8: poruka dva bilj. 5: opet pet' },
    ]);
    expect(flags.map((f) => f.footnoteId)).toEqual([5, 8]);
  });

  it('opis bez "bilj." se preskace', () => {
    const flags = collectFootnoteAnchors([
      { severity: 'warning', category: 'formatting', title: 'Oblikovanje fusnota', detail: 'Očekuje se Times New Roman 10.' },
    ]);
    expect(flags).toHaveLength(0);
  });

  it('collectAllPreviewFlags ukljucuje footnote-nalaze i deduplicira po fusnoti', () => {
    const result = {
      details: {},
      issues: [
        { severity: 'error', category: 'citations', title: 'op. cit.', detail: 'bilj. 3: greška' },
        { severity: 'error', category: 'citations', title: 'op. cit.', detail: 'bilj. 3: greška ponovljeno' },
      ],
    };
    const fn3 = collectAllPreviewFlags(result).filter((f) => f.footnoteId === 3);
    expect(fn3).toHaveLength(1);
  });
});
