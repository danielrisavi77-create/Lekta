/**
 * Sinteticki golden za genericke ("opci") pravo profile: pravo-opci-pravni-akademski-rad,
 * pravo-socijalni-opci-akademski-rad, pravo-specijalisticki-pravni-opci.
 *
 * To su catch-all fallback profili (ne jedan konkretan studijski program) s punim pravilima
 * (TNR 12, prored 1,5, margine, obvezan Sadrzaj; legal-notes odn. autor-godina citiranje).
 * Test dokazuje da se scored format-provjere ispravno okidaju i profil se ne rusi.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { expectNotPenalised } from "./helpers/check-status";
import { buildDocxFile, type ParaSpec, TOC_FIELD_PARA } from './helpers/docx-builder';
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
  return [headed('Sadržaj'), TOC_FIELD_PARA, headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(400),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}

const cases: Array<{ id: string; margins: any; a4: boolean }> = [
  { id: 'pravo-opci-pravni-akademski-rad', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, a4: false },
  { id: 'pravo-socijalni-opci-akademski-rad', margins: { top: 3, right: 3, bottom: 3, left: 3.5 }, a4: true },
  { id: 'pravo-specijalisticki-pravni-opci', margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, a4: false },
];

describe('pravo genericki ("opci") profili: scored format + no-crash', () => {
  for (const c of cases) {
    it(`${c.id} prolazi font/velicinu/prored/margine/Sadrzaj`, async () => {
      const r: any = await analyzeFixture(buildDocxFile({ paragraphs: doc(), marginsCm: c.margins }, `${c.id}.docx`), { profileId: c.id });
      for (const t of ['Dominantni font', 'Veličina osnovnog teksta', 'Prored osnovnog teksta', 'Margine dokumenta', 'Sadržaj dokumenta'])
        expectNotPenalised(check(r, t));
      if (c.a4) expectNotPenalised(check(r, 'Format stranice A4'));
    });
  }
});
