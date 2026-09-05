/**
 * Kanal A, kucica u panelu popravka (src/ui/corpus-consent-row.ts): nudi se samo uz ukljucenu znacajku i racun s
 * e-mailom, zadano je NEOZNACENA i nosi tekucu verziju teksta. Sve ostalo je posao klijenta i servera.
 */
import { describe, expect, it } from 'vitest';
import { CORPUS_CONSENT_VERSION, canonicalCorpusConsentText } from '../src/legal/corpus-consent';
import { buildCorpusConsentRow, shouldOfferCorpusConsent } from '../src/ui/corpus-consent-row';

describe('shouldOfferCorpusConsent', () => {
  it('samo ukljucena znacajka I racun s e-mailom', () => {
    expect(shouldOfferCorpusConsent({ enabled: true, hasEmailAccount: true })).toBe(true);
    expect(shouldOfferCorpusConsent({ enabled: false, hasEmailAccount: true })).toBe(false);
    expect(shouldOfferCorpusConsent({ enabled: true, hasEmailAccount: false })).toBe(false);
    expect(shouldOfferCorpusConsent({ enabled: false, hasEmailAccount: false })).toBe(false);
  });
});

describe('buildCorpusConsentRow', () => {
  it('kad se ne nudi: nema elementa i checked() je uvijek false', () => {
    const r = buildCorpusConsentRow({ enabled: false, hasEmailAccount: true });
    expect(r.row).toBeNull();
    expect(r.checked()).toBe(false);
  });

  it('kad se nudi: zadano neoznacena, nosi tekuci tekst i verziju, i poveznicu na privatnost', () => {
    const r = buildCorpusConsentRow({ enabled: true, hasEmailAccount: true });
    expect(r.row).not.toBeNull();
    const input = r.row!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(r.checked()).toBe(false);
    expect(input.dataset.corpusConsent).toBe(CORPUS_CONSENT_VERSION);
    expect(r.row!.textContent).toContain(canonicalCorpusConsentText(CORPUS_CONSENT_VERSION));
    expect(r.row!.querySelector('a')?.getAttribute('href')).toBe('/privatnost.html');
    input.checked = true;
    expect(r.checked()).toBe(true);
  });
});
