/**
 * Sinteticki golden testovi za STEM profile s brojcanim citiranjem: fer (FER),
 * fsb (Strojarstvo i brodogradnja), ttf (Tekstilno-tehnoloski), grad (Gradevinski).
 *
 * Ovi profili imaju numericko citiranje (IEEE/Vancouver) pa im je citation dimenzija
 * ogranicena; test dokazuje da se format-provjere (font, velicina, prored, poravnanje,
 * margine, A4, Sadrzaj) ispravno okidaju na uskladjenom radu prema pravilima profila.
 *
 * Prored w:line (240-tine): 1,5 => 360; 1,2 => 288; 1,15 => 276.
 *
 * Sinteticki dokument NIJE pravi rad ni izvor pravila; sluzi samo regresijskoj provjeri
 * parsera i audita (CLAUDE.md). Podupire fieldValidation.syntheticDocxAudits.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);

interface Fmt { font: string; size: number; line: number; jc?: 'both' | 'left'; }

function headed(text: string, f: Fmt): ParaSpec {
  return { text, font: f.font, sizePt: f.size, styleId: 'Heading1' };
}
function body(words: number, f: Fmt): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font: f.font, sizePt: f.size, jc: f.jc ?? 'both', spacingLine: f.line });
  return out;
}
function compliantDoc(f: Fmt): ParaSpec[] {
  return [
    headed('Sažetak', f),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font: f.font, sizePt: f.size, jc: f.jc ?? 'both', spacingLine: f.line },
    { text: 'Ključne riječi: analiza, konstrukcija, materijal, metoda', font: f.font, sizePt: f.size },
    headed('Sadržaj', f),
    headed('1. Uvod', f),
    ...body(600, f),
    headed('2. Razrada', f),
    ...body(1200, f),
    headed('3. Zaključak', f),
    ...body(300, f),
    headed('Literatura', f),
    { text: '[1] Prezime, I., Naslov rada, Izdavac, 2021.', font: f.font, sizePt: f.size },
  ];
}

describe('fer sinteticki golden: diplomski (IEEE, TNR 12, prored 1,2, A4)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/A4', async () => {
    const f: Fmt = { font: 'Times New Roman', size: 12, line: 288, jc: 'both' };
    const file = buildDocxFile({ paragraphs: compliantDoc(f), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 } }, 'fer-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fer-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
  });
});

describe('fsb sinteticki golden: diplomski (IEEE, TNR/Arial 12, prored 1,5, justify)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine', async () => {
    const f: Fmt = { font: 'Times New Roman', size: 12, line: 360, jc: 'both' };
    const file = buildDocxFile({ paragraphs: compliantDoc(f), marginsCm: { top: 2, right: 2, bottom: 2, left: 2.5 } }, 'fsb-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fsb-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Margine dokumenta').status).toBe('pass');
  });
});

describe('ttf sinteticki golden: diplomski (Vancouver, Arial 12, prored 1,5, margine 2,5)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/Sadrzaj', async () => {
    const f: Fmt = { font: 'Arial', size: 12, line: 360, jc: 'both' };
    const file = buildDocxFile({ paragraphs: compliantDoc(f), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } }, 'ttf-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'ttf-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Margine dokumenta').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});

describe('grad sinteticki golden: diplomski (IEEE, Titillium 12, prored 1,15, A4)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/A4/Sadrzaj', async () => {
    const f: Fmt = { font: 'Titillium', size: 12, line: 276, jc: 'both' };
    const file = buildDocxFile({ paragraphs: compliantDoc(f), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } }, 'grad-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'grad-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});
