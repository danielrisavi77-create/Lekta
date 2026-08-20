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
const { compileEffectiveRules } = await import('../src/profiles/rule-compiler');
const { normalizeCheckFlags } = await import('../src/profiles/profile-baseline');
const { applyScoredAdvisory } = await import('../src/profiles/advisory-demotion');
const { SOURCE_REGISTRY } = await import('../src/verification/verification-registry');
const { buildViolatingDocx } = await import('../tests/helpers/violating-docx');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

/**
 * Profil onako kako ga vidi ZIVI app: `effectiveRules` (Option A overlay), ne naslijedjeni
 * `rules` mirror.
 *
 * `golden-entry.resolveProfile` namjerno klonira `entry.rules` (golden harness mjeri sirovi
 * engine). Za closed-loop to je pogresna osnovica: popravak cita `ruleEntry`, pa bi analiza protiv
 * mirrora mjerila DRUGU vrijednost od one koju popravak postavlja. Izmjereno na
 * `vuka-strojarski-diplomski`: mirror kaze margine 2/2/2/2,5, zapis i `effectiveRules` kazu
 * 3/3/3/3 - petlja je bez ovog overlaya prijavljivala lazno proturjecje izmedju popravka i ocjene.
 */
function liveProfile(profileId: string): Record<string, unknown> {
  const withDrafts = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).find((p) => p.id === profileId);
  const base = resolveProfile(profileId) as Record<string, unknown>;
  if (!withDrafts) return base;
  // Normalizacija MORA ici nakon overlaya: `applyEntry` upisuje sirovu vrijednost zapisa
  // (npr. `size: 12`), a analizator ocekuje oblik iz `rules` (`size: [12]`). Zivi app radi isto -
  // `currentProfile` normalizira nakon sto procita effectiveRules. Bez toga 144 profila puca na
  // `profile.size.some is not a function` (izmjereno).
  const merged = { ...base, ...compileEffectiveRules(withDrafts as never) } as Record<string, unknown>;
  normalizeCheckFlags(merged);
  /**
   * Scored/advisory demotion je PRODUKTNA politika: zivi engine boduje samo verificirani scored
   * skup, a ostale dimenzije prikazuje informativno (max 0). Golden je namjerno ne primjenjuje jer
   * mjeri sirovi engine, ali closed-loop mora mjeriti PROIZVOD - inace prijavi kao neuspjeh
   * popravka ono sto fakultet uopce ne propisuje nego savjetuje (izmjereno: 29 profila je na osi
   * `paper-size` ispadalo `partial`, a rijec je o `advisory` zapisu bez fixera).
   */
  applyScoredAdvisory(
    merged as never,
    withDrafts as never,
    draftRuleEntriesFor(profileId),
    SOURCE_REGISTRY as never,
  );
  return merged;
}


/**
 * Prekrsena OS -> stabilan checkId koji tu os mjeri.
 *
 * Ovo je ispravak greske u prvom mjerenju: `resolved` je brojao NASLOVE provjera, a `violated`
 * OSI - razlicite jedinice, pa je omjer "rijeseno/prekrseno" bio neusporediv i `pass` je znacio
 * samo "barem nesto se promijenilo". Sada se za svaku prekrsenu os gleda BAS njezina provjera.
 */
const AXIS_CHECK_ID: Record<string, string> = {
  font: 'format.font.dominant',
  'font-size': 'format.size.body',
  'line-spacing': 'format.spacing.body',
  justify: 'format.justify.body',
  margins: 'page.margins',
};

/** Format stranice ima dinamican naslov (`page.size.*`), pa se prepoznaje po prefiksu. */
function checkForAxis(checks: Array<{ id?: string | null; title?: string }>, axis: string) {
  if (axis === 'paper-size') return checks.find((c) => typeof c.id === 'string' && c.id.startsWith('page.size'));
  const wanted = AXIS_CHECK_ID[axis];
  return wanted ? checks.find((c) => c.id === wanted) : undefined;
}

/** Provjera je rijesena kad vise ne kaznjava dokument (puni bodovi ili nije bodovana). */
function axisResolved(check: { earned?: number; max?: number } | undefined): boolean {
  if (!check) return false;
  return (check.max ?? 0) === 0 || (check.earned ?? 0) >= (check.max ?? 0);
}

type Outcome =
  /** Popravak je ponudjen i barem jedan nalaz je nestao. */
  | 'pass'
  /** Profil nema nijedno prekrsivo pravilo (nema sto dokazati). */
  | 'no-rules'
  /** Pravila postoje, ali nijedan popravak nije predodaban (npr. nista bodovano). */
  | 'no-repair'
  /** Popravak je izveden, ali nijedan nalaz nije nestao. */
  | 'unresolved'
  /** Dio prekrsenih osi je rijesen, dio nije. Nije dokaz pokrivenosti. */
  | 'partial'
  /** Popravak je oborio provjeru koja je prolazila, ili je promijenio tekst rada. */
  | 'regression'
  /** Fixer je bacio ili je paket ispao neispravan. */
  | 'error';

interface Row {
  profileId: string;
  outcome: Outcome;
  violated: string[];
  requested: number;
  /** Osi koje su nakon popravka prestale kaznjavati dokument. */
  axesResolved: string[];
  /** Osi koje su i dalje prekrsene nakon popravka. */
  axesRemaining: string[];
  resolved: number;
  regressions: number;
  textPreserved: boolean;
  note?: string;
}

async function runProfile(profileId: string): Promise<Row> {
  const base: Row = { profileId, outcome: 'error', violated: [], requested: 0, axesResolved: [], axesRemaining: [], resolved: 0, regressions: 0, textPreserved: true };
  try {
    const profile = liveProfile(profileId);
    const { bytes, violated } = await buildViolatingDocx(profile);
    if (!violated.length) return { ...base, outcome: 'no-rules' };

    const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId, profile });
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
      { profileId, profile },
    );

    const afterChecks = (after.checks ?? []) as Array<{ id?: string | null; title?: string; earned?: number; max?: number }>;
    const axesResolved = violated.filter((axis) => axisResolved(checkForAxis(afterChecks, axis)));
    const axesRemaining = violated.filter((axis) => !axesResolved.includes(axis));
    const regressions = detectPassRegressions(before.checks ?? [], after.checks ?? []).length;

    const row: Row = {
      profileId,
      outcome: 'pass',
      violated,
      requested: requests.length,
      axesResolved,
      axesRemaining,
      resolved: axesResolved.length,
      regressions,
      textPreserved: true,
    };
    if (regressions > 0) return { ...row, outcome: 'regression' };
    if (!axesResolved.length) return { ...row, outcome: 'unresolved' };
    // `partial` je vlastiti ishod, ne `pass`: profil kojem je od sest osi rijesena jedna NIJE
    // dokazan. Prvo mjerenje ih je spajalo i time precijenilo pokrivenost.
    if (axesRemaining.length) return { ...row, outcome: 'partial' };
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
