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
 * zavrsno stanje odmah. Otkrivanje inace traje najvise `REVEAL_MAX` (oko 4 s, odluka vlasnika
 * 2026-10-04, F31 a), a "Preskoči" ga zavrsava odmah.
 *
 * TRAGOVI NA RUBU LISTA stoje gdje je nalaz u radu (F31 d): sidro odlomka iz `finding.scope`
 * (1..broj odlomaka iz `details.measurements`), proporcionalno polozaju u dokumentu. Nalaz bez
 * sidra (ili sa sidrom u fusnoti, koja je zaseban koordinatni prostor) dobiva preostalo mjesto u
 * ravnomjernom rasporedu; mjesto mu se ne izmislja.
 *
 * NEMA PROCJENE PREOSTALOG VREMENA. Motor je ne daje (pragovi faza nisu mjera vremena, vidi
 * `progress-scan.ts`), pa se umjesto "još oko N s" ispisuje motorova recenica faze. Odstupanje je
 * zapisano kao F stavka u `docs/agents/orchestrator-backlog.md`.
 */
import type { Check } from '../../scoring/checks';
import { stableCheckId } from '../../scoring/check-id-registry';
import { buildVisualResultModel, type VisualResultInput } from '../results/visual-result-model';
import { topFindings, type FindingScope } from '../finding-view-model';
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
interface PlanFinding {
  row: RowId;
  title: string;
  measured: string | null;
  expected: string | null;
  severity: Severity;
  /** Polozaj u radu (0 pocetak, 1 kraj) iz sidra odlomka; `null` kad nalaz nema sidro u tijelu rada. */
  at: number | null;
  /** Vrh traga na rubu lista i vrh cedulje, u postocima visine lista. */
  top: number;
  noteTop: number;
}

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
  /**
   * Nudi li list presude "Napravi plan popravka". Isti uvjet pod kojim kokpit rezultata na svom
   * primarnom gumbu nosi taj natpis (`primaryAction` u `results-cockpit.ts`: popravak dostupan,
   * dakle nije demo, i postoji barem jedan automatski popravak).
   */
  repair: boolean;
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
  details?: VisualResultInput['details'] & { measurements?: { counts?: { paragraphs?: unknown } } };
  stats?: { words?: unknown; storedPages?: unknown; references?: unknown };
  preview?: { paragraphs?: Array<{ text?: unknown; headingLevel?: unknown }> };
  demo?: boolean;
}

/** Gornji rub i raspon tragova na listu, u postocima visine lista (kao u predlosku). */
const EDGE_TOP = 8;
const EDGE_SPAN = 72;
/** Najmanji razmak dviju cedulja, da se ne poklope kad su nalazi blizu u radu. */
const NOTE_GAP = 12;

/** Polozaj nalaza u radu iz sidra odlomka; fusnota i sidro izvan raspona nemaju polozaj u tijelu. */
function positionOf(scope: FindingScope, paragraphs: number | null): number | null {
  if (scope.kind !== 'anchor' || scope.footnoteId != null || !paragraphs || paragraphs < 1) return null;
  const p = Math.floor(scope.paragraphIndex);
  if (!Number.isFinite(p) || p < 1 || p > paragraphs) return null;
  return paragraphs === 1 ? 0 : (p - 1) / (paragraphs - 1);
}

/**
 * Vrhovi tragova: nalaz sa sidrom stoji proporcionalno svom mjestu u radu i zauzima najblize
 * ravnomjerno mjesto; nalazi bez sidra redom dobivaju preostala ravnomjerna mjesta.
 */
function edgeTops(at: ReadonlyArray<number | null>): number[] {
  const n = at.length;
  const even = Array.from({ length: n }, (_, k) => EDGE_TOP + (n > 1 ? (k * EDGE_SPAN) / (n - 1) : 0));
  const free = new Set(even.keys());
  const tops = at.map((a) => (a == null ? null : EDGE_TOP + a * EDGE_SPAN));
  tops.forEach((top) => {
    if (top == null) return;
    let best = -1;
    for (const k of free) if (best < 0 || Math.abs(even[k] - top) < Math.abs(even[best] - top)) best = k;
    free.delete(best);
  });
  const rest = [...free].sort((a, b) => a - b);
  return tops.map((top) => (top == null ? even[rest.shift() ?? 0] : top));
}

/** Cedulje prate svoje tragove, ali se razmicu na najmanje `NOTE_GAP` unutar raspona lista. */
function noteTops(tops: readonly number[]): number[] {
  const order = tops.map((_, j) => j).sort((a, b) => tops[a] - tops[b] || a - b);
  const out = [...tops];
  order.forEach((j, i) => { if (i > 0) out[j] = Math.max(out[j], out[order[i - 1]] + NOTE_GAP); });
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const max = i === order.length - 1 ? EDGE_TOP + EDGE_SPAN : out[order[i + 1]] - NOTE_GAP;
    out[order[i]] = Math.max(EDGE_TOP, Math.min(out[order[i]], max));
  }
  return out;
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
  const paragraphs = num(result.details?.measurements?.counts?.paragraphs);
  const ordered = topFindings(open, SLOTS)
    .map((f) => ({ f, row: rowOf(f.matchKeys, f.category) }))
    .sort((a, b) => order(a.row) - order(b.row) || a.f.priorityRank - b.f.priorityRank || a.f.originalIndex - b.f.originalIndex);
  const at = ordered.map(({ f }) => positionOf(f.scope, paragraphs));
  const tops = edgeTops(at);
  const notes = noteTops(tops);
  const findings = ordered.map(({ f, row }, j) => ({
    row,
    title: f.title,
    measured: shortDetail(f.measured),
    expected: str(f.expected),
    severity: f.severity,
    at: at[j],
    top: tops[j],
    noteTop: notes[j],
  }));

  const score = model.score.kind === 'scored' ? Math.round(model.score.value) : null;
  const automatic = result.demo ? 0 : model.signals.automaticFixes;
  const previewParagraphs = Array.isArray(result.preview?.paragraphs) ? result.preview.paragraphs : [];
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
    sheet: previewParagraphs
      .map((p) => ({ text: str(p?.text) ?? '', heading: typeof p?.headingLevel === 'number' }))
      .filter((p) => p.text)
      .slice(0, 7),
    repair: !result.demo && model.signals.automaticFixes > 0,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Vremenska crta otkrivanja (ms od dolaska rezultata). Jedno mjesto, da test i prikaz citaju isto. */

const ROW_START = 120;
const ROW_STEP = 200;
const NOTE_HOLD = 400;
/** Trajanje leta cedulje; prikaz ga cita za Web Animations, da let i model traju isto. */
export const FLIGHT = 500;
const TYPE_MS = 25;
/** Najdulje tipkanje naslova nalaza i presude; dulji tekst se tipka brze, ne dulje. */
const TITLE_TYPE_MAX = 350;
const VERDICT_TYPE_MAX = 450;
const SCORE_TICK = 12;
/**
 * Koliko list presude stoji gotov (presuda otipkana, gumbi vidljivi i mirni) prije nego ekran
 * rezultata preuzme. Skrol do presude ide na POCETKU tipkanja presude, pa je u ovom prozoru
 * stranica mirna i "Napravi plan popravka" se moze stvarno kliknuti.
 */
const HOLD_SETTLED = 1500;
/** Gornja granica otkrivanja (F31 a): rezultat nikad ne ceka dulje od ovoga. */
const REVEAL_MAX = 4000;

const rowAt = (i: number): number => ROW_START + i * ROW_STEP;
const ROWS_END = rowAt(ROWS.length - 1);
const STAMP_AT = ROWS_END + 200;
const VERDICT_AT = STAMP_AT + 150;

/** Milisekundi po znaku: najvise `slowest`, a cijeli tekst najvise `max`. */
const perChar = (length: number, slowest: number, max: number): number => (length > 0 ? Math.min(slowest, max / length) : slowest);

type Icon = '○' | '●' | '✓' | '✗';
type RowState = 'pending' | 'active' | 'pass' | 'finding' | 'unchecked';
type SlotState = 'placeholder' | 'empty' | 'filled';

/** Celija brojaca: broj, ili "-" uz `title` koji kaze zasto broja nema. Nikad prazna oznaka. */
interface StatCell { text: string; title: string; note: string }

export interface LiveFrame {
  phase: 'reading' | 'revealing' | 'final';
  statusLine: string;
  rows: Array<{ label: string; icon: Icon; state: RowState; count: string }>;
  score: string;
  scoreNote: string;
  stats: { pages: StatCell; words: StatCell; sources: StatCell };
  /** "Javi mi kad bude gotovo" ima smisla samo dok provjera traje; poslije ne obecaje nista. */
  notify: boolean;
  /** "Preskoči" postoji samo dok otkrivanje traje. */
  skip: boolean;
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
  /** `plan`: list presude nudi "Napravi plan popravka" (vidi `LivePlan.repair`). */
  verdict: { shown: boolean; text: string; caret: boolean; metaVisible: boolean; plan: boolean };
  /** Treba li stranica sama skrolati do presude (jednom, kad se presuda pocne tipkati). */
  scrollToVerdict: boolean;
  /** Je li otkrivanje gotovo, pa ekran rezultata smije preuzeti. */
  done: boolean;
}

/** Ukupno trajanje otkrivanja za plan: do kad rezultat ceka na animaciju. */
export function revealDuration(plan: LivePlan, wide: boolean): number {
  return Math.min(REVEAL_MAX, settledAt(plan, wide) + HOLD_SETTLED);
}

function foundAt(plan: LivePlan, j: number): number {
  return rowAt(ROWS.findIndex((r) => r.id === plan.findings[j].row));
}

function placedAt(plan: LivePlan, j: number, wide: boolean): number {
  return foundAt(plan, j) + (wide ? NOTE_HOLD + FLIGHT : 0);
}

const verdictMs = (plan: LivePlan): number => perChar(plan.verdict.length, TYPE_MS * 2, VERDICT_TYPE_MAX);
const titleMs = (f: PlanFinding): number => perChar(f.title.length, TYPE_MS, TITLE_TYPE_MAX);

function verdictEnd(plan: LivePlan): number {
  return VERDICT_AT + plan.verdict.length * verdictMs(plan);
}

/** Trenutak kad je sve otipkano: presuda i svi naslovi nalaza. */
function settledAt(plan: LivePlan, wide: boolean): number {
  const typed = plan.findings.map((f, j) => placedAt(plan, j, wide) + f.title.length * titleMs(f));
  return Math.max(verdictEnd(plan), ROWS_END + 800, ...typed);
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

/** Mjesto koje nije dobilo nalaz: stoji prazno (ista visina), da se sadrzaj ispod ne sazme (Z33-04). */
const EMPTY_SLOT: LiveFrame['slots'][number] = { state: 'empty', label: '', title: '', measured: '', expected: '', metaVisible: false, severity: 'info' };

/** Dok analiza traje brojaca jos nema; celija to kaze umjesto da stoji prazna. */
const WAITING: StatCell = { text: '-', title: 'Broj je poznat kad provjera završi.', note: 'mjeri se' };

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
    stats: { pages: WAITING, words: WAITING, sources: WAITING },
    notify: true,
    skip: false,
    marks: [],
    notes: [],
    edge: [],
    flying: [],
    stamp: null,
    slots: placeholderSlots(SLOTS),
    foundLine: 'još ništa',
    cats: catsFor(() => false, busy, null),
    verdict: { shown: false, text: '', caret: false, metaVisible: false, plan: false },
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
  const typedChars = (j: number): number => (placed[j] ? Math.floor((t - placedAt(plan, j, wide)) / titleMs(plan.findings[j])) : 0);
  const verdictChars = Math.max(0, Math.floor((t - VERDICT_AT) / verdictMs(plan)));
  const verdictDone = verdictChars >= plan.verdict.length;
  const score = scoreAt(plan, t);
  const revealed = plan.findings.filter((_, j) => found[j]).length;
  const final = t >= revealDuration(plan, wide);
  const cell = (n: number | null, why: string, note: string): StatCell => (n == null ? { text: '-', title: why, note } : { text: n.toLocaleString('hr-HR'), title: '', note: '' });

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
    stats: {
      pages: cell(plan.stats.pages, 'Word nije zapisao broj stranica u datoteku.', 'Word nije zapisao'),
      words: cell(plan.stats.words, 'Broj riječi nije izmjeren.', 'nije izmjereno'),
      sources: cell(plan.stats.sources, 'Broj izvora nije izmjeren.', 'nije izmjereno'),
    },
    notify: false,
    skip: !final,
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
      // Svih SLOTS mjesta stoji do prelaska na rezultat. Visak ceka provjeru dok retci traju, a kad
      // je provjera gotova postaje prazan redak, nikad izmisljen nalaz.
      ...Array.from({ length: Math.max(0, SLOTS - plan.findings.length) }, (_, k) => (doneCount >= ROWS.length
        ? EMPTY_SLOT
        : placeholderSlots(plan.findings.length + k + 1)[plan.findings.length + k])),
    ],
    foundLine: plan.total === 0 && doneCount >= ROWS.length ? summaryNaslov(0)
      : revealed ? `${doneCount >= ROWS.length ? plan.total : revealed} od ${plan.total} pronađeno` : 'još ništa',
    cats: catsFor(done, () => true, plan),
    verdict: {
      shown: t >= VERDICT_AT,
      text: plan.verdict.slice(0, verdictChars),
      caret: t >= VERDICT_AT && !verdictDone,
      metaVisible: verdictDone,
      plan: plan.repair,
    },
    scrollToVerdict: t >= VERDICT_AT,
    done: final,
  };
}
