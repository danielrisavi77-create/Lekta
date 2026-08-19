/**
 * CLI: uskladi registar programa s registrom profila (docs/generated/program-reconcile.json).
 *
 *   npx vite-node scripts/reconcile-programs.mts
 *   npm run reconcile-programs
 *
 * Logika je u src/programs/reconcile.ts (cista funkcija, dijeljena s tests/program-reconcile.test.ts).
 * Izvjestaj imenuje, a ne samo broji: jedinice bez ijednog programa idu na popis, jer je "129" bez
 * imena podatak s kojim se ne moze raditi.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { allUnits } from '../src/catalog/catalog-loader';
import { reconcilePrograms } from '../src/programs/reconcile';
import { validateProgramRegistry, type ProgramRegistry } from '../src/programs/program-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const registry = JSON.parse(
  readFileSync(join(root, 'data', 'programs', 'program-registry.json'), 'utf8'),
) as ProgramRegistry;

const errors = validateProgramRegistry(registry);
if (errors.length) {
  console.error(`Registar programa nije ispravan (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const profiles = [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS].map((p) => ({
  id: p.id,
  unitId: (p as unknown as { unitId?: string }).unitId ?? null,
}));

const report = reconcilePrograms(
  registry,
  profiles,
  allUnits().map((u) => u.id),
);

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'docs', 'generated', 'program-reconcile.json'),
  JSON.stringify(report, null, 2) + '\n',
);

const s = report.summary;
console.log('=== Uskladjivanje programa i profila ===');
console.log(`programa: ${s.programCount} (povezano ${s.byProgramState.linked}, ceka profil ${s.byProgramState['needs-profile']}, izvan opsega ${s.byProgramState.unsupported})`);
console.log(`profila : ${s.profileCount} (povezano ${s.byProfileState.linked}, jedinica nije u registru ${s.byProfileState['unit-not-in-registry']}, nijedan program ih ne trazi ${s.byProfileState['unclaimed-by-program']})`);
console.log(`jedinica: ${s.unitCount}, BEZ ijednog programa: ${s.unitsWithoutPrograms}`);
console.log(`Upisnik sinkroniziran: ${s.upisnikSynced ? 'da' : 'NE'}`);
console.log('');
if (s.profilesUnclaimedInCoveredUnits) {
  const unclaimed = report.profiles.filter((p) => p.state === 'unclaimed-by-program');
  console.log(`NALAZ: ${unclaimed.length} profila u pokrivenim jedinicama nijedan program ne trazi:`);
  for (const p of unclaimed) console.log(`  - ${p.profileId} (${p.unitId})`);
  console.log('');
}
console.log('zapisano: docs/generated/program-reconcile.json');
