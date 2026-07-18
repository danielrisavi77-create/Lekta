import { describe, it, expect } from 'vitest';

import { buildFacultyOptions, formatForFaculty } from '../src/citations/faculty-styles';
import type { CitationInput } from '../src/tools/citation';

// Test radi kroz Vite pipeline (vitest) pa import.meta.glob verified specova stvarno ucita.
describe('faculty-styles (izbornik fakulteta u citat.html)', () => {
  const opts = buildFacultyOptions();

  it('gradi fakultete iz verified specova, grupirane po sveucilistu i imenovane', () => {
    expect(opts.length).toBeGreaterThanOrEqual(55);
    // svaki fakultet ima bar jedan stil
    expect(opts.every((o) => o.styles.length >= 1)).toBe(true);
    // grupiranje po sveucilistu daje vise grupa
    expect(new Set(opts.map((o) => o.instName)).size).toBeGreaterThan(10);
    // multi-stil fakultet postoji (npr. ffzg/unin/unizd)
    expect(opts.some((o) => o.styles.length > 1)).toBe(true);
    // abecedno po imenu
    const names = opts.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'hr')));
  });

  it('fetpu (stvarna fakultetska jedinica) dobije svoje ime, ne ime cijele institucije', () => {
    // unipu-*.json specovi su ranije nosili facultyId "unipu" (ID CIJELE institucije Sveuciliste
    // Jurja Dobrile u Puli, koja ima vise jedinica: fetpu, foozpu...) umjesto stvarne sastavnice
    // "fetpu"; metaFor() je tiho fallbackao na ime institucije, pa je izbornik nudio "Sveuciliste
    // Jurja Dobrile u Puli" kao da student moze citirati "s cijele institucije". Ispravljeno u
    // data/tools/citation-specs/verified/unipu-harvard.json i unipu-chicago-notes.json.
    const fetpu = opts.find((o) => o.id === 'fetpu');
    expect(fetpu).toBeTruthy();
    expect(fetpu!.name).toMatch(/ekonomije i turizma/i);
    expect(opts.find((o) => o.id === 'unipu')).toBeUndefined();
  });

  it('ustanova-razina facultyId za STVARNO jedno-jedinicnu instituciju i dalje dobije ime ustanove preko metaFor fallbacka (unin)', () => {
    const unin = opts.find((o) => o.id === 'unin');
    expect(unin).toBeTruthy();
    expect(unin!.name).toMatch(/Sjever/);
  });

  it('custom-spec -> vjeran render preko formatFromSpec (efos)', () => {
    const efos = opts.find((o) => o.id === 'efos');
    expect(efos).toBeTruthy();
    const inp: CitationInput = {
      type: 'knjiga', authors: 'Milas, G.', title: 'Istraživačke metode u psihologiji',
      year: '2009', place: 'Zagreb', publisher: 'Naklada Slap',
    };
    const r = formatForFaculty(efos!.styles[0], inp);
    expect(r.citation).toContain('Milas, G. (2009)');
    expect(r.citation).toContain('Naklada Slap');
  });

  it('style-pin -> obiteljski motor (nije prazno, spec bez predlozaka)', () => {
    const pin = opts.flatMap((o) => o.styles).find((s) => s.pin);
    if (!pin) return; // ako trenutni podaci nemaju pin, preskoci
    const inp: CitationInput = { type: 'knjiga', authors: 'Ivić, Ivan', title: 'Test', year: '2020', publisher: 'X' };
    const r = formatForFaculty(pin, inp);
    expect(r.citation).toBeTruthy();
  });
});
