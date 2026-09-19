// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readSelectionIds } from '../src/ui/profile-selection-ids';
import { ubaciStranicu } from './helpers/dom-fixture';

/**
 * ODABIR PROFILA KAO PODATAK: selidba iz `buildAnalysisSettings` mora biti no-op (korak A2).
 *
 * ZASTO NAD PRAVOM STRANICOM, a ne nad rucno slozenim kosturom: gard treba dokazati da se osam
 * selektora poklapa s onim sto `rad/index.html` STVARNO ima. Rucni kostur bi se razisao sa
 * stranicom u trenutku kad netko preimenuje jedan `id`, a test bi i dalje bio zelen nad
 * izmisljenim DOM-om. Isti obrazac vec koristi `dev-only-strip.test.ts`.
 */

/**
 * Postavlja vrijednost kontrole na stranici.
 *
 * `<select>` prima SAMO vrijednost za koju postoji `<option>`; bez nje `.value` tiho ostane prazan.
 * Opcije ovdje puni `app.ts` u izvodjenju (institucije, jedinice, programi dolaze iz podataka), pa
 * ih fixtura mora dodati sama. Prvi pokusaj ovog testa je to propustio i mjerio prazan niz.
 */
function postavi(id: string, vrijednost: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | HTMLInputElement | null;
  if (!el) throw new Error('stranica nema #' + id + '; selektor u modulu je zastario');
  if (el.tagName === 'SELECT') {
    const sel = el as HTMLSelectElement;
    if (![...sel.options].some((o) => o.value === vrijednost)) {
      const o = document.createElement('option');
      o.value = vrijednost;
      o.textContent = vrijednost;
      sel.appendChild(o);
    }
  }
  el.value = vrijednost;
}

describe('readSelectionIds nad pravom stranicom', () => {
  beforeEach(() => { ubaciStranicu(); });

  it('svih osam selektora postoji na stranici', () => {
    // Sentinel protiv vakuumskog prolaza: da modul cita nepostojece elemente, ostale bi tvrdnje
    // padale na iznimci umjesto da imenuju uzrok.
    for (const id of ['institutionSelect', 'unitSelect', 'programSelect', 'workType',
      'workVariant', 'departmentSelect', 'methodologySelect', 'citationStyle']) {
      expect(document.getElementById(id), 'stranica mora imati #' + id).toBeTruthy();
    }
  });

  it('red kljuceva je ugovor, jer vrijednost zavrsava u JSON zapisu', () => {
    const ids = readSelectionIds(document);
    expect(Object.keys(ids)).toEqual([
      'institution', 'unit', 'program', 'workType', 'variant', 'department', 'methodology', 'citation',
    ]);
  });

  it('cita tocno ono sto je u obrascu', () => {
    postavi('institutionSelect', 'unizg');
    postavi('unitSelect', 'fpzg');
    postavi('workType', 'diplomski');
    postavi('citationStyle', 'apa7');
    const ids = readSelectionIds(document);
    expect(ids.institution).toBe('unizg');
    expect(ids.unit).toBe('fpzg');
    expect(ids.workType).toBe('diplomski');
    expect(ids.citation).toBe('apa7');
  });

  /**
   * NESIMETRIJA JE PRENESENA NAMJERNO. `department` i `methodology` padaju na zadanu vrijednost,
   * ostali ne. To postoji od prije selidbe i ovaj korak je ne popravlja, jer bi promjena ponasanja
   * u koraku koji tvrdi da je selidba ucinila selidbu neprovjerivom.
   */
  it('department i methodology padaju na zadano kad element nedostaje', () => {
    document.getElementById('departmentSelect')?.remove();
    document.getElementById('methodologySelect')?.remove();
    const ids = readSelectionIds(document);
    expect(ids.department).toBe('general');
    expect(ids.methodology).toBe('auto');
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se kvar zbog kojeg gard postoji: element koji
   * NEMA fallback nestane sa stranice. Danas to baca, i ta se cinjenica prikiva, jer bi tiho
   * vracanje praznog niza znacilo analizu nad odabirom koji nitko nije napravio.
   */
  it('gard grize: nestanak elementa bez fallbacka se ne presucuje', () => {
    expect(() => readSelectionIds(document), 'baseline je izmjeren, ne pretpostavljen').not.toThrow();
    document.getElementById('unitSelect')?.remove();
    expect(() => readSelectionIds(document)).toThrow();
  });
});
