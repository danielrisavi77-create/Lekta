// Cisti (DOM-neovisni) render sloj za pregled naslovnice: string-builderi bez document/window
// ovisnosti. Izdvojeno iz src/tools/naslovnica-page.ts (koji uvlaci ../shared/ui-boot sa
// side-effectima - fontovi, ikone, motion - koji sprecavaju uvoz u Node build-time kontekstu),
// da isti render kod moze koristiti i klijentski alat i scripts/generate-title-page-tools.mjs
// (B5, esbuild-IIFE-eval preko title-page-web.ts) bez duplicirane, drift-podlozne kopije.
import { escapeHtml } from '../utils/helpers';
import type { TitlePageModel, TitleLineStyle } from '../tools/title-page';

// Web nema fakultetske fontove; pregled aproksimira, .docx nosi pravi w:rFonts.
const SANS_FONTS = /arial|calibri|helvetica|verdana|tahoma/i;
const PREVIEW_PX_PER_PT = 1.15;

/** Inline stil retka pregleda iz predloska; sve vrijednosti sanitizirane (broj/whitelist). */
export function lineStyleCss(style: TitleLineStyle | undefined): string {
  if (!style) return '';
  const css: string[] = [];
  const size = Number(style.sizePt);
  if (Number.isFinite(size) && size > 0) css.push(`font-size:${Math.round(size * PREVIEW_PX_PER_PT)}px`);
  if (style.bold) css.push('font-weight:800');
  if (style.italic) css.push('font-style:italic');
  css.push(`text-transform:${style.uppercase ? 'uppercase' : 'none'}`);
  if (style.align === 'left' || style.align === 'right') css.push(`text-align:${style.align}`);
  if (style.font) css.push(SANS_FONTS.test(style.font) ? 'font-family:Arial,Helvetica,sans-serif' : 'font-family:var(--ink-serif)');
  return css.join(';');
}

/** Pregled po predlosku: retci grupirani u .tp-group zone, tipografija inline iz modela. */
export function renderTemplateSheet(model: TitlePageModel): string {
  const groups: { group: number | undefined; html: string[] }[] = [];
  let prev: number | undefined;
  for (const line of model.lines) {
    if (!groups.length || line.group !== prev) groups.push({ group: line.group, html: [] });
    const css = lineStyleCss(line.style);
    groups[groups.length - 1].html.push(
      // tp-${role}, NE tp-t-${role}: dijeli CSS s genericnim rasporedom (.tp-study/.tp-author/...
      // u naslovnica.html), koji "t-" prefiks nikad nije imao pravilo za sebe. lineStyleCss ispod
      // postavlja samo font-size/bold/italic/uppercase/align/font-family, nikad color, pa nema sudara.
      `<div class="tp-line tp-${line.role}"${css ? ` style="${css}"` : ''}>${escapeHtml(line.text)}</div>`,
    );
    prev = line.group;
  }
  return groups.map((g) => `<div class="tp-group">${g.html.join('')}</div>`).join('');
}
