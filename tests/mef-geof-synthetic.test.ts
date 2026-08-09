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
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
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
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    // mef-diplomski ima i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
    expect(check(r, 'Format stranice (A4)').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});

describe('geof sinteticki golden: diplomski (harvard, samo Sadrzaj scored)', () => {
  it('uskladjeni rad prolazi Sadrzaj i ne puca (bez tehnickih pravila)', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'geof-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'geof-diplomski' });
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    // Font/velicina/prored/margine su informativni (profil ih ne propisuje).
    expect(check(r, 'Dominantni font').status).toBe('info');
    expect(check(r, 'Margine dokumenta').status).toBe('info');
  });
});
