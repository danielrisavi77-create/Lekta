import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'check.yml'), 'utf8');
const vitestConfig = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');

function isolateJob(source: string, jobName: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  expect(start, `workflow nema posao ${jobName}`).toBeGreaterThanOrEqual(0);

  const nextJob = lines.findIndex((line, index) => index > start && /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  return lines.slice(start, nextJob === -1 ? lines.length : nextJob).join('\n');
}

describe('CI budget punog build gatea', () => {
  it('cuva jedan fork worker u commitanoj Vitest konfiguraciji', () => {
    expect(vitestConfig).toMatch(/^\s*pool:\s*['"]forks['"],?\s*$/m);
    expect(vitestConfig).toMatch(/^\s*maxWorkers:\s*1,?\s*$/m);
    expect(vitestConfig).toMatch(/^\s*minWorkers:\s*1,?\s*$/m);
  });

  it('build-gate ima najmanje 60 minuta', () => {
    const buildGate = isolateJob(workflow, 'build-gate');
    const timeout = buildGate.match(/^\s{4}timeout-minutes:\s*(\d+)\s*$/m);

    expect(timeout, 'build-gate nema timeout-minutes').not.toBeNull();
    expect(Number(timeout?.[1])).toBeGreaterThanOrEqual(60);
  });

  it('build-gate pokrece tocni check pa klasifikacijski sken', () => {
    const buildGate = isolateJob(workflow, 'build-gate');
    const lines = buildGate.split('\n').map((line) => line.trim());
    const checkCommand = 'run: npm run check';
    const classificationCommand = 'run: node scripts/verify-dist-classification.mjs';

    expect(lines.filter((line) => line === checkCommand)).toHaveLength(1);
    expect(lines.filter((line) => line === classificationCommand)).toHaveLength(1);
    expect(lines.indexOf(checkCommand)).toBeLessThan(lines.indexOf(classificationCommand));
  });
});
