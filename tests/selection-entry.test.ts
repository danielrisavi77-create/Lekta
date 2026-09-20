import { describe, expect, it } from 'vitest';
import { facultyContextSelection, urlSelection, type UnitLike } from '../src/ui/selection-entry';

/**
 * ULAZNI PUTOVI ODABIRA: selidba iz `app.ts` mora biti no-op (2026-09-12).
 *
 * Prije selidbe je prvenstvo ta tri ulaza (zapamcen odabir, medju-alatni signal, `?unit=` link)
 * postojalo samo kao KOMENTAR uz dva tijela u monolitu. Nijedan test ga nije mjerio, pa je bilo
 * dovoljno da netko premjesti poziv i prvenstvo se tiho okrene.
 */

const UNITS: UnitLike[] = [
  { id: 'fpzg', institutionId: 'unizg' },
  { id: 'pravo', institutionId: 'unizg' },
];

const slug = (s: string): string | null => (s === 'diplomski' ? 'graduate' : null);

describe('medju-alatni signal (faculty-context)', () => {
  it('popunjava prazno', () => {
    const sel = facultyContextSelection(null, { unitId: 'fpzg' }, UNITS);
    expect(sel).toEqual({ institution: 'unizg', unit: 'fpzg' });
  });

  it('prenosi program i razinu kad ih signal nosi', () => {
    const sel = facultyContextSelection(null, { unitId: 'fpzg', program: 'Novinarstvo', level: 'graduate' }, UNITS);
    // `level` iz signala postaje `workType` u odabiru; kljuca `level` u izlazu NEMA.
    expect(sel).toEqual({ institution: 'unizg', unit: 'fpzg', program: 'Novinarstvo', workType: 'graduate' });
    expect(Object.keys(sel!).sort()).toEqual(['institution', 'program', 'unit', 'workType']);
  });

  /**
   * OVO JE PRAVILO ZBOG KOJEG FUNKCIJA POSTOJI. Tanji signal ne smije pregaziti bogatiju
   * analizatorsku povijest; inace bi korisnika koji je vec radio na jednom fakultetu vratilo na
   * onaj koji je usput dirnuo na citatnom alatu.
   */
  it('SUTI kad zapamcene postavke vec nose jedinicu', () => {
    expect(facultyContextSelection({ unit: 'pravo' }, { unitId: 'fpzg' }, UNITS)).toBeNull();
  });

  it('nepoznata jedinica je tihi no-op, ne pogadjanje', () => {
    expect(facultyContextSelection(null, { unitId: 'nepostojeci' }, UNITS)).toBeNull();
    expect(facultyContextSelection(null, {}, UNITS)).toBeNull();
    expect(facultyContextSelection(null, null, UNITS)).toBeNull();
  });
});

describe('izricit link (?unit=)', () => {
  it('postavlja fakultet i vrstu rada', () => {
    const out = urlSelection(new URLSearchParams('unit=fpzg&work=diplomski'), UNITS, slug);
    expect(out.selection).toEqual({ institution: 'unizg', unit: 'fpzg', workType: 'graduate' });
    expect(out.projectId).toBeNull();
  });

  /**
   * NEOVISNOST DVAJU NO-OPOVA. Kriv slug vrste rada ne smije ponistiti ISPRAVAN fakultet, ni
   * obrnuto. Prije selidbe je to bila jedna recenica u komentaru.
   */
  it('nepoznat work ne ponistava ispravan unit, ni obrnuto', () => {
    const a = urlSelection(new URLSearchParams('unit=fpzg&work=izmisljeno'), UNITS, slug);
    expect(a.selection).toEqual({ institution: 'unizg', unit: 'fpzg' });

    const b = urlSelection(new URLSearchParams('unit=izmisljeno&work=diplomski'), UNITS, slug);
    expect(b.selection).toEqual({ workType: 'graduate' });
  });

  it('project se prenosi doslovno i nikad ne tumaci', () => {
    const out = urlSelection(new URLSearchParams('project=%20abc-123%20'), UNITS, slug);
    expect(out.projectId, 'vrijednost se trimma, ali se ne validira').toBe('abc-123');
    expect(out.selection).toEqual({});
    expect(urlSelection(new URLSearchParams('project='), UNITS, slug).projectId).toBeNull();
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se izvedba koja odustane od CIJELOG odabira cim
   * jedan dio ne valja, dakle spojeni no-op.
   */
  it('gard grize: spojeni no-op gubi ispravan dio', () => {
    const spojeni = (p: URLSearchParams): Record<string, string> => {
      const uid = (p.get('unit') || '').trim();
      const wt = slug((p.get('work') || '').trim());
      if (!uid || !wt) return {}; // podmetnuto: sve ili nista
      return { unit: uid, workType: wt };
    };
    const params = new URLSearchParams('unit=fpzg&work=izmisljeno');
    expect(spojeni(params), 'podmetnuta izvedba MORA izgubiti ispravan fakultet').toEqual({});
    expect(urlSelection(params, UNITS, slug).selection.unit, 'baseline je izmjeren').toBe('fpzg');
  });

  it('SENTINEL: prazan upit ne izmislja nista', () => {
    const out = urlSelection(new URLSearchParams(''), UNITS, slug);
    expect(out.selection).toEqual({});
    expect(out.projectId).toBeNull();
  });
});
