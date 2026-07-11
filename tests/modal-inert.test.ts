/**
 * Cuva inertnu pozadinu dok je modal otvoren (BL-P2-03, WCAG). trapModal mora postaviti inert +
 * aria-hidden na pozadinske landmarke (header/main/footer), releaseModal ih ukloniti; brojac
 * _modalDepth cuva ugnijezdjene modale (npr. legal preko narudzbe) da se inert ne makne prerano.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'src', 'ui', 'app.ts'), 'utf8');

describe('inertna pozadina modala', () => {
  it('setBackgroundInert cilja header/main/footer i togluje inert + aria-hidden', () => {
    expect(app).toMatch(/function setBackgroundInert\([^)]*\)\{\['header\.topbar','main','footer'\]/);
    expect(app).toContain("setAttribute('inert','')");
    expect(app).toContain("setAttribute('aria-hidden','true')");
    expect(app).toContain("removeAttribute('inert')");
    expect(app).toContain("removeAttribute('aria-hidden')");
  });

  it('trapModal ukljucuje inert na prvom modalu (brojac)', () => {
    expect(app).toMatch(/function trapModal[\s\S]*?if\(\+\+_modalDepth===1\)setBackgroundInert\(true\)/);
  });

  it('releaseModal iskljucuje inert tek kad se zatvori zadnji modal', () => {
    expect(app).toMatch(/function releaseModal[\s\S]*?if\(--_modalDepth<=0\)\{_modalDepth=0;setBackgroundInert\(false\)\}/);
  });
});
