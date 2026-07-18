import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildFacultyOptions, formatForFaculty, ensureFacultySpecsLoaded } from '../src/citations/faculty-styles';
import committedIndex from '../data/tools/citation-specs/verified-index.json';
import type { CitationInput } from '../src/tools/citation';

const VERIFIED_DIR = join(__dirname, '..', 'data', 'tools', 'citation-specs', 'verified');

// Test radi kroz Vite pipeline (vitest) pa import.meta.glob verified specova stvarno ucita.
// .spec je LIJENO ucitan (perf split); ensureFacultySpecsLoaded() ovdje eksplicitno pricekan
// (umjesto oslanjanja na to da ce dovoljno mikrotaskova proci izmedju testova) tako da testovi
// niz custom-spec formata ne ovise o implicitnom vremenu ucitavanja lijenog chunka.
describe('faculty-styles (izbornik fakulteta u citat.html)', () => {
  const opts = buildFacultyOptions();
  beforeAll(async () => { await ensureFacultySpecsLoaded(); });

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

// Drift + korektnost splita (perf: lijeni citation-specs chunk, isti obrazac kao
// tests/verified-split.test.ts). Ako padne: node scripts/gen-citation-specs-index.mjs pa commit.
describe('citation-specs verified-index.json: drift + korektnost splita', () => {
  const files = readdirSync(VERIFIED_DIR).filter((f) => f.endsWith('.json')).sort();

  function lightEntry(file: string) {
    const spec = JSON.parse(readFileSync(join(VERIFIED_DIR, file), 'utf8'));
    return {
      file,
      facultyId: spec.facultyId,
      styleToken: spec.styleToken,
      outcome: spec.outcome,
      label: spec.label,
      sourceLabel: spec.sourceLabel,
      verifiedAt: spec.verifiedAt ?? null,
    };
  }

  it('commitani verified-index.json === regenerirana light projekcija svih verified/*.json', () => {
    expect(committedIndex).toEqual(files.map(lightEntry));
  });

  it('ensureFacultySpecsLoaded spoji pun spec u svaki FacultyStyle (spec !== null nakon ucitavanja)', async () => {
    await ensureFacultySpecsLoaded();
    const allOpts = buildFacultyOptions();
    for (const opt of allOpts) {
      for (const style of opt.styles) {
        expect(style.spec, `${opt.id}: spec nije ucitan nakon ensureFacultySpecsLoaded`).not.toBeNull();
      }
    }
  });
});
