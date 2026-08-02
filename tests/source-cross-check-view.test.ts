import { describe, it, expect } from 'vitest';
import { buildSourceCrossCheckHtml } from '../src/ui/source-cross-check-view';
import type { SourceCrossCheckResult } from '../src/analysis/source-cross-check';

function baseResult(over: Partial<SourceCrossCheckResult> = {}): SourceCrossCheckResult {
  return {
    version: 1,
    sourceFiles: [{ fileName: 'izvjesce.docx', paragraphCount: 3 }],
    overlap: { version: 1, paragraphsScanned: 1, sourceFilesUsed: 1, findings: [], flaggedCount: 0 },
    claims: [],
    summary: { paragraphsFlagged: 0, claimsChecked: 0, claimsFound: 0, claimsNotFound: 0, text: '0 odlomak(a) za provjeru citata' },
    ...over,
  };
}

describe('buildSourceCrossCheckHtml: nema rezultata -> nema sekcije', () => {
  it('vraca prazan string kad provjera nije pokrenuta', () => {
    expect(buildSourceCrossCheckHtml(null)).toBe('');
    expect(buildSourceCrossCheckHtml(undefined)).toBe('');
  });
});

describe('buildSourceCrossCheckHtml: rezultat postoji, ali cist (nema nalaza)', () => {
  it('prikazuje sekciju s pozitivnom potvrdom umjesto tisine', () => {
    const html = buildSourceCrossCheckHtml(baseResult());
    expect(html).toContain('Cross-check s izvorima');
    expect(html).toContain('Nema odlomaka s doslovnim preklapanjem bez oznake citata.');
    expect(html).toContain('Sve prepoznate tvrdnje pronađene su u priloženim izvorima.');
  });
});

describe('buildSourceCrossCheckHtml: preklapanje bez oznake citata', () => {
  it('prikazuje flagirane odlomke s izvorom i primjerom n-grama', () => {
    const html = buildSourceCrossCheckHtml(baseResult({
      overlap: {
        version: 1,
        paragraphsScanned: 1,
        sourceFilesUsed: 1,
        flaggedCount: 1,
        findings: [{
          paragraphIndex: 7,
          excerpt: 'Ovo je odlomak koji doslovno preklapa s izvorom.',
          looksMarked: false,
          flagged: true,
          bestMatch: { sourceFileName: 'izvjesce.docx', overlapCount: 5, sampleNgram: 'ovo je odlomak koji doslovno' },
        }],
      },
    }));
    expect(html).toContain('Odlomak 7');
    expect(html).toContain('nema vidljivu oznaku citata');
    expect(html).toContain('izvjesce.docx');
    expect(html).toContain('5 n-grama');
  });
});

describe('buildSourceCrossCheckHtml: tvrdnje bez potvrde', () => {
  it('prikazuje tvrdnje koje nisu pronadjene ni u jednom izvoru', () => {
    const html = buildSourceCrossCheckHtml(baseResult({
      claims: [{
        claim: { kind: 'number-unit', raw: '999 kg', paragraphIndex: 3 },
        foundInAnySource: false,
        perSource: [{ fileName: 'izvjesce.docx', found: false, context: null }],
      }],
    }));
    expect(html).toContain('999 kg');
    expect(html).toContain('nije pronađena ni u jednom izvoru');
  });

  it('skraceni prikaz kad ima vise od 50 nepotvrdjenih tvrdnji', () => {
    const claims = Array.from({ length: 60 }, (_, i) => ({
      claim: { kind: 'bare-number' as const, raw: String(100 + i), paragraphIndex: i + 1 },
      foundInAnySource: false,
      perSource: [],
    }));
    const html = buildSourceCrossCheckHtml(baseResult({ claims }));
    expect(html).toContain('Prikazano prvih 50 od 60 tvrdnji.');
  });
});

describe('buildSourceCrossCheckHtml: obavezna postena formulacija', () => {
  it('uvijek sadrzi caveat o dosegu i "ne ulazi u ocjenu"', () => {
    const html = buildSourceCrossCheckHtml(baseResult());
    expect(html).toContain('NIJE Turnitin-razina alata');
    expect(html).toContain('Ne ulazi u ocjenu');
  });
});

describe('buildSourceCrossCheckHtml: escaping (XSS iz sadrzaja rada/izvora)', () => {
  it('escapea zlonamjeran sadrzaj u nazivu izvora, isjecku i tvrdnji', () => {
    const html = buildSourceCrossCheckHtml(baseResult({
      overlap: {
        version: 1,
        paragraphsScanned: 1,
        sourceFilesUsed: 1,
        flaggedCount: 1,
        findings: [{
          paragraphIndex: 1,
          excerpt: '<img src=x onerror=alert(1)>',
          looksMarked: false,
          flagged: true,
          bestMatch: { sourceFileName: '<script>alert(2)</script>', overlapCount: 3, sampleNgram: 'a b c' },
        }],
      },
      claims: [{
        claim: { kind: 'hrn-norm', raw: '<script>alert(3)</script>', paragraphIndex: 2 },
        foundInAnySource: false,
        perSource: [],
      }],
    }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
