/**
 * Reporter napretka gatea: redak po datoteci i ukljucivanje samo kroz LEKTA_GATE_PROGRESS=1.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error mjs bez tipova
import ProgressReporter, { formatProgressLine } from '../scripts/vitest-progress-reporter.mjs';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r/g, '');

describe('vitest-progress-reporter', () => {
  it('formatira redak [gotovo/ukupno] stanje putanja trajanje', () => {
    expect(formatProgressLine({ done: 12, total: 342, state: 'passed', path: 'tests/a.test.ts', durationMs: 1234 }))
      .toBe('[12/342] ok tests/a.test.ts 1,2 s');
    expect(formatProgressLine({ done: 3, total: 4, state: 'failed', path: 'tests/b.test.ts', durationMs: Number.NaN }))
      .toBe('[3/4] PAO tests/b.test.ts');
  });

  it('broji zavrsene module i pise relativnu putanju na stderr', () => {
    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => { lines.push(String(chunk)); return true; }) as typeof process.stderr.write;
    try {
      const r = new ProgressReporter();
      r.root = '/repo';
      r.onTestRunStart([{}, {}]);
      r.onTestModuleEnd({ moduleId: '/repo/tests/a.test.ts', state: () => 'passed', diagnostic: () => ({ duration: 500 }) });
    } finally {
      process.stderr.write = orig;
    }
    expect(lines.join('')).toContain('[napredak] 2 testnih datoteka');
    expect(lines.join('')).toContain('[1/2] ok tests/a.test.ts 0,5 s');
  });

  it('omotac gatea ukljucuje reporter, a vitest.config.ts ga veze na LEKTA_GATE_PROGRESS', () => {
    expect(read('scripts/with-gate-lock.mjs')).toContain("childEnv.LEKTA_GATE_PROGRESS = '1'");
    const cfg = read('vitest.config.ts');
    expect(cfg).toContain("process.env.LEKTA_GATE_PROGRESS === '1'");
    expect(cfg).toContain('reporters: progressReporters');
  });

  it('MUTACIJA: konfiguracija bez veze na reporter obara provjeru', () => {
    const mutirano = read('vitest.config.ts').replace('reporters: progressReporters,', '');
    expect(mutirano).not.toContain('reporters: progressReporters');
  });
});
