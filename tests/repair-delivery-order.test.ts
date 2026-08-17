/**
 * UGOVOR ISPORUKE: ponovna analiza se izvodi PRIJE nego sto sucelje preporuci preuzimanje.
 *
 * Do 2026-08-16 vrijedilo je obrnuto ("ponovna analiza nikad ne smije sprijeciti isporuku"):
 * lokalni panel je popravljeni dokument preuzimao AUTOMATSKI odmah po popravku, a ponovna analiza
 * je stizala poslije, kao dopuna. Vrata integriteta (package-integrity) hvataju POKVAREN paket, ali
 * ne i SEMANTICKU regresiju - popravak koji je tehnicki ispravan, a srusi provjeru koja je prije
 * prolazila. Takav dokument je zavrsavao u Preuzimanjima prije nego bi upozorenje uopce stiglo.
 *
 * Ovi testovi cuvaju novi ugovor na razini izvornog koda panela, jer je stvarni tok vezan uz DOM
 * i mrezu (puni end-to-end pokriva UX suite). Namjerno se provjerava REDOSLIJED i odsutnost
 * automatskog preuzimanja, ne izgled.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectPassRegressions } from '../src/analysis/repair-regression';
import type { Check } from '../src/scoring/checks';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = readFileSync(join(root, 'src/ui/repair-panel.ts'), 'utf8');
const APP = readFileSync(join(root, 'src/ui/app.ts'), 'utf8');

function chk(id: string, title: string, status: string): Check {
  return { id, category: 'formatting', title, status, earned: status === 'pass' ? 6 : 0, max: 6, detail: '', issue: null, scored: true };
}

describe('lokalni panel: re-check prije isporuke', () => {
  it('popravak vise ne pokrece automatsko preuzimanje odmah po applyFixers', () => {
    // Regresija koju ovo cuva: `triggerDownload(result.docxBytes, ...)` neposredno nakon
    // renderSummary, dakle prije ijedne ponovne provjere.
    expect(PANEL).not.toMatch(/renderSummary\([^)]*\);\s*\n\s*triggerDownload\(/);
  });

  it('ponovna analiza se ceka, pa tek onda ide isporuka', () => {
    const recheckAt = PANEL.indexOf('await renderRecheck(summary, repairedBytes, ctx)');
    const deliveryAt = PANEL.indexOf('renderDelivery(summary, repairedBytes, verdict, ctx)');
    expect(recheckAt, 'renderRecheck mora postojati u toku popravka').toBeGreaterThan(-1);
    expect(deliveryAt, 'renderDelivery mora postojati u toku popravka').toBeGreaterThan(-1);
    expect(deliveryAt).toBeGreaterThan(recheckAt);
  });

  it('verdikt ponovne analize odlucuje sto je GLAVNA ponuda', () => {
    expect(PANEL).toContain("primary.textContent = 'Preuzmi izvorni dokument'");
    expect(PANEL).toContain("secondary.textContent = 'Ipak preuzmi popravljeni'");
    expect(PANEL).toContain("primary.textContent = 'Preuzmi popravljeni dokument'");
  });

  it('pad ponovne analize NE zarobljava dokument (isporuka uz napomenu)', () => {
    expect(PANEL).toContain('unavailable: true');
    expect(PANEL).toMatch(/Provjeru popravljenog dokumenta nije bilo moguće izvesti/);
  });
});

describe('serverski put: regresija demotira popravljeni dokument', () => {
  it('izvorni dokument postaje glavni gumb kad je regresija dokazana', () => {
    expect(APP).toContain('class="btn btn-primary" data-repair-original');
  });

  it('popravljeni gumb ostaje dostupan, ali kao sporedan izbor', () => {
    expect(APP).toContain("fixedBtn.textContent='Ipak preuzmi popravljeni dokument'");
    expect(APP).toContain("fixedBtn.className='btn btn-secondary btn-sm'");
  });
});

describe('detectPassRegressions: uparuje po stabilnom ID-u, ne po naslovu', () => {
  it('preimenovan naslov uz isti ID NIJE regresija', () => {
    const before = [chk('format.font.dominant', 'Dominantni font', 'pass')];
    const after = [chk('format.font.dominant', 'Font osnovnog teksta', 'pass')];
    expect(detectPassRegressions(before, after)).toEqual([]);
  });

  it('stvaran pad iz pass u fail je regresija', () => {
    const before = [chk('format.font.dominant', 'Dominantni font', 'pass')];
    const after = [chk('format.font.dominant', 'Dominantni font', 'fail')];
    expect(detectPassRegressions(before, after)).toHaveLength(1);
  });

  it('nestala provjera se racuna kao regresija', () => {
    const before = [chk('format.font.dominant', 'Dominantni font', 'pass')];
    expect(detectPassRegressions(before, [])).toHaveLength(1);
  });
});
