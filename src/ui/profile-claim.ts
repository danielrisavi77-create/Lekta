/**
 * Razina dokaza profila (A-E) za zivo sucelje. SCOPE-01.
 *
 * ZASTO POSTOJI: do sada je aplikacija prikazivala samo `profile-status.json`
 * (verified/partial/research/generic), koji mjeri IZVOR PRAVILA. Je li popravak ikad dokazan na
 * dokumentu mjeri druga os, `claim` iz completion ledgera, i ona u sucelju nije postojala. Zbog
 * toga je profil kojem je popravak dokazan samo na GENERIRANOM dokumentu (razina B) pisao
 * "Potvrdeni profil", a razina A (dokazano na stvarnom radu) ima danas nula profila od 410.
 *
 * UGOVOR: tekst se PREPISUJE iz ljestvice, nikad ne srokuje ovdje. Artefakt zato po profilu nosi
 * samo slovo, a recenicu jednom, u polju `ladder`. Taj ugovor nije stilski: tvrdnja "potpuno
 * pokriveno" za profile kojima popravak nije ni pokrenut nastala je tako sto ju je generator
 * javne stranice sam sastavio (vidi completion-ledger.ts, polje claimLabel).
 *
 * Ledger sam (`docs/generated/completion-ledger.json`) NE smije u preglednicki bundle
 * (`data/generated/**` je forbidden u klasifikacijskom manifestu), pa se cita pecena projekcija.
 */
import claims from '../../data/profiles/profile-claims.json';

export type ClaimLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ProfileClaim {
  /** Slovo razine; sluzi kao kratka oznaka i kao kljuc ljestvice. */
  claim: ClaimLetter;
  /** Doslovan tekst iz ljestvice. Nikad sastavljen u sucelju. */
  label: string;
}

const ARTIFACT = claims as unknown as {
  ladder: Record<string, string>;
  byProfile: Record<string, ClaimLetter>;
};

/**
 * Razina dokaza za profil, ili `null` kad profila nema (opca provjera, nepoznat id).
 * `null` je namjerno tih: odsutnost profila vec je vidljiva kroz status, a lazna razina bila bi
 * gora od nikakve.
 */
export function profileClaimFor(profileId: string | null | undefined): ProfileClaim | null {
  if (!profileId) return null;
  const claim = ARTIFACT.byProfile[profileId];
  if (!claim) return null;
  const label = ARTIFACT.ladder[claim];
  if (!label) return null;
  return { claim, label };
}

/** Recenica za prikaz uz profil. Prefiks je oznaka polja, ostatak je doslovan tekst ljestvice. */
export function claimSentence(claim: ProfileClaim | null): string {
  return claim ? `Razina dokaza ${claim.claim}: ${claim.label}.` : '';
}
