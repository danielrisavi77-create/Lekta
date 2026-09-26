import { describe, it, expect } from 'vitest';
import { sampleSummary } from '../src/ui/profile-card';

/**
 * `sampleSummary` je izdvojen iz `app.ts` u `src/ui/profile-card.ts` (2026-09-26, ratchet u
 * `tests/ui-module-budget.test.ts`) bez promjene ponasanja. Ekvivalencija sa starom funkcijom iz
 * `app.ts` provjerena je jednokratno nad 4098 ulaza (svih 6 polja iz {izostavljeno, 0, 1, 3} te
 * `undefined` i `{}`): 0 razlika, 405 razlicitih izlaza. Ovdje ostaju karakterizacijske tvrdnje
 * koje drze taj ugovor, ukljucujuci obje grane koje nisu trivijalne (zadani tekst i potiskivanje
 * punih tekstualnih audita kad postoje PDF auditi).
 */
describe('sampleSummary: opis terenskog uzorka profila', () => {
  it('bez uzorka vraca zadani tekst', () => {
    expect(sampleSummary()).toBe('bez terenskog uzorka');
    expect(sampleSummary({})).toBe('bez terenskog uzorka');
    expect(sampleSummary({ docxAudits: 0, publicPdfAudits: 0 })).toBe('bez terenskog uzorka');
  });

  it('spaja dijelove zadanim redom s " + "', () => {
    expect(sampleSummary({
      metadataSpotChecks: 4,
      docxAudits: 2,
      publicTextSnippetAudits: 5,
      syntheticDocxAudits: 12,
    })).toBe('2 stvarnih DOCX + 12 sintetičkih DOCX testova + 5 javna tekstualna isječka + 4 metapodatkovnih provjera');
  });

  it('puni tekstualni auditi se prikazuju samo kad nema PDF audita', () => {
    expect(sampleSummary({ fullTextAudits: 7 })).toBe('7 punih tekstualnih audita');
    expect(sampleSummary({ fullTextAudits: 7, publicPdfAudits: 3 })).toBe('3 javnih PDF audita');
  });
});
