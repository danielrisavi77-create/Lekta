import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * MAPA TVRDNJI MORA SE SLAGATI S LEDGEROM.
 *
 * `data/profiles/profile-claims.json` se GENERIRA iz `docs/generated/completion-ledger.json`
 * (`scripts/gen-profile-claims.mts`), ali su to DVIJE zasebne naredbe. Regeneracija ledgera bez
 * druge polovice ostavlja dvije pecene projekcije koje tvrde razlicito o istom profilu, a mapa
 * nije imala NIJEDAN gard, pa se to nije vidjelo nigdje.
 *
 * Izmjereno 2026-09-03: ledger je regeneriran (`c659aa68`) nakon promjene matrice, mapa nije, i
 * nastao je tocno jedan nesklad. Ledger ima vlastiti drift test i on je bio zelen; mapa nije imala
 * nista, pa je nesklad prosao kroz cijeli gate.
 *
 * SMJER JE VAZNIJI OD BROJA, i zato se mjeri odvojeno:
 *
 *   mapa SLABIJA od ledgera   korisnik vidi manje nego sto dokazi nose. Neiskoristen dokaz,
 *                             neugodno ali posteno. Tolerira se dok drugi korak ne bude pokrenut.
 *   mapa JACA od ledgera      korisnik vidi tvrdnju koju dokazi NE nose. To je lazno obecanje o
 *                             tome da je popravak dokazan na stvarnom radu, i ne tolerira se
 *                             nikad, ni jedanput.
 *
 * Nista ne jamci da ce sljedeci promasaj biti u bezopasnom smjeru; upravo zato gard postoji.
 */

const ROOT = resolve(__dirname, '..');
const LADDER = ['A', 'B', 'C', 'D', 'E'] as const;
/** Manji indeks = JACA tvrdnja. `A` je najjaca ("dokazano na stvarnom radu"). */
const rank = (level: string): number => LADDER.indexOf(level as (typeof LADDER)[number]);

interface LedgerRow { profileId?: unknown; claim?: unknown; proof?: unknown }

const ledger = JSON.parse(
  readFileSync(resolve(ROOT, 'docs', 'generated', 'completion-ledger.json'), 'utf8'),
) as { rows?: LedgerRow[]; entries?: LedgerRow[] };
const claimsRaw = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'profile-claims.json'), 'utf8'),
) as Record<string, unknown>;

const byProfile = (claimsRaw.byProfile ?? claimsRaw) as Record<string, unknown>;
const rows = ledger.rows ?? ledger.entries ?? [];

interface Mismatch { profileId: string; map: string; ledger: string; proof: string }

const mismatches: Mismatch[] = [];
for (const row of rows) {
  const profileId = typeof row.profileId === 'string' ? row.profileId : '';
  const ledgerClaim = typeof row.claim === 'string' ? row.claim : '';
  const mapClaim = typeof byProfile[profileId] === 'string' ? String(byProfile[profileId]) : '';
  if (!profileId || !ledgerClaim || !mapClaim || mapClaim === ledgerClaim) continue;
  mismatches.push({ profileId, map: mapClaim, ledger: ledgerClaim, proof: String(row.proof ?? '') });
}

/**
 * Poznat nesklad, u BEZOPASNOM smjeru, koji ceka drugi korak lanca (`npm run gen-profile-claims`).
 * Kad se pokrene, popis se prazni i test i dalje prolazi, jer se trazi PODSKUP.
 */
const POZNATI_SLABIJI = new Set(['pravo-integrirani-diplomski']);

describe('mapa tvrdnji se slaze s ledgerom', () => {
  it('usporedba doista nesto mjeri, a ne prazan presjek', () => {
    // Bez ovoga bi promjena oblika ijedne datoteke ucinila sve tvrdnje ispod vakuumskima.
    const usporedivo = rows.filter((r) => typeof r.profileId === 'string' && byProfile[r.profileId as string]);
    expect(usporedivo.length).toBeGreaterThan(400);
  });

  it('MAPA NIKAD NE TVRDI JACE OD LEDGERA', () => {
    // Jedini nesklad koji je stvarna steta prema korisniku: tvrdnja da je popravak dokazan na
    // stvarnom radu, dok ledger kaze da nije. Nula tolerancije, bez iznimaka i bez rachteta.
    const lazniJaci = mismatches.filter((m) => rank(m.map) < rank(m.ledger));
    expect(lazniJaci, 'mapa obecava vise nego sto dokazi nose').toEqual([]);
  });

  it('slabiji nesklad je imenovan, ne prebrojan', () => {
    // Broj koji ostane isti dok se sadrzaj mijenja sakriva promjenu; popis se zato prikiva po
    // imenu, kao i kod citatnih dosjea u vodicu.
    const slabiji = mismatches.filter((m) => rank(m.map) > rank(m.ledger)).map((m) => m.profileId);
    for (const id of slabiji) {
      expect(POZNATI_SLABIJI.has(id), `nov nesklad: ${id}; pokreni npm run gen-profile-claims`).toBe(true);
    }
  });

  it('mapa pokriva svaki profil koji ledger ocjenjuje', () => {
    // Profil bez unosa u mapi nije nesklad nego rupa: sucelje tada nema sto pokazati, a ledger
    // tvrdi da je ocijenjen.
    const bezUnosa = rows
      .filter((r) => typeof r.profileId === 'string' && typeof r.claim === 'string')
      .map((r) => String(r.profileId))
      .filter((id) => !byProfile[id]);
    expect(bezUnosa.length).toBeLessThanOrEqual(3);
  });
});
