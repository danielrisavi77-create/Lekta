// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { renderPreview } from '../src/preview/render-preview';
import { renderFacsimile } from '../src/preview/render-facsimile';
import { findingCardHtml, type FindingViewModel } from '../src/ui/finding-view-model';

const HR = 'Čakovec, ćirilica, Županija, Šinkoz, Đakovo, čćžšđ';

describe('integritet hrvatskog teksta', () => {
  it('DOCX analiza i oba pregleda cuvaju sve znakove', async () => {
    const file = buildDocxFile({ paragraphs: [{ text: HR, font: 'Times New Roman', sizePt: 12 }] }, 'hr-znakovi.docx');
    const result: any = await analyzeFixture(file);
    const paragraph = result.preview.paragraphs.find((item: any) => item.text.includes('Čakovec'));
    expect(paragraph.text).toBe(HR);
    expect(renderPreview({ paragraphs: [paragraph] }, []).root.textContent).toContain(HR);
    expect(renderFacsimile({ paragraphs: [paragraph] }, []).root.textContent).toContain(HR);
  });

  it('profilni izvor i kartica nalaza cuvaju znakove i siguran URL', () => {
    const finding: FindingViewModel = {
      id: 'hr', originalIndex: 0, category: 'structure', severity: 'warning', kind: 'document', title: HR,
      explanation: HR, scope: { kind: 'document' }, fixability: 'manual', autoRepairable: false,
      status: 'open', priorityRank: 3, source: { title: HR, url: 'https://example.test/č', exact: false },
    };
    const html = findingCardHtml(finding, false);
    expect(html).toContain(HR);
    expect(html).not.toContain('�');
  });

  it('korisnicki UI izvori nemaju replacement znak ni tipicni mojibake', () => {
    const files = ['index.html', 'src/ui/app.ts', 'src/ui/finding-view-model.ts', 'src/preview/render-preview.ts', 'src/preview/render-facsimile.ts'];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/�|Ã.|Å.|Ä./u);
    }
  });
});
