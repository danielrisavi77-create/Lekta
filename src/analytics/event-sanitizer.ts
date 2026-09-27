/**
 * Jedini izvor istine za dodatne podatke prvostrane analitike.
 *
 * Event name, path, version i timestamp nisu dio ovog objekta; trackEvent/Edge ih nose zasebno.
 * Ovdje prolaze samo unaprijed poznati skalarni podaci koji ne sadrze studentski tekst, ime
 * datoteke, autora, e-mail, IP ili drugi osobni identifikator.
 */
export const ANALYTICS_DATA_KEYS: ReadonlySet<string> = new Set([
  'package', 'profileId', 'workType', 'scoreBand', 'provider', 'source',
  'total', 'found', 'missing', 'flagged', 'checked',
  'profileStatus', 'pick', 'sizeBucket', 'category', 'issueCount', 'kind',
  'manual', 'count', 'score', 'demo', 'method', 'product', 'ruleId',
  'changes', 'stored', 'ms', 'auto', 'assisted', 'unknown', 'structureGaps',
] as const);

export function sanitizeAnalyticsEventData(input: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ANALYTICS_DATA_KEYS.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    if (typeof value === 'string' && value.length > 200) continue;
    out[key] = value;
  }
  return out;
}
