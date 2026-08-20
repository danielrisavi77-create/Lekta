/**
 * Invarijanta bodova: bodovana provjera koja je izgubila bodove NE SMIJE javiti 'pass'.
 *
 * Do 2026-08-20 su `Sadrzaj dokumenta` i `Brojevi stranica` slale doslovno
 * `profile.requireToc?'pass':'pass'`, pa je nedostajuci sadrzaj davao 0/5 bodova I `error` nalaz
 * uz status `pass`. Kvar je bio vidljiv u commitanom golden baselineu (17 blokova), ne samo u
 * teoriji. Ovaj test cuva drugu bravu (normalizaciju u makeCheck); prva brava je ispravan
 * ternar na pozivnom mjestu (tests/docx-status-truth.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { makeCheck, unmeasurableCheck, categoryTotals, UNMEASURABLE } from '../src/scoring/checks.ts';

describe('makeCheck: invarijanta bodova', () => {
  it('bodovana provjera bez ijednog boda ne moze ostati pass', () => {
    const c = makeCheck('structure', 'Sadržaj dokumenta', 'pass', 0, 5, 'Sadržaj nije pronađen');
    expect(c.status).toBe('fail');
    expect(c.earned).toBe(0);
    expect(c.max).toBe(5);
  });

  it('bodovana provjera s djelomicnim bodovima pada u warn, ne u fail', () => {
    const c = makeCheck('formatting', 'Margine dokumenta', 'pass', 4.5, 6, 'Dio sekcija odstupa');
    expect(c.status).toBe('warn');
    expect(c.earned).toBe(4.5);
  });

  it('puni bodovi i dalje prolaze netaknuti', () => {
    const c = makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, 'Times New Roman');
    expect(c.status).toBe('pass');
  });

  it('warn i fail se ne prepisuju', () => {
    expect(makeCheck('formatting', 'Prored osnovnog teksta', 'warn', 1, 6, 'x').status).toBe('warn');
    expect(makeCheck('formatting', 'Prored osnovnog teksta', 'fail', 0, 6, 'x').status).toBe('fail');
  });

  it('informativna provjera (max 0) ostaje informational, ne fail', () => {
    const c = makeCheck('structure', 'Shema numeriranja stranica', 'pass', 0, 0, 'Nema izvora');
    expect(c.status).toBe('informational');
    expect(c.scored).toBe(false);
  });
});

describe('unmeasurableCheck: nemjerljivo nije ni prolaz ni pad', () => {
  it('ne ulazi u ocjenu i nosi vlastiti status', () => {
    const c = unmeasurableCheck('formatting', 'Prored osnovnog teksta', 'Word nije zapisao prored.');
    expect(c.status).toBe(UNMEASURABLE);
    expect(c.status).toBe('unmeasurable');
    expect(c.scored).toBe(false);
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
  });

  it('detail nosi prefiks koji korisniku kaze da mjerenje nije uspjelo', () => {
    const c = unmeasurableCheck('formatting', 'Margine dokumenta', 'Nijedna sekcija nema zapisane margine.');
    expect(c.detail).toBe('Nije moguće utvrditi: Nijedna sekcija nema zapisane margine.');
    expect(c.detail).not.toContain('Informativno');
  });

  it('zadrzava stabilan identitet provjere', () => {
    expect(unmeasurableCheck('formatting', 'Dominantni font', 'x').id).toBe('format.font.dominant');
  });

  it('nestaje iz nazivnika umjesto da glumi prolaz s punim bodovima', () => {
    const scored = makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, 'ok');
    const unmeasured = unmeasurableCheck('formatting', 'Prored osnovnog teksta', 'nema podatka');
    const totals = categoryTotals([scored, unmeasured]);
    expect(totals.formatting).toEqual({ earned: 8, max: 8 });
  });

  it('makeCheck s UNMEASURABLE prisilno nulira bodove koje bi pozivatelj poslao', () => {
    const c = makeCheck('formatting', 'Dominantni font', UNMEASURABLE, 8, 8, 'nema podatka');
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
    expect(c.scored).toBe(false);
  });
});
