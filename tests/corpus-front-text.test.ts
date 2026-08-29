import { describe, it, expect } from 'vitest';
import { frontText } from '../src/corpus/front-text';

/**
 * Naslovnica se cita da bi se prepoznala ustanova i vrsta rada. Do 2026-08-24 su se runovi spajali
 * RAZMAKOM, pa je Wordovo lomljenje naslovnice na runove pretvaralo "Završni rad" u "Završni  rad"
 * i uzorak vise nije pogadjao. Izmjereno na 246 stvarnih radova: ustanova 107 -> 122, vrsta rada
 * 63 -> 68, oboje (uvjet za profil) 47 -> 52.
 */

const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;

/** Uzorci iz `scripts/corpus-ingest.mts`, da test mjeri ono sto detekcija stvarno trazi. */
const ZAVRSNI = /zavr[šs]ni rad/i;
const FFZG = /Filozofski fakultet/i;

describe('frontText: naslovnica razlomljena na runove', () => {
  it('naslov razlomljen izmedju runova ostaje jedna fraza', () => {
    // Tocan oblik iz korpusa: "Završni" i " rad" su dva runa jer je dio drukcije oblikovan.
    const xml = para(run('Završni'), run(' rad'));
    expect(frontText(xml)).toBe('Završni rad');
    expect(ZAVRSNI.test(frontText(xml))).toBe(true);
  });

  it('NEGATIVNA KONTROLA: spajanje razmakom bi tu istu frazu razbilo', () => {
    // Dokaz da test mjeri STVARAN kvar, a ne sam sebe: stara izvedba, isti ulaz.
    const xml = para(run('Završni'), run(' rad'));
    const legacy = [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
    expect(legacy).toBe('Završni  rad');
    expect(ZAVRSNI.test(legacy)).toBe(false);
  });

  it('rijec razlomljena USRED sebe se sastavlja', () => {
    const xml = para(run('Filozofski fakul'), run('tet'));
    expect(FFZG.test(frontText(xml))).toBe(true);
  });

  it('granica ODLOMKA i dalje razdvaja rijeci', () => {
    // Bez razmaka na granici odlomka slijepilo bi se "Zagreb" i "Završni".
    const xml = para(run('Zagreb')) + para(run('Završni rad'));
    expect(frontText(xml)).toBe('Zagreb Završni rad');
  });

  it('visestruki razmaci iz izvora se sazimaju', () => {
    expect(frontText(para(run('Sveučilište   u    Zagrebu')))).toBe('Sveučilište u Zagrebu');
  });

  it('prazan ili bestekstualni XML daje prazan niz', () => {
    expect(frontText('')).toBe('');
    expect(frontText('<w:p><w:r/></w:p>')).toBe('');
  });

  it('vraca najvise 3000 znakova', () => {
    const xml = para(run('a'.repeat(5000)));
    expect(frontText(xml)).toHaveLength(3000);
  });
});
