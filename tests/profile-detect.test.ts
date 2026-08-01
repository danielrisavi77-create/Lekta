/**
 * Jedinicni testovi ciste detekcije profila (BL-P0-05-8): detectContextFromText radi po SVIM
 * institucijama (ne samo unizg), longest-match s guardom, i needsProfileConfirmation predikat.
 * Koristi pravi normalize (isti kao runtime), pa tekst sadrzi nazive doslovno da se poklope.
 */
import { describe, it, expect } from 'vitest';
import { detectContextFromText, needsProfileConfirmation, isConfidentDetection, type DetectUnit } from '../src/ui/profile-detect';

const UNITS: DetectUnit[] = [
  { id: 'fpzg', name: 'Fakultet političkih znanosti', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Politologija', 'Novinarstvo', 'Opći profil'] },
  { id: 'ffri', name: 'Filozofski fakultet u Rijeci', institutionId: 'uniri', institutionName: 'Sveučilište u Rijeci', programs: ['Povijest', 'Opći profil ustanove'] },
  { id: 'ffzg', name: 'Filozofski fakultet', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Filozofija'] },
];

describe('detectContextFromText', () => {
  it('prepoznaje NON-unizg jedinicu i vraca njezin institutionId (kriterij c)', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Rijeci, Filozofski fakultet u Rijeci, diplomski rad iz povijesti');
    expect(ctx).not.toBeNull();
    expect(ctx!.institutionId).toBe('uniri');
    expect(ctx!.unitId).toBe('ffri');
    expect(ctx!.workType).toBe('graduate');
    expect(ctx!.program).toBe('Povijest');
  });

  it('longest-match bira duzi naziv kad tekst sadrzi dva naziva jedinice', () => {
    // Tekst sadrzi i "Filozofski fakultet" (ffzg) i "Filozofski fakultet u Rijeci" (ffri, duzi).
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci, zavrsni rad');
    expect(ctx!.unitId).toBe('ffri');
  });

  it('prepoznaje unizg FPZG i studij Politologija', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Zagrebu Fakultet političkih znanosti Politologija diplomski rad');
    expect(ctx!.unitId).toBe('fpzg');
    expect(ctx!.institutionId).toBe('unizg');
    expect(ctx!.program).toBe('Politologija');
    expect(ctx!.workType).toBe('graduate');
  });

  it('workType regexi: doktorski/specijalisticki/diplomski/zavrsni/seminarski', () => {
    const t = (s: string) => detectContextFromText(UNITS, 'Fakultet političkih znanosti ' + s)!.workType;
    expect(t('doktorski rad')).toBe('doctoral');
    expect(t('disertacija')).toBe('doctoral');
    expect(t('specijalistički rad')).toBe('specialist');
    expect(t('diplomski rad')).toBe('graduate');
    expect(t('završni rad')).toBe('final');
    expect(t('seminarski rad')).toBe('seminar');
  });

  it('program preskace Opći i genericke nazive te vraca null kad nema pogotka', () => {
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci seminarski rad');
    // "Opći profil ustanove" se preskace; nijedan drugi program nije u tekstu -> program null.
    expect(ctx!.program).toBeNull();
  });

  it('kratak/neprepoznat naziv se ne matcha (guard) i prazan tekst vraca null bez bacanja', () => {
    expect(detectContextFromText([{ id: 'x', name: 'ABC' }], 'nešto o ABC-u')).toBeNull();
    expect(detectContextFromText(UNITS, '')).toBeNull();
    expect(detectContextFromText(UNITS, 'potpuno nepovezan tekst bez ustanove')).toBeNull();
  });
});

describe('needsProfileConfirmation', () => {
  it('samo verificiran i nepotvrdjen profil trazi potvrdu', () => {
    expect(needsProfileConfirmation('verified', false)).toBe(true);
    expect(needsProfileConfirmation('verified', true)).toBe(false);
    expect(needsProfileConfirmation('generic', false)).toBe(false);
    expect(needsProfileConfirmation('partial', false)).toBe(false);
  });
});

describe('isConfidentDetection', () => {
  it('vraca true samo kad je program stvarno prepoznat', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Zagrebu Fakultet političkih znanosti Politologija diplomski rad');
    expect(ctx!.program).toBe('Politologija');
    expect(isConfidentDetection(ctx)).toBe(true);
  });

  it('vraca false kad je ustanova/fakultet prepoznat ali program NIJE (regresija: tiha potvrda profila)', () => {
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci seminarski rad');
    expect(ctx!.unitId).toBe('ffri');
    expect(ctx!.program).toBeNull();
    expect(isConfidentDetection(ctx)).toBe(false);
  });

  it('vraca false za null kontekst (nista prepoznato)', () => {
    expect(isConfidentDetection(null)).toBe(false);
  });
});
