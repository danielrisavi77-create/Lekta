/**
 * renderFacsimile + pageMap (Rendgen): BEZ pageMap ponasanje je IDENTICNO starome (pin), s
 * pageMap se listovi lome i na procijenjenim granicama koje su vizualno razlicite od tvrdih
 * ("~ str. N" marker + isprekidan rub), a broj u dnu nosi "~".
 */
import { describe, expect, it } from 'vitest';
import { renderFacsimile } from '../src/preview/render-facsimile';
import type { PageMap } from '../src/preview/page-map';
import type { PreviewModel } from '../src/preview/preview-anchors';

const model = {
  paragraphs: [
    { index: 1, text: 'Prvi odlomak', headingLevel: null },
    { index: 2, text: 'Drugi odlomak', headingLevel: null, pageBreakAfter: true },
    { index: 3, text: 'Treći odlomak', headingLevel: null },
    { index: 4, text: 'Četvrti odlomak', headingLevel: null },
  ],
  truncated: false,
} as PreviewModel;

describe('renderFacsimile bez pageMap (pin postojeceg ponasanja)', () => {
  it('lomi SAMO na pageBreakAfter; brojevi stranica bez "~"; nema soft markera', () => {
    const { root } = renderFacsimile(model, []);
    const sheets = root.querySelectorAll('.lekta-fac-page');
    expect(sheets).toHaveLength(2);
    expect(root.querySelectorAll('.lekta-fac-softbreak')).toHaveLength(0);
    expect(root.querySelectorAll('.lekta-fac-page--soft-break')).toHaveLength(0);
    const nums = [...root.querySelectorAll('.lekta-fac-pagenum')].map((n) => n.textContent);
    expect(nums).toEqual(['1', '2']);
  });
});

describe('renderFacsimile s pageMap', () => {
  const pageMap: PageMap = { pageOf: [1, 1, 2, 3], pageCount: 3, calibrated: false, approximate: true };

  it('lomi i na procijenjenim granicama; tvrdi prijelom NIJE soft, procijenjeni JEST', () => {
    const { root } = renderFacsimile(model, [], { pageMap });
    const sheets = [...root.querySelectorAll<HTMLElement>('.lekta-fac-page')];
    expect(sheets).toHaveLength(3);
    // List 2 pocinje iza TVRDOG prijeloma (pageBreakAfter na odlomku 2): bez soft oznake.
    expect(sheets[1].classList.contains('lekta-fac-page--soft-break')).toBe(false);
    // List 3 pocinje na PROCIJENJENOJ granici (pageOf 2 -> 3 bez pageBreakAfter): soft.
    expect(sheets[2].classList.contains('lekta-fac-page--soft-break')).toBe(true);
    expect(sheets[2].querySelector('.lekta-fac-softbreak')!.textContent).toBe('~ str. 3 (procjena)');
  });

  it('brojevi u dnu nose "~" (procjena, ne Wordov prijelom), svaki list ima data-page', () => {
    const { root } = renderFacsimile(model, [], { pageMap });
    const nums = [...root.querySelectorAll('.lekta-fac-pagenum')].map((n) => n.textContent);
    expect(nums).toEqual(['~1', '~2', '~3']);
    const dataPages = [...root.querySelectorAll('.lekta-fac-page')].map((p) => p.getAttribute('data-page'));
    expect(dataPages).toEqual(['1', '2', '3']);
  });

  it('neuskladjen pageMap (kriva duljina) se ignorira: ponasanje kao bez njega', () => {
    const bad: PageMap = { pageOf: [1], pageCount: 1, calibrated: false, approximate: true };
    const { root } = renderFacsimile(model, [], { pageMap: bad });
    expect(root.querySelectorAll('.lekta-fac-page')).toHaveLength(2);
  });
});
