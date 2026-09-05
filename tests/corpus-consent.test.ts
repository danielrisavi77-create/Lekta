/**
 * Kanal A: zasebna privola za prilog korpusu (src/legal/corpus-consent.ts).
 *
 * Odluka o pohrani nikad ne odbija popravak; govori samo hoce li se kopija pohraniti i sto odgovor kaze.
 * Redoslijed je ugovor: bez zahtjeva nista, pa zastavica, pa anonimnost, pa verzija, da iskljucena znacajka
 * korisniku ne otkriva nista (ni starost verzije).
 */
import { describe, expect, it } from 'vitest';
import {
  CORPUS_CONSENT_VERSION,
  CORPUS_RETENTION_MONTHS,
  canonicalCorpusConsentText,
  decideCorpusContribution,
} from '../src/legal/corpus-consent';

describe('canonicalCorpusConsentText', () => {
  it('tekuca verzija ima tekst koji imenuje pseudonimizaciju, rok i povlacenje', () => {
    const t = canonicalCorpusConsentText(CORPUS_CONSENT_VERSION);
    expect(t).toBeTruthy();
    expect(t).toMatch(/pseudonim/i);
    expect(t).toContain(`${CORPUS_RETENTION_MONTHS} mjeseci`);
    expect(t).toMatch(/povu[čc]/i);
    expect(t).toContain('Moji popravci');
    // Bez em i en crtica (konvencija repozitorija).
    expect(t!.includes('—') || t!.includes('–')).toBe(false);
  });

  it('nepoznata verzija nema teksta, pa je server odbija umjesto da pogadja', () => {
    expect(canonicalCorpusConsentText('1999-01-01')).toBeNull();
    expect(canonicalCorpusConsentText(undefined)).toBeNull();
    expect(canonicalCorpusConsentText(42)).toBeNull();
  });
});

describe('decideCorpusContribution', () => {
  const zahtjev = { version: CORPUS_CONSENT_VERSION };

  it('bez zahtjeva nista: ni kad je znacajka ukljucena', () => {
    expect(decideCorpusContribution({ requested: undefined, enabled: true, anonymous: false })).toBe('not-requested');
    expect(decideCorpusContribution({ requested: null, enabled: true, anonymous: false })).toBe('not-requested');
    expect(decideCorpusContribution({ requested: { version: 7 }, enabled: true, anonymous: false })).toBe('not-requested');
    expect(decideCorpusContribution({ requested: true, enabled: true, anonymous: false })).toBe('not-requested');
  });

  it('iskljucena znacajka pobjedjuje sve: ne otkriva ni anonimnost ni starost verzije', () => {
    expect(decideCorpusContribution({ requested: zahtjev, enabled: false, anonymous: false })).toBe('disabled');
    expect(decideCorpusContribution({ requested: { version: 'stara' }, enabled: false, anonymous: true })).toBe('disabled');
  });

  it('anonimni racun ne moze dati privolu koju ne moze povuci', () => {
    expect(decideCorpusContribution({ requested: zahtjev, enabled: true, anonymous: true })).toBe('anonymous');
  });

  it('zastarjela ili nepoznata verzija teksta nije privola za tekuci tekst', () => {
    expect(decideCorpusContribution({ requested: { version: '2020-01-01' }, enabled: true, anonymous: false })).toBe('consent-outdated');
  });

  it('prihvaca se samo tekuca verzija, ukljucena znacajka i racun koji privolu moze povuci', () => {
    expect(decideCorpusContribution({ requested: zahtjev, enabled: true, anonymous: false })).toBe('accepted');
  });
});
