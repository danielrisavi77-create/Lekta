import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clampPercent, setProgressValue } from '../src/shared/premium-visuals';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Lekta premium visual system', () => {
  it('loads the shared premium layer through the public UI boot', () => {
    const boot = read('src/shared/ui-boot.ts');
    expect(boot).toContain("import './premium.css';");
    expect(boot).toContain("from './premium-visuals'");
  });

  it('exposes real-data visualization surfaces on the analyzer result', () => {
    const index = read('index.html');
    expect(index).toContain('data-premium-surface="analyzer"');
    expect(index).toContain('id="resultCategoryChart"');
    expect(index).toContain('id="resultSeverityChart"');
    expect(index).toContain('data-premium-ring');
  });

  it('marks all public product surfaces for the shared visual treatment', () => {
    for (const page of [
      'alati.html',
      'citat.html',
      'kartice.html',
      'naslovnica.html',
      'literatura.html',
      'izjava.html',
      'citati-i-literatura.html',
      'landing_benchmark.html',
      'landing_usporedba.html',
    ]) {
      expect(read(page), page).toContain('data-premium-surface=');
    }
  });

  it('gives public proof pages explicit, data-backed visual anchors', () => {
    expect(read('landing_benchmark.html')).toContain('id="benchmarkProofChart"');
    expect(read('landing_usporedba.html')).toContain('data-premium-matrix');
  });

  it('clamps chart values to a safe percentage range', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('writes progress without inventing values outside the source range', () => {
    // Vrijednost se i dalje ne izmislja izvan raspona; to je izvorna namjera ovog testa i ostaje.
    const node = document.createElement('div');
    node.setAttribute('role', 'progressbar');
    setProgressValue(node, 73, 100);
    expect(node.style.getPropertyValue('--viz-value')).toBe('73');
    expect(node.getAttribute('aria-valuenow')).toBe('73');
    setProgressValue(node, 120, 100);
    expect(node.style.getPropertyValue('--viz-value')).toBe('100');
    expect(node.getAttribute('aria-valuenow')).toBe('100');
  });

  it('bez uloge NE pise aria-value*, jer ondje nisu dopusteni', () => {
    // Izmjereno axeom nad zivom stranicom 2026-09-03: `[data-premium-progress]` su `<i>` bez
    // uloge, a `<i>` nema implicitnu ulogu koja bi `aria-value*` dopustala. Cetiri cvora, jedan
    // korijen. Vizualni dio (`--viz-value`) ostaje, jer traka je i dalje traka.
    const node = document.createElement('i');
    setProgressValue(node, 73, 100);
    expect(node.style.getPropertyValue('--viz-value')).toBe('73');
    for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow']) {
      expect(node.getAttribute(attr), attr).toBeNull();
    }
  });

  it('atributi se BRISU kad cvor izgubi ulogu, ne samo preskacu', () => {
    // Cvor je mogao nositi ulogu u ranijem renderu; preskakanje bi ostavilo staru vrijednost i
    // uz nju krivi broj, sto je gore od izostanka.
    const node = document.createElement('i');
    node.setAttribute('role', 'progressbar');
    setProgressValue(node, 73, 100);
    expect(node.getAttribute('aria-valuenow')).toBe('73');
    node.removeAttribute('role');
    setProgressValue(node, 80, 100);
    expect(node.getAttribute('aria-valuenow')).toBeNull();
  });
});
