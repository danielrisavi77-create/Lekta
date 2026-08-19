/**
 * Jednokratan, IDEMPOTENTAN seed registra studijskih programa iz zatecenih podataka.
 *
 *   npx vite-node scripts/seed-program-registry.mts [--dry]
 *
 * Izvor je `data/coverage/institutional-coverage-matrix.json`: 35 programa nad dvije jedinice
 * (fpzg, pravo). Ti su zapisi izvedeni sa STRANICA STUDIJA, ne iz Upisnika, pa svi dobivaju
 * `provenance.kind = 'faculty-page'` i `officialProgramCode: null`. Polja koja zna samo Upisnik
 * (sifra, jezik, nacin izvodjenja, jedno/dvopredmetnost, akademska godina) ostaju `null`: shema
 * ih trazi, ali ih ovaj izvor NE SADRZI i nagadjanje bi ih ucinilo neistinitima.
 *
 * Skripta NIKAD ne prepisuje postojeci zapis: jednom kad covjek ili harvest upisu tocniji podatak,
 * ponovno pokretanje ga ne smije vratiti na seed vrijednost. Dodaje samo ono cega nema.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateProgramRegistry,
  type ProgramRecord,
  type ProgramRegistry,
  type ProgramLevel,
  type UnsupportedReason,
} from '../src/programs/program-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'programs', 'program-registry.json');
const dry = process.argv.includes('--dry');

interface LegacyProgram {
  id: string;
  unitId: string;
  name: string;
  level: string;
  expectedWorkTypes: string[];
  expectedProfileIds: string[];
  scope: string;
  source?: string;
  note?: string;
}

const legacy = JSON.parse(
  readFileSync(join(root, 'data', 'coverage', 'institutional-coverage-matrix.json'), 'utf8'),
) as { verifiedAt: string; programs: LegacyProgram[] };

const existing: ProgramRegistry = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, 'utf8')) as ProgramRegistry)
  : { schemaVersion: 1, upisnikSynced: false, programs: [] };
const byId = new Map(existing.programs.map((p) => [p.id, p]));

const LEVELS = new Set<string>([
  'prijediplomski',
  'diplomski',
  'integrirani',
  'specijalistički',
  'doktorski',
  'združeni',
  'stručni prijediplomski',
  'stručni diplomski',
]);

/**
 * `scope` iz stare matrice nosi jedini nagovjestaj o partnerstvu; `partner` i `joint` znace da
 * program izvodi jos netko, pa mu profil ne mora pripadati nama. Ne pretvaramo to automatski u
 * `unsupportedReason` osim kad program doista nema profil - inace bismo odlucili umjesto covjeka.
 */
function reasonFor(program: LegacyProgram): UnsupportedReason | null {
  if (program.expectedProfileIds.length) return null;
  return program.scope === 'partner' || program.scope === 'joint' ? 'external-institution' : 'pending-port';
}

let added = 0;
for (const program of legacy.programs) {
  if (byId.has(program.id)) continue;
  const record: ProgramRecord = {
    id: program.id,
    officialInstitutionId: null,
    componentId: program.unitId,
    officialProgramCode: null,
    name: program.name,
    level: LEVELS.has(program.level) ? (program.level as ProgramLevel) : null,
    track: null,
    language: null,
    deliveryMode: null,
    jointPartner: program.scope === 'partner' || program.scope === 'joint' ? 'nije zabiljezen' : null,
    subjectCount: null,
    academicYear: null,
    ruleVersion: null,
    status: 'active',
    expectedWorkTypes: program.expectedWorkTypes ?? [],
    expectedProfileIds: program.expectedProfileIds ?? [],
    unsupportedReason: reasonFor(program),
    provenance: {
      kind: 'faculty-page',
      sourceId: null,
      sourceUrl: program.source ?? null,
      sourcePage: null,
      snapshotHash: null,
      verifiedAt: legacy.verifiedAt ?? null,
      note: program.note || undefined,
    },
  };
  byId.set(program.id, record);
  added += 1;
}

const registry: ProgramRegistry = {
  schemaVersion: 1,
  upisnikSynced: false,
  programs: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

const errors = validateProgramRegistry(registry);
if (errors.length) {
  console.error(`Registar nije ispravan (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (!dry) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(registry, null, 2) + '\n');
}

console.log('=== Seed registra programa ===');
console.log(`ukupno: ${registry.programs.length}, novo dodano: ${added}${dry ? ' (dry)' : ''}`);
console.log(`bez profila (uz razlog): ${registry.programs.filter((p) => !p.expectedProfileIds.length).length}`);
console.log(`sinkronizirano s Upisnikom: ${registry.upisnikSynced ? 'da' : 'NE (faza P1-2)'}`);
