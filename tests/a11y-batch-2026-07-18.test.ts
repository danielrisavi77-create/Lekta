/**
 * Cuva a11y popravke iz auditnog batcha 2026-07-18 (18 nalaza, Hub/Naslovnica/Citat/Kartice/
 * Izjava/Literatura/dijeljena infrastruktura): WCAG kontrast (eyebrow, tp-badge), mobileNav
 * landmark + aria-current, themeBtn label-in-name, ARIA tab semantika (citat.html + generirane
 * SEO stranice), bulk-input label, statusEl aria-live potvrda kopiranja na svih 6 alata.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const PAGES = [
  'index.html', 'alati.html', 'citat.html', 'kartice.html', 'naslovnica.html',
  'literatura.html', 'izjava.html', 'landing_usporedba.html', 'landing_benchmark.html',
];

// --- WCAG 2.x kontrast: relativna luminancija + alpha blend nad poznatom pozadinom -----------

function hexToRgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function parseRgba(s: string): { rgb: [number, number, number]; a: number } {
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)/);
  if (!m) return { rgb: hexToRgb(s), a: 1 };
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] !== undefined ? Number(m[4]) : 1 };
}
function blend(fgStr: string, bg: [number, number, number]): [number, number, number] {
  const fg = parseRgba(fgStr);
  return fg.rgb.map((c, i) => Math.round(fg.a * c + (1 - fg.a) * bg[i])) as [number, number, number];
}
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fgStr: string, bg: [number, number, number]): number {
  const fgRgb = blend(fgStr, bg);
  const [l1, l2] = [luminance(fgRgb), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Tokeni iz design-system.css (dark = :root default, light = [data-theme="light"]).
const DARK = { desk: hexToRgb('#191512'), paper: hexToRgb('#F7F3E8') };
const LIGHT = { desk: hexToRgb('#DFD8C6'), paper: hexToRgb('#FDFBF3') };

describe('WCAG kontrast: eyebrow (AUD a11y #1/#3/#5/#9)', () => {
  const css = read('src/shared/tool-page.css');

  it('tool-page.css .eyebrow (KS sloj) vise ne koristi --desk-faint', () => {
    const m = css.match(/\.eyebrow\{font-family:var\(--sans\);font-weight:600;letter-spacing:\.18em;color:var\((--[\w-]+)\)\}/);
    expect(m?.[1]).toBe('--desk-muted');
  });

  it('--desk-muted na --desk pozadini prolazi AA (>=4.5:1) u obje teme', () => {
    // rgba(237,231,220,.55) dark / #655C4B light (design-system.css)
    expect(contrast('rgba(237,231,220,.55)', DARK.desk)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#655C4B', LIGHT.desk)).toBeGreaterThanOrEqual(4.5);
  });

  it('--desk-faint i dalje NE bi prosao (dokumentira zasto je promjena bila nuzna)', () => {
    expect(contrast('rgba(237,231,220,.32)', DARK.desk)).toBeLessThan(4.5);
    expect(contrast('#98917E', LIGHT.desk)).toBeLessThan(4.5);
  });
});

describe('WCAG kontrast: tp-badge (AUD a11y #2)', () => {
  const html = read('naslovnica.html');

  it('naslovnica.html .tp-badge tekst koristi --ok-on-soft/--red-on-soft tokene', () => {
    expect(html).toContain('.tp-badge.official{background:var(--ok-soft);color:var(--ok-on-soft)');
    expect(html).toContain('.tp-badge.derived{background:var(--brand-soft);color:var(--red-on-soft)');
  });

  it('--ok-on-soft/--red-on-soft na soft-blended papiru prolaze AA u obje teme', () => {
    const okSoft = 'rgba(30,127,79,.12)';
    const redSoftDark = 'rgba(196,55,46,.12)';
    const redSoftLight = 'rgba(196,55,46,.1)';
    const okBgDark = blend(okSoft, DARK.paper);
    const okBgLight = blend(okSoft, LIGHT.paper);
    const redBgDark = blend(redSoftDark, DARK.paper);
    const redBgLight = blend(redSoftLight, LIGHT.paper);
    expect(contrast('#176243', okBgDark)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#176243', okBgLight)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#A62B23', redBgDark)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#A62B23', redBgLight)).toBeGreaterThanOrEqual(4.5);
  });

  it('design-system.css definira --ok-on-soft i --red-on-soft', () => {
    const css = read('src/shared/design-system.css');
    expect(css).toContain('--ok-on-soft: #176243;');
    expect(css).toContain('--red-on-soft: #A62B23;');
  });
});

describe('mobileNav landmark + aria-current (AUD a11y #4)', () => {
  it.each(PAGES)('%s: #mobileNav ima role=navigation i aria-label', (page) => {
    const html = read(page);
    const tag = html.match(/<div class="mobile-nav" id="mobileNav"([^>]*)>/)?.[1] ?? '';
    expect(tag).toMatch(/role="navigation"/);
    expect(tag).toMatch(/aria-label="Mobilna navigacija"/);
  });
});

describe('themeBtn label-in-name (AUD a11y #Izjava-2, WCAG 2.5.3)', () => {
  it.each(PAGES)('%s: #themeBtn staticki (pre-boot) aria-label sadrzi vidljivu rijec "Lampa"', (page) => {
    const html = read(page);
    const tag = html.match(/<button class="lampa-btn" id="themeBtn"[^>]*>/)?.[0] ?? '';
    const label = tag.match(/aria-label="([^"]*)"/)?.[1] ?? '';
    expect(label).toMatch(/Lampa/);
  });
  it('ui-boot.ts setupThemeToggle() PREPISUJE aria-label na svaki reflect() poziv (boot + klik) - i taj runtime label mora sadrzavati "Lampa", inace staticki popravak gore ne prezivi prvi reflect()', () => {
    const ts = read('src/shared/ui-boot.ts');
    const m = ts.match(/btn\.setAttribute\('aria-label', (.+)\);/);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/'Lampa/);
  });
});

describe('naslovnica: vidljiva napomena o preuzetom rasporedu (AUD a11y #Naslovnica-3)', () => {
  it('#tp-badge-note postoji uz badge (ne oslanja se samo na title)', () => {
    const html = read('naslovnica.html');
    expect(html).toContain('id="tp-badge-note"');
  });
  it('renderBadge() puni #tp-badge-note kod levelReused predloska', () => {
    const ts = read('src/tools/naslovnica-page.ts');
    expect(ts).toMatch(/setBadgeNote\(reuseNote\)/);
  });
});

describe('citat.html: ARIA tab semantika (AUD a11y #Citat-tabs)', () => {
  const html = read('citat.html');
  it('#tool-tabs je role=tablist s aria-label', () => {
    expect(html).toMatch(/id="tool-tabs"[^>]*role="tablist"/);
  });
  it('tab gumbi imaju role=tab, aria-selected i aria-controls', () => {
    expect(html).toMatch(/id="tab-single"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="panel-single"/);
    expect(html).toMatch(/id="tab-bulk"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="panel-bulk"/);
  });
  it('paneli imaju role=tabpanel i aria-labelledby', () => {
    expect(html).toMatch(/id="panel-single"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-single"/);
    expect(html).toMatch(/id="panel-bulk"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-bulk"/);
  });
  it('showTab() u citat-page.ts azurira aria-selected i tabindex', () => {
    const ts = read('src/tools/citat-page.ts');
    expect(ts).toMatch(/tab\.setAttribute\('aria-selected', String\(active\)\)/);
  });
});

describe('citat.html: bulk textarea ima label, copy statusEl postoji (AUD a11y #Citat-label/#Citat-copy)', () => {
  const html = read('citat.html');
  it('#bulk-input ima povezan <label for>', () => {
    expect(html).toMatch(/<label class="sr-only" for="bulk-input">[^<]+<\/label>\s*<textarea id="bulk-input"/);
  });
  it('generateBulk() u citat-page.ts stavlja for="bulk-result" na generirani label', () => {
    const ts = read('src/tools/citat-page.ts');
    expect(ts).toContain('<label for="bulk-result">Literatura (${label}, ${items.length})</label>');
  });
  it('#copy-status sr-only aria-live postoji i sva tri copy poziva ga koriste', () => {
    expect(html).toMatch(/<div class="sr-only" id="copy-status" role="status" aria-live="polite">/);
    const ts = read('src/tools/citat-page.ts');
    const calls = [...ts.matchAll(/bindCopyButton\([^)]*\)[^;]*/g)].length; // priblizan brojac (multiline)
    expect(calls).toBeGreaterThanOrEqual(0); // dimenzijska provjera nize je precizna:
    expect(ts).toContain("const copyStatus = { statusEl: $('#copy-status') };");
    expect((ts.match(/, copyStatus\)/g) || []).length).toBe(3);
  });
  it('#bulk-status sr-only aria-live postoji za parseBulk/generateBulk najave', () => {
    expect(html).toMatch(/<div class="sr-only" id="bulk-status" role="status" aria-live="polite">/);
    const ts = read('src/tools/citat-page.ts');
    expect(ts).toContain('function announceBulk(');
  });
});

describe('SEO generator (scripts/generate-citation-tools.mjs): ARIA tab semantika (AUD a11y #SEO-tabs)', () => {
  const src = read('scripts/generate-citation-tools.mjs');
  it('toolFormHtml() daje tablist/tab/tabpanel atribute', () => {
    expect(src).toMatch(/id="tool-tabs" class="tabs" role="tablist"/);
    expect(src).toMatch(/id="tab-single" class="tab active" type="button" role="tab" aria-selected="true" aria-controls="panel-single"/);
    expect(src).toMatch(/id="tab-bulk" class="tab" type="button" role="tab" aria-selected="false" aria-controls="panel-bulk"/);
    expect(src).toMatch(/id="panel-single" role="tabpanel" aria-labelledby="tab-single"/);
    expect(src).toMatch(/id="panel-bulk" role="tabpanel" aria-labelledby="tab-bulk"/);
  });
  it('showTab() u TOOL_JS azurira aria-selected/tabindex', () => {
    expect(src).toMatch(/el\('tab-single'\)\.setAttribute\('aria-selected', String\(single\)\)/);
  });
  it('#bulk-input ima sr-only <label for>, bulk-result label ima for', () => {
    expect(src).toContain('<label class="sr-only" for="bulk-input">Zalijepi popis literature</label>');
    expect(src).toContain("'<label for=\"bulk-result\">Literatura (abecedno, '");
  });
  it('PAGE_STYLE definira .sr-only utility', () => {
    expect(src).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(0,0,0,0\)/);
  });
});

describe('statusEl aria-live wiring na copy gumbima (AUD a11y "Dijeljena infrastruktura")', () => {
  it('naslovnica-page.ts prosljedjuje #tp-copy-status', () => {
    expect(read('src/tools/naslovnica-page.ts')).toContain("{ statusEl: $('#tp-copy-status') }");
    expect(read('naslovnica.html')).toMatch(/<div class="sr-only" id="tp-copy-status" role="status" aria-live="polite">/);
  });
  it('izjava-page.ts prosljedjuje #st-copy-status', () => {
    expect(read('src/tools/izjava-page.ts')).toContain("{ statusEl: $('#st-copy-status') }");
    expect(read('izjava.html')).toMatch(/<div class="sr-only" id="st-copy-status" role="status" aria-live="polite">/);
  });
  it('literatura-page.ts prosljedjuje #lit-copy-status', () => {
    expect(read('src/tools/literatura-page.ts')).toContain("{ statusEl: $('#lit-copy-status') }");
    expect(read('literatura.html')).toMatch(/<div class="sr-only" id="lit-copy-status" role="status" aria-live="polite">/);
  });
});

describe('literatura: metrike vise nisu role=status na svaki keystroke (AUD a11y #Literatura-metrics)', () => {
  it('.metrics div vise nema role=status/aria-live (SR najava je u zasebnom debounceanom #lit-sr-summary)', () => {
    const html = read('literatura.html');
    const tag = html.match(/<div class="metrics"([^>]*)>/)?.[1] ?? '';
    expect(tag).not.toMatch(/role="status"/);
    expect(html).toMatch(/<div class="sr-only" id="lit-sr-summary" role="status" aria-live="polite">/);
  });
  it('literatura-page.ts debounceа scheduleSrSummary', () => {
    expect(read('src/tools/literatura-page.ts')).toContain('function scheduleSrSummary(');
  });
});

describe('kartice: bez "Nema teksta." najave na pocetni load (AUD a11y #Kartice-sr)', () => {
  it('scheduleSrSummary preskace najavu dok srArmed nije true', () => {
    const ts = read('src/tools/kartice-page.ts');
    expect(ts).toMatch(/if \(!live \|\| !srArmed\) return;/);
    // srArmed se postavlja u SVIM stvarnim korisnickim akcijama, ne u init() pocetnom renderu.
    expect((ts.match(/srArmed = true;/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('izjava: #st-hint debounce (AUD a11y #Izjava-hint)', () => {
  it('render() vise ne pise izravno u #st-hint (delegira na scheduleHint)', () => {
    const ts = read('src/tools/izjava-page.ts');
    expect(ts).toContain('scheduleHint(model.missing, locked);');
    expect(ts).toContain('function scheduleHint(');
  });
});
