/**
 * Privola za Provjeru prije predaje (preflight). Kalup: integrity-consent.ts,
 * ali ZASEBAN tip i tekst jer se salje DATOTEKA (ne tekst), retencija datoteke
 * je 0 (brise se odmah), a nalaz s kratkim isjeccima zivi 7 dana.
 *
 * JEDAN kanonski tip za obje strane: importaju ga klijent (buildPreflightConsent)
 * i Edge preflight-start (validacija istih polja). Literal true tipovi
 * prisiljavaju eksplicitnost; bez valjane privole datoteka se ne salje
 * (enforcement i u klijentu i na serveru, kao kod integriteta).
 *
 * Tekst je ISTINIT po planu (adversarijalna kritika #3): ne obecava "nista se
 * ne cuva" jer se zapis privole i statistika cuvaju trajno, a nalaz 7 dana.
 */

/** Retencija pohranjenog nalaza (result_full) u danima; nakon toga pg_cron purge. */
export const PREFLIGHT_RESULT_RETENTION_DAYS = 7;

export interface PreflightConsent {
  /** Pristanak da se cijela .docx datoteka (s metapodacima) posalje posluzitelju. */
  sendsFullFile: true;
  /** Datoteka se brise odmah nakon analize; ne pohranjuje se ni u kojem obliku. */
  deleteAfterAnalysis: true;
  /** Koliko se dana nalaz (s kratkim isjeccima iz rada) cuva prije brisanja. */
  resultRetentionDays: number;
  /** Bibliografski podaci literature provjeravaju se u javnim bazama (NCBI je u SAD-u). */
  bibliographicLookup: true;
  /** Izjava: rad je posiljateljev ili ima pravo poslati ga na provjeru. */
  ownWork: true;
  /** Sadrzaj se nikad ne koristi za treniranje modela. */
  notForTraining: true;
  /** Tocan tekst privole koji je korisnik vidio i oznacio. */
  text: string;
  /** ISO 8601 timestamp trenutka privole. */
  timestamp: string;
  /** Verzija Uvjeta na snazi u trenutku privole. */
  termsVersion: string;
}

/** Tekst privole. Iskren o svakom sloju pohrane; bez em i en crtica. */
export function preflightConsentText(
  retentionDays: number = PREFLIGHT_RESULT_RETENTION_DAYS,
): string {
  return (
    'Za Provjeru prije predaje šalje se cijela Word datoteka rada, zajedno s njezinim ' +
    'metapodacima, na Lektin poslužitelj u Europskoj uniji. Datoteka se analizira i briše ' +
    'odmah nakon analize; ne pohranjuje se. ' +
    `Nalaz provjere, koji sadrži kratke isječke iz rada, čuva se najviše ${retentionDays} dana ` +
    'radi ponovnog uvida pa se automatski briše; sigurnosne kopije baze mogu podatke zadržati ' +
    'kratko dodatno razdoblje. Trajno se čuvaju samo zapis ove privole i statistika nalaza, ' +
    'bez teksta rada. Radi provjere postojanja referenci, bibliografski podaci iz popisa ' +
    'literature (autor, naslov, godina, DOI) šalju se javnim bazama Crossref, OpenAlex i ' +
    'PubMed (NCBI, SAD); njima se nikad ne šalje tekst rada. Sadržaj se nikad ne koristi za ' +
    'treniranje modela. Potvrđujem da je rad moj ili da imam pravo poslati ga na provjeru ' +
    'te da dokument ne sadrži osobne podatke trećih osoba koje nemam pravo obraditi. ' +
    'Privola je dobrovoljna; bez nje se datoteka ne šalje, a lokalna provjera oblikovanja ' +
    'radi i dalje.'
  );
}

/** Sastavi zapis privole (timestamp injektabilan radi testabilnosti). */
export function buildPreflightConsent(opts: {
  timestamp: string;
  termsVersion: string;
  retentionDays?: number;
}): PreflightConsent {
  const retentionDays = opts.retentionDays ?? PREFLIGHT_RESULT_RETENTION_DAYS;
  return {
    sendsFullFile: true,
    deleteAfterAnalysis: true,
    resultRetentionDays: retentionDays,
    bibliographicLookup: true,
    ownWork: true,
    notForTraining: true,
    text: preflightConsentText(retentionDays),
    timestamp: opts.timestamp,
    termsVersion: opts.termsVersion,
  };
}

/** Serverska/klijentska provjera: sva obavezna literal-true polja su stvarno true. */
export function isValidPreflightConsent(consent: unknown): consent is PreflightConsent {
  const c = consent as Record<string, unknown> | null;
  return !!c
    && c.sendsFullFile === true
    && c.deleteAfterAnalysis === true
    && c.bibliographicLookup === true
    && c.ownWork === true
    && c.notForTraining === true
    && typeof c.text === 'string' && c.text.length > 0
    && typeof c.timestamp === 'string'
    && typeof c.termsVersion === 'string';
}
