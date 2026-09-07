/**
 * GARD NAD SVODJENJEM SKLONJENOG PREZIMENA (`croatianSurnameStems`).
 *
 * Izmjereno 2026-09-07 usporedbom Lekte i Katedre nad ISTIM dokumentom: oba alata su prijavila
 * "citirano a nema na popisu", i OBA su bila u krivu. Proza je pisala ispravan hrvatski ("Prema
 * Galtungu i Rugeu (1965)", "U analizi Wallacea (2018)"), literatura je imala tocne jedinice, a
 * usporedba je radila nad doslovnim nizom.
 *
 * Nalaz nije kozmeticki: `citation.author-year.missing-reference` nosi 10 bodova i status `fail`, a
 * isti uzrok proizvodi i lazan `reference.uncited` (7 bodova). Rad koji citira po pravilima
 * hrvatskog jezika time gubi bodove.
 *
 * Testovi imaju PAR: sto se mora svesti i sto se NE SMIJE, jer svodjenje bez granice pretvara lazni
 * negativ u lazni pozitiv, sto je gore.
 */
import { describe, expect, it } from 'vitest';
import { croatianSurnameStems } from './author-year';

describe('svodjenje sklonjenog prezimena: sto se MORA svesti', () => {
  it('dativ i lokativ (Galtungu -> galtung)', () => {
    expect(croatianSurnameStems('Galtungu')).toContain('galtung');
  });

  it('genitiv na -a (Wallacea -> wallace)', () => {
    expect(croatianSurnameStems('Wallacea')).toContain('wallace');
  });

  it('instrumental (Galtungom -> galtung, Malovicem -> malovic)', () => {
    expect(croatianSurnameStems('Galtungom')).toContain('galtung');
    expect(croatianSurnameStems('Malovicem')).toContain('malovic');
  });

  it('dijakritika se cuva (Malovica -> malovic sa c s kvacicom)', () => {
    expect(croatianSurnameStems('Malovića')).toContain('malović');
  });

  it('vise kandidata je dopusteno: presudu donosi podudaranje s literaturom, ne pogadjanje', () => {
    // "Rugea" moze biti genitiv od "Ruge" ili od "Rugea"; vraca se kandidat, ne tvrdnja.
    expect(croatianSurnameStems('Rugea')).toContain('ruge');
  });
});

describe('svodjenje sklonjenog prezimena: sto se NE SMIJE svesti', () => {
  /**
   * Granica korijena je 4 znaka. Bez nje bi kratka prezimena pocela sudarati: "Mara" bi postala
   * "mar", pa bi se citatnica "Mara" lazno vezala uz bilo koju jedinicu cije prezime pocinje s "mar".
   * Lazni POZITIV je gori od laznog negativa, jer tiho tvrdi podudaranje kojega nema.
   */
  it('kratko prezime se ne skracuje ispod cetiri znaka', () => {
    expect(croatianSurnameStems('Mara')).toEqual([]);
    expect(croatianSurnameStems('Ivi')).toEqual([]);
    expect(croatianSurnameStems('Bua')).toEqual([]);
  });

  /**
   * Prezime na SUGLASNIK nema sto skinuti i mora ostati netaknuto. Prezime na samoglasnik nuzno daje
   * kandidate, jer se sklonjeni i nominativni oblik ondje ne razlikuju po obliku ("Wallace" i
   * "Wallacea" oba zavrsavaju nastavkom s popisa). To se NE moze rijesiti na razini niza, i zato
   * presudu ne donosi ova funkcija nego podudaranje s literaturom uz slaganje godine.
   */
  it('prezime na suglasnik ostaje netaknuto', () => {
    expect(croatianSurnameStems('Galtung')).toEqual([]);
    expect(croatianSurnameStems('Bruns')).toEqual([]);
    expect(croatianSurnameStems('Tuchman')).toEqual([]);
  });

  it('zenska sklonidba se vraca u nominativ na -a (Bandure -> bandura)', () => {
    expect(croatianSurnameStems('Bandure')).toContain('bandura');
  });

  it('kandidat nikad nije sam ulaz, inace bi svodjenje "potvrdjivalo" nepromijenjen niz', () => {
    for (const w of ['Galtungu', 'Wallacea', 'Bandure', 'Malovića']) {
      expect(croatianSurnameStems(w)).not.toContain(w.toLowerCase());
    }
  });

  it('prazan i besmislen ulaz ne proizvode kandidate', () => {
    expect(croatianSurnameStems('')).toEqual([]);
    expect(croatianSurnameStems('   ')).toEqual([]);
  });

  it('ne svodi na korijen koji bi spojio dva RAZLICITA prezimena', () => {
    // "Maras" nema padezni nastavak na popisu, pa se ne svodi na "Mara".
    expect(croatianSurnameStems('Maras')).toEqual([]);
  });
});
