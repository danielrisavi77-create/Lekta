/**
 * GARD NAD SHEMOM PROZE (`src/corpus/prose-schema.ts`).
 *
 * Validator koji nikad ne prijavi nalaz jednak je validatoru kojeg nema, pa svaki uvjet ima PAR:
 * tijelo koje ga krsi (nalaz) i tijelo koje ga ispunjava (tisina). Bez druge polovice bi "prolazio"
 * i validator koji vristi na sve.
 */
import { describe, expect, it } from 'vitest';
import { validateProseBody, bodyParagraphs, wordCount, type ProseBody } from '../src/corpus/prose-schema';

/** Ispravno tijelo; svaki test mu kvari TOCNO jednu stvar. */
function validBody(): ProseBody {
  const odlomci = Array.from(
    { length: 8 },
    (_, i) => `Odlomak broj ${i + 1} razmatra jedan aspekt teme i ne ponavlja nijedan drugi odlomak.`,
  );
  odlomci[2] = 'Raspodjela je prikazana u Tablici 1, dok su odstupanja vidljiva na Slici 2.';
  odlomci[5] = 'Usporedba je sazeta u Tablici 2 i potkrijepljena podacima iz prethodnog odjeljka.';
  return {
    id: 'fpzg--final--prijediplomski',
    unitId: 'fpzg',
    workType: 'final',
    level: 'prijediplomski',
    program: 'Politologija',
    family: 'social',
    topic: 'Formalni kriteriji oblikovanja akademskih radova',
    authoring: { method: 'llm-assisted, owner-reviewed', tool: 'skill za pisanje radova', date: '2026-09-06' },
    titlePage: {
      author: 'Ana Anic',
      mentor: 'doc. dr. sc. Ivan Ivic',
      title: 'Formalni kriteriji oblikovanja akademskih radova',
      label: 'ZAVRSNI RAD',
    },
    abstract: { hr: 'Sazetak na hrvatskom jeziku.', en: 'Abstract in English.' },
    keywords: { hr: ['oblikovanje', 'norme', 'akademski rad'], en: ['formatting', 'norms', 'thesis'] },
    chapters: [{ level: 1, title: '1. Uvod', paragraphs: odlomci }],
    tables: [
      { n: 1, caption: 'Tablica 1. Raspodjela po godinama', rows: [['Godina', 'Broj'], ['2024', '12']] },
      { n: 2, caption: 'Tablica 2. Usporedba kriterija', rows: [['Kriterij', 'Vrijednost'], ['Prored', '1,5']] },
    ],
    figures: [
      { n: 1, caption: 'Slika 1. Shema postupka' },
      { n: 2, caption: 'Slika 2. Odstupanja po jedinicama' },
    ],
    footnotes: [],
    bibliography: Array.from({ length: 16 }, (_, i) => ({
      text: `Prezime${i + 1}, A. (20${10 + i}). Naslov djela broj ${i + 1}. Zagreb: Naklada.`,
      doi: i === 0 ? '10.1234/stvarni.2019.001' : i === 1 ? '10.9999/izmisljeni.2026.999' : undefined,
      doiKind: i === 0 ? 'real' : i === 1 ? 'fake' : 'none',
    })),
  };
}

describe('shema proze: ispravno tijelo prolazi', () => {
  it('ispravno tijelo nema nijedan nalaz (baseline)', () => {
    expect(validateProseBody(validBody())).toEqual([]);
  });

  it('pomocne mjere rade nad tijelom, ne nad naslovima', () => {
    const body = validBody();
    expect(bodyParagraphs(body)).toHaveLength(8);
    expect(wordCount(body)).toBeGreaterThan(50);
  });
});

describe('shema proze: svaki uvjet stvarno grize', () => {
  it('natpis naslovnice koji ne odgovara vrsti rada je nalaz', () => {
    const body = validBody();
    body.titlePage.label = 'DIPLOMSKI RAD';
    expect(validateProseBody(body).join(' ')).toMatch(/natpis naslovnice/);
  });

  it('ponovljen odlomak je nalaz, jer sidra traze jedinstvene odlomke', () => {
    const body = validBody();
    body.chapters[0].paragraphs[1] = body.chapters[0].paragraphs[0];
    expect(validateProseBody(body).join(' ')).toMatch(/ponovljen/);
  });

  it('premalo kosih unakrsnih uputa je nalaz', () => {
    const body = validBody();
    body.chapters[0].paragraphs[2] = 'Raspodjela je prikazana u prethodnom odjeljku.';
    body.chapters[0].paragraphs[5] = 'Usporedba je sazeta u prethodnom odjeljku.';
    expect(validateProseBody(body).join(' ')).toMatch(/kosih unakrsnih uputa/);
  });

  it('literatura bez ijednog stvarnog DOI-ja je nalaz', () => {
    const body = validBody();
    body.bibliography[0] = { text: body.bibliography[0].text, doiKind: 'none' };
    expect(validateProseBody(body).join(' ')).toMatch(/nijedan DOI nije `real`/);
  });

  it('literatura bez ijednog izmisljenog DOI-ja je nalaz', () => {
    const body = validBody();
    body.bibliography[1] = { text: body.bibliography[1].text, doiKind: 'none' };
    expect(validateProseBody(body).join(' ')).toMatch(/nijedan DOI nije `fake`/);
  });

  it('premalo stavki literature je nalaz', () => {
    const body = validBody();
    body.bibliography = body.bibliography.slice(0, 5);
    expect(validateProseBody(body).join(' ')).toMatch(/literatura ima 5 stavki/);
  });

  it('pravna obitelj bez fusnota je nalaz, druge obitelji nisu', () => {
    const pravna = validBody();
    pravna.family = 'legal';
    expect(validateProseBody(pravna).join(' ')).toMatch(/pravna obitelj bez barem tri fusnote/);
    const drustvena = validBody();
    expect(validateProseBody(drustvena)).toEqual([]);
  });

  it('osobni podaci u tekstu su nalaz (OIB, e-posta, URL u tijelu)', () => {
    const oib = validBody();
    oib.chapters[0].paragraphs[0] = 'Ispitanik nosi oznaku 12345678901 u evidenciji.';
    expect(validateProseBody(oib).join(' ')).toMatch(/moguc OIB/);

    const mail = validBody();
    mail.chapters[0].paragraphs[0] = 'Upit je poslan na ana.anic@primjer.hr tijekom postupka.';
    expect(validateProseBody(mail).join(' ')).toMatch(/adresu e-poste/);

    const url = validBody();
    url.chapters[0].paragraphs[0] = 'Podaci su preuzeti s https://primjer.hr/stranica tijekom postupka.';
    expect(validateProseBody(url).join(' ')).toMatch(/URL/);
  });

  it('natpis tablice bez "Tablica N" je nalaz', () => {
    const body = validBody();
    body.tables[0].caption = 'Raspodjela po godinama';
    expect(validateProseBody(body).join(' ')).toMatch(/natpis tablice/);
  });

  it('nepotpun authoring blok je nalaz: podrijetlo se ne pretpostavlja', () => {
    const body = validBody();
    body.authoring = { method: '', tool: '', date: '' };
    expect(validateProseBody(body).join(' ')).toMatch(/authoring/);
  });
});
