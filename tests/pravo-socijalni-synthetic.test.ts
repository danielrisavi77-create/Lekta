/**
 * Sinteticki golden test za Pravni fakultet, Studijski centar socijalnog rada:
 * pravo-socijalni-rad-diplomski i -zavrsni. Citiranje pravo-social-author (autor-godina).
 *
 * Profili imaju bogata pravila (font TNR 12, prored 1,5, obostrano poravnanje, margine
 * 3/3/3/3,5 cm, A4, obvezan Sadrzaj, requiredSections, titlePage tipografija). Test gradi
 * uskladjeni .docx i provjerava da se osnovne format-provjere ispravno okidaju i da bogati
 * engine (naslovnica, TOC, headingRules) ne puca na sintetickom ulazu.
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
const headed = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });

function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 });
  return out;
}

function compliantDoc(work: 'diplomski' | 'zavrsni'): ParaSpec[] {
  return [
    { text: 'Sveučilište u Zagrebu, Pravni fakultet, Studijski centar socijalnog rada, Zagreb 2024.', font: TNR, sizePt: 12 },
    headed('Izjava o izvornosti'),
    { text: 'Izjavljujem da je ovaj rad rezultat vlastitog istraživanja.', font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    headed('Sadržaj'),
    TOC_FIELD_PARA,
    headed('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    { text: 'Ključne riječi: socijalni rad, obitelj, podrška, metoda', font: TNR, sizePt: 12 },
    headed('Abstract'),
    { text: 'Abstract of the thesis summarising the key research findings.', font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    { text: 'Keywords: social work, family, support, method', font: TNR, sizePt: 12 },
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

const M = { top: 3, right: 3, bottom: 3, left: 3.5 };

for (const work of ['diplomski', 'zavrsni'] as const) {
  describe(`pravo socijalni rad sinteticki golden: ${work} (autor-godina, margine 3/3,5)`, () => {
    it('uskladjeni rad prolazi font/velicinu/prored/poravnanje/margine/A4/Sadrzaj', async () => {
      const file = buildDocxFile({ paragraphs: compliantDoc(work), marginsCm: M }, `pravo-sr-${work}-ok.docx`);
      const r: any = await analyzeFixture(file, { profileId: `pravo-socijalni-rad-${work}` });
      expectNotPenalised(check(r, 'Dominantni font'));
      expectNotPenalised(check(r, 'Veličina osnovnog teksta'));
      expectNotPenalised(check(r, 'Prored osnovnog teksta'));
      expectNotPenalised(check(r, 'Poravnanje osnovnog teksta'));
      expectNotPenalised(check(r, 'Margine dokumenta'));
      expectNotPenalised(check(r, 'Format stranice A4'));
      expectNotPenalised(check(r, 'Sadržaj dokumenta'));
    });
  });
}
