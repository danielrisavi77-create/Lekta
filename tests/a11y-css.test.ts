/**
 * Cuva tri a11y CSS popravka: fokus prsten dovoljnog kontrasta (BL-P3-05, WCAG 1.4.11) na svih 8
 * stranica, minimalnu velicinu male mete 24x24 (BL-P3-04, WCAG 2.5.8) na index.html gumbima, i
 * kombinaciju "pojacan kontrast + danje svjetlo" iz panela "Prilagodi prikaz" (Z6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const PAGES = [
  'index.html', 'citat.html', 'kartice.html', 'naslovnica.html',
  'literatura.html', 'izjava.html', 'alati.html', 'landing_usporedba.html', 'landing_benchmark.html',
];

describe('fokus prsten kontrast (BL-P3-05)', () => {
  // Token je centraliziran u dijeljeni design-system.css (jedini izvor istine za tokene),
  // pa se ne duplicira vise inline u svakoj stranici. Jamstvo ostaje identicno.
  it('design-system.css definira neproziran dvotonski --focus prsten', () => {
    expect(read('src/shared/design-system.css')).toContain('--focus: 0 0 0 2px var(--panel),0 0 0 4px var(--brand)');
  });
  it.each(PAGES)('%s ne uvodi stari slabi prsten rgba .22', (page) => {
    expect(read(page)).not.toContain('rgba(51,64,126,.22)'); // stari slabi prsten uklonjen
  });
});

describe('velicina male mete 24px (BL-P3-04)', () => {
  // Stil je 2026-09-03 izdvojen iz inline `<style>` bloka u `src/shared/page.css`, jer je
  // 203 KB inline CSS-a cinilo 71 posto `index.html` i drzalo `/rad/` nestiliziranim.
  // Citaju se OBOJE: pravila su u CSS-u, ali markup na koji se odnose je i dalje u HTML-u.
  const css = read('src/shared/page-chrome.css') + read('src/shared/page-app.css') + read('index.html');
  it.each(['remove-file', 'wl-close'])('.%s ima min 24x24 i centriran sadrzaj', (cls) => {
    const re = new RegExp(`\\.${cls}\\{[^}]*min-width:24px;min-height:24px;display:inline-grid;place-items:center[^}]*\\}`);
    expect(css).toMatch(re);
  });
});

/**
 * Z6: POJACAN KONTRAST U DANJEM SVJETLU.
 *
 * Kontrola "Pojacan kontrast" spusta `--paper-muted`, a "Danje svjetlo" podize papir. Kombinacija
 * je najsvjetlija podloga koju proizvod moze proizvesti, pa je ona mjerodavna, ne zadana tamna.
 *
 * VRIJEDNOSTI SE CITAJU IZ IZVORA, ne prepisuju: gard s prepisanom bojom ostaje zelen dokazujuci
 * nesto o nizu koji vise nije u CSS-u (zabiljezen razred kvara u ovom repozitoriju). Racun je isti
 * kao u `tests/contrast-tinted-surfaces.test.ts`.
 */
describe('pojacan kontrast u danjem svjetlu (Z6)', () => {
  const AA = 4.5;
  type Rgb = readonly [number, number, number];
  const hex = (value: string): Rgb => {
    const h = value.replace('#', '').trim();
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  };
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a: Rgb, b: Rgb): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * Vrijednost tokena unutar PRVOG bloka koji odgovara zadanom selektoru.
   *
   * KOMENTARI NISU KOD: oba lista objasnjavaju specificnost rijecima, pa se selektor pojavi i u
   * prozi. Bez uklanjanja komentara gard trazi token u recenici i javlja da ga nema.
   */
  const tokenUBloku = (sirovo: string, selektor: string, token: string): string => {
    const css = sirovo.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const od = css.indexOf(selektor);
    expect(od, `selektor ${selektor} nije nadjen`).toBeGreaterThan(-1);
    const blok = css.slice(css.indexOf('{', od), css.indexOf('}', od));
    const m = new RegExp(`--${token}\s*:\s*([^;}]+)`).exec(blok);
    expect(m, `token --${token} nije nadjen u bloku ${selektor}`).toBeTruthy();
    return m![1].trim();
  };

  const DISPLAY = read('src/shared/display-settings.css');
  const SUSTAV = read('src/shared/design-system.css');

  it('prigusen tekst prolazi AA na OBA papira danjeg svjetla', () => {
    const muted = hex(tokenUBloku(DISPLAY, '[data-contrast="high"]', 'paper-muted'));
    const paper = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper'));
    const paper2 = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper-2'));
    // Sentinel: bez ovoga bi promjena imena tokena ucinila obje tvrdnje ispod vakuumskim.
    for (const [ime, rgb] of [['paper-muted', muted], ['paper', paper], ['paper-2', paper2]] as const) {
      expect(rgb.every((c) => Number.isFinite(c)), `--${ime}`).toBe(true);
    }
    expect(ratio(muted, paper), 'pojacan kontrast na --paper').toBeGreaterThanOrEqual(AA);
    expect(ratio(muted, paper2), 'pojacan kontrast na --paper-2').toBeGreaterThanOrEqual(AA);
  });

  it('pojacanje je STVARNO pojacanje: tamnije od zadanog prigusenog tona', () => {
    // Kontrola smjera. Kontrola koja obeca "pojacan kontrast" a da ga ne pojaca gora je od nikakve.
    const pojacan = hex(tokenUBloku(DISPLAY, '[data-contrast="high"]', 'paper-muted'));
    const zadani = hex(tokenUBloku(SUSTAV, ':root {', 'paper-muted'));
    const paper = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper'));
    expect(ratio(pojacan, paper)).toBeGreaterThan(ratio(zadani, paper));
  });
});
