import { describe, it, expect } from 'vitest';
import { reframeStatusNote } from '../src/utils/helpers';

describe('reframeStatusNote', () => {
  it('skida cisti eho "...profil:" i podigne prvo slovo', () => {
    expect(reframeStatusNote('Djelomično potvrđeni profil: aktualna odluka dopušta rad.'))
      .toBe('Aktualna odluka dopušta rad.');
    expect(reframeStatusNote('Djelomično potvrđeni opći profil: tehničko oblikovanje se provjerava.'))
      .toBe('Tehničko oblikovanje se provjerava.');
    expect(reframeStatusNote('Djelomično potvrđeni profil: citatna logika je preuzeta.'))
      .toBe('Citatna logika je preuzeta.');
  });

  it('skida i eho s tockom ("...profil.")', () => {
    expect(reframeStatusNote('Djelomično potvrđeni sigurnosni profil. Fakultet javno objavljuje studije.'))
      .toBe('Fakultet javno objavljuje studije.');
  });

  it('NE dira integrirani oblik gdje bi strip izgubio sadrzaj ili stvorio fragment', () => {
    const integ = 'Djelomično potvrđeni profil prema službenim uputama za poslijediplomske studije. Tehnička matrica je ugrađena.';
    expect(reframeStatusNote(integ)).toBe(integ);
    const integ2 = 'Djelomično potvrđeni profil za seminarske i druge studentske radove. Fakultetske upute se razlikuju.';
    expect(reframeStatusNote(integ2)).toBe(integ2);
  });

  it('note bez eha ostaje netaknut; prazno ostaje prazno', () => {
    expect(reframeStatusNote('Pravila su povezana sa službenim izvorom.')).toBe('Pravila su povezana sa službenim izvorom.');
    expect(reframeStatusNote('')).toBe('');
    expect(reframeStatusNote(null)).toBe('');
    expect(reframeStatusNote(undefined)).toBe('');
  });
});
