// Kanonski tekst privole pri kupnji. Jedini izvor istine, dijeljen izmedju preglednika i
// Edge funkcije, po uzoru na terms-version.ts: BEZ ijedne ovisnosti (bez provider.json, bez
// DOM-a), da ga Deno smije uvesti izravno (`../../../src/legal/consent-text.ts`).
//
// ZASTO POSTOJI (audit A26-08 / LEG-04..08): do 2026-08-17 tekst je zivio samo u
// src/ui/app.ts, a `create-checkout` je prihvacao BILO KOJI neprazan string kao "tekst
// privole" i doslovno ga spremao u checkout_consents. Posljedica: zapis privole nije bio
// dokaz da je korisnik vidio tekst na koji je pristao, jer je izmijenjen klijent mogao
// poslati proizvoljan sadrzaj, proizvoljnu verziju uvjeta ili nijednu.
//
// Za gubitak prava na jednostrani raskid (cl. 86. ZZP) teret dokaza je na trgovcu, pa zapis
// koji ovisi o dobroj volji klijenta ne vrijedi nista. Zato server od sada USPOREDJUJE
// primljeni tekst s kanonskim za poslanu verziju uvjeta i odbija sve ostalo.

/**
 * Tekst privole po verziji uvjeta.
 *
 * Kljuc je TERMS_VERSION koji je vrijedio kad je tekst prikazan. Stare verzije se NE brisu:
 * u trenutku bumpa u pregledniku postoje vec ucitane stranice sa starim tekstom, pa bi
 * brisanje odbilo privolu koju je korisnik posteno dao nad tada vazecim tekstom. Uz to,
 * zapisi u checkout_consents moraju ostati provjerljivi i unatrag.
 *
 * Kad se tekst materijalno mijenja: bump TERMS_VERSION, dodaj NOVI unos ovdje, stari ostavi.
 */
export const CHECKOUT_CONSENT_TEXTS: Readonly<Record<string, string>> = Object.freeze({
  '2026-07-20':
    'Pristajem da isporuka digitalnog sadržaja (puni izvještaj) počne odmah nakon plaćanja i izričito se odričem prava na jednostrani raskid ugovora u roku od 14 dana (čl. 86. Zakona o zaštiti potrošača). Bez ovog pristanka kupnja se ne može dovršiti.',
});

/** Kanonski tekst za zadanu verziju uvjeta, ili null ako verzija nije poznata. */
export function canonicalConsentText(termsVersion: unknown): string | null {
  if (typeof termsVersion !== 'string') return null;
  return CHECKOUT_CONSENT_TEXTS[termsVersion] ?? null;
}

/**
 * Usporedba otporna na bezopasne razlike u prijenosu (rubni razmaci, CRLF), ali NE na
 * razliku u sadrzaju. Namjerno ne normalizira dijakritiku ni interpunkciju: tekst na koji je
 * korisnik pristao mora biti onaj koji je vidio, do znaka.
 */
export function consentTextMatches(received: unknown, termsVersion: unknown): boolean {
  const canonical = canonicalConsentText(termsVersion);
  if (canonical === null || typeof received !== 'string') return false;
  const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();
  return norm(received) === norm(canonical);
}
