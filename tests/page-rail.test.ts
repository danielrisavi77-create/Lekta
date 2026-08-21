/**
 * Stranicna traka Rendgena: raspodjela nalaza po procijenjenim stranicama, "~" prefiksi,
 * posten header kad se procjena razlikuje od Wordovog broja, klik-skok.
 */
import { describe, expect, it } from 'vitest';
import { buildPageRailModel, renderPageRail } from '../src/preview/page-rail';
import type { PageMap } from '../src/preview/page-map';
import type { PreviewFlag, PreviewModel } from '../src/preview/preview-anchors';

const pageMap: PageMap = { pageOf: [1, 1, 2, 3], pageCount: 3, calibrated: true, approximate: true };
const model = {
  paragraphs: [
    { index: 1, text: 'A', headingLevel: null },
    { index: 2, text: 'B', headingLevel: null },
    { index: 5, text: 'C', headingLevel: null },
    { index: 9, text: 'D', headingLevel: null },
  ],
  truncated: false,
} as PreviewModel;

const flag = (paragraphIndex: number, severity: PreviewFlag['severity'], footnoteId?: number): PreviewFlag =>
  ({ paragraphIndex, footnoteId, excerpt: '', severity, kind: 'k', title: 'T', source: 'typo' }) as PreviewFlag;

describe('buildPageRailModel', () => {
  it('nalazi se broje po stranici POZICIJE odlomka (preko .index mape), fusnote na zadnjoj', () => {
    const m = buildPageRailModel(pageMap, [flag(1, 'error'), flag(5, 'warning'), flag(9, 'info'), flag(0, 'info', 7)], model, null);
    expect(m.entries).toHaveLength(3);
    expect(m.entries[0].counts).toEqual({ error: 1, warning: 0, info: 0 });
    expect(m.entries[1].counts).toEqual({ error: 0, warning: 1, info: 0 });
    expect(m.entries[2].counts).toEqual({ error: 0, warning: 0, info: 2 }); // D + fusnota
  });

  it('nalaz na nepoznatom odlomku se preskace bez rusenja', () => {
    const m = buildPageRailModel(pageMap, [flag(999, 'error')], model, null);
    expect(m.entries.every((e) => e.counts.error === 0)).toBe(true);
  });
});

describe('renderPageRail', () => {
  it('brojevi nose "~", header pokazuje OBA broja kad se procjena i Word razlikuju', () => {
    const m = buildPageRailModel(pageMap, [], model, 5);
    const rail = renderPageRail(m, () => {});
    expect(rail.querySelector('.lekta-xray-rail__head')!.textContent).toBe('~3 str. (Word: 5)');
    const nums = [...rail.querySelectorAll('.lekta-xray-rail__page b')].map((b) => b.textContent);
    expect(nums).toEqual(['~1', '~2', '~3']);
  });

  it('bez razlike header ne izmislja Wordov broj', () => {
    const m = buildPageRailModel(pageMap, [], model, 3);
    expect(renderPageRail(m, () => {}).querySelector('.lekta-xray-rail__head')!.textContent).toBe('~3 str.');
  });

  it('klik na stranicu zove onJump s njenim brojem', () => {
    const m = buildPageRailModel(pageMap, [], model, null);
    const jumped: number[] = [];
    const rail = renderPageRail(m, (p) => jumped.push(p));
    rail.querySelectorAll<HTMLButtonElement>('.lekta-xray-rail__page').forEach((b) => b.click());
    expect(jumped).toEqual([1, 2, 3]);
  });

  it('tockica s vise nalaza nosi broj', () => {
    const m = buildPageRailModel(pageMap, [flag(1, 'error'), flag(2, 'error')], model, null);
    const rail = renderPageRail(m, () => {});
    expect(rail.querySelector('.lekta-xray-rail__dot--error')!.textContent).toBe('2');
  });
});

describe('kompaktna traka: boja i oznake celija', () => {
  it('celija nosi najjacu ozbiljnost u data-sev; prva, zadnja i celije s nalazima su oznacene', () => {
    const m = buildPageRailModel(pageMap, [flag(1, 'warning'), flag(1, 'error'), flag(5, 'info')], model, null);
    const rail = renderPageRail(m, () => {});
    const cells = [...rail.querySelectorAll<HTMLElement>('.lekta-xray-rail__page')];
    expect(cells.map((c) => c.dataset.sev)).toEqual(['error', 'info', 'none']);
    expect(cells.map((c) => c.dataset.labeled === 'true')).toEqual([true, true, true]);
  });
});
