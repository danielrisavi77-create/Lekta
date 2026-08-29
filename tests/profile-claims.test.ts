/**
 * Drift + vjernost guard za JAVNU projekciju razine dokaza (SCOPE-01).
 *
 * `data/profiles/profile-claims.json` je jedini put kojim razina A-E iz completion ledgera dolazi
 * do preglednika: sam ledger zivi pod `data/generated/**`, koji je klasifikacijskim manifestom
 * zabranjen u bundleu.
 *
 * Artefakt po profilu nosi SAMO slovo, a tekst jednom, u polju `ladder`. To nije samo ustednja
 * (14 KB naspram 65 KB): tako je nemoguce da jedan profil dobije "ljepsi" tekst od drugog s istom
 * razinom. Ugovor "label se prepisuje iz ledgera, nikad ne srokuje" time postaje strukturan,
 * a ne stvar discipline. Ugovor postoji jer je tvrdnja "potpuno pokriveno" za profile kojima
 * popravak nije ni pokrenut nastala upravo tako sto ju je generator javne stranice sam sastavio.
 */
import { describe, it, expect } from 'vitest';
import baked from '../data/profiles/profile-claims.json';
import ledger from '../docs/generated/completion-ledger.json';
import registry from '../data/profiles/verified-profiles.json';
import legalDepartments from '../data/profiles/legal-departments.json';
import { CLAIM_LADDER, type ClaimLevel } from '../src/verification/completion-ledger';

interface Row {
  profileId: string | null;
  claim: ClaimLevel;
  claimLabel: string;
}

const rows = (ledger as { rows: Row[] }).rows;
const art = baked as unknown as {
  ladder: Record<string, string>;
  counts: Record<string, number>;
  byProfile: Record<string, ClaimLevel>;
};

/** Ista logika kao scripts/gen-profile-claims.mts (izvor istine za pecenje). */
function expectedByProfile(): Record<string, ClaimLevel> {
  const out: Record<string, ClaimLevel> = {};
  for (const row of rows) if (row.profileId) out[row.profileId] = row.claim;
  return out;
}

describe('profile-claims.json: drift prema ledgeru', () => {
  it('pecena mapa je identicna izracunu iz ledgera', () => {
    expect(art.byProfile).toEqual(expectedByProfile());
  });

  it('ljestvica u artefaktu je identicna CLAIM_LADDER', () => {
    expect(art.ladder).toEqual(CLAIM_LADDER);
  });

  it('brojaci u artefaktu odgovaraju sadrzaju', () => {
    const counts: Record<string, number> = {};
    for (const claim of Object.values(art.byProfile)) counts[claim] = (counts[claim] ?? 0) + 1;
    expect(art.counts).toEqual(counts);
  });
});

describe('profile-claims.json: vjernost tvrdnje', () => {
  it('svaki label koji ledger pripisuje razini je doslovno onaj iz ljestvice', () => {
    expect(rows.length).toBeGreaterThan(400);
    const srokovani = rows
      .filter((r) => r.claimLabel !== CLAIM_LADDER[r.claim])
      .map((r) => `${r.profileId}: ${r.claimLabel}`);
    expect(srokovani).toEqual([]);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmetnut je tocno onaj kvar zbog kojeg ugovor postoji:
   * netko srokce "ljepsi" tekst umjesto da ga prepise iz ljestvice. Obje grane su dokazane.
   */
  it('gard na srocen label stvarno grize', () => {
    const provjeri = (r: Row[]) => r.filter((x) => x.claimLabel !== CLAIM_LADDER[x.claim]);
    expect(provjeri(rows), 'baseline: nemutiran ledger je cist').toEqual([]);
    const mutiran: Row[] = [{ ...rows[0], claimLabel: 'potpuno pokriveno' }, ...rows.slice(1)];
    expect(provjeri(mutiran).length).toBe(1);
  });
});

describe('profile-claims.json: nazivnici su imenovani', () => {
  const registryIds = (registry as Array<{ id: string }>).map((p) => p.id);
  const departmentIds = (legalDepartments as Array<{ id: string }>).map((d) => d.id);

  it('410 profila u ledgeru = 407 iz registra + 3 pravne katedre', () => {
    expect(registryIds.length + departmentIds.length).toBe(Object.keys(art.byProfile).length);
  });

  it('svaki profil iz registra ima razinu dokaza', () => {
    expect(registryIds.filter((id) => !(id in art.byProfile))).toEqual([]);
  });

  it('nijedan profil nema proturjecnu razinu kroz svoje programe', () => {
    const po: Record<string, Set<string>> = {};
    for (const row of rows) {
      if (!row.profileId) continue;
      (po[row.profileId] ??= new Set()).add(row.claim);
    }
    const proturjecni = Object.entries(po)
      .filter(([, s]) => s.size > 1)
      .map(([id]) => id);
    expect(proturjecni).toEqual([]);
  });
});
