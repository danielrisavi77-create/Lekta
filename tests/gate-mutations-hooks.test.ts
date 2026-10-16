// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hookCommand, missingHookRegistrations } from './helpers/hook-discipline';

/**
 * LINT-FEEDBACK (PostToolUse oxlint nad zapisanom datotekom, odluka vlasnika 2026-10-13). Mutira se
 * KOPIJA izvora u privremenom direktoriju, a opseg i presudu racuna cisti node proces. Tvrdnja:
 * nalaz oxlinta za `src/a.ts` stize do modela.
 */
describe('mutacije: scripts/hooks/lint-feedback.mjs', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/hooks/lint-feedback.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const pomoc = readFileSync(resolve(process.cwd(), 'scripts/hooks/hook-input.mjs'), 'utf8');
  const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8'));
  const nalaz = { status: 1, stdout: 'src/a.ts:2:12: Checking equality with NaN [Error/eslint(use-isnan)]\n1 problem\n' };

  /** Prijavljuje li (mutirani) izvor nalaz oxlinta za `src/a.ts` modelu: opseg I presuda. */
  function prijavljujeNalaz(source: string): boolean {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-lint-mut-'));
    try {
      const file = join(dir, 'lint-feedback.mjs');
      writeFileSync(file, source);
      writeFileSync(join(dir, 'hook-input.mjs'), pomoc);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.uOpsegu('src/a.ts') && m.judgeLint('src/a.ts', ${JSON.stringify(nalaz)}).prijavi));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) === true;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: stvarni hook je registriran i prijavljuje nalaz', () => {
    expect(missingHookRegistrations(settings)).toEqual([]);
    expect(prijavljujeNalaz(izvor)).toBe(true);
  });

  it('mutant: lint-feedback maknut iz settings.json se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    delete mutant.hooks.PostToolUse;
    expect(missingHookRegistrations(mutant)).toEqual([
      'PostToolUse[Edit]: ' + hookCommand('scripts/hooks/lint-feedback.mjs'),
      'PostToolUse[Write]: ' + hookCommand('scripts/hooks/lint-feedback.mjs'),
    ]);
  });

  it('mutant: registracija pod PreToolUse (oxlint bi vidio stari sadrzaj) se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    mutant.hooks.PreToolUse.push(...mutant.hooks.PostToolUse);
    delete mutant.hooks.PostToolUse;
    expect(missingHookRegistrations(mutant)).toEqual([
      'PostToolUse[Edit]: ' + hookCommand('scripts/hooks/lint-feedback.mjs'),
      'PostToolUse[Write]: ' + hookCommand('scripts/hooks/lint-feedback.mjs'),
    ]);
  });

  it('mutant: .ts ispao iz ekstenzija se hvata', () => {
    const mutant = izvor.replace('(?:ts|tsx|', '(?:tsx|');
    expect(mutant).not.toBe(izvor);
    expect(prijavljujeNalaz(mutant)).toBe(false);
  });

  it('mutant: src/ u ignoriranim putanjama se hvata', () => {
    const mutant = izvor.replace('[/^node_modules\\//, ', '[/^src\\//, /^node_modules\\//, ');
    expect(mutant).not.toBe(izvor);
    expect(prijavljujeNalaz(mutant)).toBe(false);
  });

  it('mutant: presuda koja svaki zavrseni izlaz smatra cistim se hvata', () => {
    const mutant = izvor.replace('if (ishod.status === 0) return', 'if (ishod.status !== null) return');
    expect(mutant).not.toBe(izvor);
    expect(prijavljujeNalaz(mutant)).toBe(false);
  });
});
