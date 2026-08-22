type TelemetryPrimitive = string | number | boolean;

const ALLOWED_EVENT_FIELDS = new Set([
  'event', 'package', 'profileId', 'workType', 'scoreBand', 'provider', 'source',
  'total', 'found', 'missing', 'flagged', 'checked', 'profileStatus', 'pick',
  'sizeBucket', 'category', 'issueCount', 'kind', 'manual', 'count', 'score',
  'demo', 'method', 'product', 'ruleId', 'changes', 'stored', 'ms',
]);

export function sanitizeEventData(data: any): Record<string, TelemetryPrimitive> {
  const allowed: Record<string, TelemetryPrimitive> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (ALLOWED_EVENT_FIELDS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)) {
      allowed[key] = value as TelemetryPrimitive;
    }
  }
  return allowed;
}
