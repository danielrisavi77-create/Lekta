import { describe, expect, it } from 'vitest';
import {
  applyRepairSelectionSnapshot, buildRepairSelectionSnapshot, defaultRepairSelection,
  parseRepairSelectionKey, repairItemsDigest, repairSelectionKey,
} from '../src/ui/repair-selection';
import { defaultSelectedItems } from '../src/repair/default-selection';
import { hashString } from '../src/profiles/profile-fingerprint';
import { REPAIR_SELECTION_SCHEMA_VERSION } from '../src/session/local-document-session';

/**
 * IDENTITET, OTISAK I VRACANJE ODABIRA POPRAVAKA (korak C6, 2026-09-12).
 *
 * Gard mjeri MEHANIZAM vlastitim brojacima (`applied`, `skippedUnknown`, `advancedNeedsReview`,
 * `rejected`), ne nizvodnim ucinkom (broj oznacenih kucica), jer kucice mogu biti oznacene i zbog
 * predodabira. Sentineli: prazna populacija nikad ne daje valjan otisak ni uredan no-op.
 */

const item = (fixerId: string, ruleId: string, over: Record<string, unknown> = {}) =>
  ({ fixerId, ruleId, params: {}, ...over });

const A = item('font-fixer', 'fer--font', { violated: true });
const B = item('margins-fixer', 'fer--margins', { violated: false });
const C = item('paper-size-fixer', 'fer--paper-size', { recommended: true, violated: false });
const D = item('toc-field-fixer', 'toc-field');

describe('kljuc odabira', () => {
  it('je `fixerId|ruleId` i parsira se natrag na PRVOM separatoru', () => {
    expect(repairSelectionKey(A)).toBe('font-fixer|fer--font');
    expect(parseRepairSelectionKey('font-fixer|fer--font')).toEqual({ fixerId: 'font-fixer', ruleId: 'fer--font' });
    // `ruleId` smije nositi `|`; `fixerId` nikad, pa je prvi separator jedini ispravan rez.
    expect(parseRepairSelectionKey('f|a|b')).toEqual({ fixerId: 'f', ruleId: 'a|b' });
    expect(parseRepairSelectionKey('bez-separatora')).toBeNull();
    expect(parseRepairSelectionKey('|prazan-fixer')).toBeNull();
    expect(parseRepairSelectionKey('prazan-rule|')).toBeNull();
  });
});

describe('zadani odabir', () => {
  it('je po CLANSTVU jednak defaultSelectedItems preslikanom u kljuceve, za sve kombinacije violated/recommended', () => {
    const kombinacije = [
      item('f', '1', { violated: true }),
      item('f', '2', { violated: false }),
      item('f', '3'),
      item('f', '4', { recommended: true, violated: false }),
      item('f', '5', { recommended: true }),
      item('f', '6', { violated: true, recommended: true }),
    ];
    const ocekivano = defaultSelectedItems(kombinacije).map(repairSelectionKey);
    // SENTINEL: usporedba dviju praznih populacija nije tvrdnja o pravilu.
    expect(ocekivano.length).toBeGreaterThan(0);
    expect(ocekivano.length).toBeLessThan(kombinacije.length);
    expect(defaultRepairSelection(kombinacije)).toEqual(ocekivano);
    // Stavka BEZ izricitog podatka je predodabrana (`violated !== false`, ne `=== true`).
    expect(defaultRepairSelection([item('f', 'x')])).toEqual(['f|x']);
  });
});

describe('otisak ponude', () => {
  it('je isti za preslagan isti skup, a RAZLICIT cim se stavka doda, makne ili joj se promijeni fixerId', () => {
    const osnova = repairItemsDigest([A, B, C]);
    expect(repairItemsDigest([C, A, B])).toBe(osnova);
    expect(repairItemsDigest([A, B, C, D])).not.toBe(osnova);
    expect(repairItemsDigest([A, B])).not.toBe(osnova);
    expect(repairItemsDigest([A, B, item('drugi-fixer', C.ruleId)])).not.toBe(osnova);
    // Ponovljen kljuc mijenja otisak: broj stavaka je dio identiteta.
    expect(repairItemsDigest([A, A, B, C])).not.toBe(osnova);
  });

  it('koristi hashString iz profile-fingerprint (treci hash se ne uvodi)', () => {
    expect(repairItemsDigest([B, A])).toBe(hashString(['font-fixer|fer--font', 'margins-fixer|fer--margins'].join('\n')));
  });

  it('SENTINEL: prazna populacija BACA, a snimka nad njom je null', () => {
    expect(() => repairItemsDigest([])).toThrow(/prazan skup/);
    expect(buildRepairSelectionSnapshot({ items: [], keys: ['a|b'], deep: true, now: 1 })).toBeNull();
    // Dva razlicita prazna skupa ne smiju dati jednak valjan otisak: valjanog otiska nema.
    let prvi: string | null = null;
    let drugi: string | null = null;
    try { prvi = repairItemsDigest([]); } catch { /* ocekivano */ }
    try { drugi = repairItemsDigest([]); } catch { /* ocekivano */ }
    expect(prvi).toBeNull();
    expect(drugi).toBeNull();
  });
});

describe('snimka', () => {
  it('nosi otisak, deep i SAMO poznate kljuceve, bez ponavljanja, u redoslijedu ulaza', () => {
    const s = buildRepairSelectionSnapshot({ items: [A, B, C], keys: ['margins-fixer|fer--margins', 'nepoznat|x', 'font-fixer|fer--font', 'font-fixer|fer--font'], deep: false, now: 42 });
    expect(s).toEqual({
      schemaVersion: REPAIR_SELECTION_SCHEMA_VERSION,
      itemsDigest: repairItemsDigest([A, B, C]),
      selected: ['margins-fixer|fer--margins', 'font-fixer|fer--font'],
      deep: false,
      updatedAt: 42,
    });
  });
});

describe('vracanje snimke', () => {
  const snimka = (items: typeof A[], keys: string[]) =>
    buildRepairSelectionSnapshot({ items, keys, deep: true, now: 7 })!;

  it('vraca applied > 0 po IDENTITETU i nad PRESLAGANIM skupom', () => {
    const s = snimka([A, B, C], ['font-fixer|fer--font', 'paper-size-fixer|fer--paper-size']);
    const r = applyRepairSelectionSnapshot([C, B, A], s);
    expect(r.rejected).toBeNull();
    expect(r.applied).toBe(2);
    expect(r.skippedUnknown).toBe(0);
    expect(r.ruleIds).toEqual(['fer--font', 'fer--paper-size']);
  });

  it('SENTINEL: neprazan selected s applied 0 uz rejected null je PAD, ne uredan no-op', () => {
    const s = snimka([A, B, C], ['font-fixer|fer--font']);
    const r = applyRepairSelectionSnapshot([A, B, C], s);
    expect(s.selected.length).toBeGreaterThan(0);
    expect(r.rejected === null && r.applied === 0, 'mrtav mehanizam s brojacem na nuli').toBe(false);
  });

  it('odbija s digest-mismatch uz promijenjen skup, i tada NISTA ne preslikava (applied === 0)', () => {
    const s = snimka([A, B, C], ['font-fixer|fer--font']);
    const r = applyRepairSelectionSnapshot([A, B, C, D], s);
    expect(r.rejected).toBe('digest-mismatch');
    expect(r.applied).toBe(0);
    expect(r.ruleIds).toEqual([]);
    // Prazna ponuda takodjer ne vraca nista.
    expect(applyRepairSelectionSnapshot([], s).rejected).toBe('digest-mismatch');
  });

  it('broji skippedUnknown za kljuc kojeg nema, uz isti otisak (rucno skrojena snimka)', () => {
    const s = { ...snimka([A, B], ['font-fixer|fer--font']), selected: ['font-fixer|fer--font', 'duh|nema'] };
    const r = applyRepairSelectionSnapshot([A, B], s);
    expect(r.rejected).toBeNull();
    expect(r.applied).toBe(1);
    expect(r.skippedUnknown).toBe(1);
  });

  it('napredne forme se NE vracaju oznacene nego se broje u advancedNeedsReview', () => {
    const s = snimka([A, B], ['font-fixer|fer--font', 'margins-fixer|fer--margins']);
    const r = applyRepairSelectionSnapshot([A, B], s, { isAdvanced: (i) => i.ruleId === 'fer--margins' });
    expect(r.applied).toBe(1);
    expect(r.advancedNeedsReview).toBe(1);
    expect(r.ruleIds).toEqual(['fer--font']);
  });

  it('kriva shema ili nedostajuca snimka daju rejected schema', () => {
    expect(applyRepairSelectionSnapshot([A], undefined).rejected).toBe('schema');
    expect(applyRepairSelectionSnapshot([A], { ...snimka([A], []), schemaVersion: 99 as unknown as 1 }).rejected).toBe('schema');
  });
});
