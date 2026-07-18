/**
 * Predlozak fakulteta u jezgri generatora naslovnice (buildTitlePage(input, template)).
 * Kljucno: grana BEZ predloska mora ostati bajt-identicna staroj (regresijski deep-equal),
 * a s predloskom redoslijed/prisutnost/obveznost/tipografija dolaze iz predloska.
 */
import { describe, it, expect } from 'vitest';
import { buildTitlePage, titlePageText, type TitlePageInput } from '../src/tools/title-page';
import type { TitlePageTemplate } from '../src/title-pages/template-schema';

const INPUT: TitlePageInput = {
  university: 'Sveučilište u Zagrebu',
  faculty: 'Fakultet političkih znanosti',
  study: 'Diplomski studij Politologije',
  author: 'Ana Anić',
  title: 'Uloga civilnog društva',
  subtitle: 'Studija slučaja',
  workType: 'Diplomski rad',
  mentor: 'dr. sc. Ivan Ivić',
  place: 'Zagreb',
  year: '2026',
};

const TEMPLATE: TitlePageTemplate = {
  id: 'fpzg-graduate',
  unitId: 'fpzg',
  level: 'graduate',
  name: 'FPZG diplomski rad',
  provenance: { status: 'official', sourceIds: ['x'] },
  status: 'draft',
  marginsCm: { top: 3, right: 3, bottom: 3, left: 3 },
  defaultFont: 'Times New Roman',
  elements: [
    { role: 'university', required: true, elementProvenance: 'official-rules', group: 0, sizePt: 14, uppercase: true },
    { role: 'faculty', required: true, elementProvenance: 'official-rules', group: 0, sizePt: 14, uppercase: true },
    { role: 'author', required: true, elementProvenance: 'official-rules', group: 1, sizePt: 12 },
    { role: 'title', required: true, elementProvenance: 'official-rules', group: 1, sizePt: 22, bold: true, font: 'Arial' },
    { role: 'worktype', required: true, elementProvenance: 'official-rules', group: 1, sizePt: 12 },
    { role: 'mentor', required: false, elementProvenance: 'thesis-consensus', group: 2, sizePt: 12 },
    { role: 'placeyear', required: true, elementProvenance: 'official-rules', group: 3, sizePt: 12 },
  ],
};

describe('buildTitlePage bez predloska: regresija', () => {
  it('rezultat je identican pozivu s eksplicitnim undefined', () => {
    expect(buildTitlePage(INPUT)).toEqual(buildTitlePage(INPUT, undefined));
  });
  it('linije nemaju style/group i model nema templateId', () => {
    const m = buildTitlePage(INPUT);
    expect(m.templateId).toBeUndefined();
    for (const line of m.lines) {
      expect(line.style).toBeUndefined();
      expect(line.group).toBeUndefined();
    }
  });
});

describe('buildTitlePage s predloskom', () => {
  it('redoslijed i prisutnost prate elemente predloska (study/subtitle izostavljeni)', () => {
    const m = buildTitlePage(INPUT, TEMPLATE);
    expect(m.templateId).toBe('fpzg-graduate');
    expect(m.lines.map((l) => l.role)).toEqual([
      'university', 'faculty', 'author', 'title', 'worktype', 'mentor', 'placeyear',
    ]);
  });

  it('missing racuna po required s hrvatskim oznakama (neobavezno prazno nije missing)', () => {
    const m = buildTitlePage({ ...INPUT, author: '', mentor: '' }, TEMPLATE);
    expect(m.missing).toEqual(['ime i prezime']);
  });

  it('tipografija ide u line.style; font pada na defaultFont predloska', () => {
    const m = buildTitlePage(INPUT, TEMPLATE);
    const title = m.lines.find((l) => l.role === 'title')!;
    expect(title.style).toEqual({ font: 'Arial', sizePt: 22, bold: true });
    const uni = m.lines.find((l) => l.role === 'university')!;
    expect(uni.style).toEqual({ font: 'Times New Roman', sizePt: 14, uppercase: true });
  });

  it('uppercase je prezentacijski: tekst retka NIJE transformiran', () => {
    const m = buildTitlePage(INPUT, TEMPLATE);
    expect(m.lines.find((l) => l.role === 'university')!.text).toBe('Sveučilište u Zagrebu');
  });

  it('fixedText popunjava prazno polje, korisnikov unos ima prednost', () => {
    const withFixed: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'university', required: true, elementProvenance: 'official-rules', group: 0, fixedText: 'SVEUČILIŠTE U ZAGREBU' },
      ],
    };
    expect(buildTitlePage({}, withFixed).lines[0].text).toBe('SVEUČILIŠTE U ZAGREBU');
    expect(buildTitlePage({ university: 'Sveučilište u Splitu' }, withFixed).lines[0].text)
      .toBe('Sveučilište u Splitu');
  });

  it('ponovljena uloga: prvi element korisnikov unos, drugi samo fixedText', () => {
    // Dvojezicni worktype (ZAVRSNI RAD / BACHELOR THESIS): korisnik ima jedno polje pa
    // drugi worktype element prikazuje svoj fixedText, a ne ponovljeni korisnikov unos.
    const bilingual: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'worktype', required: true, elementProvenance: 'official-rules', group: 0, uppercase: true, fixedText: 'ZAVRŠNI RAD' },
        { role: 'worktype', required: false, elementProvenance: 'official-rules', group: 0, uppercase: true, fixedText: 'BACHELOR THESIS' },
      ],
    };
    const m = buildTitlePage({ workType: 'Završni rad' }, bilingual);
    expect(m.lines.map((l) => l.text)).toEqual(['Završni rad', 'BACHELOR THESIS']);
  });

  it('ponovljena uloga bez fixedTexta se preskace (nema duplog retka)', () => {
    const dupStudy: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'study', required: false, elementProvenance: 'official-rules', group: 0 },
        { role: 'study', required: false, elementProvenance: 'official-rules', group: 0 },
      ],
    };
    const m = buildTitlePage({ study: 'Politologija' }, dupStudy);
    expect(m.lines.map((l) => l.text)).toEqual(['Politologija']);
  });

  it('ponovljena uloga: fixedText+label (fkit/efzg/biotech-graduate obrazac) - locked fraza se ne prepisuje, drugi element prima unos', () => {
    // Regresija za bug: prvi element (fiksna institucijska fraza) je prije "locked" gubio
    // fixedText jer je firstOfRole davao prednost korisnikovom unosu; drugi element (stvarni
    // naziv studija, bez fixedTexta) je bio potpuno preskocen (i missing=[] iako obavezan).
    const fixedPlusLabel: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'study', required: true, elementProvenance: 'official-rules', group: 0, fixedText: 'SVEUČILIŠNI PRIJEDIPLOMSKI STUDIJ', locked: true },
        { role: 'study', required: true, elementProvenance: 'official-rules', group: 0, label: 'Naziv studija' },
      ],
    };
    const filled = buildTitlePage({ study: 'Kemijsko inženjerstvo' }, fixedPlusLabel);
    expect(filled.lines.filter((l) => l.role === 'study').map((l) => l.text)).toEqual([
      'SVEUČILIŠNI PRIJEDIPLOMSKI STUDIJ', 'Kemijsko inženjerstvo',
    ]);
    expect(filled.missing).not.toContain('Naziv studija');

    const empty = buildTitlePage({}, fixedPlusLabel);
    expect(empty.lines.filter((l) => l.role === 'study').map((l) => l.text)).toEqual([
      'SVEUČILIŠNI PRIJEDIPLOMSKI STUDIJ',
    ]);
    expect(empty.missing).toContain('Naziv studija');
  });

  it('ponovljena uloga: oba elementa locked (biotech-final obrazac) - korisnikov unos se ignorira, oba retka fiksna', () => {
    const bothLocked: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'study', required: true, elementProvenance: 'official-template', group: 0, fixedText: 'Preddiplomski sveučilišni studij', locked: true },
        { role: 'study', required: true, elementProvenance: 'official-template', group: 0, fixedText: '"Biotehnologija i istraživanje lijekova"', locked: true },
      ],
    };
    // Stray unos u #tp-study (npr. korisnik krivo misli da polje treba ispuniti) se NE smije
    // prelupiti preko fiksne institucijske fraze niti preko fiksnog naziva studija.
    const m = buildTitlePage({ study: 'Nešto sasvim drugo' }, bothLocked);
    expect(m.lines.filter((l) => l.role === 'study').map((l) => l.text)).toEqual([
      'Preddiplomski sveučilišni studij', '"Biotehnologija i istraživanje lijekova"',
    ]);
    expect(m.missing).toHaveLength(0);
  });

  it('ponovljena uloga: dva razlicita obavezna polja bez fixedTexta (fmtu obrazac) - prvo dobiva unos, drugo je posteno missing', () => {
    // Genuinski dva razlicita polja (Naziv studija / Smjer studija) dijele jedno tekstualno
    // polje na formi; ne moze se izmisliti drugi tekst, ali vise ne smije nestati bez upozorenja.
    const twoRequiredLabels: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'study', required: true, elementProvenance: 'official-rules', group: 0, label: 'Naziv studija' },
        { role: 'study', required: true, elementProvenance: 'official-rules', group: 0, label: 'Smjer studija' },
      ],
    };
    const m = buildTitlePage({ study: 'Pomorski menadžment' }, twoRequiredLabels);
    expect(m.lines.filter((l) => l.role === 'study').map((l) => l.text)).toEqual(['Pomorski menadžment']);
    expect(m.missing).toEqual(['Smjer studija']);
  });

  it('ponovljena uloga: opcionalno pa obavezno bez fixedTexta (kbf obrazac) - unos ide na obavezni element, opcionalni ostaje tih', () => {
    const optionalThenRequired: TitlePageTemplate = {
      ...TEMPLATE,
      elements: [
        { role: 'study', required: false, elementProvenance: 'official-template', group: 0, label: 'Institut (ako postoji)' },
        { role: 'study', required: true, elementProvenance: 'official-rules', group: 0, label: 'Naziv studijskoga programa' },
      ],
    };
    const filled = buildTitlePage({ study: 'Teologija' }, optionalThenRequired);
    // Obavezno polje (drugi element) dobiva stvaran unos, ne opcionalni prvi.
    expect(filled.lines.filter((l) => l.role === 'study').map((l) => l.text)).toEqual(['Teologija']);
    expect(filled.missing).toHaveLength(0);

    const empty = buildTitlePage({}, optionalThenRequired);
    expect(empty.lines.filter((l) => l.role === 'study')).toHaveLength(0);
    expect(empty.missing).toEqual(['Naziv studijskoga programa']);
  });

  it('mentor zadrzava prefiks titule i s predloskom', () => {
    const m = buildTitlePage({ ...INPUT, mentorLabel: 'Mentorica', mentor: 'Ana Barić' }, TEMPLATE);
    expect(m.lines.find((l) => l.role === 'mentor')!.text).toBe('Mentorica: Ana Barić');
  });

  it('titlePageText grupira po group vrijednostima predloska', () => {
    const text = titlePageText(buildTitlePage(INPUT, TEMPLATE));
    expect(text).toBe([
      'Sveučilište u Zagrebu\nFakultet političkih znanosti',
      'Ana Anić\nUloga civilnog društva\nDiplomski rad',
      'Mentor: dr. sc. Ivan Ivić',
      'Zagreb, 2026.',
    ].join('\n\n'));
  });

  it('JMBAG/kolegij bez elementa u predlosku se sidre uz srodnu ulogu (JMBAG iza imena, isti group)', () => {
    // v1 predlosci ne modeliraju studentId/course kao elemente (samo notes), pa ih jezgra
    // ubacuje: JMBAG odmah iza author retka (nasljeduje group), kolegij iza study/faculty.
    const m = buildTitlePage({ ...INPUT, studentId: '0123456789', course: 'Metodologija' }, TEMPLATE);
    const roles = m.lines.map((l) => l.role);
    const authorIdx = roles.indexOf('author');
    expect(roles[authorIdx + 1]).toBe('studentId');
    expect(m.lines[authorIdx + 1].text).toBe('JMBAG: 0123456789');
    expect(m.lines[authorIdx + 1].group).toBe(m.lines[authorIdx].group);
    expect(m.lines[authorIdx + 1].style?.font).toBe('Times New Roman');
    // TEMPLATE nema study element -> kolegij pada na sidro 'faculty'.
    const facultyIdx = roles.indexOf('faculty');
    expect(roles[facultyIdx + 1]).toBe('course');
    expect(m.lines[facultyIdx + 1].group).toBe(m.lines[facultyIdx].group);
    // Bez unosa se nista ne ubacuje (regresija: predlozak ostaje netaknut).
    const plain = buildTitlePage(INPUT, TEMPLATE);
    expect(plain.lines.some((l) => l.role === 'studentId' || l.role === 'course')).toBe(false);
  });
});
