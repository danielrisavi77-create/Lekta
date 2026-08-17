/**
 * Privola pri kupnji mora biti DOKAZIVA, ne prepricana (audit A26-08 / LEG-04..07).
 *
 * Do 2026-08-17 `create-checkout` je prihvacao bilo koji neprazan string kao tekst privole i
 * doslovno ga spremao, uz klijentov timestamp i opcionalnu verziju uvjeta. Ovaj test cuva tri
 * svojstva bez kojih zapis nema dokaznu vrijednost:
 *
 *   1. tekst mora odgovarati KANONSKOM tekstu za poslanu verziju uvjeta;
 *   2. nepoznata ili izostavljena verzija se odbija;
 *   3. tekst koji vrijedi za jednu verziju ne prolazi kao privola za drugu.
 *
 * Uz to cuva da kanonski tekst POSTOJI za verziju koja je trenutno na snazi: bez toga bi
 * klijent slao praznu privolu, a server bi je uredno odbijao, pa se kupnja ne bi mogla
 * dovrsiti ni uz posve ispravno ponasanje korisnika.
 */
import { describe, it, expect } from 'vitest';
import { CHECKOUT_CONSENT_TEXTS, canonicalConsentText, consentTextMatches } from '../src/legal/consent-text';
import { TERMS_VERSION } from '../src/legal/terms-version';

describe('kanonski tekst privole', () => {
  it('postoji za verziju uvjeta koja je trenutno na snazi', () => {
    const text = canonicalConsentText(TERMS_VERSION);
    expect(text, `nema kanonskog teksta za TERMS_VERSION ${TERMS_VERSION}`).toBeTruthy();
    expect(text!.length).toBeGreaterThan(80);
  });

  it('spominje trenutnu isporuku i odricanje od prava na raskid', () => {
    const text = canonicalConsentText(TERMS_VERSION)!;
    expect(text).toContain('odmah nakon plaćanja');
    expect(text).toContain('odričem');
    expect(text).toContain('14 dana');
  });

  it('nepoznata, prazna ili neispravno tipizirana verzija nema kanonski tekst', () => {
    for (const bad of ['', '1999-01-01', 'nepostojeca', null, undefined, 42, {}]) {
      expect(canonicalConsentText(bad as unknown), String(bad)).toBeNull();
    }
  });
});

describe('usporedba primljene privole', () => {
  const version = TERMS_VERSION;
  const canonical = canonicalConsentText(version)!;

  it('prihvaca tocan tekst', () => {
    expect(consentTextMatches(canonical, version)).toBe(true);
  });

  it('prihvaca bezopasnu razliku u prijenosu (CRLF, rubni razmaci)', () => {
    expect(consentTextMatches(`  ${canonical}  `, version)).toBe(true);
    expect(consentTextMatches(canonical.replace(/\n/g, '\r\n'), version)).toBe(true);
  });

  it('odbija izmijenjen, skracen ili prazan tekst', () => {
    expect(consentTextMatches(canonical.replace('odmah nakon plaćanja', 'kasnije'), version)).toBe(false);
    expect(consentTextMatches(canonical.slice(0, 50), version)).toBe(false);
    expect(consentTextMatches('', version)).toBe(false);
    expect(consentTextMatches('   ', version)).toBe(false);
  });

  it('odbija tekst bez poznate verzije uvjeta', () => {
    expect(consentTextMatches(canonical, 'nepostojeca')).toBe(false);
    expect(consentTextMatches(canonical, undefined)).toBe(false);
  });

  /**
   * Stare verzije se namjerno NE brisu iz registra: u trenutku bumpa u pregledniku postoje vec
   * ucitane stranice sa starim tekstom. Ali tekst jedne verzije ne smije proci kao privola za
   * drugu, inace bi bump verzije bio kozmeticki.
   */
  it('tekst jedne verzije ne prolazi kao privola za drugu', () => {
    const versions = Object.keys(CHECKOUT_CONSENT_TEXTS);
    for (const a of versions) {
      for (const b of versions) {
        if (a === b) continue;
        if (CHECKOUT_CONSENT_TEXTS[a] === CHECKOUT_CONSENT_TEXTS[b]) continue;
        expect(consentTextMatches(CHECKOUT_CONSENT_TEXTS[a], b), `${a} tekst pod verzijom ${b}`).toBe(false);
      }
    }
  });
});
