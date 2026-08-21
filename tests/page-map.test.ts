/**
 * Pin za heuristicku paginaciju (buildPageMap): monotonija, tvrdi prijelomi, kalibracija na
 * storedPages s klampom, skraceni preview bez kalibracije. Procjena je UI sloj i nikad ne
 * ulazi u checks/stats (golden cuva stats bajt-identicnim, pa bi svaki pokusaj bodovanja po
 * procjeni pao tamo; ovdje se pinna ugovor da je izlaz cist objekt bez veze na rezultat).
 */
import { describe, expect, it } from 'vitest';
import { buildPageMap } from '../src/preview/page-map';
import type { PreviewModel, PreviewParagraph } from '../src/preview/preview-anchors';

function para(index: number, text: string, extra: Partial<PreviewParagraph> = {}): PreviewParagraph {
  return { index, text, headingLevel: null, ...extra };
}

function model(paragraphs: PreviewParagraph[], extra: Partial<PreviewModel> = {}): PreviewModel {
  return { paragraphs, truncated: false, ...extra };
}

const LONG = 'x'.repeat(500);

describe('buildPageMap', () => {
  it('prazan model daje praznu mapu', () => {
    expect(buildPageMap({ model: model([]) })).toEqual({ pageOf: [], pageCount: 0, calibrated: false, approximate: true });
  });

  it('samo tvrdi prijelomi: pageCount = brojPrijeloma + 1, svi odlomci mapirani', () => {
    const map = buildPageMap({
      model: model([para(1, 'A'), para(2, 'B', { pageBreakAfter: true }), para(3, 'C')]),
    });
    expect(map.pageOf).toEqual([1, 1, 2]);
    expect(map.pageCount).toBe(2);
  });

  it('tvrdi prijelom iza ZADNJEG odlomka ne otvara praznu stranicu', () => {
    const map = buildPageMap({ model: model([para(1, 'A'), para(2, 'B', { pageBreakAfter: true })]) });
    expect(map.pageCount).toBe(1);
  });

  it('pageOf je nepadajuci (monotonija po konstrukciji)', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => para(i + 1, LONG));
    const map = buildPageMap({ model: model(paragraphs) });
    expect(map.pageCount).toBeGreaterThan(1);
    for (let i = 1; i < map.pageOf.length; i++) expect(map.pageOf[i]).toBeGreaterThanOrEqual(map.pageOf[i - 1]);
    expect(map.pageOf[map.pageOf.length - 1]).toBe(map.pageCount);
  });

  it('granica sekcije je tvrdi prijelom; zadnji sectPr (indeks zadnjeg odlomka) se filtrira', () => {
    const map = buildPageMap({
      model: model([para(1, 'A'), para(2, 'B'), para(3, 'C'), para(4, 'D')]),
      sectionBreaks: [2, 4],
    });
    expect(map.pageOf).toEqual([1, 1, 2, 2]);
    expect(map.pageCount).toBe(2);
  });

  it('kalibracija priblizi pageCount Wordovom broju (unutar tolerancije)', () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => para(i + 1, LONG));
    const raw = buildPageMap({ model: model(paragraphs) });
    const stored = raw.pageCount + Math.max(2, Math.round(raw.pageCount * 0.4));
    const k = stored / raw.pageCount;
    if (k <= 1.8) {
      const cal = buildPageMap({ model: model(paragraphs), storedPages: stored });
      expect(cal.calibrated).toBe(true);
      expect(Math.abs(cal.pageCount - stored)).toBeLessThanOrEqual(Math.max(1, Math.round(stored * 0.15)));
    }
  });

  it('klamp: apsurdan storedPages (zastario) NE kalibrira i to posteno kaze', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => para(i + 1, LONG));
    const raw = buildPageMap({ model: model(paragraphs) });
    const map = buildPageMap({ model: model(paragraphs), storedPages: raw.pageCount * 5 });
    expect(map.calibrated).toBe(false);
    expect(map.pageCount).toBe(raw.pageCount);
  });

  it('skraceni preview (truncated) se NIKAD ne kalibrira (B8)', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => para(i + 1, LONG));
    const map = buildPageMap({ model: model(paragraphs, { truncated: true }), storedPages: 10 });
    expect(map.calibrated).toBe(false);
  });

  it('slika i fusnota povecavaju visinu (guraju sadrzaj na sljedecu stranicu)', () => {
    const base = [para(1, LONG), para(2, LONG), para(3, LONG)];
    const raw = buildPageMap({ model: model(base) });
    const withImage = buildPageMap({
      model: model([para(1, LONG, { images: [{ src: 'data:x', wCm: 10, hCm: 20 }] }), para(2, LONG), para(3, LONG)]),
    });
    expect(withImage.pageCount).toBeGreaterThanOrEqual(raw.pageCount);
    const withFootnote = buildPageMap({
      model: model(
        [para(1, LONG, { markers: [{ id: 1, offset: 0 }] }), para(2, LONG), para(3, LONG)],
        { footnotes: [{ id: 1, text: 'f'.repeat(1200) }] },
      ),
    });
    expect(withFootnote.pageCount).toBeGreaterThanOrEqual(raw.pageCount);
  });

  it('redak tablice se broji jednom (celije dijele redak, ne naslaguju se)', () => {
    const cellA = para(1, LONG, { cell: { tableId: 0, row: 0, col: 0 } });
    const cellB = para(2, LONG, { cell: { tableId: 0, row: 0, col: 1 } });
    const stacked = buildPageMap({ model: model([para(1, LONG), para(2, LONG)]) });
    const table = buildPageMap({ model: model([cellA, cellB]) });
    expect(table.pageCount).toBeLessThanOrEqual(stacked.pageCount);
  });
});
