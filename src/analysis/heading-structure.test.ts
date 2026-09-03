import { describe, expect, it } from 'vitest';
import { detectHeadingStructure, looksLikeBibliographyEntry, looksLikeTitlePageLabel } from './heading-structure';

const run = (text: string, props: Record<string, unknown> = {}) => ({ text, runs: [{ text, ...props }] });

describe('detectHeadingStructure', () => {
  it('prepoznaje numerirane ručno oblikovane naslove i razine', () => {
    const result = detectHeadingStructure([
      { index: 1, text: 'Uvod', headingLevel: 1, runs: [{ text: 'Uvod', bold: true, size: 14 }] },
      { index: 2, ...run('1. Teorijski okvir', { bold: true, size: 14 }) },
      { index: 3, ...run('1.1 Ključni pojmovi', { bold: true, size: 12 }) },
      { index: 4, ...run('Ovo je običan odlomak rada koji nije naslov.', { size: 12 }) },
    ], { maxLevel: 3 });

    expect(result.candidates.map((candidate) => [candidate.paragraphIndex, candidate.proposedLevel])).toEqual([
      [2, 1],
      [3, 2],
    ]);
    expect(result.candidates[0].confidence).toBe('high');
    expect(result.summary).toEqual({ total: 2, highConfidence: 2, needsConfirmation: 0 });
  });

  it('izostavlja tablice, popise, opise elemenata i sadržaj', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('Tablica 1. Rezultati', { bold: true, size: 14 }) },
      { index: 2, ...run('- Stavka popisa', { bold: true, size: 14 }) },
      { index: 3, ...run('Slika 2. Model', { bold: true, size: 14 }) },
      { index: 4, ...run('1. Uvod', { bold: true, size: 14 }), styleName: 'TOC 1' },
      { index: 5, ...run('2. Metoda', { bold: true, size: 14 }), cell: { table: 1 } },
    ]);

    expect(result.candidates).toEqual([]);
  });

  /**
   * RE-53. Test iznad izostavlja sadrzaj preko `styleName: 'TOC 1'`, ali na ZIVOJ putanji taj
   * put ne postoji: attachHeadingStructure gradi odlomke iz result.preview.paragraphs, a ti
   * objekti nemaju ni styleId ni styleName. Ostaje samo tekst, u kojem Word unos sadrzaja ima
   * tabulator pa broj stranice (paragraphText pretvara <w:tab/> u \t).
   *
   * Prije popravka su sva cetiri unosa prolazila kao naslovi s confidence=high i
   * selectedByDefault=true, pa bi ih "Popravi sve" pretvorio u stvarne naslove: pojavili bi se u
   * samom sadrzaju pri sljedecem osvjezavanju i pomaknuli numeraciju.
   */
  it('izostavlja unose sadrzaja i kad stil nije dostupan (tabulator pa broj stranice)', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('1. Uvod\t1', { bold: true, size: 14 }) },
      { index: 2, ...run('2. Razrada\t3', { bold: true, size: 14 }) },
      { index: 3, ...run('2.1. Metoda\t4', { bold: true, size: 14 }) },
      { index: 4, ...run('3. Zaključak\t9', { bold: true, size: 14 }) },
      // Kontrola: pravi naslov u istom dokumentu mora i dalje biti prepoznat.
      { index: 5, ...run('1. Uvod', { bold: true, size: 14 }) },
    ], { maxLevel: 3 });

    expect(result.candidates.map((candidate) => candidate.paragraphIndex)).toEqual([5]);
  });

  it('prijavljuje preskok razine', () => {
    const result = detectHeadingStructure([
      { index: 1, text: '1. Glavno poglavlje', runs: [{ text: '1. Glavno poglavlje', bold: true, size: 14 }] },
      { index: 2, text: '1.1.1 Preduboka razina', runs: [{ text: '1.1.1 Preduboka razina', bold: true, size: 12 }] },
    ], { maxLevel: 3 });

    expect(result.warnings.some((warning) => warning.kind === 'skipped-level')).toBe(true);
  });

  it('ne numeriranom kandidatu bez pouzdane razine traži potvrdu', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('Metodologija', { bold: true, size: 13 }) },
    ], { maxLevel: 3 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].confidence).toBe('medium');
    expect(result.candidates[0].selectedByDefault).toBe(false);
  });
});

/**
 * RAZINA SE SPUSTA DA NE PRESKACE HIJERARHIJU.
 *
 * `inferUnnumberedLevels` razinu izvodi iz RANGA velicine fonta, neovisno o susjedima, pa je
 * naslov s trecom najvecom velicinom dobivao razinu 3 i kad mu je prethodnik razina 1. Popravak
 * je taj prijedlog doslovno upisivao, pa je `structure.heading.hierarchy` padao IZ prolaza u
 * upozorenje. Izmjereno 2026-08-23 na stvarnom radu (`corpus-0147`, efzg-seminarski): 6/6 -> 5/6,
 * skok na "IZJAVA O AKADEMSKOJ CESTITOSTI". Kod je pritom SAM upozoravao `skipped-level`.
 */
describe('detectHeadingStructure: spustanje razine', () => {
  const bigTitle = { bold: true, size: 20 };
  const mid = { bold: true, size: 16 };
  const small = { bold: true, size: 13 };

  it('predlozeni naslov ne preskace razinu iza prethodnog predlozenog naslova', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('NASLOV RADA', bigTitle) },
      { index: 2, ...run('IZJAVA O AKADEMSKOJ CESTITOSTI', small) },
      { index: 3, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });

    const selected = result.candidates.filter((c) => c.selectedByDefault);
    const levels = selected.map((c) => c.proposedLevel);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i], `skok s ${levels[i - 1]} na ${levels[i]}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    }
  });

  it('NEGATIVNA KONTROLA: razina se nikad ne PODIZE, samo spusta', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('1. Uvod', mid) },
      { index: 2, ...run('1.1 Pojmovi', small) },
      { index: 3, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });
    const byIndex = new Map(result.candidates.map((c) => [c.paragraphIndex, c.proposedLevel]));
    // Numerirani naslovi zadrzavaju razinu iz numeracije; spustanje ih ne smije dirati.
    expect(byIndex.get(1)).toBe(1);
    expect(byIndex.get(2)).toBe(2);
  });

  it('NEODABRAN kandidat ne smije "pokrivati" skok (inace se spustanje ne dogodi)', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('NASLOV RADA', bigTitle) },
      { index: 2, ...run('Podnaslov koji nije siguran', mid) },
      { index: 3, ...run('IZJAVA O AKADEMSKOJ CESTITOSTI', small) },
      { index: 4, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });
    const selected = result.candidates.filter((c) => c.selectedByDefault).sort((a, b) => a.paragraphIndex - b.paragraphIndex);
    const levels = selected.map((c) => c.proposedLevel);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
    }
  });
});

/**
 * ZAPIS LITERATURE NIJE NASLOV.
 *
 * `REF_SECTION` hvata samo NASLOV popisa ("Literatura"), ne i pojedine zapise. Zapis pocinje
 * brojem kao poglavlje ("8. ..."), a granica duljine je 180 znakova, pa je vecina zapisa prolazila
 * kao kandidat, i to predodabran. Izmjereno na stvarnom radu (`local-37-zavrsni`): popravak je
 * jednom zapisu literature upisao `Heading1`, cime bi zapis usao u sadrzaj i u hijerarhiju naslova.
 */
describe('detectHeadingStructure: zapis literature', () => {
  const bib = '8. Lezaic A. Komunikacija u zdravstvenom timu. Sestrinski glasnik. 2019;24(2):142-6.';
  const bib2 = '16. Buono RA, Nygren M, Bianchi-Berthouze N. Touch interaction. Interact Comput. 2020;12(3):55-70.';

  it('numeriran zapis literature nije kandidat za naslov', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run(bib, { bold: true, size: 14 }) },
      { index: 2, ...run(bib2, { bold: true, size: 14 }) },
      { index: 3, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });
    expect(result.candidates.map((c) => c.paragraphIndex)).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: numerirano POGLAVLJE i dalje jest kandidat', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('8. Rasprava o rezultatima istrazivanja', { bold: true, size: 14 }) },
      { index: 2, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });
    expect(result.candidates.map((c) => c.paragraphIndex)).toEqual([1]);
  });

  it('NEGATIVNA KONTROLA: kratak numeriran naslov s velikom kraticom nije zapis literature', () => {
    expect(looksLikeBibliographyEntry('3. Analiza EU.')).toBe(false);
  });

  it('predikat trazi SVE uvjete: numeraciju, duljinu i potpis bibliografije', () => {
    expect(looksLikeBibliographyEntry(bib)).toBe(true);
    // bez numeracije
    expect(looksLikeBibliographyEntry(bib.replace(/^8\.\s/, ''))).toBe(false);
    // bez potpisa bibliografije (nema inicijala ni DOI-ja ni raspona stranica)
    expect(looksLikeBibliographyEntry('8. Ovo je dugacak numeriran naslov poglavlja bez ikakvih inicijala autora')).toBe(false);
  });
});

/**
 * NASLOVNICKA OZNAKA NIJE NASLOV.
 *
 * "ZAVRSNI RAD" je oznaka vrste rada na naslovnici. Detektor ju je prepoznavao kao naslov visoke
 * pouzdanosti (velika slova, veci font, kratka) i predodabirao, pa bi popravak upisao `Heading1`
 * i oznaka bi zavrsila u SADRZAJU. Izmjereno na stvarnom radu (`corpus-0221`).
 */
describe('detectHeadingStructure: naslovnicka oznaka', () => {
  it('oznaka vrste rada nije kandidat', () => {
    for (const label of ['ZAVRŠNI RAD', 'Diplomski rad', 'SEMINARSKI RAD', 'Doktorski rad', 'Student:', 'Mentor:']) {
      expect(looksLikeTitlePageLabel(label), label).toBe(true);
    }
  });

  it('NEGATIVNA KONTROLA: naslov koji tu rijec samo SADRZI ostaje naslov', () => {
    expect(looksLikeTitlePageLabel('Diplomski rad kao zanr akademskog pisanja')).toBe(false);
    expect(looksLikeTitlePageLabel('Uvod')).toBe(false);
    expect(looksLikeTitlePageLabel('Zakljucak')).toBe(false);
  });

  it('oznaka se izbacuje iz kandidata, a pravi naslov ostaje', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('ZAVRŠNI RAD', { bold: true, size: 16 }) },
      { index: 2, ...run('1. Uvod', { bold: true, size: 14 }) },
      { index: 3, ...run('Obican odlomak rada koji nije naslov i dovoljno je dug.', { size: 12 }) },
    ], { maxLevel: 3 });
    expect(result.candidates.map((c) => c.paragraphIndex)).toEqual([2]);
  });
});
