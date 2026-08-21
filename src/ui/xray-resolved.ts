/**
 * "Popravljeno" nalazi za prije/poslije prikaz: provjere koje su PRIJE popravka bile prekrsene,
 * a POSLIJE prolaze. POST-FESTUM iskaz (nakon ponovne analize), nikad obecanje unaprijed; sud o
 * regresijama donosi detectPassRegressions, ovo je njegova pozitivna strana.
 *
 * Uparivanje po STABILNOM check.id (isti registar kao detectPassRegressions); naslov je samo
 * fallback kad NI JEDNA strana nema id (rucni fixturi).
 */
import type { Check } from '../scoring/checks';

export interface ResolvedFinding {
  checkId: string;
  title: string;
  /** Prva poznata lokacija nalaza PRIJE popravka (iz details.triage), za buduci skok. */
  beforeParagraphIndex?: number;
}

interface AnalysisLike {
  checks?: readonly Check[] | null;
  details?: any;
}

function keyOf(c: Check): string | null {
  return c.id ?? null;
}

export function resolveFixedFindings(
  before: AnalysisLike | null | undefined,
  after: AnalysisLike | null | undefined,
): ResolvedFinding[] {
  const beforeChecks = before?.checks ?? [];
  const afterChecks = after?.checks ?? [];
  if (!beforeChecks.length || !afterChecks.length) return [];

  const afterById = new Map<string, Check>();
  const afterByTitle = new Map<string, Check>();
  for (const c of afterChecks) {
    const id = keyOf(c);
    if (id) afterById.set(id, c);
    else afterByTitle.set(c.title, c);
  }

  const locByCheckId = new Map<string, number>();
  for (const tf of before?.details?.triage?.findings ?? []) {
    const id = typeof tf?.id === 'string' ? tf.id : null;
    const loc = tf?.locations?.[0]?.paragraphIndex;
    if (id && typeof loc === 'number' && !locByCheckId.has(id)) locByCheckId.set(id, loc);
  }

  const out: ResolvedFinding[] = [];
  for (const b of beforeChecks) {
    if (!b || !b.scored || b.max <= 0 || b.status === 'pass') continue;
    const id = keyOf(b);
    const a = id ? afterById.get(id) : afterByTitle.get(b.title);
    if (!a || a.status !== 'pass') continue;
    const loc = id ? locByCheckId.get(id) : undefined;
    out.push({ checkId: id ?? b.title, title: b.title, ...(loc != null ? { beforeParagraphIndex: loc } : {}) });
  }
  return out;
}
