/**
 * Cuva CTA u praznom stanju taba "Spremnost za predaju" (BL-P3-17). U zadanoj fazi "Samo dokument"
 * nema administrativne checkliste; umjesto slijepe poruke prikazuje se gumb koji vraca u carobnjak,
 * otvara napredne opcije i fokusira odabir faze. Regresijski: ako CTA/wiring nestane, ovo pada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'src', 'ui', 'app.ts'), 'utf8');

describe('prazan tab Spremnost za predaju: CTA', () => {
  it('prazno stanje "Samo dokument" ima gumb data-open-phase (nije vise slijepa poruka)', () => {
    // fallback za prazan groups mora sadrzavati CTA gumb
    expect(app).toMatch(/groups\|\|'[^']*data-open-phase[^']*'/);
    expect(app).toMatch(/data-open-phase>Odaberi fazu/);
  });

  it('klik na CTA vraca u carobnjak, otvara napredne opcije i fokusira fazu', () => {
    const m = app.match(/\[data-open-phase\]'\);if\(ph\)\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\}/);
    expect(m, 'delegirani handler za data-open-phase postoji').toBeTruthy();
    const body = m![1];
    // Oblik je dobio opcionalni lanac (`?.`), jer nezasticeno citanje rusi montazu na stranici
    // koja taj element nema. Tvrdnja je ista, i susjedna vec koristi isti oblik za #submissionPhase.
    expect(body).toContain("$('#wizardView')?.classList.remove('hidden')");
    expect(body).toContain('.advanced-options');
    expect(body).toContain("$('#submissionPhase')?.focus()");
  });

  it('checklista i dalje ima download akciju (nije slucajno maknuta)', () => {
    expect(app).toContain('data-download-submission');
    expect(app).toContain('downloadSubmissionReport()');
  });
});
