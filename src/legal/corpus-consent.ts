/**
 * Kanal A: zasebna, neobavezna privola da se pseudonimizirana kopija dokumenta zadrzi za mjerenje popravka.
 *
 * Odvojena od privole za popravak (`TERMS_VERSION`): popravak radi jednako s njom i bez nje, i ne donosi
 * nikakvu pogodnost (inace privola nije slobodna). Server je izvor istine o verziji: klijent salje verziju
 * teksta koji je korisnik VIDIO, a server pohranu prihvaca samo za tekucu verziju. Isti obrazac kao
 * `canonicalConsentText` za narudzbe.
 *
 * Cisti modul bez uvoza: dijele ga klijent, Edge funkcija (`supabase/functions/repair-docx`) i testovi.
 * Spec: docs/superpowers/specs/2026-09-05-kanal-a-privola-korpusa.md.
 *
 * ODLUKE 2026-09-05 (vlasnik je delegirao: "sam napravi dio za Kanal A"): rok cuvanja 36 mjeseci od predaje ili
 * do povlacenja privole, sto je ranije; anonimni racuni ne dobivaju kucicu jer ne mogu povuci privolu; tekst
 * je nacrt sesije i vlasnik ga smije zamijeniti, uz novu verziju.
 */

export const CORPUS_CONSENT_VERSION = '2026-09-05';

/** Rok cuvanja priloga, u mjesecima od predaje; kopija se brise i ranije, cim se privola povuce. */
export const CORPUS_RETENTION_MONTHS = 36;

const TEXTS: Readonly<Record<string, string>> = Object.freeze({
  '2026-09-05':
    'Dopuštam da Lekta zadrži pseudonimiziranu kopiju ovog dokumenta za testiranje automatskog popravka ' +
    'oblikovanja. Imena, e-mail adrese i drugi osobni podaci iz metapodataka i naslovnice zamjenjuju se ' +
    'pseudonimima prije pohrane, a ključ za povratak se ne čuva. Kopija se ne dijeli, ne koristi ni za što ' +
    'osim mjerenja popravka i briše se kad povučem privolu, a najkasnije 36 mjeseci nakon predaje. Privolu ' +
    'mogu povući u "Moji popravci".',
});

/** Doslovan tekst kucice za danu verziju; `null` za nepoznatu verziju (server tada odbija pohranu). */
export function canonicalCorpusConsentText(version: unknown): string | null {
  return typeof version === 'string' && Object.prototype.hasOwnProperty.call(TEXTS, version) ? TEXTS[version] : null;
}

export type CorpusContributionDecision =
  | 'not-requested' // klijent nije poslao privolu: nista se ne pohranjuje, nista se ne prijavljuje
  | 'disabled' // privola poslana, ali je znacajka na serveru iskljucena
  | 'anonymous' // privola poslana s anonimnog racuna: ne pohranjuje se, jer se ne bi mogla povuci
  | 'consent-outdated' // privola za zastarjelu ili nepoznatu verziju teksta
  | 'accepted';

export interface CorpusContributionInput {
  /** `meta.corpusConsent` iz zahtjeva za popravak; sve osim `{ version: string }` se cita kao ne-zahtjev. */
  requested: unknown;
  /** Zastavica na serveru (`CORPUS_CONTRIBUTION_ENABLED === '1'`). */
  enabled: boolean;
  /** `user.is_anonymous === true`. */
  anonymous: boolean;
}

/**
 * Odluka o prilogu korpusu. Popravak se NIKAD ne odbija zbog ovoga: odluka govori samo hoce li se kopija
 * pohraniti i sto ce odgovor reci korisniku. Redoslijed je namjeran: bez zahtjeva nista, pa zastavica, pa
 * anonimnost, pa verzija. Tako iskljucena znacajka nikad ne otkriva korisniku ni je li mu verzija teksta stara.
 */
export function decideCorpusContribution(input: CorpusContributionInput): CorpusContributionDecision {
  const version = (input.requested as { version?: unknown } | null | undefined)?.version;
  if (!input.requested || typeof version !== 'string') return 'not-requested';
  if (!input.enabled) return 'disabled';
  if (input.anonymous) return 'anonymous';
  if (version !== CORPUS_CONSENT_VERSION) return 'consent-outdated';
  return 'accepted';
}
