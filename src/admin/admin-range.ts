/**
 * Lekta Control Center: razrjesenje "Danas/7d/30d/Prilagodjeno" u konkretne UTC granice.
 *
 * Izomorfno (bez DOM-a, bez Deno.*) - dijeli se s Edge funkcijom `admin-stats` PREKO
 * `admin-dispatch.ts` (isti obrazac kao src/report/slot-logic.ts), pa se pod tsc provjerom
 * dokazuje PRIJE deploya, ne tek na zivoj bazi.
 *
 * "Danas" je Europe/Zagreb kalendarski dan, ne UTC dan - admin moze provjeravati s puta, ne
 * u pregledniku koji je slucajno u drugoj vremenskoj zoni. `previous` za 'today' je JUCER u
 * ISTOM dijelu dana (ne "protekli dio jucer navecer"), asimetricno naspram 7d/30d/custom gdje
 * je previous jednostavno prethodni blok jednake duljine.
 */

export type AdminRange = 'today' | '7d' | '30d' | 'custom';

export interface ResolvedAdminRange {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
}

export interface AdminRangeError {
  error: 'bad_range' | 'range_too_large';
}

const ZAGREB_TZ = 'Europe/Zagreb';
const DAY_MS = 86_400_000;
const MAX_CUSTOM_RANGE_MS = 366 * DAY_MS;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function zagrebOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZAGREB_TZ, timeZoneName: 'shortOffset' }).formatToParts(instant);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = /GMT([+-]\d+)/.exec(raw);
  return m ? Number(m[1]) * 60 : 60;
}

/** UTC instant koji odgovara 00:00:00 lokalnog Zagreb vremena na zadani kalendarski dan. */
function zagrebMidnightUtc(dateKey: string): Date {
  const naiveUtc = new Date(`${dateKey}T00:00:00Z`);
  return new Date(naiveUtc.getTime() - zagrebOffsetMinutes(naiveUtc) * 60_000);
}

function zagrebDateKey(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZAGREB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function resolveAdminRange(
  range: AdminRange,
  opts: { fromDate?: string; toDate?: string; now?: Date } = {},
): ResolvedAdminRange | AdminRangeError {
  const now = opts.now ?? new Date();

  if (range === 'today') {
    const from = zagrebMidnightUtc(zagrebDateKey(now));
    const elapsedMs = now.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - DAY_MS);
    return {
      from: from.toISOString(),
      to: now.toISOString(),
      previousFrom: prevFrom.toISOString(),
      previousTo: new Date(prevFrom.getTime() + elapsedMs).toISOString(),
    };
  }

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    const from = new Date(now.getTime() - days * DAY_MS);
    const prevFrom = new Date(from.getTime() - days * DAY_MS);
    return { from: from.toISOString(), to: now.toISOString(), previousFrom: prevFrom.toISOString(), previousTo: from.toISOString() };
  }

  if (range === 'custom') {
    if (!opts.fromDate || !opts.toDate || !DATE_KEY_RE.test(opts.fromDate) || !DATE_KEY_RE.test(opts.toDate)) {
      return { error: 'bad_range' };
    }
    const from = zagrebMidnightUtc(opts.fromDate);
    const to = new Date(zagrebMidnightUtc(opts.toDate).getTime() + DAY_MS); // toDate je inkluzivan
    if (to.getTime() <= from.getTime()) return { error: 'bad_range' };
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > MAX_CUSTOM_RANGE_MS) return { error: 'range_too_large' };
    const prevFrom = new Date(from.getTime() - spanMs);
    return { from: from.toISOString(), to: to.toISOString(), previousFrom: prevFrom.toISOString(), previousTo: from.toISOString() };
  }

  return { error: 'bad_range' };
}

export function isAdminRangeError(x: ResolvedAdminRange | AdminRangeError): x is AdminRangeError {
  return typeof (x as AdminRangeError).error === 'string';
}
