/**
 * Sinteticki golden test za profile s harvard/apa7 citiranjem (autor-godina).
 *
 * Gradi kontrolirane .docx ulaze s POZNATIM ocekivanim ishodom (font TNR, velicina 12,
 * prored 1,5, obostrano poravnanje, margine 2,5, A4, Sadrzaj) i provjerava da auditi
 * ispravno okidaju za svaki profil. Tvrdnje su prilagodjene pravilima profila (npr.
 * kif nema A4 zahtjev, pmf nema Sadrzaj zahtjev, vef nema margine).
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

/** Tijelo teksta, ispravno oblikovano; spacingLine 360 = 1,5. */
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
    { text: 'Ključne riječi: analiza, metoda, istraživanje, rezultat', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    headed('1. Uvod'),
    ...body(600),
    headed('2. Rasprava'),
    ...body(1200),
    headed('3. Zaključak'),
    ...body(300),
    headed('Literatura'),
    { text: 'Prezime, I. (2020). Naslov knjige. Zagreb: Naklada.', font: TNR, sizePt: 12 },
  ];
}

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

/** Provjeri uskladjeni rad za dani profil; opts biraju koje uvjetne provjere se traze. */
async function expectCompliant(
  profileId: string,
  opts: { a4?: boolean; a4Title?: string; sadrzaj?: boolean; margins?: boolean },
) {
  const file = buildDocxFile({ paragraphs: compliantDoc(), marginsCm: M25 }, `${profileId}-ok.docx`);
  const r: any = await analyzeFixture(file, { profileId });
  expect(check(r, 'Dominantni font').status, 'font').toBe('pass');
  expect(check(r, 'Veličina osnovnog teksta').status, 'velicina').toBe('pass');
  expect(check(r, 'Prored osnovnog teksta').status, 'prored').toBe('pass');
  expect(check(r, 'Poravnanje osnovnog teksta').status, 'poravnanje').toBe('pass');
  // Naslov ovisi o tome ima li profil i paperSizes:['A4'] (paper-size ruleEntry) uz requireA4 -
  // profile.paperSizes ima prednost u analyze-docx.ts pa je onda naslov "Format stranice (A4)".
  if (opts.a4) expect(check(r, opts.a4Title ?? 'Format stranice A4').status, 'A4').toBe('pass');
  if (opts.sadrzaj) expect(check(r, 'Sadržaj dokumenta').status, 'sadrzaj').toBe('pass');
  if (opts.margins) {
    const m = check(r, 'Margine dokumenta');
    expect(m.max, 'margine max').toBeGreaterThan(0);
    expect(m.status, 'margine').toBe('pass');
  }
}

describe('harvard/apa7 sinteticki golden (autor-godina)', () => {
  it('efzg-zavrsni (harvard): font/velicina/prored/poravnanje/A4/Sadrzaj/margine', () =>
    expectCompliant('efzg-zavrsni', { a4: true, sadrzaj: true, margins: true }));

  it('vef-diplomski (harvard): font/velicina/prored/poravnanje/A4/Sadrzaj', () =>
    expectCompliant('vef-diplomski', { a4: true, a4Title: 'Format stranice (A4)', sadrzaj: true }));

  it('kif-diplomski (apa7): font/velicina/prored/poravnanje/Sadrzaj/margine', () =>
    expectCompliant('kif-diplomski', { sadrzaj: true, margins: true }));

  it('pmf-geografija-diplomski (harvard): font/velicina/prored/poravnanje/A4/margine', () =>
    expectCompliant('pmf-geografija-diplomski', { a4: true, a4Title: 'Format stranice (A4)', margins: true }));

  it('ufzg-zavrsni (apa7): font/velicina/prored/poravnanje/A4/Sadrzaj/margine', () =>
    expectCompliant('ufzg-zavrsni', { a4: true, a4Title: 'Format stranice (A4)', sadrzaj: true, margins: true }));

  it('ufzg-diplomski (apa7): font/velicina/prored/poravnanje/A4/Sadrzaj/margine', () =>
    expectCompliant('ufzg-diplomski', { a4: true, a4Title: 'Format stranice (A4)', sadrzaj: true, margins: true }));
});
