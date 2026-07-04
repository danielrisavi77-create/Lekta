import { describe, it, expect } from 'vitest';
import { buildTitlePage, titlePageText } from '../src/tools/title-page';

describe('buildTitlePage', () => {
  it('prazan unos daje nula redaka i popis preporucenih polja', () => {
    const m = buildTitlePage({});
    expect(m.lines).toHaveLength(0);
    expect(m.missing).toContain('naslov rada');
    expect(m.missing).toContain('mentor');
  });

  it('slaze retke ispravnim redoslijedom i ulogama', () => {
    const m = buildTitlePage({
      university: 'Sveučilište u Zagrebu',
      faculty: 'Fakultet političkih znanosti',
      author: 'Ana Anić',
      title: 'Naslov rada',
      workType: 'Diplomski rad',
      mentor: 'dr. sc. Ivan Ivić',
      place: 'Zagreb',
      year: '2026',
    });
    expect(m.lines.map(l => l.role)).toEqual([
      'university', 'faculty', 'author', 'title', 'worktype', 'mentor', 'placeyear',
    ]);
    expect(m.missing).toHaveLength(0);
  });

  it('mentor i komentor dobivaju prefiks', () => {
    const m = buildTitlePage({ mentor: 'Ivić', comentor: 'Horvat' });
    expect(m.lines.find(l => l.role === 'mentor')?.text).toBe('Mentor: Ivić');
    expect(m.lines.find(l => l.role === 'comentor')?.text).toBe('Komentor: Horvat');
  });

  it('titula mentora/komentora se moze postaviti (Mentorica/Komentorica)', () => {
    const m = buildTitlePage({ mentor: 'Ana Anić', mentorLabel: 'Mentorica', comentor: 'Iva Ivić', comentorLabel: 'Komentorica' });
    expect(m.lines.find(l => l.role === 'mentor')?.text).toBe('Mentorica: Ana Anić');
    expect(m.lines.find(l => l.role === 'comentor')?.text).toBe('Komentorica: Iva Ivić');
  });

  it('mjesto i godina se spajaju, godina dobiva tocku', () => {
    expect(buildTitlePage({ place: 'Zagreb', year: '2026' }).lines[0].text).toBe('Zagreb, 2026.');
    expect(buildTitlePage({ year: '2026' }).lines[0].text).toBe('2026.');
    expect(buildTitlePage({ place: 'Split' }).lines[0].text).toBe('Split');
  });

  it('visak razmaka se cisti', () => {
    const m = buildTitlePage({ title: '  Naslov   s   razmacima  ' });
    expect(m.lines.find(l => l.role === 'title')?.text).toBe('Naslov s razmacima');
  });

  it('titlePageText grupira retke praznim redom', () => {
    const m = buildTitlePage({
      university: 'Sveučilište u Zagrebu',
      author: 'Ana Anić',
      title: 'Naslov',
      mentor: 'Ivić',
      place: 'Zagreb',
      year: '2026',
    });
    const text = titlePageText(m);
    expect(text).toContain('Sveučilište u Zagrebu\n\nAna Anić');
    expect(text.trim().endsWith('Zagreb, 2026.')).toBe(true);
  });
});
