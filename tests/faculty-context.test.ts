/**
 * faculty-context.ts: dijeljeni kataloski kontekst (unitId/program/level) kroz alate.
 * Cista logika (localStorage), bez DOM-a. Dokazuje: round-trip, merge semantiku (patch koji
 * ne dira polje ga ne brise), eksplicitni reset preko unitId:'', migraciju sa starog
 * lekta.citat-faculty kljuca (ukljucujuci slucaj kad upis pod novim kljucem ne uspije), i da
 * smece u storageu ne rusi citanje.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFacultyContext, saveFacultyContext } from '../src/tools/faculty-context';

const KEY = 'lekta.faculty-context';
const LEGACY_KEY = 'lekta.citat-faculty';

beforeEach(() => {
  localStorage.clear();
});

describe('readFacultyContext / saveFacultyContext', () => {
  it('prazan storage vraca prazan kontekst', () => {
    expect(readFacultyContext()).toEqual({});
  });

  it('round-trip: sprema i cita unitId/program/level', () => {
    saveFacultyContext({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
    expect(readFacultyContext()).toEqual({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
  });

  it('patch koji ne dira unitId/program/level ih ne brise (merge, ne overwrite)', () => {
    saveFacultyContext({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
    saveFacultyContext({ level: 'final' }); // npr. citat mijenja samo unitId inace, ovdje simuliramo drugo polje
    expect(readFacultyContext()).toEqual({ unitId: 'efos', program: 'Psihologija', level: 'final' });
  });

  it('saveFacultyContext({unitId}) iz citata ne brise program/level koje je naslovnica vec spremila', () => {
    saveFacultyContext({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
    saveFacultyContext({ unitId: 'efos' }); // isti obrazac kao citat-page.ts poziv
    expect(readFacultyContext()).toEqual({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
  });

  it('saveFacultyContext({unitId: ""}) resetira cijeli kontekst', () => {
    saveFacultyContext({ unitId: 'efos', program: 'Psihologija', level: 'graduate' });
    saveFacultyContext({ unitId: '' });
    expect(readFacultyContext()).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('smece pod lekta.faculty-context se tiho ignorira (pada na migraciju/prazno)', () => {
    localStorage.setItem(KEY, '{ovo nije valjan JSON');
    expect(readFacultyContext()).toEqual({});
  });

  it('nepoznata/los-tipizirana polja se filtriraju (sanitize)', () => {
    localStorage.setItem(KEY, JSON.stringify({ unitId: 'efos', evil: '<script>', level: 42 }));
    expect(readFacultyContext()).toEqual({ unitId: 'efos' });
  });
});

describe('migracija sa lekta.citat-faculty', () => {
  it('stari bare-string kljuc se ucita kao {unitId} i migrira na novi kljuc', () => {
    localStorage.setItem(LEGACY_KEY, 'efos');

    const ctx = readFacultyContext();

    expect(ctx).toEqual({ unitId: 'efos' });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ unitId: 'efos' });
  });

  it('novi kljuc ima prednost ako oba postoje (vec migrirano ranije)', () => {
    localStorage.setItem(KEY, JSON.stringify({ unitId: 'fer' }));
    localStorage.setItem(LEGACY_KEY, 'efos');

    expect(readFacultyContext()).toEqual({ unitId: 'fer' });
  });

  it('ako upis pod novim kljucem baci, stari kljuc OSTAJE (ne gubi se izbor)', () => {
    // Vlastiti backing store (ne oslanja se na to KAKO happy-dom implementira Storage
    // interno): jedini zahtjev je da setItem(KEY, ...) baci, getItem/removeItem rade normalno.
    const store = new Map<string, string>([[LEGACY_KEY, 'efos']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        if (k === KEY) throw new Error('kvota puna');
        store.set(k, v);
      },
      removeItem: (k: string) => { store.delete(k); },
    });

    const ctx = readFacultyContext();

    expect(ctx).toEqual({ unitId: 'efos' });
    expect(store.get(LEGACY_KEY)).toBe('efos'); // NIJE obrisan
    vi.unstubAllGlobals();
  });
});
