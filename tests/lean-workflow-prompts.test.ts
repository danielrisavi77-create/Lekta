// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIME_SENTENCE, evalTimeLine, leanPromptProblems, leanPromptSections } from './helpers/lean-prompts';

// Normalizira CR (CLAUDE.md): Windows checkout daje CRLF, pa bi CRLF test ispod dobio \r\r\n.
const workflow = readFileSync(resolve('.claude/workflows/lekta-lean.js'), 'utf8').replace(/\r\n/g, '\n');

describe('lean workflow: vremenski redak, omot zadatka i rad bez nadzora (odluka vlasnika 2026-09-28)', () => {
  it('BASELINE: stvarna skripta je cista', () => {
    expect(leanPromptProblems(workflow)).toEqual([]);
  });

  it('sve cetiri prompt sekcije su pronadjene (nazivnik nije prazan)', () => {
    for (const text of Object.values(leanPromptSections(workflow))) expect(text.length).toBeGreaterThan(100);
  });

  it('bez proracuna ostaje samo recenica; s proracunom dolazi "Proracun N s", uz startedAt i pocetak', () => {
    expect(evalTimeLine(workflow, { task: 'x' })).toBe(TIME_SENTENCE);
    expect(evalTimeLine(workflow, undefined)).toBe(TIME_SENTENCE);
    expect(evalTimeLine(workflow, { timeBudgetSeconds: 900.7 })).toBe(`${TIME_SENTENCE} Proracun 900 s.`);
    expect(evalTimeLine(workflow, { timeBudgetSeconds: 600, startedAt: '2026-09-28T01:00:00Z' })).toBe(
      `${TIME_SENTENCE} Proracun 600 s od 2026-09-28T01:00:00Z. Na pocetku svakog koraka izracunaj proteklo vrijeme ` +
      '(`date -u +%s` minus $(date -u -d 2026-09-28T01:00:00Z +%s)) i drzi se proracuna; u izvjestaj napisi "proteklo Ns / proracun 600s".',
    );
  });

  it('E1: s epoch pocetkom (broj ili znamenke) dolazi uputa o proteklom vremenu s tim brojem', () => {
    const ocekivano = `${TIME_SENTENCE} Proracun 900 s od 1790000000. Na pocetku svakog koraka izracunaj proteklo vrijeme ` +
      '(`date -u +%s` minus 1790000000) i drzi se proracuna; u izvjestaj napisi "proteklo Ns / proracun 900s".';
    expect(evalTimeLine(workflow, { timeBudgetSeconds: 900, startedAt: 1790000000 })).toBe(ocekivano);
    expect(evalTimeLine(workflow, { timeBudgetSeconds: 900, startedAt: '1790000000' })).toBe(ocekivano);
  });

  it('E1: bez pocetka nema upute o proteklom vremenu, a neispravan pocetak ne ulazi u prompt', () => {
    expect(evalTimeLine(workflow, { timeBudgetSeconds: 300 })).toBe(`${TIME_SENTENCE} Proracun 300 s.`);
    for (const bad of ['sutra', '2026-09-28 01:00', '2026-09-28T01:00:00Z; rm -rf /', '$(id)', -5, 1.5, 12]) {
      const line = evalTimeLine(workflow, { timeBudgetSeconds: 300, startedAt: bad });
      expect(line, String(bad)).toBe(`${TIME_SENTENCE} Proracun 300 s.`);
    }
  });

  it('neispravan proracun ne ulazi u redak, a startedAt bez proracuna se ignorira', () => {
    for (const bad of [0, -5, Number.NaN, '600', null]) {
      expect(evalTimeLine(workflow, { timeBudgetSeconds: bad })).toBe(TIME_SENTENCE);
    }
    expect(evalTimeLine(workflow, { startedAt: '2026-09-28T01:00:00Z' })).toBe(TIME_SENTENCE);
  });

  it('CRLF checkout daje isti rezultat kao LF', () => {
    const crlf = workflow.replace(/\n/g, '\r\n');
    expect(leanPromptProblems(crlf)).toEqual([]);
    expect(evalTimeLine(crlf, { timeBudgetSeconds: 60 })).toBe(`${TIME_SENTENCE} Proracun 60 s.`);
  });
});
