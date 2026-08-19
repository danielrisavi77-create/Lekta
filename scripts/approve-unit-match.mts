/**
 * CLI: ljudsko potvrdjivanje uparivanja sastavnica Upisnika s nasim jedinicama (P1-6).
 *
 *   npm run approve-unit-match -- --list                     (sve sto ceka odluku)
 *   npm run approve-unit-match -- --list --confidence weak   (samo slabi prijedlozi)
 *   npm run approve-unit-match -- --list --confidence none   (samo bez para)
 *   npm run approve-unit-match -- "<izvoditelj>" --unit riteh --by "Ime Prezime"
 *   npm run approve-unit-match -- "<izvoditelj>" --no-unit foreign-institution --by "Ime Prezime"
 *   npm run approve-unit-match -- --accept-exact --by "Ime Prezime"   (skupno, oznaceno bulk)
 *
 * Odluke se pisu u `data/programs/unit-match-decisions.json` (autorski sloj). Prijedlog stroja u
 * `docs/generated/` se regenerira i NIKAD ne pregazi odluku.
 *
 * Skupno odobrenje je dopusteno, ali ostaje VIDLJIVO kao skupno (`bulk: true`). Verifikacijski
 * worklist je zatekao 38 pravila koja su izgledala potvrdjeno a bila su odobrena skupno; ako se ta
 * razlika ne zapise u trenutku odluke, kasnije se ne moze rekonstruirati.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import {
  validateDecisions,
  decisionCoverage,
  upsertDecision,
  NO_UNIT_REASONS,
  type DecisionFile,
  type NoUnitReason,
  type UnitMatchDecision,
} from '../src/programs/unit-match-decisions';
import type { MatchReport } from '../src/programs/unit-match';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DECISIONS = join(root, 'data', 'programs', 'unit-match-decisions.json');

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? (argv[i + 1] ?? '') : null;
};
const has = (name: string): boolean => argv.includes(`--${name}`);

const report = JSON.parse(
  readFileSync(join(root, 'docs', 'generated', 'upisnik-unit-match.json'), 'utf8'),
) as MatchReport;

const file: DecisionFile = existsSync(DECISIONS)
  ? (JSON.parse(readFileSync(DECISIONS, 'utf8')) as DecisionFile)
  : { schemaVersion: 1, decisions: [] };

const knownUnitIds = new Set(ZAGREB_CATALOG.flatMap((i) => i.units.map((u) => u.id)));
const knownExecutors = new Set(report.proposals.map((p) => p.executor));
const coverage = decisionCoverage(report.proposals, file);

// --- ispis stanja ---
if (has('list') || !argv.length) {
  const wanted = flag('confidence');
  const pending = report.proposals
    .filter((p) => coverage.pendingExecutors.includes(p.executor))
    .filter((p) => !wanted || (p.match?.confidence ?? 'none') === wanted)
    .sort((a, b) => b.programCount - a.programCount);

  console.log('=== Uparivanje sastavnica: stanje odluka ===');
  console.log(`odluceno ${coverage.decided}/${coverage.total}, ceka ${coverage.pending}` +
    `${coverage.bulkDecided ? `, od toga skupno ${coverage.bulkDecided}` : ''}` +
    `${coverage.overrides ? `, covjek odstupio od stroja ${coverage.overrides}x` : ''}`);
  console.log('');
  console.log(`CEKA ODLUKU${wanted ? ` (pouzdanost: ${wanted})` : ''}: ${pending.length}`);
  for (const p of pending.slice(0, 40)) {
    const proposed = p.match ? `${p.match.unitId} [${p.match.confidence}] ${p.match.reason}` : 'BEZ PRIJEDLOGA';
    const alts = p.alternatives.length ? `  alt: ${p.alternatives.join(', ')}` : '';
    console.log(`  ${String(p.programCount).padStart(3)} prog  ${p.executor}`);
    console.log(`             -> ${proposed}${alts}`);
  }
  if (pending.length > 40) console.log(`  ... jos ${pending.length - 40}`);
  console.log('');
  console.log(`Razlozi za --no-unit: ${NO_UNIT_REASONS.join(', ')}`);
  process.exit(0);
}

const by = flag('by');
if (!by) {
  console.error('Nedostaje --by "Ime Prezime". Odluku uvijek potpisuje covjek.');
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);

function decide(executor: string, unitId: string | null, reason: NoUnitReason | null, bulk: boolean): void {
  const proposal = report.proposals.find((p) => p.executor === executor);
  if (!proposal) {
    console.error(`Izvoditelj nije u prijedlogu: "${executor}"`);
    process.exit(1);
  }
  const decision: UnitMatchDecision = {
    executor,
    unitId,
    noUnitReason: reason,
    decidedBy: by!,
    decidedAt: today,
    bulk,
    proposed: { unitId: proposal.match?.unitId ?? null, confidence: proposal.match?.confidence ?? null },
    ...(flag('note') ? { note: flag('note')! } : {}),
  };
  Object.assign(file, upsertDecision(file, decision));
}

// --- skupno prihvacanje svih `exact` prijedloga ---
if (has('accept-exact')) {
  const exact = report.proposals.filter((p) => p.match?.confidence === 'exact');
  for (const p of exact) decide(p.executor, p.match!.unitId, null, true);
  console.log(`Skupno prihvaceno: ${exact.length} exact prijedloga (oznaceni bulk: true).`);
} else {
  const executor = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
  if (!executor) {
    console.error('Nedostaje naziv izvoditelja (u navodnicima) ili --accept-exact.');
    process.exit(1);
  }
  const unit = flag('unit');
  const noUnit = flag('no-unit');
  if (unit && noUnit) {
    console.error('--unit i --no-unit se iskljucuju.');
    process.exit(1);
  }
  if (!unit && !noUnit) {
    console.error('Zadaj --unit <unitId> ili --no-unit <razlog>.');
    process.exit(1);
  }
  if (unit && !knownUnitIds.has(unit)) {
    console.error(`Jedinica "${unit}" ne postoji u katalogu.`);
    process.exit(1);
  }
  if (noUnit && !NO_UNIT_REASONS.includes(noUnit as NoUnitReason)) {
    console.error(`Nepoznat razlog "${noUnit}". Dopusteni: ${NO_UNIT_REASONS.join(', ')}`);
    process.exit(1);
  }
  decide(executor, unit ?? null, (noUnit as NoUnitReason) ?? null, false);
  console.log(`Zapisano: ${executor} -> ${unit ?? `(bez jedinice: ${noUnit})`}`);
}

const errors = validateDecisions(file, { knownUnitIds, knownExecutors });
if (errors.length) {
  console.error(`Odluke nisu ispravne (${errors.length}), nista nije spremljeno:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

mkdirSync(dirname(DECISIONS), { recursive: true });
writeFileSync(DECISIONS, JSON.stringify(file, null, 2) + '\n');

const after = decisionCoverage(report.proposals, file);
console.log(`odluceno ${after.decided}/${after.total}, ceka ${after.pending}, skupnih ${after.bulkDecided}`);
console.log('zapisano: data/programs/unit-match-decisions.json');
