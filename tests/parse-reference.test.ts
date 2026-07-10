import { describe, it, expect } from 'vitest';

import { parseReference, splitReferences } from '../src/citations/parse-reference';

describe('splitReferences', () => {
  it('dijeli po praznom retku kad postoji', () => {
    const out = splitReferences('Prva referenca.\n\nDruga\nreferenca u dva retka.');
    expect(out).toEqual(['Prva referenca.', 'Druga referenca u dva retka.']);
  });

  it('dijeli po retku kad nema praznih redaka', () => {
    expect(splitReferences('Prva\nDruga\nTreca')).toEqual(['Prva', 'Druga', 'Treca']);
  });

  it('skida redne oznake i prazne unose', () => {
    expect(splitReferences('1. Prva\n2) Druga\n[3] Treca\n   ')).toEqual(['1. Prva', '2) Druga', '[3] Treca']);
    // stripMarker se primjenjuje u parseReference, ne u splitu; split zadrzava sirovi redak
  });
});

describe('parseReference', () => {
  it('APA knjiga: autor, godina, naslov, mjesto, izdavac', () => {
    const r = parseReference('Kovačić, I. (2020). Politički sustavi. Zagreb: Fakultet političkih znanosti.');
    expect(r.type).toBe('knjiga');
    expect(r.fields.year).toBe('2020');
    expect(r.fields.title).toBe('Politički sustavi');
    expect(r.fields.place).toBe('Zagreb');
    expect(r.fields.publisher).toBe('Fakultet političkih znanosti');
    expect(r.fields.authors).toContain('Kovačić');
  });

  it('APA clanak: casopis, volumen, broj, stranice', () => {
    const r = parseReference('Horvat, A., & Marić, P. (2019). Analiza podataka. Društvena istraživanja, 28(3), 45-67.');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.title).toBe('Analiza podataka');
    expect(r.fields.container).toBe('Društvena istraživanja');
    expect(r.fields.volume).toBe('28');
    expect(r.fields.issue).toBe('3');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.authors).toContain('Horvat');
    expect(r.fields.authors).toContain('Marić');
  });

  it('clanak s DOI-jem: izvlaci DOI, ne tretira URL kao mjesto', () => {
    const r = parseReference('Kovač, M. (2021). Naslov rada. Časopis, 5, 1-10. https://doi.org/10.1234/abcd');
    expect(r.fields.doi).toBe('10.1234/abcd');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Naslov rada');
    expect(r.fields.pages).toBe('1-10');
    expect(r.fields.place).toBeUndefined();
    expect(r.fields.publisher).toBeUndefined();
  });

  it('mrezni izvor: institucija kao autor + URL', () => {
    const r = parseReference('Državni zavod za statistiku (2021). Popis stanovništva. https://dzs.hr/popis');
    expect(r.type).toBe('mrezni');
    expect(r.fields.url).toBe('https://dzs.hr/popis');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Popis stanovništva');
    expect(r.fields.authors).toContain('Državni zavod');
  });

  it('prvi autor (za sortiranje) je prezime prije prvog zareza', () => {
    const r = parseReference('Šimić, T. (2018). Naslov. Split: Redak.');
    // sort kljuc se u UI-u racuna preko parseAuthors; ovdje samo potvrda da autor pocinje prezimenom
    expect(r.fields.authors.startsWith('Šimić')).toBe(true);
  });

  it('nepotpun/messy unos ne puca i oznacava nisku pouzdanost', () => {
    const r = parseReference('nekakav nepotpun tekst bez ičega');
    expect(r.type).toBe('knjiga');
    expect(r.lowConfidence).toBe(true);
    expect(() => parseReference('')).not.toThrow();
  });

  it('propis: prepoznaje Narodne novine', () => {
    const r = parseReference('Zakon o radu. Narodne novine, 93/14.');
    expect(r.type).toBe('propis');
  });
});

// Golden korpus: realan zalijepljen popis literature (APA hr/en mix). Pinovi pokrivaju svaku
// klasu popravka bulk parsera; regresija ako se parser pokvari. Ne mijenjati bez razloga.
describe('parseReference: korpus (regresija bulk)', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string> }> = [
    {
      name: 'hrv veznik "i": zadrzava SVA tri autora',
      raw: 'Petz, B., Kolesarić, V. i Ivanec, D. (2012). Petzova statistika. Jastrebarsko: Naklada Slap.',
      type: 'knjiga',
      expect: { authors: 'Petz, B.; Kolesarić, V.; Ivanec, D.', place: 'Jastrebarsko', publisher: 'Naklada Slap' },
    },
    {
      name: 'zadnji inicijal se NE gubi (Deci, E. L.)',
      raw: 'Deci, E. L., & Ryan, R. M. (1985). Intrinsic motivation and self-determination in human behavior. New York: Plenum.',
      type: 'knjiga',
      expect: { authors: 'Deci, E. L.; Ryan, R. M.', place: 'New York', publisher: 'Plenum' },
    },
    {
      name: 'mjesto sa zarezom (Cambridge, MA)',
      raw: 'Vygotsky, L. S. (1978). Mind in society. Cambridge, MA: Harvard University Press.',
      type: 'knjiga',
      expect: { place: 'Cambridge, MA', publisher: 'Harvard University Press' },
    },
    {
      name: 'izdavac s tockama (W. H. Freeman)',
      raw: 'Bandura, A. (1997). Self-efficacy: The exercise of control. New York: W. H. Freeman.',
      type: 'knjiga',
      expect: { title: 'Self-efficacy: The exercise of control', publisher: 'W. H. Freeman' },
    },
    {
      name: 'izdavac sa zarezom (Farrar, Straus and Giroux)',
      raw: 'Kahneman, D. (2011). Thinking, fast and slow. New York: Farrar, Straus and Giroux.',
      type: 'knjiga',
      expect: { publisher: 'Farrar, Straus and Giroux' },
    },
    {
      name: 'clanak: casopis, volumen(broj), stranice',
      raw: 'Kardum, I., & Hudek-Knežević, J. (2012). Osobine ličnosti i zdravlje. Psihologijske teme, 21(2), 235-256.',
      type: 'clanak',
      expect: { authors: 'Kardum, I.; Hudek-Knežević, J.', container: 'Psihologijske teme', volume: '21', issue: '2', pages: '235-256' },
    },
    {
      name: 'poglavlje u zborniku "U: ... (ur.), Knjiga (str. X-Y). Mjesto: Izdavac"',
      raw: 'Šverko, B. (2004). Ljudske vrednote. U: J. Obradović i M. Čudina-Obradović (ur.), Psihologija (str. 45-78). Zagreb: Golden marketing.',
      type: 'poglavlje',
      expect: { title: 'Ljudske vrednote', editor: 'J. Obradović, M. Čudina-Obradović', container: 'Psihologija', pages: '45-78', place: 'Zagreb', publisher: 'Golden marketing' },
    },
    {
      name: 'propis: naziv + Narodne novine + broj',
      raw: 'Zakon o zaštiti osobnih podataka. (2018). Narodne novine, 42/18.',
      type: 'propis',
      expect: { title: 'Zakon o zaštiti osobnih podataka', container: 'Narodne novine', issue: '42/18' },
    },
    {
      name: 'zavrsni/doktorski: ustanova u institution, ne izdavac',
      raw: 'Marušić, I. (2019). Motivacija za učenje (Doktorska disertacija). Filozofski fakultet, Sveučilište u Zagrebu.',
      type: 'zavrsni',
      expect: { institution: 'Filozofski fakultet, Sveučilište u Zagrebu' },
    },
    {
      name: 'APA7 bez mjesta: goli izdavac',
      raw: 'Fulgosi, A. (1997). Faktorska analiza. Školska knjiga.',
      type: 'knjiga',
      expect: { publisher: 'Školska knjiga' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = parseReference(c.raw);
      expect(r.type).toBe(c.type);
      for (const [k, v] of Object.entries(c.expect)) {
        expect(`${k}=${(r.fields as any)[k] ?? ''}`).toBe(`${k}=${v}`);
      }
    });
  }
});

type SourceTypeLike = 'knjiga' | 'poglavlje' | 'clanak' | 'mrezni' | 'zavrsni' | 'propis';
