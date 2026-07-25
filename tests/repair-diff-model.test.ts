import { describe, it, expect } from 'vitest';
import { buildDiffOps, diffWords, locateChanges, type DiffParagraph } from '../src/ui/repair-diff-model';

function m(texts: Array<string | [number, string]>) {
  return {
    paragraphs: texts.map((t, i): DiffParagraph => {
      if (Array.isArray(t)) return { index: i + 1, text: t[1], headingLevel: t[0] };
      return { index: i + 1, text: t };
    }),
  };
}

describe('buildDiffOps: poravnanje odlomaka', () => {
  it('bez razlika ne prijavljuje nista', () => {
    expect(buildDiffOps(m(['a', 'b', 'c']), m(['a', 'b', 'c']))).toEqual([]);
  });

  it('jedan obrisan prazan odlomak: jedno brisanje, ostatak netaknut', () => {
    const ops = buildDiffOps(m(['a', '', 'b', 'c']), m(['a', 'b', 'c']));
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('delete');
    expect(ops[0].before).toBe(2);
    expect(ops[0].after).toBeNull();
  });

  // Ovo je scenarij koji je stara implementacija lomila: niz od 3 prazna sazet na 1 (pomak 2).
  it('niz od 3 prazna sazet na 1 daje TOCNO 2 brisanja, ne desinkronizira ostatak', () => {
    const before = m(['A', '', '', '', 'B', 'C', 'D', 'E']);
    const after = m(['A', '', 'B', 'C', 'D', 'E']);
    const ops = buildDiffOps(before, after);
    expect(ops.every((o) => o.kind === 'delete')).toBe(true);
    expect(ops).toHaveLength(2); // dva viska prazna reda, a NE 5 laznih mjesta
    expect(ops.map((o) => o.before)).toEqual([3, 4]);
    // Nijedan od preostalih odlomaka (B,C,D,E) nije lazno prijavljen kao promjena.
    expect(ops.some((o) => o.after !== null)).toBe(false);
  });

  it('umetnut Sadrzaj (vise redaka) daje umetanja, ne stotine laznih mjesta', () => {
    const before = m(['Naslov', ...Array.from({ length: 30 }, (_, i) => `Odlomak ${i}`)]);
    const toc = Array.from({ length: 20 }, (_, i) => `Poglavlje ${i} .... ${i + 3}`);
    const after = m(['Naslov', 'Sadrzaj', ...toc, ...Array.from({ length: 30 }, (_, i) => `Odlomak ${i}`)]);
    const ops = buildDiffOps(before, after);
    expect(ops.every((o) => o.kind === 'insert')).toBe(true);
    expect(ops).toHaveLength(21); // Sadrzaj + 20 redaka, tocno; ostatak se poravnao
  });

  it('dodavanje na kraju prijavljuje SVE dodane odlomke (ne samo jedan)', () => {
    const ops = buildDiffOps(m(['a', 'b']), m(['a', 'b', 'c', 'd', 'e']));
    expect(ops).toHaveLength(3);
    expect(ops.every((o) => o.kind === 'insert')).toBe(true);
    expect(ops.map((o) => o.after)).toEqual([3, 4, 5]);
  });

  it('brisanje na kraju prijavljuje SVE obrisane odlomke', () => {
    const ops = buildDiffOps(m(['a', 'b', 'c', 'd', 'e']), m(['a', 'b']));
    expect(ops).toHaveLength(3);
    expect(ops.every((o) => o.kind === 'delete')).toBe(true);
    expect(ops.map((o) => o.before)).toEqual([3, 4, 5]);
  });
});

describe('buildDiffOps: promijenjen tekst (zamjena)', () => {
  it('naslov velika slova (Uvod -> UVOD) je JEDNA zamjena, ne brisanje+umetanje', () => {
    const before = m([[1, 'Uvod'], 'tekst']);
    const after = m([[1, 'UVOD'], 'tekst']);
    const ops = buildDiffOps(before, after);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('replace');
    expect(ops[0].before).toBe(1);
    expect(ops[0].after).toBe(1);
    expect(ops[0].beforeText).toBe('Uvod');
    expect(ops[0].afterText).toBe('UVOD');
    expect(ops[0].headingLevel).toBe(1);
  });

  it('prazan odlomak uz promijenjeni naslov ostaje strukturno brisanje, a naslov je zamjena', () => {
    const before = m([[1, 'Uvod'], '', 'tekst']);
    const after = m([[1, 'UVOD'], 'tekst']);
    const ops = buildDiffOps(before, after);
    const replace = ops.filter((o) => o.kind === 'replace');
    const del = ops.filter((o) => o.kind === 'delete');
    expect(replace).toHaveLength(1);
    expect(replace[0].afterText).toBe('UVOD');
    expect(del).toHaveLength(1);
    expect(del[0].beforeText).toBe('');
  });
});

describe('diffWords', () => {
  it('oznacava samo promijenjene rijeci, cuva zajednicke i sve znakove', () => {
    const { before, after } = diffWords('crvena kuca na brijegu', 'crvena zgrada na brijegu');
    expect(before.map((t) => t.text).join('')).toBe('crvena kuca na brijegu');
    expect(after.map((t) => t.text).join('')).toBe('crvena zgrada na brijegu');
    expect(before.filter((t) => t.changed).map((t) => t.text)).toEqual(['kuca']);
    expect(after.filter((t) => t.changed).map((t) => t.text)).toEqual(['zgrada']);
  });

  it('promjena velicine slova cijele rijeci: rijec je promijenjena na obje strane', () => {
    const { before, after } = diffWords('Uvod', 'UVOD');
    expect(before).toEqual([{ text: 'Uvod', changed: true }]);
    expect(after).toEqual([{ text: 'UVOD', changed: true }]);
  });
});

describe('locateChanges (natrag-kompatibilno)', () => {
  it('prazan model ne rusi', () => {
    expect(locateChanges(m([]), m([]))).toEqual([]);
    expect(locateChanges(null, null)).toEqual([]);
  });

  it('postuje limit', () => {
    const before = m(Array.from({ length: 100 }, (_, i) => `x${i}`));
    const after = m(Array.from({ length: 100 }, (_, i) => `y${i}`));
    expect(locateChanges(before, after, 5).length).toBeLessThanOrEqual(5);
  });
});
