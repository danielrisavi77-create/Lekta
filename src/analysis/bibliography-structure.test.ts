import { describe, expect, it } from 'vitest';
import { analyzeBibliographyStructure, bibliographyAnchorFingerprint } from './bibliography-structure';

describe('bibliography structure', () => {
  it('strukturira zapise, pronalazi duplikate i citatnice bez teksta dokumenta', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Uvod', headingLevel: 1 },
      { index: 2, text: 'U radu se navodi (Horvat, 2020).' },
      { index: 3, text: 'Literatura', headingLevel: 1 },
      { index: 4, text: 'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.' },
      { index: 5, text: 'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.' },
    ]);

    expect(result.entries).toHaveLength(2);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.entries[0].cited).toBe(true);
    expect(result.summary.highConfidence).toBe(2);
    expect(result.entries[0].anchorFingerprint).toBe(
      bibliographyAnchorFingerprint([4], result.entries[0].rawText),
    );
  });

  /**
   * SIDRO MORA BITI DOSLJEDNO SAMO PO SEBI: hash(paragraphIndices, rawText) mora pokrivati tocno one
   * odlomke ciji je tekst u rawText. Do 2026-09-05 nije: `extractReferences` je SVAKI odlomak koji nije
   * izgledao kao nov zapis lijepio na prethodni (podnaslove popisa, cijele sekcije iza literature), a
   * indeks je ostajao samo prvi. Fixer, koji cita jedan odlomak, sidro nad NETAKNUTIM dokumentom nije
   * mogao potvrditi i odbijao je popravak CIJELE literature uz `stale-anchor`.
   *
   * IZMJERENO 2026-09-05 na 8 od 38 stvarnih radova: 17 spojenih zapisa, nula na commitanim fixturama.
   * Nakon popravka: 0 od 397 zapisa se razilazi, stale-anchor na literaturi 8 -> 0 radova.
   */
  it('rucno oblikovan podnaslov popisa i IEEE "[n]" zapis nisu nastavak prethodnog zapisa', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Literatura', headingLevel: 1 },
      { index: 2, text: 'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.' },
      { index: 3, text: 'Propisi i norme' }, // rucno oblikovan podnaslov, bez Heading stila
      { index: 4, text: 'Zakon o zaštiti podataka, NN 42/2018.' },
      { index: 5, text: '[3] Steel Alliance. Steel Buildings in Europe. Brussels, 2006.' },
      { index: 6, text: 'Popis tablica' }, // zavrsni dio: ovdje literatura prestaje
      { index: 7, text: 'Tablica 1. Deskriptivna statistika uzorka po godinama 2019. i 2020.' },
    ]);
    const tekstovi = result.entries.map((entry) => entry.rawText);
    expect(tekstovi, 'podnaslov i tablice ne smiju uci u zapise').toEqual([
      'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.',
      'Zakon o zaštiti podataka, NN 42/2018.',
      '[3] Steel Alliance. Steel Buildings in Europe. Brussels, 2006.',
    ]);
    for (const entry of result.entries) {
      expect(entry.paragraphIndices, entry.rawText).toHaveLength(1);
      expect(entry.anchorFingerprint).toBe(bibliographyAnchorFingerprint(entry.paragraphIndices, entry.rawText));
    }
  });

  it('stvarno prelomljen zapis se i dalje spaja, ali nosi SVE svoje odlomke', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Literatura', headingLevel: 1 },
      { index: 2, text: 'Atkinson, A. i Messy, F. (2012). Measuring Financial Literacy:' }, // nije zavrsen
      { index: 3, text: 'Results of the OECD Pilot Study. Paris: OECD Publishing.' },
      { index: 4, text: 'Barić, B. (2020). Metodologija. Split: Naklada.' },
      { index: 5, text: 'Dostupno na: https://example.test/rad' }, // URL nastavak iza zavrsenog zapisa
    ]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].paragraphIndices).toEqual([2, 3]);
    expect(result.entries[0].rawText).toContain('Paris: OECD Publishing.');
    expect(result.entries[1].paragraphIndices).toEqual([4, 5]);
    for (const entry of result.entries) {
      expect(entry.anchorFingerprint).toBe(bibliographyAnchorFingerprint(entry.paragraphIndices, entry.rawText));
    }
  });

  /**
   * KLJUC SORTIRANJA JE KLJUC BODOVANE PROVJERE. "Abecedni poredak literature" (analyze-docx) sudi po
   * prvom autoru iz `extractReferences`, malim slovima, `hr` kolacija. Popravak i ova analiza moraju
   * sortirati po ISTOM kljucu, inace fixer upise redoslijed koji provjera odmah obara.
   *
   * Izmjereno 2026-09-05 na `local-36-diplomski`: fixer je sortirao po cijelom nizu, gdje `hr`
   * kolacija zanemaruje zarez, pa je "United Nations General Assembly, ..." otisao ISPRED
   * "United Nations, ..."; provjera gleda samo "united nations" < "united nations general assembly"
   * i pala je iz pass u warn. Bio je to jedini pad na 45 radova nakon sto je literatura opet radila.
   */
  it('sortKey je prvi autor kako ga vidi provjera, i poredak se sudi po njemu', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Literatura', headingLevel: 1 },
      { index: 2, text: 'United Nations General Assembly, United Nations Rules for the Protection of Juveniles (1990). New York: UN.' },
      { index: 3, text: 'United Nations, United Nations Guidelines for the Prevention of Juvenile Delinquency (1990). New York: UN.' },
    ]);
    expect(result.entries.map((entry) => entry.sortKey)).toEqual(['united nations general assembly', 'united nations']);
    // Po cijelom nizu ovaj je redoslijed "abecedan" (zarez se u kolaciji zanemaruje); po prvom autoru NIJE.
    expect(result.alphabetical.order).toEqual(['united nations general assembly', 'united nations']);
    expect(result.alphabetical.expected).toBe(false);
  });

  it('označava nepotpun zapis i ne izmišlja nedostajuća polja', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Bibliografija', headingLevel: 1 },
      { index: 2, text: 'Nepotpun zapis bez godine' },
    ]);
    expect(result.entries[0].confidence).not.toBe('high');
    expect(result.entries[0].fields.year).toBeUndefined();
    expect(result.confirmationActions).toContain('enrich-metadata');
  });
});
