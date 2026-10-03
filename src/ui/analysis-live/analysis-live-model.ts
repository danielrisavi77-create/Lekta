/**
 * ANALIZA UZIVO (ALIGNMENT Z33, varijanta A): MODEL, bez DOM-a.
 *
 * Predlozak (`design/templates/analysis/Analysis.dc.html`) vrti izmisljen rad s izmisljenih sest
 * nalaza na tajmeru. Ovdje ne smije nista od toga. Dvije su faze i obje crtaju SAMO ono sto
 * motor stvarno zna u tom trenutku:
 *
 *   CITANJE (`readingFrame`)  dok analiza traje. Motor javlja samo prag faze i recenicu
 *     (osam `onProgress` poziva u `src/analysis/analyze-docx.ts`). Redak provjere postaje ● kad
 *     motor UDJE u fazu u kojoj se ta provjera racuna, i ostaje ● dok rezultat ne stigne: dok
 *     rezultata nema, nitko ne zna je li ✓ ili ✗. Nalaza, brojki i ocjene jos nema, pa ih nema
 *     ni na ekranu (ocjena stoji na 100 uz "mijenja se dok mjerim", kako trazi plan).
 *
 *   OTKRIVANJE (`revealFrame`)  kad rezultat stigne. Isti rezultat koji ce prikazati ekran
 *     rezultata slaze se u redoslijed: retci se razrjesavaju jedan po jedan, nalaz retka dobiva
 *     trag i ceduljicu, ocjena pada za stvarno izgubljene bodove tog retka, a na kraju stoji
 *     tocno `result.score`. Vrijeme je ovdje samo redoslijed prikaza vec poznatog rezultata.
 *
 * Pod `prefers-reduced-motion` i u skrivenoj kartici crta se `revealFrame(plan, Infinity)`:
 * zavrsno stanje odmah.
 *
 * NEMA PROCJENE PREOSTALOG VREMENA. Motor je ne daje (pragovi faza nisu mjera vremena, vidi
 * `progress-scan.ts`), pa se umjesto "još oko N s" ispisuje motorova recenica faze. Odstupanje je
 * zapisano kao F stavka u `docs/agents/orchestrator-backlog.md`.
 */
import type { Check } from '../../scoring/checks';
import { stableCheckId } from '../../scoring/check-id-registry';
import { buildVisualResultModel, type VisualResultInput } from '../results/visual-result-model';
import { topFindings } from '../finding-view-model';
import { summaryNaslov } from '../results/finding-summary';
import { pluralHr } from '../results/plural-hr';

/** Osam redaka provjere, doslovno iz predloska, i prag faze motora u kojoj se racunaju. */
const ROWS = [
  { id: 'font', label: 'Font i veličina', pct: 35 },
  { id: 'margine', label: 'Margine', pct: 35 },
  { id: 'prored', label: 'Prored', pct: 35 },
  { id: 'uvlaka', label: 'Uvlaka i poravnanje', pct: 35 },
  { id: 'brojevi', label: 'Brojevi stranica', pct: 52 },
  { id: 'naslovi', label: 'Naslovi i sadržaj', pct: 52 },
  { id: 'citati', label: 'Citati i literatura', pct: 68 },
  { id: 'opseg', label: 'Opseg', pct: 52 },
] as const;
type RowId = typeof ROWS[number]['id'];

/** Kategorije rezultata iz predloska i retci koji ih cine. */
const CATS: ReadonlyArray<{ label: string; rows: readonly RowId[] }> = [
  { label: 'Format', rows: ['font', 'margine', 'prored', 'uvlaka'] },
  { label: 'Struktura', rows: ['naslovi'] },
  { label: 'Citati', rows: ['citati'] },
  { label: 'Predaja', rows: ['brojevi', 'opseg'] },
];

/** Koliko mjesta za nalaze stoji otvoreno od pocetka (predlozak: 6). */
const SLOTS = 6;

/**
 * Redak provjere prema STABILNOM identitetu (`check.id`, inace `stableCheckId(title)`), ne prema
 * hrvatskom naslovu. Prostor imena je iz `src/scoring/check-id-registry.ts`.
 */
function rowForId(id: string | null | undefined, category: string): RowId {
  const s = id ?? '';
  if (/^format\.(font|size)\b/.test(s)) return 'font';
  if (/^page\.(margins|size)\b/.test(s)) return 'margine';
  if (/^format\.(spacing\.body|lines-per-page)\b/.test(s)) return 'prored';
  if (/^(format\.|footnote\.)/.test(s)) return 'uvlaka';
  if (/^page\.numbers\b/.test(s)) return 'brojevi';
  if (/^scope\./.test(s)) return 'opseg';
  if (/^(citation|reference|legal)\./.test(s)) return 'citati';
  if (/^(structure|toc|title|method|element)\./.test(s)) return 'naslovi';
  // Provjera bez identiteta u registru: po kategoriji motora, nikad po naslovu.
  if (category === 'citations') return 'citati';
  if (category === 'formatting' || category === 'typography') return 'uvlaka';
  return 'naslovi';
}

function rowOfCheck(check: Check): RowId {
  return rowForId(check.id ?? stableCheckId(String(check.title ?? '')), String(check.category ?? ''));
}

type RowStatus = 'finding' | 'pass' | 'unchecked';
type Severity = 'error' | 'warning' | 'info';

interface PlanRow { id: RowId; label: string; pct: number; status: RowStatus; count: number; detail: string | null; lost: number }
interface PlanFinding { row: RowId; title: string; measured: string | null; expected: string | null; severity: Severity }

export interface LivePlan {
  rows: PlanRow[];
  /** Nalazi u REDOSLIJEDU OTKRIVANJA (redak, pa prioritet); najvise `SLOTS`. */
  findings: PlanFinding[];
  /** Svi otvoreni nalazi dokumenta (moze ih biti vise od mjesta). */
  total: number;
  score: number | null;
  scoreMax: number;
  verdict: string;
  summary: string;
  eyebrow: string;
  profile: string;
  source: string | null;
  stats: { pages: number | null; words: number | null; sources: number | null };
  sheet: Array<{ text: string; heading: boolean }>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Kratka mjera za olovku na listu; dugi opis provjere ne stane na rub lista, pa se ne crta. */
function shortDetail(detail: unknown): string | null {
  const d = str(detail);
  return d && d.length <= 32 ? d : null;
}

interface LiveResultInput extends VisualResultInput {
  stats?: { words?: unknown; storedPages?: unknown; references?: unknown };
  preview?: { paragraphs?: Array<{ text?: unknown; headingLevel?: unknown }> };
  demo?: boolean;
}

/** Rezultat analize -> plan otkrivanja. Sve sto plan nosi dolazi iz `result`; nista se ne izmislja. */
export function buildLivePlan(input: unknown): LivePlan {
  const result = (input && typeof input === 'object' ? input : {}) as LiveResultInput;
  const model = buildVisualResultModel(result);
  const checks: Check[] = Array.isArray(result.checks) ? result.checks : [];
  const open = model.findings.document.filter((f) => f.status !== 'ignored');

  const rowOf = (matchKeys: readonly string[], category: string): RowId => {
    const check = checks.find((c) => matchKeys.includes(String(c.title)));
    return check ? rowOfCheck(check) : rowForId(null, category);
  };
  const openRows = open.map((f) => rowOf(f.matchKeys, f.category));

  const rows: PlanRow[] = ROWS.map((r) => {
    const own = checks.filter((c) => rowOfCheck(c) === r.id);
    const count = openRows.filter((id) => id === r.id).length;
    const failing = own.filter((c) => c.status === 'warn' || c.status === 'fail');
    const status: RowStatus = count > 0 || failing.length ? 'finding'
      : own.some((c) => c.status === 'pass') ? 'pass' : 'unchecked';
    const lost = own.filter((c) => c.scored && c.max > 0).reduce((s, c) => s + Math.max(0, c.max - c.earned), 0);
    const detail = shortDetail((failing[0] ?? own.find((c) => c.status === 'pass'))?.detail);
    return { id: r.id, label: r.label, pct: r.pct, status, count, detail, lost };
  });

  const order = (id: RowId): number => ROWS.findIndex((r) => r.id === id);
  const findings = topFindings(open, SLOTS)
    .map((f) => ({ f, row: rowOf(f.matchKeys, f.category) }))
    .sort((a, b) => order(a.row) - order(b.row) || a.f.priorityRank - b.f.priorityRank || a.f.originalIndex - b.f.originalIndex)
    .map(({ f, row }) => ({
      row,
      title: f.title,
      measured: shortDetail(f.measured),
      expected: str(f.expected),
      severity: f.severity,
    }));

  const score = model.score.kind === 'scored' ? Math.round(model.score.value) : null;
  const automatic = result.demo ? 0 : model.signals.automaticFixes;
  const paragraphs = Array.isArray(result.preview?.paragraphs) ? result.preview.paragraphs : [];
  return {
    rows,
    findings,
    total: open.length,
    score,
    scoreMax: checks.filter((c) => c.scored && c.max > 0).reduce((s, c) => s + c.max, 0),
    verdict: model.readiness.label,
    summary: summaryNaslov(open.length) + '.' + (automatic > 0 ? ` Od toga ${automatic} mogu popraviti automatski.` : ''),
    eyebrow: [model.header.documentName, model.header.profile, model.authority.label].join(' · '),
    profile: model.header.profile,
    source: str(result.details?.sources?.find((s) => str(s?.title))?.title),
    stats: { pages: num(result.stats?.storedPages), words: num(result.stats?.words), sources: num(result.stats?.references) },
    sheet: paragraphs
      .map((p) => ({ text: str(p?.text) ?? '', heading: typeof p?.headingLevel === 'number' }))
      .filter((p) => p.text)
      .slice(0, 7),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Vremenska crta otkrivanja (ms od dolaska rezultata). Jedno mjesto, da test i prikaz citaju isto. */

const ROW_START = 300;
const ROW_STEP = 450;
const NOTE_HOLD = 900;
const FLIGHT = 1000;
const TYPE_MS = 25;
const SCORE_TICK = 30;
const HOLD_AFTER_SCROLL = 1500;

const rowAt = (i: number): number => ROW_START + i * ROW_STEP;
const ROWS_END = rowAt(ROWS.length - 1);
const STAMP_AT = ROWS_END + 600;
const VERDICT_AT = STAMP_AT + 300;

type Icon = '○' | '●' | '✓' | '✗';
type RowState = 'pending' | 'active' | 'pass' | 'finding' | 'unchecked';
type SlotState = 'placeholder' | 'empty' | 'filled';

export interface LiveFrame {
  phase: 'reading' | 'revealing' | 'final';
  statusLine: string;
  rows: Array<{ label: string; icon: Icon; state: RowState; count: string }>;
  score: string;
  scoreNote: string;
  stats: { pages: string; words: string; sources: string } | null;
  /** Olovka na listu: retci s mjerom. `label` je kratka stvarna mjera ili prazno. */
  marks: Array<{ row: RowId; tone: 'finding' | 'pass'; label: string }>;
  /** Ceduljice uz list (samo siroki ekran) i tragovi na rubu, po jedan po nalazu. */
  notes: Array<{ title: string; meta: string; visible: boolean }>;
  edge: Array<{ visible: boolean; gathered: boolean }>;
  /** Indeksi nalaza cija cedulja upravo leti prema svom mjestu. */
  flying: number[];
  stamp: string | null;
  slots: Array<{ state: SlotState; label: string; title: string; measured: string; expected: string; metaVisible: boolean; severity: Severity }>;
  foundLine: string;
  cats: Array<{ label: string; status: string; tone: 'wait' | 'busy' | 'ok' | 'bad' }>;
  verdict: { shown: boolean; text: string; caret: boolean; metaVisible: boolean };
  /** Treba li stranica sama skrolati do presude (jednom). */
  scrollToVerdict: boolean;
  /** Je li otkrivanje gotovo, pa ekran rezultata smije preuzeti. */
  done: boolean;
}

/** Ukupno trajanje otkrivanja za plan: do kad rezultat ceka na animaciju. */
export function revealDuration(plan: LivePlan, wide: boolean): number {
  return scrollAt(plan, wide) + HOLD_AFTER_SCROLL;
}

function foundAt(plan: LivePlan, j: number): number {
  return rowAt(ROWS.findIndex((r) => r.id === plan.findings[j].row));
}

function placedAt(plan: LivePlan, j: number, wide: boolean): number {
  return foundAt(plan, j) + (wide ? NOTE_HOLD + FLIGHT : 0);
}

function verdictEnd(plan: LivePlan): number {
  return VERDICT_AT + plan.verdict.length * TYPE_MS * 2;
}

function scrollAt(plan: LivePlan, wide: boolean): number {
  const typed = plan.findings.map((f, j) => placedAt(plan, j, wide) + f.title.length * TYPE_MS);
  return Math.max(verdictEnd(plan), ROWS_END + 1700, ...typed);
}

const plural = (n: number): string => pluralHr(n, ['nalaz', 'nalaza', 'nalaza']);

function catsFor(done: (row: RowId) => boolean, busy: (row: RowId) => boolean, plan: LivePlan | null): LiveFrame['cats'] {
  return CATS.map((c) => {
    const all = c.rows.every(done);
    if (!all) return { label: c.label, status: c.rows.some((r) => done(r) || busy(r)) ? 'provjeravam…' : 'čeka', tone: c.rows.some((r) => done(r) || busy(r)) ? 'busy' : 'wait' };
    const n = plan ? plan.rows.filter((r) => c.rows.includes(r.id)).reduce((s, r) => s + r.count, 0) : 0;
    return n > 0 ? { label: c.label, status: `${n} ${plural(n)}`, tone: 'bad' } : { label: c.label, status: 'u redu', tone: 'ok' };
  });
}

const placeholderSlots = (n: number): LiveFrame['slots'] => Array.from({ length: n }, (_, i) => ({
  state: 'placeholder' as const, label: `NALAZ ${i + 1} · ČEKA PROVJERU`, title: '', measured: '', expected: '', metaVisible: false, severity: 'info' as const,
}));

/** Stanje dok analiza traje: samo prag faze motora. */
export function readingFrame(pct: number): LiveFrame {
  const value = Number.isFinite(pct) ? pct : 0;
  const busy = (row: RowId): boolean => value >= (ROWS.find((r) => r.id === row)?.pct ?? 101);
  return {
    phase: 'reading',
    statusLine: `PROVJERA 0 / ${ROWS.length}`,
    rows: ROWS.map((r) => (busy(r.id) ? { label: r.label, icon: '●', state: 'active', count: '' } : { label: r.label, icon: '○', state: 'pending', count: '' })),
    score: '100',
    scoreNote: 'mijenja se dok mjerim',
    stats: null,
    marks: [],
    notes: [],
    edge: [],
    flying: [],
    stamp: null,
    slots: placeholderSlots(SLOTS),
    foundLine: 'još ništa',
    cats: catsFor(() => false, busy, null),
    verdict: { shown: false, text: '', caret: false, metaVisible: false },
    scrollToVerdict: false,
    done: false,
  };
}

/** Ocjena u trenutku `t`: pada za stvarno izgubljene bodove razrijesenih redaka, zavrsava na `score`. */
function scoreAt(plan: LivePlan, t: number): number | null {
  if (plan.score == null) return null;
  let shown = 100;
  let lost = 0;
  ROWS.forEach((_, i) => {
    if (t < rowAt(i)) return;
    lost += plan.rows[i].lost;
    const last = i === ROWS.length - 1;
    const exact = plan.scoreMax > 0 ? Math.round((100 * (plan.scoreMax - lost)) / plan.scoreMax) : 100;
    const target = last ? plan.score! : Math.max(plan.score!, Math.min(100, exact));
    shown = Math.max(target, shown - Math.floor((t - rowAt(i)) / SCORE_TICK));
  });
  return shown;
}

/**
 * Stanje otkrivanja u trenutku `t` (ms od dolaska rezultata). `Infinity` je zavrsno stanje.
 * `wide` je siroki ekran (>= 980 px): samo ondje postoje ceduljice uz list i njihov let.
 */
export function revealFrame(plan: LivePlan, t: number, wide: boolean): LiveFrame {
  const done = (row: RowId): boolean => t >= rowAt(ROWS.findIndex((r) => r.id === row));
  const doneCount = ROWS.filter((r) => done(r.id)).length;
  const stamped = t >= STAMP_AT;
  const found = plan.findings.map((_, j) => t >= foundAt(plan, j));
  const placed = plan.findings.map((_, j) => t >= placedAt(plan, j, wide));
  const flying = wide ? plan.findings.map((_, j) => j).filter((j) => found[j] && !placed[j] && t >= foundAt(plan, j) + NOTE_HOLD) : [];
  const typedChars = (j: number): number => (placed[j] ? Math.floor((t - placedAt(plan, j, wide)) / TYPE_MS) : 0);
  const verdictChars = Math.max(0, Math.floor((t - VERDICT_AT) / (TYPE_MS * 2)));
  const verdictDone = verdictChars >= plan.verdict.length;
  const score = scoreAt(plan, t);
  const revealed = plan.findings.filter((_, j) => found[j]).length;
  const final = t >= revealDuration(plan, wide);
  const fmt = (n: number | null): string => (n == null ? '' : n.toLocaleString('hr-HR'));

  return {
    phase: final ? 'final' : 'revealing',
    statusLine: doneCount >= ROWS.length ? 'PROVJERA GOTOVA' : `PROVJERA ${doneCount} / ${ROWS.length}`,
    rows: plan.rows.map((r) => {
      if (!done(r.id)) return { label: r.label, icon: '●', state: 'active', count: '' };
      if (r.status === 'finding') return { label: r.label, icon: '✗', state: 'finding', count: r.count ? `${r.count} ${plural(r.count)}` : '' };
      if (r.status === 'pass') return { label: r.label, icon: '✓', state: 'pass', count: '' };
      return { label: r.label, icon: '○', state: 'unchecked', count: '' };
    }),
    score: score == null ? 'Nije bodovano' : String(score),
    scoreNote: doneCount < ROWS.length ? 'mijenja se dok mjerim' : `${plan.total} ${plural(plan.total)}`,
    stats: { pages: fmt(plan.stats.pages), words: fmt(plan.stats.words), sources: fmt(plan.stats.sources) },
    marks: plan.rows
      .filter((r) => done(r.id) && r.status !== 'unchecked' && ['font', 'margine', 'prored', 'uvlaka', 'brojevi'].includes(r.id))
      .map((r) => ({ row: r.id, tone: r.status === 'finding' ? 'finding' as const : 'pass' as const, label: r.status === 'finding' ? (r.detail ?? '') : '' })),
    notes: wide ? plan.findings.map((f, j) => ({
      title: f.title,
      meta: [f.measured, f.expected].filter(Boolean).join(' → '),
      visible: found[j] && !stamped && !placed[j] && !flying.includes(j),
    })) : [],
    edge: plan.findings.map((_, j) => ({ visible: found[j] && !stamped, gathered: stamped })),
    flying,
    stamp: stamped ? (plan.score == null ? `${plan.total} ${plural(plan.total)}` : `${plan.total} ${plural(plan.total)} · ${plan.score}`) : null,
    slots: [
      ...plan.findings.map((f, j) => {
        if (!placed[j]) return placeholderSlots(j + 1)[j];
        const chars = typedChars(j);
        return {
          state: 'filled' as const,
          label: String(j + 1).padStart(2, '0'),
          title: f.title.slice(0, chars),
          measured: f.measured ?? '',
          expected: f.expected ?? '',
          metaVisible: chars >= f.title.length,
          severity: f.severity,
        };
      }),
    ],
    foundLine: plan.total === 0 && doneCount >= ROWS.length ? summaryNaslov(0)
      : revealed ? `${doneCount >= ROWS.length ? plan.total : revealed} od ${plan.total} pronađeno` : 'još ništa',
    cats: catsFor(done, () => true, plan),
    verdict: {
      shown: t >= VERDICT_AT,
      text: plan.verdict.slice(0, verdictChars),
      caret: t >= VERDICT_AT && !verdictDone,
      metaVisible: verdictDone,
    },
    scrollToVerdict: t >= scrollAt(plan, wide),
    done: final,
  };
}
