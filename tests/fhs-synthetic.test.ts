/**
 * Sinteticki golden test fhs profila (Fakultet hrvatskih studija, diplomski).
 *
 * Gradi kontrolirani .docx s poznatim ishodom (font TNR, velicina 12, prored 1,5,
 * obostrano poravnanje, margine 2,5, Sadrzaj) i provjerava da auditi ispravno okidaju.
 * Citiranje apa7 -> autor-godina. fhs ne propisuje A4 imperativno (requireA4 nije
 * postavljen), pa se A4 ne provjerava.
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
    { text: 'Ključne riječi: hrvatski studiji, kultura, analiza, metoda', font: TNR, sizePt: 12 },
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

describe('fhs sinteticki golden: diplomski (apa7, prored 1,5)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'fhs-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fhs-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    const m = check(r, 'Margine dokumenta');
    expect(m.max).toBeGreaterThan(0);
    expect(m.status).toBe('pass');
  });
});
