/**
 * Feature #4: analizator izlaze sirovi popis literature (details.references) da UI moze
 * pokrenuti opt-in online provjeru postojanja. Dokazuje golden-safe oblik + paritet broja.
 * Golden ostaje netaknut jer je polje pod details (golden-normalize ga ne snima).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const head = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });
const line = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, jc: 'both' });

describe('details.references emisija', () => {
  it('izlaze {raw,p,author,year}; length === stats.references (broj)', async () => {
    const paragraphs: ParaSpec[] = [
      head('Uvod'),
      line('Ovo je uvodni odlomak rada s dovoljno teksta da analiza teče normalno.'),
      head('Literatura'),
      line('Kovačić, I. (2020). Politički sustavi. Zagreb: Fakultet političkih znanosti.'),
      line('Horvat, A. (2019). Analiza podataka. Društvena istraživanja, 28(3), 45-67.'),
    ];
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs }, 'refs.docx'));
    expect(Array.isArray(r.details.references)).toBe(true);
    expect(r.details.references.length).toBeGreaterThan(0);
    expect(r.details.references.length).toBe(r.stats.references);
    expect(typeof r.stats.references).toBe('number'); // stats ostaje BROJ, ne niz
    const first = r.details.references[0];
    expect(first).toHaveProperty('raw');
    expect(first).toHaveProperty('p');
    expect(first).toHaveProperty('author');
    expect(first).toHaveProperty('year');
    expect(r.details.references.some((x: any) => /Kovačić|Politički sustavi/.test(x.raw))).toBe(true);
  });

  it('bez popisa literature: prazan niz, ne baca, paritet ostaje', async () => {
    const paragraphs: ParaSpec[] = [head('Uvod'), line('Tekst rada bez popisa literature.')];
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs }, 'noref.docx'));
    expect(Array.isArray(r.details.references)).toBe(true);
    expect(r.details.references.length).toBe(r.stats.references);
  });
});
