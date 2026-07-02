/**
 * Sinteticki golden test AGR profila (CLAUDE.md golden harness).
 *
 * Gradi kontrolirane .docx ulaze s POZNATIM ocekivanim ishodom i provjerava da
 * auditi ispravno okidaju za sve tri razine:
 *   - diplomski / zavrsni: font (Arial/TNR/Calibri), velicina 12, prored 1,15, A4, Sadrzaj;
 *     zavrsni dodatno obostrano poravnanje (Justify je propisan).
 *   - doktorski: velicina 12, prored 1,5, margine 2,5 (bodovano), A4, Sadrzaj.
 *
 * Sinteticki dokumenti NISU pravi radovi ni izvor pravila; sluze samo regresijskoj
 * provjeri parsera i audita (CLAUDE.md). Podupiru fieldValidation.syntheticDocxAudits.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });

/** Tijelo teksta zeljene duljine, ispravno oblikovano; spacingLine 276=1,15, 360=1,5. */
function body(words: number, spacingLine: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine });
  return out;
}

/** Uskladjen rad: sazetak, sadrzaj, poglavlja, zakljucak, literatura. */
function compliantDoc(spacingLine: number): ParaSpec[] {
  return [
    headed('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font: TNR, sizePt: 12, jc: 'both', spacingLine },
    { text: 'Ključne riječi: agronomija, tlo, analiza, metoda', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    headed('1. Uvod'),
    ...body(600, spacingLine),
    headed('2. Rasprava'),
    ...body(1200, spacingLine),
    headed('3. Zaključak'),
    ...body(300, spacingLine),
    headed('Literatura'),
    { text: 'Husnjak, S. (2014). Sistematika tala. Zagreb: Agronomski fakultet.', font: TNR, sizePt: 12 },
  ];
}

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('AGR sinteticki golden: diplomski (Preporuke, prored 1,15)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/A4/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(276), marginsCm: M25 }, 'agr-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'agr-diplomski' });
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
  });
});

describe('AGR sinteticki golden: zavrsni (Justify propisan)', () => {
  it('uskladjeni rad prolazi + obostrano poravnanje', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(276), marginsCm: M25 }, 'agr-zav-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'agr-zavrsni' });
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Poravnanje osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
  });
});

describe('AGR sinteticki golden: doktorski (imperativno, prored 1,5, margine)', () => {
  it('uskladjeni rad prolazi velicinu/prored/margine/A4/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(360), marginsCm: M25 }, 'agr-dok-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'agr-doktorski' });
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    const m = check(r, 'Margine dokumenta');
    expect(m.max).toBeGreaterThan(0); // doktorski boduje margine
    expect(m.status).toBe('pass');
  });
});
