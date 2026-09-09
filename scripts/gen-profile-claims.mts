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
import { CLAIM_LADDER, PROOF_SOURCE_NOTE, type ClaimLevel, type ProofAxis, type ProofSource } from '../src/verification/completion-ledger';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface LedgerRow {
  profileId: string | null;
  unitId: string;
  workType: string;
  claim: ClaimLevel;
  claimLabel: string;
  proof: ProofAxis;
  proofSource: ProofSource | null;
}

const ledger = JSON.parse(
  readFileSync(join(root, 'docs/generated/completion-ledger.json'), 'utf8'),
) as { rows: LedgerRow[] };

const byProfile: Record<string, ClaimLevel> = {};
const conflicts: string[] = [];
/** Izvori dokaza po profilu, preko svih njegovih redaka (vrsta rada x program). */
const sourcesByProfile: Record<string, Set<ProofSource | 'none'>> = {};
/** Parovi `unitId::workType` po profilu i profili na kojima je dokaz stvarno IZMJEREN po paru (T05). */
const pairsByProfile: Record<string, Set<string>> = {};
const measuredByPair: Record<string, Set<string>> = {};

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
  (sourcesByProfile[row.profileId] ??= new Set()).add(row.proofSource ?? 'none');
  const pairKey = `${row.unitId}::${row.workType}`;
  (pairsByProfile[row.profileId] ??= new Set()).add(pairKey);
  if (row.proofSource === 'profile') (measuredByPair[pairKey] ??= new Set()).add(row.profileId);
}

/**
 * Profili razine A ciji je dokaz na stvarnom radu ISKLJUCIVO naslijedjen (svi redci `unit-work-type`,
 * nijedan izmjeren na samom profilu). Vanjski audit 2026-09-08 (nalaz 4): sucelje je istom recenicom
 * pokrivalo izmjereno i izvedeno; ovdje se popis pece da ga sucelje moze PREPISATI, a ne izvoditi.
 */
const inheritedA = Object.keys(byProfile)
  .filter((id) => byProfile[id] === 'A')
  .filter((id) => {
    const s = sourcesByProfile[id] ?? new Set();
    return s.has('unit-work-type') && !s.has('profile');
  })
  .sort();

/**
 * Za svaki naslijedjeni A profil: profili iste ustanove i vrste rada na kojima je dokaz IZMJEREN (T05,
 * `testedProfileIds`). Sucelje to prepisuje; prazan popis bi bio kvar (nasljedjuje se od nekoga), pa se staje.
 */
const inheritedFrom: Record<string, string[]> = {};
for (const id of inheritedA) {
  const tested = new Set<string>();
  for (const pair of pairsByProfile[id] ?? []) for (const src of measuredByPair[pair] ?? []) if (src !== id) tested.add(src);
  if (!tested.size) throw new Error(`naslijedjeni A profil ${id} nema izmjerenog izvora dokaza`);
  inheritedFrom[id] = [...tested].sort();
}

// Nazivnici imenovani: 407 iz registra + 3 pravne katedre = 410. Brojaci po slovu se daju ZASEBNO,
// jer se inace "D 34" (spoj nad registrom) i "D 37" (cijeli artefakt) razilaze bez objasnjenja.
const registryIds = new Set(
  (JSON.parse(readFileSync(join(root, 'data/profiles/verified-profiles.json'), 'utf8')) as Array<{ id: string }>).map((p) => p.id),
);
const departmentIds = new Set(
  (JSON.parse(readFileSync(join(root, 'data/profiles/legal-departments.json'), 'utf8')) as Array<{ id: string }>).map((d) => d.id),
);
const countsByRegistry: Record<string, number> = {};
const countsByLegalDepartment: Record<string, number> = {};
for (const [id, claim] of Object.entries(byProfile)) {
  if (registryIds.has(id)) countsByRegistry[claim] = (countsByRegistry[claim] ?? 0) + 1;
  else if (departmentIds.has(id)) countsByLegalDepartment[claim] = (countsByLegalDepartment[claim] ?? 0) + 1;
  else throw new Error(`profil ${id} nije ni u registru ni medju pravnim katedrama`);
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
  countsByRegistry,
  countsByLegalDepartment,
  /** Napomene uz razinu, doslovno iz ledgera (PROOF_SOURCE_NOTE); sucelje ih prepisuje. */
  proofNotes: PROOF_SOURCE_NOTE,
  /** Profili razine A s iskljucivo naslijedjenim dokazom (par jedinica x vrsta rada), sortirano. */
  inheritedA,
  /** Za svaki naslijedjeni A profil: profili na kojima je dokaz izmjeren (T05, `testedProfileIds`). */
  inheritedFrom,
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
