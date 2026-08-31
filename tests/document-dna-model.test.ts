import { describe, expect, it } from 'vitest';
import {
  bucketRanges,
  buildDocumentDnaModel,
  type DnaFindingInput,
  type DocumentDnaInput,
} from '../src/ui/results/document-dna-model';

function input(over: Partial<DocumentDnaInput> = {}): DocumentDnaInput {
  return {
    totalParagraphs: 240,
    lastPreviewedParagraph: 240,
    previewTruncated: false,
    headings: [],
    findings: [],
    provisional: false,
    ...over,
  };
}

function finding(over: Partial<DnaFindingInput> = {}): DnaFindingInput {
  return {
    id: 'f1',
    category: 'structure',
    severity: 'error',
    title: 'Nalaz',
    locations: [],
    ...over,
  };
}

function available(model: ReturnType<typeof buildDocumentDnaModel>) {
  if (model.kind !== 'available') throw new Error('ocekivan dostupan model, dobiven: ' + model.kind);
  return model;
}

describe('DNA rada: geometrija osi', () => {
  it.each([1, 7, 24, 25, 240, 1001])('rasponi su kontinuirani i iscrpni za %i odlomaka', (total) => {
    const ranges = bucketRanges(total);
    expect(ranges[0].from).toBe(1);
    expect(ranges[ranges.length - 1].to).toBe(total);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].from).toBe(ranges[i - 1].to + 1);
    }
    expect(ranges.every((r) => r.to >= r.from)).toBe(true);
  });

  it.each([1, 7, 24, 25, 240, 1001])('svaki odlomak pripada TOCNO jednoj kanti (%i)', (total) => {
    const buckets = available(buildDocumentDnaModel(input({ totalParagraphs: total }))).buckets;
    for (const p of [1, Math.ceil(total / 2), total]) {
      const hits = buckets.filter((b) => p >= b.from && p <= b.to);
      expect(hits, `odlomak ${p} od ${total}`).toHaveLength(1);
    }
  });

  it('do 24 odlomka svaka kanta nosi tocno jedan', () => {
    const buckets = available(buildDocumentDnaModel(input({ totalParagraphs: 7 }))).buckets;
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.from === b.to)).toBe(true);
  });

  it('bez izmjerenih odlomaka traka se ne crta, i to se imenuje', () => {
    const model = buildDocumentDnaModel(input({ totalParagraphs: 0 }));
    expect(model.kind).toBe('unavailable');
    if (model.kind === 'unavailable') expect(model.reason).toMatch(/odlomaka/i);
  });
});

describe('DNA rada: pravilo mapiranja', () => {
  it('oblikovanje NIKAD ne ulazi u kantu, makar mu tekst podmece broj odlomka', () => {
    const model = available(buildDocumentDnaModel(input({
      findings: [finding({
        id: 'fmt',
        category: 'formatting',
        locations: [{ paragraphIndex: 12, anchorId: 'loc-p12' }],
      })],
    })));
    expect(model.buckets.every((b) => !b.findingIds.includes('fmt'))).toBe(true);
    expect(model.documentWide.findingIds).toContain('fmt');
    expect(model.buckets.reduce((n, b) => n + b.locationCount, 0)).toBe(0);
  });

  it('oblikovanje s fusnotom ide u traku fusnota, ne u documentWide ni u kantu', () => {
    const model = available(buildDocumentDnaModel(input({
      findings: [finding({
        id: 'fmt-fn',
        category: 'formatting',
        locations: [{ paragraphIndex: 0, footnoteId: 7, anchorId: 'loc-fn7' }],
      })],
    })));
    expect(model.footnotes.map((f) => f.footnoteId)).toEqual([7]);
    expect(model.documentWide.findingIds).not.toContain('fmt-fn');
    expect(model.buckets.every((b) => !b.findingIds.includes('fmt-fn'))).toBe(true);
  });

  it('nalaz bez ijedne lokacije ide u unplaced, ne u kantu ni u documentWide', () => {
    const model = available(buildDocumentDnaModel(input({
      findings: [finding({ id: 'nema', category: 'citations', locations: [] })],
    })));
    expect(model.unplaced.findingIds).toEqual(['nema']);
    expect(model.documentWide.findingIds).not.toContain('nema');
    expect(model.buckets.every((b) => !b.findingIds.includes('nema'))).toBe(true);
  });

  it('sidro izvan raspona se BROJI, nikad ne stisce u zadnju kantu', () => {
    const model = available(buildDocumentDnaModel(input({
      totalParagraphs: 100,
      findings: [finding({
        id: 'van',
        locations: [{ paragraphIndex: 9999, anchorId: 'loc-p9999' }, { paragraphIndex: 0, anchorId: 'loc-p0' }],
      })],
    })));
    expect(model.unplaced.outOfRangeCount).toBe(2);
    expect(model.buckets[model.buckets.length - 1].findingIds).not.toContain('van');
  });

  it('isto sidro dvaput broji jednom; sedam razlicitih pali sedam kanti', () => {
    const dupe = available(buildDocumentDnaModel(input({
      findings: [finding({ locations: [{ paragraphIndex: 5, anchorId: 'loc-p5' }, { paragraphIndex: 5, anchorId: 'loc-p5' }] })],
    })));
    expect(dupe.buckets.reduce((n, b) => n + b.locationCount, 0)).toBe(1);

    const spread = available(buildDocumentDnaModel(input({
      totalParagraphs: 240,
      findings: [finding({
        locations: [10, 40, 70, 100, 130, 160, 190].map((p) => ({ paragraphIndex: p, anchorId: `loc-p${p}` })),
      })],
    })));
    expect(spread.buckets.filter((b) => b.findingIds.includes('f1'))).toHaveLength(7);
    expect(spread.buckets.filter((b) => b.findingIds.length > 0).every((b) => b.findingIds.length === 1)).toBe(true);
  });
});

describe('DNA rada: degradirana stanja', () => {
  it('skracen pregled gasi SKOK, ali ne i gustocu (ona dolazi iz triage, ne iz preview)', () => {
    const model = available(buildDocumentDnaModel(input({
      totalParagraphs: 240,
      lastPreviewedParagraph: 100,
      previewTruncated: true,
      findings: [finding({ locations: [{ paragraphIndex: 200, anchorId: 'loc-p200' }] })],
    })));
    const late = model.buckets.filter((b) => b.from > 100);
    expect(late.every((b) => b.beyondPreview)).toBe(true);
    expect(late.every((b) => b.jumpParagraphIndex === null)).toBe(true);
    expect(late.reduce((n, b) => n + b.locationCount, 0)).toBe(1);
  });

  it('bez prepoznatih naslova traka i dalje postoji, samo bez oznaka', () => {
    const model = available(buildDocumentDnaModel(input({ headings: [] })));
    expect(model.headingsAvailable).toBe(false);
    expect(model.buckets.length).toBeGreaterThan(0);
    expect(model.buckets.every((b) => b.headings.length === 0)).toBe(true);
  });

  it('bez sidrenih nalaza traka je prazna, a ne ravnomjerno rasporedjena', () => {
    const model = available(buildDocumentDnaModel(input()));
    expect(model.buckets.every((b) => b.heightRatio === 0 && b.dominantSeverity === null)).toBe(true);
  });

  it('heightRatio je 0..1 s najgusсom kantom na tocno 1', () => {
    const model = available(buildDocumentDnaModel(input({
      totalParagraphs: 240,
      findings: [
        finding({ id: 'a', locations: [{ paragraphIndex: 5, anchorId: 'a1' }, { paragraphIndex: 6, anchorId: 'a2' }] }),
        finding({ id: 'b', locations: [{ paragraphIndex: 200, anchorId: 'b1' }] }),
      ],
    })));
    const ratios = model.buckets.map((b) => b.heightRatio);
    expect(Math.max(...ratios)).toBe(1);
    expect(ratios.every((r) => r >= 0 && r <= 1)).toBe(true);
  });
});

describe('DNA rada: tripwire protiv izmisljanja stranica', () => {
  it('model nigdje ne nosi broj stranice ni niz "str."', () => {
    const model = buildDocumentDnaModel(input({
      totalParagraphs: 240,
      headings: [{ index: 12, level: 1, excerpt: 'Uvod' }],
      findings: [
        finding({ locations: [{ paragraphIndex: 12, anchorId: 'loc-p12' }] }),
        finding({ id: 'fn', locations: [{ paragraphIndex: 0, footnoteId: 3, anchorId: 'loc-fn3' }] }),
      ],
    }));
    const json = JSON.stringify(model);
    expect(json).not.toMatch(/str\./);
    expect(json).not.toMatch(/"page"/);

    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
      }
    };
    walk(model);
    expect([...keys].filter((k) => /page|stranic/i.test(k))).toEqual([]);
  });
});
