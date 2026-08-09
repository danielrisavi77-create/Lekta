/**
 * Sinteticki golden za umjetnicke/projektne fakultete: alu (Akademija likovnih umjetnosti)
 * i arh (Arhitektonski fakultet).
 *
 * Ovi diplomski radovi su umjetnicki/projektni (portfolio, projekt), a sluzbeni izvori
 * NE propisuju faculty-wide tehnicko oblikovanje (font/velicina/prored/margine), pa su te
 * provjere iskljucene (informativne). Test dokazuje da profili ne pucaju na stvarnom docx-u
 * (ranije: profile.font.some / profile.margins[side] nad praznim pravilima) i da se scored
 * dio (Sadrzaj kod arh; format kod arh-doktorski koji nasljedjuje DR.SC.-08) ispravno okida.
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
  return [headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('alu/arh: profili ne pucaju na stvarnom docx-u (crash-fix)', () => {
  for (const id of ['alu-diplomski', 'alu-doktorski', 'arh-diplomski', 'dizajn-diplomski']) {
    it(`${id} se analizira bez pucanja i format je informativan`, async () => {
      const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: id });
      expect(Array.isArray(r.checks)).toBe(true);
      // format iskljucen -> informativni status (bez kaznjavanja)
      expect(check(r, 'Dominantni font').status).toBe('info');
      expect(check(r, 'Margine dokumenta').status).toBe('info');
    });
  }
  it('arh-diplomski: obvezan Sadrzaj se boduje i prolazi', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'arh-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'arh-diplomski' });
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});

describe('arh-doktorski: nasljeduje DR.SC.-08 (font/velicina/prored/A4 scored)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/A4', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'arh-dok-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'arh-doktorski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
  });
});

describe('arh-diplomski: paperSizes A3/A0 (projektni format iz Pravilnika 2013 cl. 16)', () => {
  it('A3 knjizica prolazi provjeru formata', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25, pageCm: { w: 29.7, h: 42 } }, 'arh-a3.docx');
    const r: any = await analyzeFixture(file, { profileId: 'arh-diplomski' });
    expect(check(r, 'Format stranice (A3/A0)').status).toBe('pass');
  });
  it('A4 dokument daje upozorenje (nije u dopustenom skupu A3/A0)', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: M25, pageCm: { w: 21, h: 29.7 } }, 'arh-a4.docx');
    const r: any = await analyzeFixture(file, { profileId: 'arh-diplomski' });
    expect(check(r, 'Format stranice (A3/A0)').status).toBe('warn');
  });
});
