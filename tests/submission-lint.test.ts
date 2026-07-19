import { describe, it, expect } from 'vitest';
import {
  submissionLint,
  submissionLintSummary,
  KIND_NASLOV_TOCKA,
  KIND_CITAT_BEZ_LOKATORA,
  KIND_GOLA_POVEZNICA,
  KIND_REFERENCA_BEZ_GODINE,
  KIND_ELEMENT_BEZ_REFERENCE,
  KIND_ELEMENT_NUMERIRANJE,
  KIND_AUTOR_GODINA_NESKLAD,
  KIND_NEVALJAN_ISBN,
  KIND_NEVALJAN_DOI,
  KIND_BUDUCA_GODINA,
  KIND_DUPLIKAT_REFERENCE,
  type SubmissionLintInput,
} from '../src/audits/submission-lint';

function lint(partial: Partial<SubmissionLintInput>) {
  return submissionLint({
    paragraphs: [],
    citations: [],
    references: [],
    referencesStart: -1,
    language: 'hr',
    currentYear: 2026,
    ...partial,
  });
}
const para = (index: number, text: string, headingLevel: number | null = null) => ({ index, text, headingLevel });
const byKind = (fs: ReturnType<typeof submissionLint>, k: string) => fs.filter((f) => f.kind === k);

describe('submissionLint: naslov zavrsava tockom', () => {
  it('prijavljuje naslov s tockom (i uz numeriranje)', () => {
    const fs = lint({ paragraphs: [para(1, 'Uvod.', 1), para(2, '2. Razrada teme.', 1)] });
    expect(byKind(fs, KIND_NASLOV_TOCKA)).toHaveLength(2);
  });
  it('ne prijavljuje uredan naslov ni trotocku', () => {
    const fs = lint({ paragraphs: [para(1, '1. Uvod', 1), para(2, 'Rasprava', 2)] });
    expect(byKind(fs, KIND_NASLOV_TOCKA)).toHaveLength(0);
  });
});

describe('submissionLint: izravni citat bez broja stranice (godina NIJE stranica)', () => {
  it('prijavljuje doslovni navod s (Autor, godina) bez stranice', () => {
    const fs = lint({ paragraphs: [para(1, 'Kako kaže „ovo je doslovni citat teksta” (Kovač, 2018).')] });
    expect(byKind(fs, KIND_CITAT_BEZ_LOKATORA)).toHaveLength(1);
  });
  it('ne prijavljuje kad ima str. broj', () => {
    const fs = lint({ paragraphs: [para(1, '„ovo je doslovni citat teksta” (Kovač, 2018, str. 45).')] });
    expect(byKind(fs, KIND_CITAT_BEZ_LOKATORA)).toHaveLength(0);
  });
  it('ne prijavljuje kad je stranica dvotockom (2018: 45)', () => {
    const fs = lint({ paragraphs: [para(1, '„ovo je doslovni citat teksta” (Kovač, 2018: 45).')] });
    expect(byKind(fs, KIND_CITAT_BEZ_LOKATORA)).toHaveLength(0);
  });
  it('ne prijavljuje odlomak bez doslovnog navoda', () => {
    const fs = lint({ paragraphs: [para(1, 'Parafraza teme prema (Kovač, 2018).')] });
    expect(byKind(fs, KIND_CITAT_BEZ_LOKATORA)).toHaveLength(0);
  });
});

describe('submissionLint: gola poveznica u tijelu', () => {
  it('prijavljuje URL u tijelu, ne u literaturi', () => {
    const fs = lint({
      paragraphs: [para(1, 'Vidi www.example.com/x za više.'), para(3, 'Izvor. https://who.int/a')],
      referencesStart: 2,
    });
    const f = byKind(fs, KIND_GOLA_POVEZNICA);
    expect(f).toHaveLength(1);
    expect(f[0].paragraphIndex).toBe(1);
  });
});

describe('submissionLint: jedinica literature bez godine', () => {
  it('prijavljuje redak koji izgleda kao referenca a nema godinu', () => {
    const fs = lint({
      paragraphs: [para(1, 'Literatura', 1), para(2, 'Babić. Komunikologija u praksi danas.'), para(3, 'Horvat, I. (2020). Naslov. Zagreb: Naklada.')],
      referencesStart: 1,
    });
    const f = byKind(fs, KIND_REFERENCA_BEZ_GODINE);
    expect(f).toHaveLength(1);
    expect(f[0].paragraphIndex).toBe(2);
  });
});

describe('submissionLint: numeriranje i spominjanje slika/tablica', () => {
  it('prijavljuje preskok u numeriranju i sliku koja se ne spominje', () => {
    const fs = lint({
      paragraphs: [
        para(1, 'Slika 1. Prva'),
        para(2, 'Kao što prikazuje Slika 1, rezultat je jasan.'),
        para(3, 'Slika 3. Treca (preskocena 2)'),
      ],
    });
    expect(byKind(fs, KIND_ELEMENT_NUMERIRANJE)).toHaveLength(1); // [1,3] nije uzastopno
    const ref = byKind(fs, KIND_ELEMENT_BEZ_REFERENCE);
    expect(ref).toHaveLength(1); // Slika 3 se ne spominje; Slika 1 se spominje
    expect(ref[0].paragraphIndex).toBe(3);
  });
});

describe('submissionLint: nesklad autor-godina (izmisljena/nemarna referenca)', () => {
  it('prijavljuje kad tekst ima godinu koje nema u literaturi za istog autora', () => {
    const fs = lint({
      citations: [{ author: 'Horvat', year: '2020', p: 5, raw: '(Horvat, 2020)' }],
      references: [{ text: 'Horvat, I. (2019). Naslov.', author: 'Horvat', year: '2019', p: 30 }],
    });
    expect(byKind(fs, KIND_AUTOR_GODINA_NESKLAD)).toHaveLength(1);
  });
  it('ne prijavljuje kad se godina poklapa', () => {
    const fs = lint({
      citations: [{ author: 'Horvat', year: '2019', p: 5 }],
      references: [{ text: 'Horvat, I. (2019).', author: 'Horvat', year: '2019', p: 30 }],
    });
    expect(byKind(fs, KIND_AUTOR_GODINA_NESKLAD)).toHaveLength(0);
  });
  it('ne prijavljuje kad autora uopce nema u literaturi (to je missing)', () => {
    const fs = lint({
      citations: [{ author: 'Novak', year: '2019', p: 5 }],
      references: [{ text: 'Horvat, I. (2019).', author: 'Horvat', year: '2019', p: 30 }],
    });
    expect(byKind(fs, KIND_AUTOR_GODINA_NESKLAD)).toHaveLength(0);
  });
});

describe('submissionLint: nevaljan ISBN / DOI', () => {
  it('prijavljuje ISBN s krivom kontrolnom znamenkom, ne ispravan', () => {
    const bad = lint({ references: [{ text: 'Knjiga. ISBN 978-0-306-40615-8', author: 'A', year: '2020', p: 1 }] });
    expect(byKind(bad, KIND_NEVALJAN_ISBN)).toHaveLength(1);
    const good = lint({ references: [{ text: 'Knjiga. ISBN 978-0-306-40615-7', author: 'A', year: '2020', p: 1 }] });
    expect(byKind(good, KIND_NEVALJAN_ISBN)).toHaveLength(0);
  });
  it('prijavljuje DOI krivog oblika, ne ispravan', () => {
    const bad = lint({ references: [{ text: 'Clanak. doi: 12345', author: 'A', year: '2020', p: 1 }] });
    expect(byKind(bad, KIND_NEVALJAN_DOI)).toHaveLength(1);
    const good = lint({ references: [{ text: 'Clanak. doi: 10.1000/xyz123', author: 'A', year: '2020', p: 1 }] });
    expect(byKind(good, KIND_NEVALJAN_DOI)).toHaveLength(0);
  });
});

describe('submissionLint: buduca godina i duplikat', () => {
  it('prijavljuje godinu u buducnosti', () => {
    const fs = lint({ references: [{ text: 'Knjiga. (2030).', author: 'A', year: '2030', p: 1 }], currentYear: 2026 });
    expect(byKind(fs, KIND_BUDUCA_GODINA)).toHaveLength(1);
  });
  it('prijavljuje ponovljenu jedinicu u literaturi', () => {
    const r = { text: 'Horvat, I. (2020). Ista knjiga o temi. Zagreb: Naklada.', author: 'Horvat', year: '2020' };
    const fs = lint({ references: [{ ...r, p: 30 }, { ...r, p: 31 }] });
    expect(byKind(fs, KIND_DUPLIKAT_REFERENCE)).toHaveLength(1);
  });
});

describe('submissionLint: sazetak', () => {
  it('broji nalaze po vrsti', () => {
    const fs = lint({ paragraphs: [para(1, 'Uvod.', 1)] });
    const s = submissionLintSummary(fs);
    expect(s.total).toBe(1);
    expect(s.byKind[KIND_NASLOV_TOCKA]).toBe(1);
  });
});
