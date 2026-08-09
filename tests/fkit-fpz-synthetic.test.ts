/**
 * Sinteticki golden za fkit (Fakultet kemijskog inzenjerstva i tehnologije) i
 * fpz (Fakultet prometnih znanosti).
 *
 * fkit-diplomski/zavrsni: FKIT Izmjene Pravilnika (2025) propisuju imperativno velicinu 12,
 * prored 1,5 i A4 (scored); NE propisuju font ni margine pa su checkFont/checkMargins:false
 * (gasi crash i cini ih informativnima). fkit-doktorski: DR.SC.-08.
 *
 * fpz-diplomski/zavrsni: jedinstvene Upute (2018) scored samo obvezne cjeline, Sadrzaj i
 * numeraciju; tehnicko oblikovanje nije imperativno pa su checkFont/Size/Spacing/Margins:false.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (t: string): ParaSpec => ({ text: t, font: TNR, sizePt: 12, styleId: 'Heading1' });
function body(n: number): ParaSpec[] {
  const s = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < n; c += 60) out.push({ text: s.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 });
  return out;
}
function doc(): ParaSpec[] {
  return [headed('Sažetak'), { text: 'Ključne riječi: kemija, promet, analiza', font: TNR, sizePt: 12 },
    { text: 'Summary. Keywords: chemistry, transport.', font: TNR, sizePt: 12 },
    headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(600),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('fkit-diplomski/zavrsni: scored velicina/prored/A4 (bez fonta)', () => {
  for (const id of ['fkit-diplomski', 'fkit-zavrsni']) {
    it(`${id} prolazi velicinu/prored/A4 i ne puca`, async () => {
      const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: id });
      expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
      expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
      // fkit-diplomski/zavrsni imaju i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
      expect(check(r, 'Format stranice (A4)').status).toBe('pass');
      expect(check(r, 'Dominantni font').status).toBe('info'); // informativno (nema font pravila)
      expect(check(r, 'Margine dokumenta').status).toBe('info'); // informativno
    });
  }
});

describe('fkit-doktorski: DR.SC.-08', () => {
  it('prolazi font/velicinu/prored/A4', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'fkit-dok-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fkit-doktorski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
  });
});

describe('fpz-diplomski/zavrsni: scored Sadrzaj (oblikovanje advisory)', () => {
  for (const id of ['fpz-diplomski', 'fpz-zavrsni']) {
    it(`${id} prolazi Sadrzaj i ne puca`, async () => {
      const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: id });
      expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
      expect(check(r, 'Dominantni font').status).toBe('info'); // informativno
      expect(check(r, 'Margine dokumenta').status).toBe('info'); // informativno
    });
  }
});
