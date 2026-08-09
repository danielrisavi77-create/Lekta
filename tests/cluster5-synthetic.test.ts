/**
 * Sinteticki golden za klaster grf/kbf/kif/mef/muza/pbf (doktorski + size-bug profili).
 *
 * grf-diplomski/zavrsni: font TNR/Arial 12, prored 1,5, margine, A4, Sadrzaj (scored; ieee);
 *   scalar size:12 ispravljen na [12]. kbf-diplomski/zavrsni: TNR 12, prored 1,5, margine,
 *   poravnanje, Sadrzaj (scored; chicago-notes); scalar size:12 -> [12].
 * kif-doktorski: harvard, puna pravila (font/velicina/prored/margine/A4/Sadrzaj).
 * mef-doktorski: tanak (A4/Sadrzaj scored, bez fonta/margina) -> checkFont/Size/Spacing/Margins:false
 *   (crash-fix). muza-diplomski: umjetnicki, prazna pravila -> checkX:false (crash-fix).
 * muza-doktorski / pbf-doktorski: DR.SC.-08 (font/velicina/prored/A4).
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
  return [headed('Sažetak'), { text: 'Ključne riječi: grafika, teologija, kineziologija', font: TNR, sizePt: 12 },
    headed('Sadržaj'), headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(600),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const F = 'Dominantni font', V = 'Veličina osnovnog teksta', P = 'Prored osnovnog teksta';
const J = 'Poravnanje osnovnog teksta', M = 'Margine dokumenta', A4 = 'Format stranice A4', SA = 'Sadržaj dokumenta';
// profil ima i requireA4 i paperSizes:['A4'] (paper-size ruleEntry) - profile.paperSizes ima prednost
// u analyze-docx.ts pa checker koristi naslov "Format stranice (A4)", ne legacy "Format stranice A4".
const A4P = 'Format stranice (A4)';

const cases: Array<{ id: string; margins: any; pass: string[] }> = [
  { id: 'grf-diplomski', margins: { top: 2.5, right: 2.5, bottom: 3.5, left: 3.5 }, pass: [F, V, P, M, A4P, SA] },
  { id: 'kbf-diplomski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3.5 }, pass: [F, V, P, J, M, SA] },
  { id: 'kbf-zavrsni', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3.5 }, pass: [F, V, P, J, M, SA] },
  { id: 'kif-doktorski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, pass: [F, V, P, M, A4P, SA] },
  { id: 'mef-doktorski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, pass: [A4P, SA] }, // font i margine informativni
  { id: 'muza-diplomski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, pass: [] }, // ne puca; format je informativan
  { id: 'muza-doktorski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, pass: [F, V, P, A4] },
  { id: 'pbf-doktorski', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, pass: [F, V, P, A4] },
];

describe('cluster grf/kbf/kif/mef/muza/pbf: scored/informativno provjere + no-crash', () => {
  for (const c of cases) {
    it(`${c.id} prolazi ${c.pass.join('/')}`, async () => {
      const file = buildDocxFile({ paragraphs: doc(), marginsCm: c.margins }, `${c.id}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: c.id });
      expect(Array.isArray(r.checks)).toBe(true);
      for (const title of c.pass) expect(check(r, title)?.status, `${c.id}: ${title}`).toBe('pass');
    });
  }
});
