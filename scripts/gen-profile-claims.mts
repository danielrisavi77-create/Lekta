/**
 * Build-time generator JAVNE projekcije razine dokaza po profilu (SCOPE-01).
 *
 * Ljestvica A-E vec postoji i dobra je (`CLAIM_LADDER` u src/verification/completion-ledger.ts),
 * ali je do sada zivjela SAMO u docs/generated/completion-ledger.json, koji je pod
 * `data/generated/**` razredom i ne smije u preglednicki bundle. Zivi app je zato prikazivao
 * `profile-status.json` (verified/partial/research/generic), koji mjeri IZVOR PRAVILA, ne dokaz
 * popravka; profil s popravkom dokazanim samo na generiranom dokumentu (razina B) u sucelju je
 * pisao "Potvrdeni profil".
 *
 * Ovaj generator radi jednu stvar: PREPISUJE `claim` i `claimLabel` iz ledgera u malu javnu mapu
 * koju smije procitati preglednik. Label se NE srokuje ovdje. Taj ugovor je zapisan u
 * completion-ledger.ts (polje claimLabel) i nastao je iz stvarnog kvara: tvrdnja "potpuno
 * pokriveno" za profile kojima popravak nije ni pokrenut nastala je tako sto ju je generator
 * javne stranice sam sastavio.
 *
 * Nazivnici se ovdje i imenuju, jer se inace razilaze bez objasnjenja:
 *   436 redaka ledgera = po paru (profil, program); 3 retka nemaju profil (program bez profila)
 *   410 profila u ledgeru = 407 iz verified-profiles.json + 3 pravne katedre (legal-departments)
 *
 * Pokreni:  npx vite-node scripts/gen-profile-claims.mts
 * Drift izmedu pecene mape i ledgera hvata tests/profile-claims.test.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLAIM_LADDER, type ClaimLevel } from '../src/verification/completion-ledger';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface LedgerRow {
  profileId: string | null;
  claim: ClaimLevel;
  claimLabel: string;
}

const ledger = JSON.parse(
  readFileSync(join(root, 'docs/generated/completion-ledger.json'), 'utf8'),
) as { rows: LedgerRow[] };

const byProfile: Record<string, ClaimLevel> = {};
const conflicts: string[] = [];

for (const row of ledger.rows) {
  if (!row.profileId) continue;
  // Sanity: label MORA doslovno odgovarati ljestvici. Ako ledger ikad pocne srokovati vlastiti
  // tekst, to se mora vidjeti ovdje, a ne tek na javnoj stranici.
  if (row.claimLabel !== CLAIM_LADDER[row.claim]) {
    throw new Error(`ledger label ne odgovara ljestvici za ${row.profileId}: ${row.claimLabel}`);
  }
  const seen = byProfile[row.profileId];
  if (seen && seen !== row.claim) conflicts.push(row.profileId);
  byProfile[row.profileId] = row.claim;
}

// Profil s vise programa ima vise redaka. Danas nijedan nema proturjecne razine; ako se to
// promijeni, tisi izbor (zadnji redak pobjeduje) bio bi kvar, pa se ovdje staje.
if (conflicts.length) {
  throw new Error(`profili s proturjecnom razinom dokaza: ${[...new Set(conflicts)].join(', ')}`);
}

const counts: Record<string, number> = {};
for (const claim of Object.values(byProfile)) counts[claim] = (counts[claim] ?? 0) + 1;

const out = {
  schemaVersion: 1,
  napomena:
    'GENERIRANO (npx vite-node scripts/gen-profile-claims.mts) iz docs/generated/completion-ledger.json. ' +
    'Ne uredjuj rucno. Po profilu se biljezi SAMO slovo razine; tekst se cita iz polja ladder, koje je ' +
    'doslovno prepisano iz CLAIM_LADDER. Tako se ista recenica ne ponavlja 410 puta u bundleu (53 KB ' +
    'naspram 10 KB), a ugovor "label se prepisuje, nikad ne srokuje" ostaje na snazi.',
  ladder: CLAIM_LADDER,
  counts,
  byProfile,
};

writeFileSync(join(root, 'data/profiles/profile-claims.json'), JSON.stringify(out, null, 2) + '\n');
console.log(
  `profile-claims.json: ${Object.keys(byProfile).length} profila; ` +
    Object.entries(counts)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
);
