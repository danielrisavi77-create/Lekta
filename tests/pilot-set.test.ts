/**
 * Guard nad odlukom o pilot skupini (SCOPE-01).
 *
 * `data/profiles/pilot-set.json` je AUTORSKI zapis: koje profile smijemo promovirati u javnoj
 * beti. Opasnost nije da netko upise krivi profil nego da popis tiho postane popis zelja:
 * `ready: true` se rucno preklopi, brojevi zastare, a razina dokaza se prepise ljepsom.
 *
 * Zato ovaj test ne provjerava ukus nego SLAGANJE s izmjerenim izvorima:
 *  (1) svaki navedeni profil stvarno postoji,
 *  (2) zapisana razina dokaza je identicna onoj iz completion ledgera (profile-claims.json),
 *  (3) `ready` se IZVODI iz kriterija, pa ga rucni preklop ne moze proizvesti,
 *  (4) profil je u tocno jednom popisu, a izuzece uvijek nosi razlog.
 */
import { describe, it, expect } from 'vitest';
import pilot from '../data/profiles/pilot-set.json';
import claims from '../data/profiles/profile-claims.json';
import registry from '../data/profiles/verified-profiles.json';

interface Entry {
  profileId: string;
  unitId: string;
  realDocuments?: number;
  realPass?: number;
  ready?: boolean;
  blockers?: string[];
  reason: string;
}

const set = pilot as unknown as {
  decidedBy: string;
  decidedAt: string;
  criteria: { minRealDocuments: number; minRealPass: number; minClaim: string; requiresVisualReview: boolean };
  wave1: Entry[];
  wave2: Entry[];
  excluded: Entry[];
};

// Artefakt po profilu nosi SAMO slovo razine; tekst zivi jednom, u polju `ladder`.
const byProfile = (claims as unknown as { byProfile: Record<string, string> }).byProfile;
/** Razina dokaza dolazi ISKLJUCIVO iz ledgera; pilot je vise ne pohranjuje. */
const claimOf = (e: Entry): string => byProfile[e.profileId] ?? '';
const registryIds = new Set((registry as Array<{ id: string }>).map((p) => p.id));
const all = [...set.wave1, ...set.wave2, ...set.excluded];

/** Ljestvica ide od najjace (A) prema najslabijoj (E), pa je "barem B" = A ili B. */
const LADDER_ORDER = ['A', 'B', 'C', 'D', 'E'];
function meetsMinClaim(claim: string, min: string): boolean {
  return LADDER_ORDER.indexOf(claim) >= 0 && LADDER_ORDER.indexOf(claim) <= LADDER_ORDER.indexOf(min);
}

describe('pilot-set.json: slaganje s izvorima', () => {
  it('svaki navedeni profil postoji u registru', () => {
    expect(all.length).toBeGreaterThan(0);
    const nepostojeci = all.filter((e) => !registryIds.has(e.profileId)).map((e) => e.profileId);
    expect(nepostojeci).toEqual([]);
  });

  /**
   * Razina dokaza se IZVODI iz ledgera, ne upisuje u ovu datoteku.
   *
   * Do 2026-09-04 je svaki unos nosio vlastiti `claim`, koji je bio kopija `profile-claims.json`.
   * Kopija se raziđe cim se generirana strana pomakne, a osvjeziti je moze samo covjek koji se
   * sjeti; jednom se to i dogodilo i oborilo gate. Sada raskoraka NEMA JER GA NEMA GDJE BITI, pa je
   * jedino sto se moze pokvariti profil kojeg ledger uopce ne poznaje.
   *
   * Isto nacelo koje ova datoteka vec primjenjuje na `ready` ("izvodi se, ne upisuje").
   */
  it('svaki profil iz pilota postoji u ledgeru, pa se razina moze izvesti', () => {
    const nepoznati = all.filter((e) => !(e.profileId in byProfile)).map((e) => e.profileId);
    expect(nepoznati, 'bez zapisa u ledgeru razina se ne moze izvesti').toEqual([]);
  });

  /**
   * NEGATIVNA KONTROLA: bez nje bi tvrdnja iznad prolazila i da detektor ne gleda nista, jer je
   * ocekivani rezultat prazan popis. Podmece se profil kojeg ledger ne poznaje.
   */
  it('detektor prijavi profil kojeg ledger ne poznaje', () => {
    const podmetnut = [...all, { profileId: 'ne-postoji-u-ledgeru', unitId: 'x', reason: 'kontrola' } as Entry];
    const nepoznati = podmetnut.filter((e) => !(e.profileId in byProfile)).map((e) => e.profileId);
    expect(nepoznati).toEqual(['ne-postoji-u-ledgeru']);
  });

  it('profil je u tocno jednom popisu', () => {
    const ids = all.map((e) => e.profileId);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('svaki zapis nosi razlog, a izuzeti profili imaju razinu u ledgeru', () => {
    for (const e of all) expect(e.reason.length, e.profileId).toBeGreaterThan(20);
    for (const e of set.excluded) expect(claimOf(e), e.profileId).toBeTruthy();
  });

  it('odluka je potpisana i datirana', () => {
    expect(set.decidedBy.length).toBeGreaterThan(3);
    expect(set.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pilot-set.json: `ready` se izvodi, ne upisuje', () => {
  /** Ista pravila kao `criteria` u datoteci; jedini izvor istine za zastavicu. */
  function derivedReady(e: Entry): boolean {
    if (!meetsMinClaim(claimOf(e), set.criteria.minClaim)) return false;
    if ((e.realDocuments ?? 0) < set.criteria.minRealDocuments) return false;
    if ((e.realPass ?? 0) < set.criteria.minRealPass) return false;
    // Razina A trazi vizualni pregled, a njegov zapis jos ne postoji ni za jedan profil.
    if (set.criteria.requiresVisualReview) return false;
    return true;
  }

  it('nijedan profil nije oznacen spremnim mimo kriterija', () => {
    const lazno = set.wave1.filter((e) => e.ready === true && !derivedReady(e)).map((e) => e.profileId);
    expect(lazno).toEqual([]);
  });

  it('svaki nespreman profil imenuje sto mu tocno fali', () => {
    for (const e of set.wave1) {
      if (e.ready) continue;
      expect(e.blockers?.length, `${e.profileId} nema imenovanu prepreku`).toBeGreaterThan(0);
    }
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmetnut kvar je tocno onaj koji se u praksi dogada:
   * netko preklopi `ready: true` na profilu koji nema ni deset dokumenata ni jedan prolaz.
   */
  it('gard na rucno preklopljen `ready` stvarno grize', () => {
    expect(set.wave1.filter((e) => e.ready === true && !derivedReady(e)), 'baseline je cist').toEqual([]);
    const slab = set.wave1.find((e) => (e.realDocuments ?? 0) < set.criteria.minRealDocuments);
    expect(slab, 'postoji profil koji ne zadovoljava kriterij').toBeDefined();
    const mutiran = { ...(slab as Entry), ready: true };
    expect(mutiran.ready === true && !derivedReady(mutiran)).toBe(true);
  });
});
