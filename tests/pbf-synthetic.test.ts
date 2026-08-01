/**
 * Sinteticki golden test pbf profila (Prehrambeno-biotehnoloski fakultet, diplomski).
 *
 * Gradi kontrolirani .docx s poznatim ishodom (font TNR, velicina 12, prored 1,5,
 * obostrano poravnanje, A4, Sadrzaj) i provjerava da auditi ispravno okidaju.
 * Citiranje harvard -> autor-godina. pbf ne propisuje brojcane margine
 * (checkMargins:false), pa se margine ne provjeravaju.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila; sluzi samo regresijskoj
 * provjeri parsera i audita (CLAUDE.md). Podupire fieldValidation.syntheticDocxAudits.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });

function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 });
  return out;
}

function compliantDoc(): ParaSpec[] {
  return [
    headed('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    { text: 'Ključne riječi: prehrana, biotehnologija, analiza, metoda', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    headed('1. Uvod'),
    ...body(600),
    headed('2. Rasprava'),
    ...body(1200),
    headed('3. Zaključak'),
    ...body(300),
    headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov knjige. Zagreb: Naklada.', font: TNR, sizePt: 12 },
  ];
}

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('pbf sinteticki golden: diplomski (harvard, prored 1,5, A4)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/A4/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'pbf-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'pbf-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    // pbf-diplomski ima i requireA4 i paperSizes:['A4'] (paper-size ruleEntry).
    expect(check(r, 'Format stranice (A4)').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});
