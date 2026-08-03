/**
 * Cuva inertnu pozadinu dok je modal otvoren (BL-P2-03, WCAG). trapModal mora postaviti inert +
 * aria-hidden na pozadinske landmarke (header/main/footer), releaseModal ih ukloniti; brojac
 * _modalDepth cuva ugnijezdjene modale (npr. legal preko narudzbe) da se inert ne makne prerano.
 * trapModal/releaseModal/setBackgroundInert zive u modal-utils.ts (izdvojeno iz app.ts da ih
 * repair-panel.ts/repair-price-slider.ts mogu dijeliti bez cikličkog uvoza).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modalUtils = readFileSync(join(root, 'src', 'ui', 'modal-utils.ts'), 'utf8');

describe('inertna pozadina modala', () => {
  it('setBackgroundInert cilja header/main/footer i togluje inert + aria-hidden', () => {
    expect(modalUtils).toMatch(/export function setBackgroundInert\([^)]*\)[\s\S]*?\['header\.topbar', 'main', 'footer'\]/);
    expect(modalUtils).toContain("setAttribute('inert', '')");
    expect(modalUtils).toContain("setAttribute('aria-hidden', 'true')");
    expect(modalUtils).toContain("removeAttribute('inert')");
    expect(modalUtils).toContain("removeAttribute('aria-hidden')");
  });

  it('trapModal ukljucuje inert na prvom modalu (brojac)', () => {
    expect(modalUtils).toMatch(/export function trapModal[\s\S]*?if \(\+\+_modalDepth === 1\) setBackgroundInert\(true\)/);
  });

  it('releaseModal iskljucuje inert tek kad se zatvori zadnji modal', () => {
    expect(modalUtils).toMatch(/export function releaseModal[\s\S]*?if \(--_modalDepth <= 0\) \{\s*_modalDepth = 0;\s*setBackgroundInert\(false\);/);
  });
});
