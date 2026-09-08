import { describe, expect, it } from 'vitest';
import { deskItems, findingForFlag, trakaZaOpseg, type DeskFinding, type DeskFlag } from '../src/ui/results/desk-model';

const n = (id: string, scope: DeskFinding['scope']): DeskFinding => ({ id, title: id, severity: 'warning', scope });

describe('korektorski stol: spoj nalaza i mjesta', () => {
  it('nalaz sa sidrom dobiva zastavicu na istom odlomku', () => {
    const flags: DeskFlag[] = [{ paragraphIndex: 7 }, { paragraphIndex: 42 }];
    const items = deskItems([n('a', { kind: 'anchor', paragraphIndex: 42 })], flags);
    expect(items[0].flagIndex).toBe(1);
  });

  it('FUSNOTA JE ZASEBAN PROSTOR i ne smije pasti na odlomak istog broja', () => {
    // `paragraphIndex` je 0 kad nalaz cilja fusnotu; da se kljuc gradi samo od broja, fusnota 3 i
    // odlomak 3 bili bi isto mjesto i klik bi vodio na krivi dio dokumenta.
    const flags: DeskFlag[] = [{ paragraphIndex: 3 }, { paragraphIndex: 0, footnoteId: 3 }];
    const izOdlomka = deskItems([n('p', { kind: 'anchor', paragraphIndex: 3 })], flags);
    const izFusnote = deskItems([n('f', { kind: 'anchor', paragraphIndex: 0, footnoteId: 3 })], flags);
    expect(izOdlomka[0].flagIndex).toBe(0);
    expect(izFusnote[0].flagIndex).toBe(1);
  });

  it('nalaz bez sidra NEMA vezu, i to je ishod a ne kvar', () => {
    // Izmjereno: 45% nalaza vrijedi za cijeli rad, 16% za podrucje, 33% se ne zna. Kad bi se za
    // njih izmislio flagIndex, klik bi vodio na mjesto koje nitko nije izmjerio.
    const flags: DeskFlag[] = [{ paragraphIndex: 1 }];
    const items = deskItems([
      n('d', { kind: 'document' }),
      n('r', { kind: 'region', label: 'sadržaj' }),
      n('u', { kind: 'unavailable', reason: 'ne zna se' }),
    ], flags);
    expect(items.map((i) => i.flagIndex)).toEqual([null, null, null]);
  });

  it('sidro bez odgovarajuce zastavice ostaje bez veze', () => {
    // Nalaz zna odlomak, ali renderer ondje nista ne crta. Lazna veza bi vodila na prazno mjesto.
    const items = deskItems([n('a', { kind: 'anchor', paragraphIndex: 99 })], [{ paragraphIndex: 1 }]);
    expect(items[0].flagIndex).toBeNull();
  });

  it('kad vise zastavica gadja isto mjesto, uzima se PRVA', () => {
    const flags: DeskFlag[] = [{ paragraphIndex: 5 }, { paragraphIndex: 5 }];
    expect(deskItems([n('a', { kind: 'anchor', paragraphIndex: 5 })], flags)[0].flagIndex).toBe(0);
  });

  it('obrnut smjer: klik na oznaceno mjesto nalazi svoj nalaz', () => {
    const flags: DeskFlag[] = [{ paragraphIndex: 5 }, { paragraphIndex: 9 }];
    const items = deskItems([n('a', { kind: 'anchor', paragraphIndex: 9 })], flags);
    expect(findingForFlag(items, 1)?.id).toBe('a');
    // Zastavica bez svog nalaza (npr. registar dugih recenica) ne smije vratiti tudji nalaz.
    expect(findingForFlag(items, 0)).toBeNull();
  });

  it('traka umjesto okvira: svaki opseg bez sidra ima svoju recenicu', () => {
    expect(trakaZaOpseg({ kind: 'anchor', paragraphIndex: 1 })).toBeNull();
    expect(trakaZaOpseg({ kind: 'document' })).toContain('cijeli rad');
    expect(trakaZaOpseg({ kind: 'region', label: 'sadržaj' })).toContain('sadržaj');
    expect(trakaZaOpseg({ kind: 'unavailable', reason: 'zašto ne' })).toBe('zašto ne');
  });

  it('prazan ulaz ne baca', () => {
    expect(deskItems([], [])).toEqual([]);
    expect(findingForFlag([], 0)).toBeNull();
  });
});
