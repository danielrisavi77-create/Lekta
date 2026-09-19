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
    // JAMSTVO JE ISTO, MEHANIZAM SE PROMIJENIO (2026-09-10).
    //
    // Do danas je povratak u carobnjak bio dva rucna dodira `hidden` nad `#resultView` i
    // `#wizardView`, praceni s `setWizardStep(3)`. Ta dva dodira bila su suvisna: `setWizardStep`
    // ide kroz `showWizardStep` pa `renderView`, koji `classList.toggle` nad SVE TRI povrsine
    // postavlja identicno krajnje stanje. Uklonjeni su jer je prikaz dobio jednog pisca.
    //
    // Usput je vrijedno zapisati kako je gard istrunuo: opcionalni lanac (`?.`) dodan je svjesno i
    // s razlogom (nezasticeno citanje rusi montazu na stranici koja taj element nema), ali je
    // `tests/wizard-view-single-writer.test.ts` trazio iskljucivo oblik BEZ `?.`, pa je od tog
    // trenutka bio zelen nad kodom koji ima tocno onaj kvar zbog kojeg postoji. Gard sada trazi
    // oba oblika.
    //
    // `renderView` je uz to SIGURNIJI od uklonjenog koda: radi `if (el)` po elementu, pa stranica
    // bez te povrsine i dalje prolazi bez iznimke.
    expect(body, 'CTA mora vratiti u carobnjak na korak provjere').toContain('setWizardStep(3)');
    expect(body).toContain('.advanced-options');
    expect(body).toContain("$('#submissionPhase')?.focus()");
  });

  it('checklista i dalje ima download akciju (nije slucajno maknuta)', () => {
    expect(app).toContain('data-download-submission');
    expect(app).toContain('downloadSubmissionReport()');
  });
});
