/**
 * render-sheet.ts: cisti (DOM-neovisni) render sloj za pregled naslovnice, izdvojen iz
 * naslovnica-page.ts (B5.1) da ga i scripts/generate-title-page-tools.mjs moze koristiti
 * bajt-vjerno preko esbuild-IIFE-eval harnessa (title-page-web.ts, B5.2). Ovaj test dokazuje
 * da se izlaz moze racunati IZVAN DOM konteksta (nema document/window referenci) i da je
 * ponasanje netaknuto ekstrakcijom.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplateSheet, lineStyleCss } from '../src/title-pages/render-sheet';
import type { TitlePageModel, TitleLineStyle } from '../src/tools/title-page';

describe('lineStyleCss', () => {
  it('bez stila vraca prazan string', () => {
    expect(lineStyleCss(undefined)).toBe('');
  });

  it('font-size se skalira PREVIEW_PX_PER_PT (1.15) i zaokruzuje', () => {
    expect(lineStyleCss({ sizePt: 16 })).toBe('font-size:18px;text-transform:none');
  });

  it('bold/italic/uppercase/align se prevode u odgovarajuca CSS svojstva', () => {
    const style: TitleLineStyle = { bold: true, italic: true, uppercase: true, align: 'right' };
    const css = lineStyleCss(style);
    expect(css).toContain('font-weight:800');
    expect(css).toContain('font-style:italic');
    expect(css).toContain('text-transform:uppercase');
    expect(css).toContain('text-align:right');
  });

  it('align:center se NE ispisuje (CSS default, whitelist samo left/right)', () => {
    expect(lineStyleCss({ align: 'center' })).not.toContain('text-align');
  });

  it('sans-serifni font (Arial i sl.) mapira na web sans stack', () => {
    expect(lineStyleCss({ font: 'Arial' })).toContain('font-family:Arial,Helvetica,sans-serif');
  });

  it('serifni/nepoznat font mapira na --ink-serif (dokument-pregled tipografija)', () => {
    expect(lineStyleCss({ font: 'Times New Roman' })).toContain('font-family:var(--ink-serif)');
  });

  it('nevaljan/nula sizePt se ne ispisuje (NaN/<=0 guard)', () => {
    expect(lineStyleCss({ sizePt: 0 })).not.toContain('font-size');
    expect(lineStyleCss({ sizePt: NaN })).not.toContain('font-size');
  });
});

describe('renderTemplateSheet', () => {
  it('prazan model vraca prazan string', () => {
    const model: TitlePageModel = { lines: [], missing: [] };
    expect(renderTemplateSheet(model)).toBe('');
  });

  it('retci se grupiraju u .tp-group po uzastopnoj promjeni group vrijednosti', () => {
    const model: TitlePageModel = {
      lines: [
        { role: 'university', text: 'Sveučilište u Zagrebu', group: 0 },
        { role: 'faculty', text: 'FPZG', group: 0 },
        { role: 'title', text: 'Naslov rada', group: 1 },
      ],
      missing: [],
    };
    const html = renderTemplateSheet(model);
    expect(html.match(/tp-group/g)?.length).toBe(2);
    expect(html).toContain('tp-university');
    expect(html).toContain('tp-faculty');
    expect(html).toContain('tp-title');
  });

  it('tekst se escapea (XSS/HTML-safe), role postaje CSS klasa tp-<role> (ne tp-t-<role>)', () => {
    const model: TitlePageModel = {
      lines: [{ role: 'author', text: '<script>alert(1)</script> & "citat"', group: 0 }],
      missing: [],
    };
    const html = renderTemplateSheet(model);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('class="tp-line tp-author"');
  });

  it('redak bez stila nema style atribut; redak sa stilom ga nosi inline', () => {
    const model: TitlePageModel = {
      lines: [
        { role: 'university', text: 'Bez stila', group: 0 },
        { role: 'worktype', text: 'DIPLOMSKI RAD', group: 0, style: { bold: true } },
      ],
      missing: [],
    };
    const html = renderTemplateSheet(model);
    expect(html).toContain('<div class="tp-line tp-university">Bez stila</div>');
    expect(html).toContain('style="font-weight:800;text-transform:none"');
  });

  it('radi izvan DOM-a: poziv ne referencira document/window (cisti string-builder)', () => {
    // Nema stubGlobal/happy-dom potreban - ako bi kod diralo document/window, ovaj test bi
    // vec pao pod cistim node environmentom (vidi vitest.config.ts environment default).
    const model: TitlePageModel = { lines: [{ role: 'placeyear', text: 'Zagreb, 2026.', group: 2 }], missing: [] };
    expect(() => renderTemplateSheet(model)).not.toThrow();
  });
});
