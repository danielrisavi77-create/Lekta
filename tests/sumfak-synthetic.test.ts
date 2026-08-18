/**
 * Sinteticki golden test sumfak profila (Fakultet sumarstva i drvne tehnologije).
 *
 * Gradi kontrolirane .docx ulaze s POZNATIM ocekivanim ishodom i provjerava da auditi
 * ispravno okidaju za obje razine (pravila: font Arial/TNR/Calibri, velicina 11-12,
 * prored 1,15, margine 2,5, obostrano poravnanje propisano, Sadrzaj; diplomski dodatno
 * A4). Citiranje harvard -> autor-godina.
 *
 * Sinteticki dokumenti NISU pravi radovi ni izvor pravila; sluze samo regresijskoj
 * provjeri parsera i audita (CLAUDE.md). Podupiru fieldValidation.syntheticDocxAudits.
 */
import { describe, it, expect } from 'vitest';
import { expectNotPenalised } from "./helpers/check-status";
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });

/** Tijelo teksta, ispravno oblikovano; spacingLine 276 = 1,15. */
function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: 276 });
  return out;
}

/** Uskladjen rad: sazetak, sadrzaj, poglavlja, zakljucak, literatura. */
function compliantDoc(): ParaSpec[] {
  return [
    headed('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font: TNR, sizePt: 12, jc: 'both', spacingLine: 276 },
    { text: 'Ključne riječi: šumarstvo, sastojina, gospodarenje, analiza', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    headed('1. Uvod'),
    ...body(600),
    headed('2. Rasprava'),
    ...body(1200),
    headed('3. Zaključak'),
    ...body(300),
    headed('Literatura'),
    { text: 'Matić, S. (2011). Šume i šumarstvo Hrvatske. Zagreb: Akademija šumarskih znanosti.', font: TNR, sizePt: 12 },
  ];
}

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

describe('sumfak sinteticki golden: diplomski (harvard, prored 1,15, A4)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/A4/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'sumfak-dipl-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'sumfak-diplomski' });
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Veličina osnovnog teksta'));
    expectNotPenalised(check(r, 'Prored osnovnog teksta'));
    expectNotPenalised(check(r, 'Poravnanje osnovnog teksta'));
    expectNotPenalised(check(r, 'Format stranice A4'));
    expectNotPenalised(check(r, 'Sadržaj dokumenta'));
    const m = check(r, 'Margine dokumenta');
    expect(m.max).toBeGreaterThan(0);
    expectNotPenalised(m);
  });
});

describe('sumfak sinteticki golden: zavrsni (harvard, prored 1,15, poravnanje)', () => {
  it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/Sadrzaj', async () => {
    const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, 'sumfak-zav-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'sumfak-zavrsni' });
    expectNotPenalised(check(r, 'Dominantni font'));
    expectNotPenalised(check(r, 'Veličina osnovnog teksta'));
    expectNotPenalised(check(r, 'Prored osnovnog teksta'));
    expectNotPenalised(check(r, 'Poravnanje osnovnog teksta'));
    expectNotPenalised(check(r, 'Sadržaj dokumenta'));
    const m = check(r, 'Margine dokumenta');
    expect(m.max).toBeGreaterThan(0);
    expectNotPenalised(m);
  });
});
