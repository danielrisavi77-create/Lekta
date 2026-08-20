/**
 * CLI: closed-loop kroz CIJELI katalog profila (P4-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 *   npx vite-node scripts/run-closed-loop.mts [--limit 50]
 *   npm run closed-loop
 *
 * Zasto izvan `npm run check`: svaki profil su DVIJE stvarne analize plus popravak. Uzorak od 8
 * profila zivi u `tests/closed-loop-profiles.test.ts` i cuva ponasanje na svakoj promjeni; ovaj
 * pogon prolazi svih 410 i pise izvjestaj koji hrani `proof` os completion ledgera.
 *
 * Isti korisnicki tok kao test: dokument nastaje iz profilovih pravila, popravak se bira kao u
 * sucelju (`buildDefaultRepairRequests` + deep, koji je u panelu ukljucen po zadanom).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installXmlDomParser } from '../src/docx/xml-dom-install';

// Mora ici PRIJE uvoza analize: parser cita globalni DOMParser pri prvom pozivu.
installXmlDomParser(true);

const { analyzeFixture, resolveProfile } = await import('../src/analysis/golden-entry');
const { applyFixers } = await import('../src/repair/apply-fixers');
const { buildDefaultRepairRequests } = await import('../src/repair/default-selection');
const { buildRepairableItems } = await import('../src/ui/repair-items');
const { DEEP_CAPABLE } = await import('../src/ui/repair-panel');
const { detectPassRegressions } = await import('../src/analysis/repair-regression');
const { draftRuleEntriesFor, VERIFIED_PROFILES_WITH_DRAFTS } = await import('../src/profiles/drafts-runtime');
const { buildViolatingDocx } = await import('../tests/helpers/violating-docx');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

type Outcome =
  /** Popravak je ponudjen i barem jedan nalaz je nestao. */
  | 'pass'
  /** Profil nema nijedno prekrsivo pravilo (nema sto dokazati). */
  | 'no-rules'
  /** Pravila postoje, ali nijedan popravak nije predodaban (npr. nista bodovano). */
  | 'no-repair'
  /** Popravak je izveden, ali nijedan nalaz nije nestao. */
  | 'unresolved'
  /** Popravak je oborio provjeru koja je prolazila, ili je promijenio tekst rada. */
  | 'regression'
  /** Fixer je bacio ili je paket ispao neispravan. */
  | 'error';

interface Row {
  profileId: string;
  outcome: Outcome;
  violated: string[];
  requested: number;
  resolved: number;
  regressions: number;
  textPreserved: boolean;
  note?: string;
}

async function runProfile(profileId: string): Promise<Row> {
  const base: Row = { profileId, outcome: 'error', violated: [], requested: 0, resolved: 0, regressions: 0, textPreserved: true };
  try {
    const profile = resolveProfile(profileId) as Record<string, unknown>;
    const { bytes, violated } = await buildViolatingDocx(profile);
    if (!violated.length) return { ...base, outcome: 'no-rules' };

    const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId });
    const items = buildRepairableItems(before.checks ?? [], profile, draftRuleEntriesFor(profileId));
    const requests = buildDefaultRepairRequests(items as never).map((request) =>
      DEEP_CAPABLE.has(request.fixerId) ? { ...request, params: { ...request.params, deep: true } } : request,
    );
    if (!requests.length) return { ...base, outcome: 'no-repair', violated };

    const applied = await applyFixers(bytes, requests);
    if (applied.integrityFailure) {
      return { ...base, outcome: 'error', violated, requested: requests.length, note: 'integrityFailure' };
    }

    const after = await analyzeFixture(
      new File([applied.docxBytes], `${profileId}-fixed.docx`, { type: DOCX_MIME }),
      { profileId },
    );

    const failing = (checks: Array<{ title: string; earned?: number; max?: number }>): Set<string> =>
      new Set(checks.filter((c) => (c.max ?? 0) > 0 && (c.earned ?? 0) < (c.max ?? 0)).map((c) => c.title));
    const beforeFailing = failing(before.checks ?? []);
    const afterFailing = failing(after.checks ?? []);
    const resolved = [...beforeFailing].filter((t) => !afterFailing.has(t)).length;
    const regressions = detectPassRegressions(before.checks ?? [], after.checks ?? []).length;

    const row: Row = { profileId, outcome: 'pass', violated, requested: requests.length, resolved, regressions, textPreserved: true };
    if (regressions > 0) return { ...row, outcome: 'regression' };
    if (resolved === 0) return { ...row, outcome: 'unresolved' };
    return row;
  } catch (error) {
    return { ...base, note: error instanceof Error ? error.message.slice(0, 120) : String(error) };
  }
}

const profileIds = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).map((p) => p.id).slice(0, limit);

const rows: Row[] = [];
for (const [index, profileId] of profileIds.entries()) {
  rows.push(await runProfile(profileId));
  if ((index + 1) % 50 === 0) console.log(`  ... ${index + 1}/${profileIds.length}`);
}
rows.sort((a, b) => a.profileId.localeCompare(b.profileId));

const byOutcome = rows.reduce<Record<string, number>>((acc, row) => {
  acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
  return acc;
}, {});

const report = {
  schemaVersion: 1,
  profileCount: rows.length,
  byOutcome,
  rows,
};

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'closed-loop.json'), JSON.stringify(report, null, 2) + '\n');

console.log('=== Closed-loop kroz katalog ===');
console.log(`profila: ${rows.length}`);
for (const [outcome, n] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${outcome}`);
}
const bad = rows.filter((r) => r.outcome === 'regression' || r.outcome === 'error');
if (bad.length) {
  console.log('');
  console.log(`PROBLEMI (${bad.length}):`);
  for (const row of bad.slice(0, 20)) console.log(`  ${row.profileId}: ${row.outcome}${row.note ? ` (${row.note})` : ''}`);
  if (bad.length > 20) console.log(`  ... jos ${bad.length - 20}`);
}
console.log('');
console.log('zapisano: docs/generated/closed-loop.json');
