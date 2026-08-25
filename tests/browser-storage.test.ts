// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadFresh() {
  vi.resetModules();
  return import('../src/shared/browser-storage');
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser storage', () => {
  it('sprema JSON i cita zapisanu vrijednost', async () => {
    const { safeStorageGet, safeStorageSet } = await loadFresh();

    expect(safeStorageSet('lekta.preferences.v2', { language: 'hr', strictness: 'strict' })).toBe(true);
    expect(localStorage.getItem('lekta.preferences.v2')).toBe('{"language":"hr","strictness":"strict"}');
    expect(safeStorageGet('lekta.preferences.v2')).toEqual({ language: 'hr', strictness: 'strict' });
  });

  it('sprema tekstualnu vrijednost bez JSON navodnika za prepaint temu', async () => {
    const { safeStorageGet, safeStorageSetText } = await loadFresh();

    expect(safeStorageSetText('lekta.theme', 'light')).toBe(true);
    expect(localStorage.getItem('lekta.theme')).toBe('light');
    expect(safeStorageGet('lekta.theme')).toBe('light');
  });

  it('vraca zadani fallback za nepostojeci ili neispravan JSON zapis', async () => {
    const { safeStorageGet } = await loadFresh();
    localStorage.setItem('lekta.preferences.v2', '{nije-json');

    expect(safeStorageGet('lekta.preferences.v2', { language: 'hr' })).toEqual({ language: 'hr' });
    expect(safeStorageGet('lekta.missing', 'default')).toBe('default');
  });

  it('cuva kloniranu vrijednost u memoriji kada localStorage odbije pristup', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    const { safeStorageGet, safeStorageSet } = await loadFresh();
    const value = { theme: 'dark' };

    expect(safeStorageSet('lekta.preferences.v2', value)).toBe(false);
    value.theme = 'light';
    expect(safeStorageGet('lekta.preferences.v2')).toEqual({ theme: 'dark' });
  });

  it('tekstualnu vrijednost cuva u memoriji kada localStorage nije dostupan', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    const { safeStorageGet, safeStorageSetText } = await loadFresh();

    expect(safeStorageSetText('lekta.theme', 'dark')).toBe(false);
    expect(safeStorageGet('lekta.theme')).toBe('dark');
  });

  it('migrira sve thesisready kljuceve, cuva postojeci lekta zapis i uklanja stare kljuceve', async () => {
    const migrations = {
      'thesisready.preferences.v2': 'lekta.preferences.v2',
      'thesisready.history.v2': 'lekta.history.v2',
      'thesisready.production.v2.1': 'lekta.production.v2.1',
      'thesisready.submission.v2.2.2': 'lekta.submission.v2.2.2',
      'thesisready.analytics-consent.v1': 'lekta.analytics-consent.v1',
      'thesisready.orders.v1': 'lekta.orders.v1',
      'thesisready.theme': 'lekta.theme',
    } as const;
    for (const [legacyKey, currentKey] of Object.entries(migrations)) {
      localStorage.setItem(legacyKey, `legacy:${legacyKey}`);
      expect(localStorage.getItem(currentKey)).toBeNull();
    }
    localStorage.setItem('lekta.orders.v1', 'current:orders');
    const { migrateLegacyStorage } = await loadFresh();

    migrateLegacyStorage();

    for (const [legacyKey, currentKey] of Object.entries(migrations)) {
      expect(localStorage.getItem(legacyKey)).toBeNull();
      expect(localStorage.getItem(currentKey)).toBe(
        currentKey === 'lekta.orders.v1' ? 'current:orders' : `legacy:${legacyKey}`,
      );
    }
  });
});
