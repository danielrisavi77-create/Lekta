/**
 * Sinteticki golden za zadnji klaster: erf/sfzg diplomski (stvarni uzorci) + svi preostali
 * doktorski profili (sintetika; doktorske disertacije se dosljedno ne serviraju kao otvoreni
 * fulltext na ZIR-u).
 *
 * erf-diplomski: font TNR 12, prored 1,5, Sadrzaj (scored); margine nisu propisane ->
 *   checkMargins:false (crash-fix). sfzg-diplomski: font/velicina/prored/margine/poravnanje/
 *   Sadrzaj (scored; vancouver). Doktorski: DR.SC.-08 ili s iskljucenim provjerama (geof) ->
 *   test dokazuje da se profil ne rusi i da font-provjera radi.
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
  return [headed('Sažetak'), { text: 'Ključne riječi: rehabilitacija, stomatologija', font: TNR, sizePt: 12 },
    headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(600),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('erf-diplomski: font/velicina/prored/Sadrzaj (margine advisory)', () => {
  it('prolazi font/velicinu/prored/Sadrzaj i ne puca', async () => {
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'erf-dipl.docx'), { profileId: 'erf-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    expect(check(r, 'Margine dokumenta').status).toBe('pass'); // informativno (nije propisano)
  });
});

describe('sfzg-diplomski: puna pravila (vancouver)', () => {
  it('prolazi font/velicinu/prored/poravnanje/margine/Sadrzaj', async () => {
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, 'sfzg-dipl.docx'), { profileId: 'sfzg-diplomski' });
    for (const t of ['Dominantni font', 'Veličina osnovnog teksta', 'Prored osnovnog teksta', 'Poravnanje osnovnog teksta', 'Margine dokumenta', 'Sadržaj dokumenta'])
      expect(check(r, t)?.status, t).toBe('pass');
  });
});

const DOCTORAL = ['erf-doktorski', 'sfzg-doktorski', 'ufzg-doktorski', 'vef-doktorski', 'fer-doktorski',
  'fsb-doktorski', 'grad-doktorski', 'ttf-doktorski', 'geof-doktorski',
  'pravo-doktorski-pravne-znanosti', 'pravo-socijalne-djelatnosti-doktorski'];

describe('doktorski profili: ne pucaju i font-provjera radi', () => {
  for (const id of DOCTORAL) {
    it(`${id} se analizira bez pucanja`, async () => {
      const r: any = await analyzeFixture(buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}.docx`), { profileId: id });
      expect(Array.isArray(r.checks)).toBe(true);
      expect(check(r, 'Dominantni font').status).toBe('pass');
    });
  }
});
