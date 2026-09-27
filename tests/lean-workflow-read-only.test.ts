// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEAN_READER_TOOLS,
  agentTools,
  findRunAgentCalls,
  leanReadOnlyViolations,
  parseAgentFrontmatter,
} from './helpers/lean-read-only';

// Run wf_c810022a-a05: brief agent lean workflowa implementirao je dio zadatka i commitao na granu, jer je
// "SAMO CITAJ" bio samo recenica u promptu. Brief, kriticar i dizajner zato idu kroz agenta lean-citac.
// CR se normalizira pri citanju: Windows checkout (core.autocrlf) daje CRLF, a mutacije ispod rade
// regexom nad recima (`.` u JS regexu ne hvata \r, pa bi `/^tools:.*\n/m` na CRLF-u tiho promasio).
const readLf = (path: string): string => readFileSync(resolve(path), 'utf8').replace(/\r/g, '');
const workflow = readLf('.claude/workflows/lekta-lean.js');
const agentMd = readLf('.claude/agents/lean-citac.md');
const toCrlf = (text: string): string => text.replace(/\n/g, '\r\n');

describe('lean workflow: read-only faze idu kroz lean-citac', () => {
  it('brief, kriticar i dizajner nose agentType lean-citac, a pisuce faze ne', () => {
    expect(leanReadOnlyViolations(workflow)).toEqual([]);
  });

  it('parser vidi stvarne pozive: po jedan brief, kriticar i dizajner, i implementator bez agentType', () => {
    const calls = findRunAgentCalls(workflow);
    for (const label of ['brief', 'kriticar', 'dizajner']) {
      expect(calls.filter((c) => c.label === label)).toEqual([{ label, agentType: 'lean-citac' }]);
    }
    const writers = calls.filter((c) => c.label.startsWith('implementator'));
    expect(writers.length).toBeGreaterThan(0);
    for (const c of writers) expect(c.agentType).toBeNull();
  });

  it('lean-citac smije samo Read, Glob i Grep', () => {
    const fm = parseAgentFrontmatter(agentMd);
    expect(fm.name).toBe('lean-citac');
    expect(fm.description).toMatch(/read-only/i);
    expect(agentTools(agentMd)).toEqual([...LEAN_READER_TOOLS]);
  });

  it('definicija bez tools ili s praznim popisom je greska, ne "svi alati"', () => {
    expect(() => agentTools(agentMd.replace(/^tools:.*\n/m, ''))).toThrow(/nema tools/);
    expect(() => agentTools(agentMd.replace(/^tools:.*$/m, 'tools: '))).toThrow();
  });

  it('CRLF checkout (Windows) daje isti rezultat kao LF', () => {
    expect(toCrlf(agentMd)).toContain('\r\n');
    expect(parseAgentFrontmatter(toCrlf(agentMd))).toEqual(parseAgentFrontmatter(agentMd));
    expect(agentTools(toCrlf(agentMd))).toEqual([...LEAN_READER_TOOLS]);
    expect(findRunAgentCalls(toCrlf(workflow))).toEqual(findRunAgentCalls(workflow));
    expect(leanReadOnlyViolations(toCrlf(workflow))).toEqual([]);
  });

  it('parser ne prihvaca agentType koji nije literal', () => {
    const src = workflow.replace("schema: BRIEF_SCHEMA, agentType: 'lean-citac'", 'schema: BRIEF_SCHEMA, agentType: READER');
    expect(src).not.toBe(workflow);
    expect(leanReadOnlyViolations(src)).toEqual(["brief ide bez agentType 'lean-citac' (<ne-literal: READER>)"]);
  });
});
