/**
 * Sinteticki golden testovi za mef (Medicinski fakultet) i geof (Geodetski fakultet),
 * diplomski rad. Oba imaju autor-godina (harvard) citiranje.
 *
 * mef: font TNR/Arial i velicina 11/12 su imperativ (scored); prored (1,5 ILI 2) i margine
 * su advisory pa su checkSpacing/checkMargins false -> Prored/Margine su informativni.
 * A4 i Sadrzaj su obvezni.
 *
 * geof: Opci naputak propisuje SAMO obvezan Sadrzaj i autor-godina citiranje; ne propisuje
 * font, velicinu, prored, margine ni format papira. Zato su te provjere iskljucene
 * (informativne). Test dokazuje da se scored dio (Sadrzaj) ispravno okida i da profil ne puca.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila; sluzi samo regresijskoj provjeri
 * parsera i audita (CLAUDE.md). Podupire fieldValidation.syntheticDocxAudits.
 */
import { describe, it, expect } from 'vitest';
import { expectNotPenalised } from "./helpers/check-status";
import { buildDocxFile, type ParaSpec, TOC_FIELD_PARA } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (text: string, font = TNR): ParaSpec => ({ text, font, sizePt: 12, styleId: 'Heading1' });

function body(words: number, font = TNR): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font, sizePt: 12, jc: 'both', spacingLine: 360 });
  return out;
}

function compliantDoc(font = TNR): ParaSpec[] {
  return [
    headed('Sažetak', font),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font, sizePt: 12, jc: 'both', spacingLine: 360 },
    { text: 'Ključne riječi: medicina, geodezija, analiza, metoda', font, sizePt: 12 },
    headed('Sadržaj', font),
    TOC_FIELD_PARA,
    headed('1. Uvod', font),
    ...body(600, font),
    headed('2. Rasprava', font),
    ...body(1200, font),
    headed('3. Zaključak', font),
    ...body(300, font),
    headed('Literatura', font),
    { text: 'Prezime, I. (2021). Naslov knjige. Zagreb: Naklada.', font, sizePt: 12 },
  ];
}

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('mef sinteticki golden: diplomski (harvard, font+velicina scored, A4)', () => {
  it('uskladjeni rad prolazi font, velicinu, A4 i Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'mef-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'mef-diplomski' });
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Veličina osnovnog teksta'));
    // mef-diplomski ima i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
    expectNotPenalised(check(r, 'Format stranice (A4)'));
    expectNotPenalised(check(r, 'Sadržaj dokumenta'));
  });
});

describe('geof sinteticki golden: diplomski (harvard, samo Sadrzaj scored)', () => {
  it('uskladjeni rad prolazi Sadrzaj i ne puca (bez tehnickih pravila)', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'geof-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'geof-diplomski' });
    expectNotPenalised(check(r, 'Sadržaj dokumenta'));
    // Font/velicina/prored/margine su informativni (profil ih ne propisuje) -> pass bez kaznjavanja.
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Margine dokumenta'));
  });
});
