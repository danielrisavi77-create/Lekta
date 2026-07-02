import { describe, it, expect } from 'vitest';
import { buildStatement, statementText } from '../src/tools/statement';

describe('buildStatement', () => {
  it('prazan unos: zadani naslov i popis preporucenih polja', () => {
    const m = buildStatement({});
    expect(m.heading).toBe('Izjava o izvornosti');
    expect(m.signatureName).toBe('');
    expect(m.missing).toEqual(['ime i prezime', 'vrsta rada', 'naslov rada', 'mjesto', 'datum']);
  });

  it('uvrštava vrstu rada malim slovom i naslov u navodnike', () => {
    const m = buildStatement({ workType: 'Diplomski rad', title: 'Uloga civilnog društva' });
    expect(m.body).toContain('ovaj diplomski rad pod naslovom „Uloga civilnog društva“');
  });

  it('bez naslova ne dodaje dio o naslovu', () => {
    const m = buildStatement({ workType: 'Završni rad' });
    expect(m.body).toContain('ovaj završni rad rezultat');
    expect(m.body).not.toContain('pod naslovom');
  });

  it('spaja mjesto i datum', () => {
    expect(buildStatement({ place: 'Zagreb', date: '3. srpnja 2026.' }).placeDate).toBe('Zagreb, 3. srpnja 2026.');
    expect(buildStatement({ date: '2026.' }).placeDate).toBe('2026.');
  });

  it('podržava varijantu naslova', () => {
    expect(buildStatement({ heading: 'Izjava o akademskoj čestitosti' }).heading).toBe('Izjava o akademskoj čestitosti');
  });

  it('potpuni unos nema nedostajućih polja', () => {
    const m = buildStatement({ author: 'Ana Anić', workType: 'Diplomski rad', title: 'Naslov', place: 'Zagreb', date: '2026.' });
    expect(m.missing).toHaveLength(0);
    expect(m.signatureName).toBe('Ana Anić');
  });

  it('statementText slaže naslov, tijelo i potpis', () => {
    const m = buildStatement({ author: 'Ana Anić', workType: 'Diplomski rad', place: 'Zagreb', date: '2026.' });
    const text = statementText(m);
    expect(text.startsWith('Izjava o izvornosti')).toBe(true);
    expect(text.trim().endsWith('Ana Anić')).toBe(true);
    expect(text).toContain('Zagreb, 2026.');
  });
});
