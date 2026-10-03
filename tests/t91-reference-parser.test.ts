// @vitest-environment node
/**
 * T91 golden: parser popisa literature (`extractReferences`) nad rucno sastavljenim, izmisljenim
 * zapisima. Nijedan zapis nije iz stvarnog rada.
 *
 * Dva oblika iz D1 mjerenja (Laya, 2026-09-28, sinteticki skup s istinom po konstrukciji):
 *   (a) zapis koji pocinje s "(godina)." (bez autora) lijepio se na prethodni zapis, pa ga
 *       `reference.completeness` nije mogao prijaviti (D1: 4 od 72 prijavljeno);
 *   (b) potpuni zapisi s oznakom bez godine ("b.g.", "s. a.", "n. d.", "u tisku") prijavljivali su
 *       se kao nepotpuni (D1: 128 od 144 laznih nalaza).
 *
 * Ovaj test BILJEZI ponasanje. `nepotpun` je predikat `reference.completeness` za autor-godina
 * profil (`src/analysis/analyze-docx.ts`).
 */
import { describe, expect, it } from 'vitest';
import { extractReferences } from '../src/citations/author-year';

type Ref = { text: string; author: string; year: string; noDate?: string };
const nepotpun = (r: Ref) => !r.year || !r.author || r.text.length < 25;

const POTPUNI = [
  'Horvat, A. (2011). Lokalna samouprava u praksi. Zagreb: Primjer naklada.',
  'Babic, M. (2014). Izborni sustavi i stranke. Split: Ogledni izdavac.',
  'Juric, I. (2016). Javne politike danas. Rijeka: Primjer naklada.',
  'Novak, K. (2018). Civilno drustvo i mediji. Osijek: Ogledni izdavac.',
  'Peric, T. (2019). Regionalni razvoj Hrvatske. Zadar: Primjer naklada.',
  'Radic, D. (2020). Digitalna uprava. Zagreb: Ogledni izdavac.',
  'Tomic, J. (2021). Europske integracije. Split: Primjer naklada.',
  'Matic, P. (2022). Socijalna politika. Rijeka: Ogledni izdavac.',
];
// (a) bez autora, svaki iza jednog potpunog zapisa
const BEZ_AUTORA = [
  '(2012). Prirucnik za lokalne izbore. Zagreb: Primjer naklada.',
  '(2013). Godisnje izvjesce o participaciji. Split: Ogledni izdavac.',
  '(2015). Zbornik o javnim politikama. Rijeka: Primjer naklada.',
  '(2017). Pregled regionalnih strategija. Osijek: Ogledni izdavac.',
  '(2018). Smjernice za digitalnu upravu. Zadar: Primjer naklada.',
  '(2019). Studija o medijskoj pismenosti. Zagreb: Ogledni izdavac.',
  '(2021). Analiza socijalnih programa. Split: Primjer naklada.',
  '(2023). Izvjesce o europskim fondovima. Rijeka: Ogledni izdavac.',
];
// (b) potpuni zapisi s oznakom bez godine
const BEZ_GODINE = [
  'Kovac, B. (b.g.). Povijest lokalne uprave. Zagreb: Primjer naklada.',
  'Maric, L. (b.g.). Gradanske udruge. Split: Ogledni izdavac.',
  'Vukic, S. (s. a.). Pregled izbornih zakona. Rijeka: Primjer naklada.',
  'Bilic, R. (s. a.). Ustavni okvir samouprave. Osijek: Ogledni izdavac.',
  'Grgic, N. (n. d.). Mediji i politika. Zadar: Primjer naklada.',
  'Pavic, Z. (n. d.). Javna rasprava. Zagreb: Ogledni izdavac.',
  'Knez, V. (u tisku). Novi modeli participacije. Politicka misao.',
  'Lovric, E. (u tisku). Digitalni gradani. Drustvena istrazivanja.',
];

function refs(lines: string[]): Ref[] {
  const paragraphs = [{ text: 'Uvod', headingLevel: 1 }, { text: 'Tekst rada.' }, { text: 'Literatura', headingLevel: 1 }, ...lines.map((text) => ({ text }))];
  return extractReferences(paragraphs, 'hr').entries as Ref[];
}

describe('T91 golden: zateceno ponasanje parsera literature', () => {
  it('(a) zapis koji pocinje s "(godina)." spaja se s prethodnim', () => {
    const lines = POTPUNI.flatMap((p, i) => [p, BEZ_AUTORA[i]]);
    const r = refs(lines);
    const samostalniBezAutora = r.filter((x) => /^\(\d{4}\)/.test(x.text)).length;
    const spojeni = r.filter((x) => /\.\s+\(\d{4}\)\./.test(x.text)).length;
    expect({ zapisa: r.length, samostalniBezAutora, spojeni, nepotpunih: r.filter(nepotpun).length })
      .toEqual({ zapisa: ZATECENO.a.zapisa, samostalniBezAutora: ZATECENO.a.samostalniBezAutora, spojeni: ZATECENO.a.spojeni, nepotpunih: ZATECENO.a.nepotpunih });
  });

  it('(b) potpuni zapisi s oznakom bez godine prijavljuju se kao nepotpuni', () => {
    const r = refs(BEZ_GODINE);
    expect({ zapisa: r.length, nepotpunih: r.filter(nepotpun).length, bezAutora: r.filter((x) => !x.author).length })
      .toEqual(ZATECENO.b);
  });

  it('kontrola: obicni potpuni zapisi nisu nepotpuni', () => {
    const r = refs(POTPUNI);
    expect({ zapisa: r.length, nepotpunih: r.filter(nepotpun).length }).toEqual({ zapisa: 8, nepotpunih: 0 });
  });
});

// Izmjereno na origin/master 7abdffeb prije popravka.
// (a) 8 potpunih + 8 bez autora daje 8 zapisa: svaki zapis bez autora zalijepljen je na prethodni.
// (b) 8 potpunih zapisa bez godine daje 7 zapisa, svih 7 nepotpunih, 5 bez prepoznatog autora.
const ZATECENO = {
  a: { zapisa: 8, samostalniBezAutora: 0, spojeni: 8, nepotpunih: 0 },
  b: { zapisa: 7, nepotpunih: 7, bezAutora: 5 },
};
