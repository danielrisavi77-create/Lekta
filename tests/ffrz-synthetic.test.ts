/**
 * Sinteticki golden za ffrz (Fakultet filozofije i religijskih znanosti).
 *
 * ffrz-diplomski i ffrz-bakalaureatski: sluzbene Upute (FFRZ, 2021) daju cijelo tehnicko
 * oblikovanje IMPERATIVNO (scored): font TNR 12, prored 1,5, margine 2,5, A4, Sadrzaj,
 * obvezne cjeline; citiranje autor-godina (harvard). Test provjerava da se te provjere
 * ispravno okidaju na uskladjenom radu (i da scalar size:12 vise ne puca).
 *
 * ffrz-doktorski: DR.SC.-08 (font/velicina/prored/A4).
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
  return [headed('Sažetak'), { text: 'Ključne riječi: filozofija, religija, metoda', font: TNR, sizePt: 12 },
    headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(600),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }, headed('Životopis')];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

for (const id of ['ffrz-diplomski', 'ffrz-bakalaureatski']) {
  describe(`${id}: imperativno oblikovanje (harvard)`, () => {
    it('uskladjeni rad prolazi font/velicinu/prored/margine/A4/Sadrzaj', async () => {
      const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: id });
      expect(check(r, 'Dominantni font').status).toBe('pass');
      expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
      expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
      expect(check(r, 'Margine dokumenta').status).toBe('pass');
      // ffrz-diplomski/bakalaureatski imaju i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
      expect(check(r, 'Format stranice (A4)').status).toBe('pass');
      expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    });
  });
}

describe('ffrz-doktorski: DR.SC.-08', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/A4', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'ffrz-dok-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'ffrz-doktorski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
  });
});
