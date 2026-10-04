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
 * Prvi commit je BILJEZIO zateceno ponasanje (ZATECENO nize); popravak ga mijenja u POSLIJE.
 * `nepotpun` je predikat `reference.completeness` za autor-godina profil, isti koji koristi
 * `src/analysis/analyze-docx.ts`.
 */
import { describe, expect, it } from 'vitest';
import { extractReferences, isIncompleteReference } from '../src/citations/author-year';
import { loadReferenceParser, referenceParserProblems } from './helpers/reference-parser-guard';
import { analyzeBibliographyStructure } from '../src/analysis/bibliography-structure';

type Ref = { text: string; author: string; year: string; noDate?: string };
const nepotpun = (r: Ref) => isIncompleteReference(r);

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

function mjeriA(r: Ref[]) {
  return {
    zapisa: r.length,
    samostalniBezAutora: r.filter((x) => /^\(\d{4}\)/.test(x.text)).length,
    // Zapis koji SADRZI redak bez autora, a ne pocinje njime. Prvi commit je ovdje imao regex
    // /\.\s+\(\d{4}\)\./ koji pogada i "Horvat, A. (2011)." pa bi dao 8 i bez spajanja; zatecenih
    // 8 je ipak tocno jer je svaki od 8 redaka bez autora bio zalijepljen (zapisa 8 umjesto 16).
    spojeni: r.filter((x) => BEZ_AUTORA.some((b) => x.text.includes(b) && !x.text.startsWith(b))).length,
    nepotpunih: r.filter(nepotpun).length,
  };
}

describe('T91 golden: parser literature nakon popravka', () => {
  it('(a) zapis koji pocinje s "(godina)." je zaseban zapis i prijavljuje se kao nepotpun', () => {
    const r = refs(POTPUNI.flatMap((p, i) => [p, BEZ_AUTORA[i]]));
    expect(mjeriA(r)).toEqual(POSLIJE.a);
    expect(r.filter((x) => !x.author).map((x) => x.year)).toEqual(['2012', '2013', '2015', '2017', '2018', '2019', '2021', '2023']);
  });

  it('(b) potpuni zapisi s oznakom bez godine nisu nepotpuni i nose oznaku', () => {
    const r = refs(BEZ_GODINE);
    expect({ zapisa: r.length, nepotpunih: r.filter(nepotpun).length, bezAutora: r.filter((x) => !x.author).length })
      .toEqual(POSLIJE.b);
    expect(r.every((x) => x.year === '' && !!x.noDate)).toBe(true);
  });

  it('kontrola: obicni potpuni zapisi nisu nepotpuni', () => {
    const r = refs(POTPUNI);
    expect({ zapisa: r.length, nepotpunih: r.filter(nepotpun).length }).toEqual({ zapisa: 8, nepotpunih: 0 });
  });

  it('gard (tests/helpers/reference-parser-guard.ts) je cist nad stvarnim parserom, uvezenim i izvrsenim iz izvora', () => {
    expect(referenceParserProblems({ extractReferences, isIncompleteReference } as Parameters<typeof referenceParserProblems>[0])).toEqual([]);
    expect(referenceParserProblems(loadReferenceParser())).toEqual([]);
  });

  it('pregled R5: izvrsavanje izvora radi i bez node:module stripTypeScriptTypes (Node 20, esbuild)', () => {
    expect(referenceParserProblems(loadReferenceParser((s) => s, null))).toEqual([]);
  });

  it('pregled R2: kratak autorov red i kratica s tockom ostaju jedan zapis s autorom', () => {
    for (const [autor, ocekivano] of [['Horvat, A.', 'Horvat'], ['HZZ.', 'HZZ']] as const) {
      const r = refs([autor, '(2011). Godisnje izvjesce o zaposljavanju. Zagreb: Ogledni izdavac.']);
      expect(r.map((x) => ({ author: x.author, year: x.year, nepotpun: nepotpun(x) }))).toEqual([{ author: ocekivano, year: '2011', nepotpun: false }]);
    }
  });

  it('pregled R2b: prethodni zapis bez godine ne guta iduci "(2011).", oba ostaju nepotpuna', () => {
    const r = refs(['Hrvatski zavod. Godisnje izvjesce. Zagreb: Naklada', '(2011). Prirucnik za poslodavce. Zagreb: Ogledni izdavac.']);
    expect(r.map((x) => nepotpun(x))).toEqual([true, true]);
  });

  it('pregled R2b (runda 4): naslov bez interpunkcije nije autor, "(2011)." ostaje nepotpun nalaz', () => {
    const r = refs(['Socijalna politika', '(2011). Prirucnik za socijalne radnike. Zagreb: Ogledni izdavac.']);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => nepotpun(x))).toBe(true);
  });

  it('pregled R1 (runda 4): goli broj u naslovu nije datum, oznaka bez godine ostaje', () => {
    const [r] = refs(['Horvat, A. (u tisku). Mediji 2011. Zagreb: Ogledni izdavac.']);
    expect({ author: r.author, year: r.year, noDate: r.noDate, nepotpun: nepotpun(r) }).toEqual({ author: 'Horvat', year: '', noDate: '(u tisku)', nepotpun: false });
  });

  it('pregled R1: oznaka u naslovu i godina na kraju zapisa: godina vrijedi', () => {
    const [r] = refs(['Horvat, A. Mediji (u tisku). Zagreb: Ogledni izdavac, 2011.']);
    expect({ year: r.year, noDate: r.noDate }).toEqual({ year: '2011', noDate: undefined });
  });

  it('pregled R1: oznaka bez godine u naslovu iza godine ne brise godinu', () => {
    const [r] = refs(['Horvat, A. (2011). Mediji (u tisku). Zagreb: Primjer naklada.']);
    expect({ author: r.author, year: r.year, noDate: r.noDate }).toEqual({ author: 'Horvat', year: '2011', noDate: undefined });
  });

  it('pregled R2: "(godina)." iza autorova dijela bez godine i tocke ostaje isti zapis', () => {
    const r = refs(['Hrvatski zavod za zaposljavanje', '(2011). Godisnje izvjesce. Zagreb: Ogledni izdavac.']);
    expect(r.map((x) => ({ author: x.author, year: x.year, nepotpun: nepotpun(x) }))).toEqual([{ author: 'Hrvatski zavod za zaposljavanje', year: '2011', nepotpun: false }]);
  });

  it('pregled R3: ponovljeni autor "(2011b)." ostaje zaseban zapis i nalaz', () => {
    const r = refs(['Horvat, A. (2011a). Lokalna samouprava u praksi. Zagreb: Primjer naklada.', '(2011b). Lokalna samouprava danas. Zagreb: Primjer naklada.']);
    expect(r.map((x) => ({ author: x.author, year: x.year, nepotpun: nepotpun(x) }))).toEqual([
      { author: 'Horvat', year: '2011a', nepotpun: false },
      { author: '', year: '2011b', nepotpun: true },
    ]);
  });

  it('pregled R6: struktura literature ne daje missing-year za oznaku bez godine', () => {
    const paragraphs = [{ text: 'Uvod', headingLevel: 1 }, { text: 'Tekst rada.' }, { text: 'Literatura', headingLevel: 1 }, ...BEZ_GODINE.map((text) => ({ text }))]
      .map((p, index) => ({ ...p, index }));
    const s = analyzeBibliographyStructure(paragraphs, 'hr');
    expect(s.entries.length).toBe(BEZ_GODINE.length);
    expect(s.entries.filter((e) => e.flags.includes('missing-year')).map((e) => e.rawText)).toEqual([]);
  });

  it('pomak prema zatecenom: tocno 8 zapisa bez autora odvojeno, 7 laznih nalaza (b) nestaje', () => {
    expect(POSLIJE.a.zapisa - ZATECENO.a.zapisa).toBe(BEZ_AUTORA.length);
    expect(ZATECENO.a.spojeni - POSLIJE.a.spojeni).toBe(BEZ_AUTORA.length);
    expect(ZATECENO.b.nepotpunih - POSLIJE.b.nepotpunih).toBe(7);
  });

  it('metrika spojeni hvata lijepljenje: simulirano staro spajanje daje zatecene brojke (a)', () => {
    const glued = POTPUNI.map((p, i) => `${p} ${BEZ_AUTORA[i]}`);
    const r = refs(glued);
    expect({ zapisa: r.length, spojeni: mjeriA(r).spojeni }).toEqual({ zapisa: ZATECENO.a.zapisa, spojeni: ZATECENO.a.spojeni });
  });

  it('idempotencija: drugi prolaz nad tekstovima zapisa iz prvog prolaza je no-op', () => {
    for (const lines of [POTPUNI.flatMap((p, i) => [p, BEZ_AUTORA[i]]), BEZ_GODINE, POTPUNI]) {
      const prvi = refs(lines);
      const drugi = refs(prvi.map((x) => x.text));
      expect(drugi.map(({ text, author, year, noDate }) => ({ text, author, year, noDate })))
        .toEqual(prvi.map(({ text, author, year, noDate }) => ({ text, author, year, noDate })));
    }
  });
});

// Nakon popravka (isti ulazi).
const POSLIJE = {
  a: { zapisa: 16, samostalniBezAutora: 8, spojeni: 0, nepotpunih: 8 },
  b: { zapisa: 8, nepotpunih: 0, bezAutora: 0 },
};

// Izmjereno na origin/master 7abdffeb prije popravka (prvi commit ovog testa).
// (a) 8 potpunih + 8 bez autora daje 8 zapisa: svaki zapis bez autora zalijepljen je na prethodni.
// (b) 8 potpunih zapisa bez godine daje 7 zapisa, svih 7 nepotpunih, 5 bez prepoznatog autora.
const ZATECENO = {
  a: { zapisa: 8, samostalniBezAutora: 0, spojeni: 8, nepotpunih: 0 },
  b: { zapisa: 7, nepotpunih: 7, bezAutora: 5 },
};
