/**
 * Testovi mosta analyzeSourceCrossCheckOffThread (Web Worker s inline fallbackom), isti obrazac
 * kao tests/analyze-docx-client.test.ts: u vitest okruzenju nema Workera (happy-dom ga ne
 * definira), pa se ovdje pokriva ugovor mosta (inline fallback identican direktnom pozivu,
 * slomljena worker infrastruktura pada na inline, greska obrade putuje s izvornom porukom).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { extractSourceMaterialText } from '../src/analysis/source-material-text';
import { analyzeSourceCrossCheck } from '../src/analysis/source-cross-check';
import { analyzeSourceCrossCheckOffThread } from '../src/analysis/source-cross-check-client';

const SHARED_SENTENCE =
  'Prema tjednom izvješću broj tri izvedeni su radovi na temeljima objekta uz sudjelovanje dva radnika i jednog voditelja gradilišta tijekom cijelog radnog tjedna bez značajnih odstupanja od plana.';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeSourceCrossCheckOffThread: inline fallback', () => {
  it('bez Workera vraca identican rezultat kao izravni analyzeSourceCrossCheck', async () => {
    const sourceFile = buildDocxFile({ paragraphs: [{ text: SHARED_SENTENCE }] }, 'izvor.docx');
    const thesisParagraphs = [{ index: 1, text: SHARED_SENTENCE }];

    const sourceDoc = await extractSourceMaterialText(sourceFile);
    const direct = analyzeSourceCrossCheck({ thesisParagraphs, sourceDocs: [sourceDoc] });
    const bridged = await analyzeSourceCrossCheckOffThread(thesisParagraphs, [sourceFile]);
    expect(bridged).toEqual(direct);
  });

  it('slomljen Worker spawn pada na inline i obrada svejedno uspijeva', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('sinteticki pad worker spawna'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const sourceFile = buildDocxFile({ paragraphs: [{ text: SHARED_SENTENCE }] }, 'izvor.docx');
      const result = await analyzeSourceCrossCheckOffThread([{ index: 1, text: SHARED_SENTENCE }], [sourceFile]);
      expect(result.overlap.flaggedCount).toBe(1);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('greska same obrade putuje s izvornom porukom (nepodrzan format izvora)', async () => {
    const pdf = new File(['%PDF-1.4'], 'izvor.pdf', { type: 'application/pdf' });
    await expect(analyzeSourceCrossCheckOffThread([{ index: 1, text: 'tekst' }], [pdf])).rejects.toThrow(/PDF izvori još nisu podržani/);
  });
});
