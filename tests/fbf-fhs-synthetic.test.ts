/**
 * Sinteticki golden za fbf (Farmaceutsko-biokemijski fakultet) i fhs zavrsni (Hrvatski studiji).
 *
 * fbf-specijalisticki: Upute (2014) scored velicinu (10/11/12), prored (2), margine, A4;
 * NE propisuju font pa je checkFont:false (gasi crash). Citiranje vancouver.
 * fbf-doktorski / fhs-doktorski: DR.SC.-08.
 * fhs-zavrsni: OPCE TEHNICKE UPUTE (FHS) scored font TNR 12, prored 1,5, margine 2,5,
 * obostrano poravnanje, Sadrzaj; citiranje nije jednoznacno propisano (ostaje custom/-).
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (t: string): ParaSpec => ({ text: t, font: TNR, sizePt: 12, styleId: 'Heading1' });
function body(n: number, line = 360): ParaSpec[] {
  const s = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < n; c += 60) out.push({ text: s.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: line });
  return out;
}
function doc(line = 360): ParaSpec[] {
  return [headed('Sažetak'), { text: 'Ključne riječi: farmacija, analiza, metoda', font: TNR, sizePt: 12 },
    headed('Sadržaj'), headed('1. Uvod'), ...body(600, line), headed('2. Razrada'), ...body(600, line),
    headed('3. Zaključak'), ...body(200, line), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('fbf-specijalisticki: scored velicina/prored/margine/A4 (bez fonta), vancouver', () => {
  it('prolazi velicinu/prored/margine/A4 i ne puca', async () => {
    const file = buildDocxFile({ paragraphs: doc(480), marginsCm: M25 }, 'fbf-spec-ok.docx'); // prored 2 -> line 480
    const r: any = await analyzeFixture(file, { profileId: 'fbf-specijalisticki' });
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Margine dokumenta').status).toBe('pass');
    // fbf-specijalisticki ima i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
    expect(check(r, 'Format stranice (A4)').status).toBe('pass');
    expect(check(r, 'Dominantni font').status).toBe('info'); // informativno
  });
});

describe('fbf-doktorski / fhs-doktorski: DR.SC.-08', () => {
  for (const id of ['fbf-doktorski', 'fhs-doktorski']) {
    it(`${id} prolazi font/velicinu/prored/A4`, async () => {
      const file = buildDocxFile({ paragraphs: doc(360), marginsCm: M25 }, `${id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: id });
      expect(check(r, 'Dominantni font').status).toBe('pass');
      expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
      expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
      expect(check(r, 'Format stranice A4').status).toBe('pass');
    });
  }
});

describe('fhs-zavrsni: OPCE TEHNICKE UPUTE (font/velicina/prored/margine/poravnanje/Sadrzaj)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: doc(360), marginsCm: M25 }, 'fhs-zav-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fhs-zavrsni' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Margine dokumenta').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});
