const SESSION_MEMORY = new Map<string, unknown>();

const LEGACY_STORAGE_KEYS: Record<string, string> = {
  'thesisready.preferences.v2': 'lekta.preferences.v2',
  'thesisready.history.v2': 'lekta.history.v2',
  'thesisready.production.v2.1': 'lekta.production.v2.1',
  'thesisready.submission.v2.2.2': 'lekta.submission.v2.2.2',
  'thesisready.analytics-consent.v1': 'lekta.analytics-consent.v1',
  'thesisready.orders.v1': 'lekta.orders.v1',
  'thesisready.theme': 'lekta.theme',
};

export function migrateLegacyStorage(): void {
  try {
    for (const legacyKey in LEGACY_STORAGE_KEYS) {
      const currentKey = LEGACY_STORAGE_KEYS[legacyKey];
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null && localStorage.getItem(currentKey) === null) {
        localStorage.setItem(currentKey, legacyValue);
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Browser storage can be disabled or unavailable. The in-memory fallback remains usable.
  }
}

// Browser storage is an untyped JSON boundary. Keep the existing loose-data contract for callers.
export function safeStorageGet(key: string, fallback: any = null): any {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // Fall through to the per-session copy.
  }
  return SESSION_MEMORY.has(key) ? structuredClone(SESSION_MEMORY.get(key)) : fallback;
}

export function safeStorageSet(key: string, value: unknown): boolean {
  SESSION_MEMORY.set(key, structuredClone(value));
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeStorageSetText(key: string, value: string): boolean {
  SESSION_MEMORY.set(key, value);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
