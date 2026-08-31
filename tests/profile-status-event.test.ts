import { describe, expect, it } from 'vitest';
import {
  PROFILE_STATUS_GENERIC,
  PROFILE_STATUS_UNREADABLE,
  profileStatusForEvent,
} from '../src/ui/profile-status-event';

/**
 * Nalaz (lekta-3f, potvrdjen mjerenjem): listener na `#stepToAnalyze` citao je `currentProfile()`
 * sinkrono i bez garda. Ta funkcija baca kad pravila profila nisu ucitana, a iznimka u jednom
 * listeneru ne zaustavlja ostale, pa je carobnjak isao dalje dok je `profile_completed` tiho
 * nestajao. Nijedan test nije pokrivao taj dogadjaj.
 */
describe('status profila za telemetriju', () => {
  it('dogadjaj prezivi kad citanje profila BACI', () => {
    expect(profileStatusForEvent(() => { throw new Error('pravila profila nisu ucitana'); }))
      .toBe(PROFILE_STATUS_UNREADABLE);
  });

  it('necitljiv profil NIJE isto sto i opci profil', () => {
    // Spojiti ih znacilo bi telemetriji reci da su ti korisnici bili na opcoj provjeri,
    // sto nije izmjereno nego pretpostavljeno.
    expect(PROFILE_STATUS_UNREADABLE).not.toBe(PROFILE_STATUS_GENERIC);
    expect(profileStatusForEvent(() => { throw new Error('x'); }))
      .not.toBe(profileStatusForEvent(() => ({})));
  });

  it('citljiv profil vraca svoj status', () => {
    expect(profileStatusForEvent(() => ({ statusKey: 'verified' }))).toBe('verified');
  });

  it('citljiv profil bez statusa je opci', () => {
    for (const p of [{}, { statusKey: '' }, { statusKey: '   ' }, { statusKey: null }, { statusKey: 7 }]) {
      expect(profileStatusForEvent(() => p as { statusKey?: unknown })).toBe(PROFILE_STATUS_GENERIC);
    }
  });

  it('prazan profil se ne cita kao opci nego kao necitljiv', () => {
    expect(profileStatusForEvent(() => null)).toBe(PROFILE_STATUS_UNREADABLE);
    expect(profileStatusForEvent(() => undefined)).toBe(PROFILE_STATUS_UNREADABLE);
  });

  it('nikad ne baca, ma sto citatelj napravio', () => {
    for (const bad of [
      () => { throw new TypeError('tip'); },
      () => { throw 'niz'; },
      () => { throw null; },
    ]) {
      expect(() => profileStatusForEvent(bad as () => never)).not.toThrow();
    }
  });
});
