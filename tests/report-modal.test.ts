/**
 * Cuva zamjenu native window.prompt (blokirljiv, neostiliziran, losa mobilna/a11y UX) tematiziranim
 * modalom za prijavu pogresne provjere (BL-P2-12). Regresijski: ako se window.prompt vrati ili se
 * modal/wiring ukloni, ovo pada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'src', 'ui', 'app.ts'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

describe('prijava pogresne provjere: modal umjesto window.prompt', () => {
  it('app.ts vise NE koristi window.prompt', () => {
    expect(app).not.toMatch(/window\.prompt\s*\(/);
    expect(app).not.toMatch(/[^.\w]prompt\s*\(/); // ni goli prompt(
  });

  it('reportWrongCheck otvara modal, uz closeReport i submitReport', () => {
    expect(app).toMatch(/function reportWrongCheck\(\)\{[^}]*reportModal[^}]*trapModal/);
    expect(app).toContain('function closeReport()');
    expect(app).toContain('function submitReport()');
  });

  it('submitReport zadrzava mailto/JSON fallback i telemetriju', () => {
    expect(app).toMatch(/function submitReport\(\)\{[\s\S]*?mailto:/);
    expect(app).toMatch(/function submitReport\(\)\{[\s\S]*?downloadBlob\(/);
    expect(app).toMatch(/function submitReport\(\)\{[\s\S]*?trackEvent\('wrong_check_reported'/);
  });

  it('gumbi modala su ozicani u bind()', () => {
    for (const id of ['closeReport', 'cancelReport', 'submitReport']) {
      expect(app).toContain(`$('#${id}').onclick`);
    }
  });

  it('Escape zatvara reportModal', () => {
    expect(app).toMatch(/closeCheckoutConsent\(\);closeReport\(\);/);
  });

  it('index.html ima tematizirani reportModal s labeliranim textarea', () => {
    expect(html).toMatch(/id="reportModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
    expect(html).toMatch(/<label for="reportNote">/);
    expect(html).toMatch(/<textarea id="reportNote"[^>]*maxlength="1000"/);
    for (const id of ['closeReport', 'cancelReport', 'submitReport']) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
