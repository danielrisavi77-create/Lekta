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
});
