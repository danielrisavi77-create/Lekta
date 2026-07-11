/**
 * Privola za cloud integritetsku provjeru (Faza 4, odluka A). Ovo je JEDINI korak koji salje
 * tekst rada izvan preglednika, pa trazi zasebnu, eksplicitnu privolu (odvojenu od checkout
 * privole). Po uzoru na CheckoutConsent (src/report/checkout.ts): trajno se biljezi tocan tekst,
 * timestamp i verzija uvjeta uz zapis provjere (integrity_checks.consent, migracija 0018).
 *
 * Obveze u tekstu: (1) salje se cijeli tekst rada, (2) cuva se kratko (RETENTION_DAYS) pa se
 * automatski brise, (3) NIKAD se ne koristi za treniranje. Bez ove privole tekst se ne salje.
 */

/** Retencija sirovog poslanog teksta u danima (odluka foundera: kratko zadrzavanje). */
export const INTEGRITY_RETENTION_DAYS = 7;

export interface IntegrityConsent {
  /** Pristanak da se cijeli tekst rada posalje posluzitelju radi provjere. */
  sendsFullText: true;
  /** Koliko se dana sirovi tekst cuva prije automatskog brisanja. */
  retentionDays: number;
  /** Potvrda da se tekst NE koristi za treniranje modela. */
  notForTraining: true;
  /** Tocan tekst privole koji je korisnik vidio i oznacio. */
  text: string;
  /** ISO 8601 timestamp trenutka privole. */
  timestamp: string;
  /** Verzija Uvjeta na snazi u trenutku privole. */
  termsVersion: string;
}

/** Tekst privole za dani broj dana retencije. Iskren o tome sto se salje i koliko se cuva. */
export function integrityConsentText(retentionDays: number = INTEGRITY_RETENTION_DAYS): string {
  return (
    'Za provjeru izvornosti (plagijat, prijevodni plagijat i AI-signal) salje se cijeli tekst ovog rada ' +
    'nasem posluzitelju. Format, struktura i citati i dalje se analiziraju lokalno; samo ova provjera salje tekst. ' +
    `Poslani tekst cuva se najvise ${retentionDays} dana radi ponovnog uvida, zatim se automatski brise. ` +
    'Tekst se nikad ne koristi za treniranje modela. Privola je dobrovoljna i mozes je uskratiti.'
  );
}

/** Sastavi zapis privole (timestamp injektabilan radi testabilnosti). */
export function buildIntegrityConsent(opts: {
  timestamp: string;
  termsVersion: string;
  retentionDays?: number;
}): IntegrityConsent {
  const retentionDays = opts.retentionDays ?? INTEGRITY_RETENTION_DAYS;
  return {
    sendsFullText: true,
    retentionDays,
    notForTraining: true,
    text: integrityConsentText(retentionDays),
    timestamp: opts.timestamp,
    termsVersion: opts.termsVersion,
  };
}
