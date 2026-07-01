import { describe, it, expect } from 'vitest';

import {
  computeFingerprint,
  fingerprintMatch,
  sequenceSimilarity,
  type FingerprintInput,
} from '../src/fingerprint/fingerprint';

/** Realisticna teza: naslov, autor, sekvenca naslova. */
function workX(over: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    title: 'Ucinak digitalizacije na javnu upravu',
    author: 'Ana Anic',
    headings: [
      { level: 1, text: '1. Uvod' },
      { level: 1, text: '2. Teorijski okvir' },
      { level: 2, text: '2.1. Pojmovi' },
      { level: 1, text: '3. Metodologija' },
      { level: 1, text: '4. Rezultati' },
      { level: 1, text: '5. Zakljucak' },
      { level: 1, text: 'Popis literature' },
    ],
    ...over,
  };
}

describe('computeFingerprint', () => {
  it('gradi otisak iz strukture, ne iz bajtova', () => {
    const fp = computeFingerprint(workX());
    expect(fp.titleNorm).toBe('ucinakdigitalizacijenajavnuupravu');
    expect(fp.authorNorm).toBe('anaanic');
    expect(fp.sectionCount).toBe(6); // sest H1 (ukljucujuci popis literature)
    expect(fp.headings).toContain('uvod'); // vodeci broj sekcije skinut
    expect(fp.headings).toContain('pojmovi'); // H2 ulazi u sekvencu
  });

  it('naslov fallback na prvi Heading 1 kad nema metapodatka', () => {
    const fp = computeFingerprint({ title: '', headings: [{ level: 1, text: 'Moj diplomski rad' }] });
    expect(fp.titleNorm).toBe('mojdiplomskirad');
  });
});

describe('fingerprintMatch: stabilan kroz uredivanja (kriterij 11.2)', () => {
  it('isti naslov uz teske izmjene strukture i dalje matcha (jaki match naslova)', () => {
    const original = computeFingerprint(workX());
    const heavilyEdited = computeFingerprint(
      workX({
        author: 'A. Anic', // promijenjen zapis autora
        headings: [
          { level: 1, text: 'Uvod' },
          { level: 1, text: 'Metodologija' }, // preokrenut redoslijed
          { level: 1, text: 'Teorijski okvir' },
          { level: 1, text: 'Rasprava' }, // dodana sekcija
          { level: 1, text: 'Rezultati' },
          { level: 1, text: 'Zakljucak' },
          { level: 1, text: 'Literatura' }, // preimenovana
        ],
      }),
    );
    expect(fingerprintMatch(original, heavilyEdited)).toBe(true);
  });

  it('promijenjen naslov, ali ista sekvenca i autor i dalje matcha (seq >= prag I autor)', () => {
    const original = computeFingerprint(workX());
    const retitled = computeFingerprint(
      workX({ title: 'Digitalizacija javne uprave, zavrsna verzija' }),
    );
    // naslov se razlikuje pa pada jaki match; spasava ga slicnost sekvence + isti autor
    expect(original.titleNorm).not.toBe(retitled.titleNorm);
    expect(fingerprintMatch(original, retitled)).toBe(true);
  });

  it('reorder sekcija ne kvari match (Jaccard je neosjetljiv na redoslijed)', () => {
    const a = computeFingerprint(workX({ title: 'X' }));
    const reordered = computeFingerprint(
      workX({
        title: 'Y', // razlicit naslov da se oslonimo na sekvencu
        headings: [
          { level: 1, text: 'Zakljucak' },
          { level: 1, text: 'Uvod' },
          { level: 2, text: 'Pojmovi' },
          { level: 1, text: 'Rezultati' },
          { level: 1, text: 'Metodologija' },
          { level: 1, text: 'Teorijski okvir' },
          { level: 1, text: 'Popis literature' },
        ],
      }),
    );
    expect(fingerprintMatch(a, reordered)).toBe(true);
  });
});

describe('fingerprintMatch: razlicit rad ne matcha (kriteriji 11.3 i 11.4)', () => {
  it('ocito drugi rad (drugi naslov, autor i sekvenca) ne matcha', () => {
    const x = computeFingerprint(workX());
    const y = computeFingerprint({
      title: 'Energetska tranzicija i obnovljivi izvori',
      author: 'Marko Maric',
      headings: [
        { level: 1, text: 'Uvod' },
        { level: 1, text: 'Energetski sustav' },
        { level: 1, text: 'Obnovljivi izvori' },
        { level: 1, text: 'Politike' },
        { level: 1, text: 'Zakljucak' },
      ],
    });
    expect(fingerprintMatch(x, y)).toBe(false);
  });

  it('lazirani otisak (samo naslov posudjen, sve ostalo drugacije) ne osvaja preko sekvence', () => {
    const slot = computeFingerprint(workX());
    const spoof = computeFingerprint({
      title: 'posve drugi naslov',
      author: 'Netko Drugi',
      headings: [
        { level: 1, text: 'Alpha' },
        { level: 1, text: 'Beta' },
        { level: 1, text: 'Gamma' },
      ],
    });
    expect(fingerprintMatch(slot, spoof)).toBe(false);
  });
});

describe('sequenceSimilarity', () => {
  it('identicni skupovi daju 1, disjunktni 0', () => {
    expect(sequenceSimilarity(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1);
    expect(sequenceSimilarity(['a', 'b'], ['x', 'y'])).toBe(0);
  });
  it('prazni skupovi daju 0 (ne matchaju trivijalno)', () => {
    expect(sequenceSimilarity([], [])).toBe(0);
  });
  it('djelomicno preklapanje je izmedu 0 i 1', () => {
    const sim = sequenceSimilarity(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'e']);
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });
});
