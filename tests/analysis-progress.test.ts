import { describe, it, expect } from 'vitest';
import type { DocumentFingerprint } from '../src/fingerprint/fingerprint';
import {
  sortByRecency,
  groupByDocument,
  documentProgress,
  summarizeProgress,
  activeDocumentProgress,
  describeProgress,
  type HistoryEntry,
} from '../src/history/progress';

function fp(titleNorm: string, authorNorm = 'ana', headings: string[] = ['uvod', 'razrada', 'zakljucak']): DocumentFingerprint {
  return { titleNorm, authorNorm, headings, sectionCount: headings.length };
}

function entry(id: string, at: string, score: number, docFingerprint: DocumentFingerprint | null, fileName = 'rad.docx'): HistoryEntry {
  return { id, generatedAt: at, fileName, score, docFingerprint };
}

describe('sortByRecency', () => {
  it('vraca najnoviji zapis prvi i ne mutira ulaz', () => {
    const input = [
      entry('a', '2026-01-01T10:00:00Z', 60, fp('teza')),
      entry('b', '2026-03-01T10:00:00Z', 80, fp('teza')),
      entry('c', '2026-02-01T10:00:00Z', 70, fp('teza')),
    ];
    const out = sortByRecency(input);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((x) => x.id)).toEqual(['a', 'b', 'c']); // original netaknut
  });
});

describe('groupByDocument', () => {
  it('grupira re-checkove istog rada preko jakog match naslova', () => {
    const entries = [
      entry('r1', '2026-01-01T10:00:00Z', 60, fp('teza o pravu')),
      entry('r2', '2026-01-05T10:00:00Z', 75, fp('teza o pravu')),
      entry('r3', '2026-01-09T10:00:00Z', 88, fp('teza o pravu')),
    ];
    const groups = groupByDocument(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((x) => x.id)).toEqual(['r3', 'r2', 'r1']); // najnoviji prvi
  });

  it('razdvaja razlicite dokumente', () => {
    const groups = groupByDocument([
      entry('a', '2026-01-01T10:00:00Z', 60, fp('teza o pravu')),
      entry('b', '2026-01-02T10:00:00Z', 50, fp('seminar iz etike', 'ana', ['a', 'b'])),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('labavi match: razlicit naslov ali isti autor i ista sekvenca naslova grupira zajedno', () => {
    const headings = ['uvod', 'metode', 'rezultati', 'zakljucak'];
    const groups = groupByDocument([
      entry('v1', '2026-01-01T10:00:00Z', 55, fp('verzija jedan', 'marko', headings)),
      entry('v2', '2026-01-04T10:00:00Z', 70, fp('verzija dva', 'marko', headings)),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((x) => x.id)).toEqual(['v2', 'v1']);
  });

  it('zapisi bez otiska cine svaku svoju grupu (ne grupiraju se naslijepo)', () => {
    const groups = groupByDocument([
      entry('n1', '2026-01-01T10:00:00Z', 40, null),
      entry('n2', '2026-01-02T10:00:00Z', 45, null),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('documentProgress', () => {
  it('racuna rastucu putanju (delta, best, trend up)', () => {
    const group = [
      entry('r3', '2026-01-09T10:00:00Z', 88, fp('teza')),
      entry('r2', '2026-01-05T10:00:00Z', 75, fp('teza')),
      entry('r1', '2026-01-01T10:00:00Z', 60, fp('teza')),
    ];
    const p = documentProgress(group);
    expect(p.revisions).toBe(3);
    expect(p.firstScore).toBe(60);
    expect(p.latestScore).toBe(88);
    expect(p.bestScore).toBe(88);
    expect(p.delta).toBe(28);
    expect(p.trend).toBe('up');
    expect(p.firstAt).toBe('2026-01-01T10:00:00Z');
    expect(p.latestAt).toBe('2026-01-09T10:00:00Z');
    expect(p.entryIds).toEqual(['r3', 'r2', 'r1']);
  });

  it('pad score-a je trend down, best cuva vrhunac', () => {
    const group = [
      entry('r2', '2026-01-05T10:00:00Z', 70, fp('teza')),
      entry('r1', '2026-01-01T10:00:00Z', 90, fp('teza')),
    ];
    const p = documentProgress(group);
    expect(p.delta).toBe(-20);
    expect(p.trend).toBe('down');
    expect(p.bestScore).toBe(90);
  });

  it('jedna provjera je trend flat, delta 0', () => {
    const p = documentProgress([entry('r1', '2026-01-01T10:00:00Z', 74, fp('teza'))]);
    expect(p.revisions).toBe(1);
    expect(p.delta).toBe(0);
    expect(p.trend).toBe('flat');
    expect(p.firstScore).toBe(74);
    expect(p.latestScore).toBe(74);
  });
});

describe('summarizeProgress i activeDocumentProgress', () => {
  const entries = [
    entry('a1', '2026-01-01T10:00:00Z', 60, fp('teza o pravu')),
    entry('a2', '2026-01-05T10:00:00Z', 75, fp('teza o pravu')),
    entry('b1', '2026-01-06T10:00:00Z', 50, fp('drugi rad', 'iva', ['x', 'y', 'z'])),
    entry('a3', '2026-01-09T10:00:00Z', 88, fp('teza o pravu')),
  ];

  it('sortira dokumente po najnovijoj aktivnosti', () => {
    const summary = summarizeProgress(entries);
    expect(summary).toHaveLength(2);
    // teza je zadnje dirana (a3), pa je prva
    expect(summary[0].fileName).toBe('rad.docx');
    expect(summary[0].revisions).toBe(3);
    expect(summary[0].latestScore).toBe(88);
    expect(summary[1].revisions).toBe(1);
  });

  it('activeDocumentProgress vraca najnovije diran dokument', () => {
    const active = activeDocumentProgress(entries);
    expect(active?.latestScore).toBe(88);
    expect(active?.delta).toBe(28);
  });

  it('prazna povijest daje null', () => {
    expect(activeDocumentProgress([])).toBeNull();
    expect(summarizeProgress([])).toEqual([]);
  });
});

describe('describeProgress', () => {
  it('jedna provjera bez delte', () => {
    const p = documentProgress([entry('r1', '2026-01-01T10:00:00Z', 74, fp('teza'))]);
    expect(describeProgress(p)).toBe('1. provjera, 74');
  });

  it('vise provjera prikazuje pozitivnu deltu', () => {
    const p = documentProgress([
      entry('r3', '2026-01-09T10:00:00Z', 88, fp('teza')),
      entry('r1', '2026-01-01T10:00:00Z', 62, fp('teza')),
    ]);
    expect(describeProgress(p)).toBe('2. provjera, 88 (+26 od prve provjere)');
  });

  it('bez promjene score-a', () => {
    const p = documentProgress([
      entry('r2', '2026-01-05T10:00:00Z', 80, fp('teza')),
      entry('r1', '2026-01-01T10:00:00Z', 80, fp('teza')),
    ]);
    expect(describeProgress(p)).toBe('2. provjera, 80 (bez promjene od prve provjere)');
  });
});
