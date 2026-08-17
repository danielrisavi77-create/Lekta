/**
 * Sinteticki golden za efzg (Ekonomski fakultet Zagreb).
 *
 * efzg-diplomski: NADOGRADJEN na imperativni Pravilnik o izradi pisanih radova na diplomskim
 * studijima (2012). Tehnicko oblikovanje je scored: margine 2,5 cm, Times New Roman ili Arial 12,
 * prored 1,5, obostrano poravnanje. Test dokazuje da uskladjeni rad prolazi font/margine/Sadrzaj.
 *
 * efzg-doktorski: oblikovanje delegirano na sveucilisni DR.SC.-08 (font TNR 12, prored 1,5,
 * margine, A4 scored). Test provjerava da se te provjere ispravno okidaju.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { expectNotPenalised } from "./helpers/check-status";
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
  return [headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(600),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}

describe('efzg-diplomski: imperativno oblikovanje (Pravilnik 2012, scored)', () => {
  it('uskladjeni rad prolazi font/margine/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } }, 'efzg-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'efzg-diplomski' });
    expect(Array.isArray(r.checks)).toBe(true);
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Margine dokumenta'));
    expectNotPenalised(check(r, 'Sadržaj dokumenta'));
  });
});

describe('efzg-doktorski: DR.SC.-08 (font/velicina/prored/A4 scored)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/A4', async () => {
    const file = buildDocxFile({ paragraphs: doc(), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } }, 'efzg-dok-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'efzg-doktorski' });
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Veličina osnovnog teksta'));
    expectNotPenalised(check(r, 'Prored osnovnog teksta'));
    expectNotPenalised(check(r, 'Format stranice A4'));
  });
});
