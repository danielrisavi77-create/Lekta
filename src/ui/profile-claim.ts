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
  /**
   * Za razinu A: je li dokaz na stvarnom radu izmjeren na OVOM profilu (`direct`) ili naslijedjen od
   * drugog profila iste ustanove i iste vrste rada (`inherited`). `null` za ostale razine.
   *
   * Vanjski audit 2026-09-08 (nalaz 4): od 31 A profila 19 je nasljedjivalo dokaz, a sucelje ih je
   * pokrivalo istom recenicom kao i 12 izmjerenih. Popis naslijedjenih se PREPISUJE iz artefakta
   * (`inheritedA`, pecen iz ledgera), ne izvodi ovdje.
   */
  proof: 'direct' | 'inherited' | null;
  /** Napomena uz naslijedjen dokaz, doslovno iz ledgera (PROOF_SOURCE_NOTE); prazna inace. */
  note: string;
  /**
   * Osnova dokaza kao JEDNA os za sve razine (plan T05): `direct` (A, izmjereno na ovom profilu),
   * `inherited` (A, izmjereno na drugom profilu iste ustanove i vrste rada), `synthetic` (B, popravak dokazan
   * samo na generiranom dokumentu), `not-demonstrated` (C, D, E). Razina A do E ostaje zasebna dimenzija.
   */
  evidenceBasis: EvidenceBasis;
  /** Profili na kojima je dokaz STVARNO izmjeren; za `inherited` nikad ne sadrzi ovaj profil. Prazno inace. */
  testedProfileIds: string[];
}

export type EvidenceBasis = 'direct' | 'inherited' | 'synthetic' | 'not-demonstrated';

const ARTIFACT = claims as unknown as {
  ladder: Record<string, string>;
  byProfile: Record<string, ClaimLetter>;
  proofNotes?: Record<string, string>;
  inheritedA?: string[];
  inheritedFrom?: Record<string, string[]>;
};

const INHERITED_A = new Set(ARTIFACT.inheritedA ?? []);

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
  if (claim !== 'A') {
    return { claim, label, proof: null, note: '', evidenceBasis: claim === 'B' ? 'synthetic' : 'not-demonstrated', testedProfileIds: [] };
  }
  const inherited = INHERITED_A.has(profileId);
  const tested = inherited ? (ARTIFACT.inheritedFrom?.[profileId] ?? []).filter((id) => id !== profileId) : [profileId];
  return {
    claim,
    label,
    proof: inherited ? 'inherited' : 'direct',
    note: inherited ? (ARTIFACT.proofNotes?.['unit-work-type'] ?? '') : '',
    evidenceBasis: inherited ? 'inherited' : 'direct',
    testedProfileIds: tested,
  };
}

/**
 * Recenica za prikaz uz profil. Prefiks je oznaka polja, ostatak je doslovan tekst ljestvice; za
 * naslijedjen dokaz slijedi napomena, takodjer doslovna iz ledgera.
 */
export function claimSentence(claim: ProfileClaim | null): string {
  if (!claim) return '';
  const base = `Razina dokaza ${claim.claim}: ${claim.label}.`;
  const basis = BASIS_NOTE[claim.evidenceBasis];
  const inherited = claim.proof === 'inherited' && claim.note ? ` ${claim.note}` : '';
  return `${base}${inherited}${basis ? ` ${basis}` : ''}`;
}

/**
 * Sto osnova dokaza znaci za KORISNIKA (plan T05): za B da je dokument na kojem je popravak dokazan generiran,
 * za C, D i E gdje je stvarna granica provjere i popravka. Recenica ljestvice ostaje doslovna; ovo je dodatak
 * o OSNOVI, ne parafraza razine. Za `direct` nema dodatka: ljestvica vec kaze "dokazano na stvarnom radu".
 * Za `inherited` napomenu nosi ledger (`note`), pa se ovdje ne ponavlja.
 */
const BASIS_NOTE: Record<EvidenceBasis, string> = {
  direct: '',
  inherited: '',
  synthetic: 'Dokument na kojem je popravak dokazan je generiran, nije stvaran studentski rad.',
  'not-demonstrated': 'Provjera vrijedi; automatski popravak za ovaj profil nije dokazan ni na jednom dokumentu, pa ga treba pregledati u Wordu.',
};

/**
 * JEDNA oznaka razine dokaza za kartici profila I za zaglavlje rezultata (plan T05: "na kartici profila i u
 * rezultatu prikazati istu projekciju"). Oba mjesta zovu ovu funkciju, pa ne mogu odlutati. Atributi nose
 * osnovu i slovo strojno citljivo (testovi, stilovi); vidljivi tekst je kratak, puna recenica je u `title`.
 */
export function claimBadgeHtml(claim: ProfileClaim | null, esc: (v: string) => string): string {
  if (!claim) return '';
  return `<span class="profile-status evidence" data-evidence-claim="${esc(claim.claim)}" data-evidence-basis="${esc(claim.evidenceBasis)}" title="${esc(claimSentence(claim))}">Razina dokaza ${esc(claim.claim)}</span>`;
}
