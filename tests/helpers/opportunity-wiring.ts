/**
 * Staticki i ponasajni gardovi Opportunity Reporta V3 (Codex V3-04 na #163).
 *
 * Svaki gard vraca popis problema; prazan popis je cisto. Mutacije su u
 * `tests/gate-mutations.test.ts`, izravni poziv nad stvarnim datotekama u
 * `tests/product-journey-telemetry.test.ts` i `tests/opportunity-migration-v3.test.ts`.
 */
import type { OpportunityBucket } from '../../src/admin/admin-types';
import type { OpportunityMeasurementHealth } from '../../src/admin/opportunity-ranking';

export interface OpportunityWiringSources {
  app: string;
  panel: string;
  emitter: string;
  /** `src/analytics/repair-result.ts`: pozivatelj koji salje neovisni brojac i zove emitter. */
  result: string;
}

function occurrences(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Argumenti svakog poziva `name(...)` (bez zagrada unutar argumenata). */
function calls(source: string, name: string): string[][] {
  return [...source.matchAll(new RegExp(`\\b${name}\\(([^()]*(?:\\([^()]*\\)[^()]*)*)\\)`, 'g'))]
    .map((m) => m[1].split(',').map((a) => a.trim()));
}

/**
 * Dvostruka emisija, izgubljen kontekst, neovisnost brojaca i redoslijed prema integrity gateu.
 */
export function opportunityWiringProblems({ app, panel, emitter, result }: OpportunityWiringSources): string[] {
  const out: string[] = [];

  const summaryInEmitter = occurrences(emitter, "track('repair_noop_summary'");
  if (summaryInEmitter !== 1) out.push(`emitter: repair_noop_summary se emitira ${summaryInEmitter} puta (mora tocno 1)`);
  if (emitter.includes('repair_result_ok')) {
    out.push('emitter: repair_result_ok ne smije biti u emitteru, inace nije neovisan brojac');
  }

  // Pozivatelj: tocno jedan neovisni brojac s kontekstom i tocno jedan poziv emittera s istim kontekstom.
  const counter = occurrences(result, "track('repair_result_ok', { ...context })");
  if (counter !== 1) out.push(`repair-result.ts: repair_result_ok s kontekstom se emitira ${counter} puta (mora tocno 1)`);
  const toEmitter = calls(result, 'emitRepairNoOpSignals');
  if (toEmitter.length !== 1) out.push(`repair-result.ts: emitRepairNoOpSignals se poziva ${toEmitter.length} puta (mora tocno 1)`);
  for (const args of toEmitter) {
    if (args[2] !== 'context') out.push('repair-result.ts: emitter ne dobiva isti Opportunity kontekst');
  }

  // Putevi: nitko osim pozivatelja ne zove emitter ni ne salje brojac izravno; svaki put jednom, s kontekstom.
  for (const [name, source] of [['app.ts', app], ['repair-panel.ts', panel]] as const) {
    if (calls(source, 'emitRepairNoOpSignals').length > 0) out.push(`${name}: emitter se zove izravno, mimo neovisnog brojaca`);
    if (source.includes('repair_result_ok')) out.push(`${name}: repair_result_ok se salje izravno, mimo pozivatelja`);
    const paths = calls(source, 'trackRepairResultOk');
    if (paths.length !== 1) out.push(`${name}: trackRepairResultOk se poziva ${paths.length} puta (mora tocno 1)`);
    for (const args of paths) {
      if (args.length !== 3 || !args[2]) out.push(`${name}: trackRepairResultOk bez Opportunity konteksta`);
    }
  }

  if (!app.includes("if(out.kind==='ok')trackRepairResultOk(trackEvent,out.skippedReasons,opportunityContextFor(r))")) {
    out.push('app.ts: serverski repair ne salje profileId/workType rezultata');
  }
  if (!app.includes('opportunityContext:opportunityContextFor(r)')) {
    out.push('app.ts: lokalni repair panel ne dobiva opportunityContext iz profila i vrste rada');
  }

  // Lokalni put nastaje tek nakon integrity gatea.
  const localCall = 'trackRepairResultOk(ctx.trackEvent, result.skippedReasons, ctx.opportunityContext)';
  if (!panel.includes(localCall)) out.push('repair-panel.ts: pozivatelj bez ctx.opportunityContext');
  const integrity = panel.indexOf('if (result.integrityFailure)');
  if (integrity === -1) out.push('repair-panel.ts: nema integrity gatea');
  const at = panel.indexOf(localCall);
  if (at !== -1 && integrity !== -1 && at < integrity) out.push('repair-panel.ts: repair rezultat prije integrity gatea');

  return out;
}

/** Dogadjaji cija se parity racuna od V3 epohe; ostali repair/analysis dogadjaji od pocetka prozora. */
const V3_REPAIR_EVENTS = new Set(['repair_noop_summary', 'repair_noop_reason', 'repair_result_ok']);

/**
 * SQL obuhvat: V3 repair dogadjaji od `repair_v3_from`, ostali od pocetka prozora; epoha je
 * globalna (bez filtra prozora) i pokriva oba V3 izvora; parity po obuhvatu postoji za sve tri povrsine.
 */
export function opportunitySqlScopeProblems(sql: string): string[] {
  const out: string[] = [];
  const bounds = [...sql.matchAll(/e\.event = '([a-z_]+)'\s+and e\.created_at >= ([\w.]+)/g)];
  if (bounds.length === 0) out.push('SQL: nema nijednog ogranicenja dogadjaja po vremenu');
  for (const [, event, bound] of bounds) {
    const v3 = V3_REPAIR_EVENTS.has(event);
    if (v3 && !bound.endsWith('.repair_v3_from')) out.push(`SQL: ${event} mora poceti od repair_v3_from (ima ${bound})`);
    if (!v3 && !bound.endsWith('.f')) out.push(`SQL: ${event} mora poceti od pocetka prozora (ima ${bound})`);
  }

  const epoch = sql.match(/\bv3 as \(([\s\S]*?)\n {2}\),/)?.[1] ?? '';
  if (!epoch) out.push('SQL: nema globalne V3 epohe (CTE v3)');
  else {
    if (!epoch.includes('min(e.created_at)')) out.push('SQL: V3 epoha mora biti min(created_at)');
    if (!/e\.event in \('repair_result_ok', 'repair_noop_summary'\)/.test(epoch)) {
      out.push('SQL: V3 epoha mora obuhvatiti repair_result_ok i repair_noop_summary');
    }
    if (/created_at\s*[<>]/.test(epoch)) out.push('SQL: V3 epoha ne smije biti ogranicena prozorom');
  }

  // #163 je jednom imao win_v3 koji cita sam sebe; win_v3 mora citati win.
  const winV3 = sql.match(/\bwin_v3 as \(([\s\S]*?)\n {2}\),/)?.[1] ?? '';
  if (!/\bfrom win w\b/.test(winV3) || /\bfrom win_v3\b/.test(winV3)) out.push('SQL: win_v3 mora citati win, ne sebe');

  for (const surface of ['structure', 'repair_noop_items', 'repair_attempts']) {
    if (!sql.includes(`'${surface}'::text`)) out.push(`SQL: nema parity po obuhvatu za ${surface}`);
  }
  if (!/where sc\.rn = sh\.rn and sc\.summary <> sc\.breakdown/.test(sql)) {
    out.push('SQL: scopeParityMismatches mora vracati samo neslaganja istog prozora');
  }
  return out;
}

type HealthFn = (bucket: HealthBucket) => OpportunityMeasurementHealth;
type HealthBucket = Pick<
  OpportunityBucket,
  'analysisCompletedEvents' | 'opportunityEvents' | 'structureGapItems' | 'structureBreakdownItems'
  | 'repairAttemptEvents' | 'repairNoOpSummaryEvents' | 'repairNoOpSummaryItems' | 'repairNoOpItems'
  | 'scopeParityMismatches'
>;

const ZERO: HealthBucket = {
  analysisCompletedEvents: 0, opportunityEvents: 0, structureGapItems: 0, structureBreakdownItems: 0,
  repairAttemptEvents: 0, repairNoOpSummaryEvents: 0, repairNoOpSummaryItems: 0, repairNoOpItems: 0,
  scopeParityMismatches: [],
};

/** Scenariji u kojima zeleno mjerenje bi bilo lazno; svaki mora dati `partial`. */
export const FALSE_GREEN_SCENARIOS: ReadonlyArray<{ name: string; bucket: HealthBucket }> = [
  {
    name: 'V3-01 structure: isti zbroj, krivi profil',
    bucket: {
      ...ZERO, analysisCompletedEvents: 1, opportunityEvents: 1, structureGapItems: 1, structureBreakdownItems: 1,
      scopeParityMismatches: [
        { surface: 'structure', profileId: 'A', workType: 'diplomski', summary: 1, breakdown: 0 },
        { surface: 'structure', profileId: 'B', workType: 'diplomski', summary: 0, breakdown: 1 },
      ],
    },
  },
  {
    name: 'V3-01 repair: isti zbroj, kriva vrsta rada',
    bucket: {
      ...ZERO, repairAttemptEvents: 1, repairNoOpSummaryEvents: 1, repairNoOpSummaryItems: 2, repairNoOpItems: 2,
      scopeParityMismatches: [
        { surface: 'repair_noop_items', profileId: 'A', workType: 'zavrsni', summary: 2, breakdown: 0 },
        { surface: 'repair_noop_items', profileId: 'A', workType: 'diplomski', summary: 0, breakdown: 2 },
      ],
    },
  },
  {
    name: 'V3-02: uspjesan repair bez summaryja',
    bucket: { ...ZERO, analysisCompletedEvents: 1, opportunityEvents: 1, repairAttemptEvents: 1 },
  },
  {
    name: 'V3-02: summary bez uspjesnog repaira',
    bucket: { ...ZERO, repairNoOpSummaryEvents: 1 },
  },
  {
    name: 'no-op breakdown utihnuo',
    bucket: { ...ZERO, repairAttemptEvents: 1, repairNoOpSummaryEvents: 1, repairNoOpSummaryItems: 3 },
  },
  {
    name: 'opportunity_summary utihnuo',
    bucket: { ...ZERO, analysisCompletedEvents: 2, opportunityEvents: 1 },
  },
];

export function falseGreenParityProblems(health: HealthFn): string[] {
  const out: string[] = [];
  for (const { name, bucket } of FALSE_GREEN_SCENARIOS) {
    const kind = health(bucket).kind;
    if (kind !== 'partial') out.push(`${name}: ${kind}, mora biti partial`);
  }
  // V3-03: repair-only prozor s count=0 smije biti zdrav za repair, ali analiza ostaje bez podataka.
  const repairOnly = health({ ...ZERO, repairAttemptEvents: 1, repairNoOpSummaryEvents: 1 });
  if (repairOnly.analysis !== 'no-data') out.push(`V3-03: repair-only prozor daje analysis=${repairOnly.analysis}`);
  return out;
}
