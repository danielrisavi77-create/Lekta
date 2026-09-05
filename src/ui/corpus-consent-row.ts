/**
 * Kanal A: kucica za ZASEBNU, neobaveznu privolu da se pseudonimizirana kopija dokumenta zadrzi za mjerenje
 * popravka. Zivi izvan `app.ts` (koji samo poziva `buildCorpusConsentRow` i cita `checked()`), da app.ts ne raste
 * i da se pravila prikaza mogu testirati bez DOM-a cijele aplikacije.
 *
 * Pravila prikaza (spec 2026-09-05-kanal-a-privola-korpusa.md):
 *  - prikazuje se SAMO kad je znacajka ukljucena u konfiguraciji (`corpusContribution`) i kad korisnik ima racun
 *    s e-mailom; anonimni racun ne moze povuci privolu, pa mu se ne nudi;
 *  - zadano NEOZNACENA, stoji ispod obvezne privole za popravak, s vlastitim doslovnim tekstom
 *    (`canonicalCorpusConsentText`) i poveznicom na odjeljak 1c privatnosti;
 *  - ne mijenja nista u popravku: jedino sto proizvodi je `checked()`, koji klijent prevede u `meta.corpusConsent`.
 */
import { CORPUS_CONSENT_VERSION, canonicalCorpusConsentText } from '../legal/corpus-consent';

export interface CorpusConsentRow {
  /** Element za umetanje u panel, ili `null` kad se kucica ne nudi. */
  row: HTMLElement | null;
  /** Je li korisnik oznacio privolu; `false` uvijek kad se kucica ne nudi. */
  checked: () => boolean;
}

export interface CorpusConsentRowOptions {
  /** Zastavica iz produkcijske konfiguracije. */
  enabled: boolean;
  /** Korisnik ima racun s e-mailom (nije anoniman). */
  hasEmailAccount: boolean;
}

export function shouldOfferCorpusConsent(opts: CorpusConsentRowOptions): boolean {
  return opts.enabled === true && opts.hasEmailAccount === true;
}

export function buildCorpusConsentRow(opts: CorpusConsentRowOptions): CorpusConsentRow {
  if (!shouldOfferCorpusConsent(opts)) return { row: null, checked: () => false };
  const text = canonicalCorpusConsentText(CORPUS_CONSENT_VERSION) ?? '';
  const row = document.createElement('label');
  row.className = 'lekta-repair-panel__deep lekta-repair-panel__corpus';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.corpusConsent = CORPUS_CONSENT_VERSION;
  const span = document.createElement('span');
  span.textContent = ` ${text} `;
  const link = document.createElement('a');
  link.href = '/privatnost.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Više o tome u Privatnosti, odjeljak 1c.';
  span.appendChild(link);
  row.appendChild(input);
  row.appendChild(span);
  return { row, checked: () => input.checked === true };
}
