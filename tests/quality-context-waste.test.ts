// @vitest-environment node
/**
 * Petlja ucenja: brojac rasipnih poziva konteksta (scripts/quality/context-waste.mjs). Ulaz je
 * SINTETICKI transkript s poznatim brojem rasipnih poziva; nikad stvarni ~/.claude.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyWaste, renderWasteMarkdown, summarizeWaste, wasteFromLines } from '../scripts/quality/context-waste.mjs';
import { collectAll } from '../scripts/quality/harvest.mjs';

const TAJNA = 'TAJNI-SADRZAJ-DATOTEKE-NE-SMIJE-U-IZVJESTAJ';
const DAN = '2026-10-08';
const TS = `${DAN}T10:00:00Z`;
const S1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const S2 = 'bbbbbbbb-1111-2222-3333-444444444444';

const redci = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}\t${TAJNA} ${i}`).join('\n');
let n = 0;
/** Par tool_use + tool_result kao dva retka transkripta. */
function poziv(session: string, name: string, input: object, izlaz: string, opts: { uuid?: string; error?: boolean } = {}) {
  const id = `t-${++n}`;
  return [
    { type: 'assistant', uuid: `u-${n}-a`, sessionId: session, cwd: 'X:\\radno\\Lekta', timestamp: TS, message: { content: [{ type: 'tool_use', id, name, input }] } },
    { type: 'user', uuid: opts.uuid ?? `u-${n}-b`, sessionId: session, cwd: 'X:\\radno\\Lekta', timestamp: TS, message: { content: [{ type: 'tool_result', tool_use_id: id, content: izlaz, ...(opts.error ? { is_error: true } : {}) }] } },
  ];
}
const jl = (rows: unknown[]) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

/** Tocno 7 rasipnih poziva u S1 i 1 u S2; ostalo su kontrole koje se NE smiju brojati. */
function fixture() {
  const s1 = [
    // rasipno (7)
    ...poziv(S1, 'Read', { file_path: `X:\\radno\\tajna-mapa\\velika.ts` }, redci(201)),
    ...poziv(S1, 'Bash', { command: `cat docs/${TAJNA}.md` }, redci(300)),
    ...poziv(S1, 'PowerShell', { command: 'Get-Content C:\\x\\log.txt' }, redci(250)),
    ...poziv(S1, 'Bash', { command: 'gh pr view 123 --json body,comments' }, redci(41)),
    ...poziv(S1, 'Bash', { command: 'git -C /c/x log --stat' }, redci(41)),
    ...poziv(S1, 'Agent', { subagent_type: 'codex:codex-rescue', prompt: TAJNA }, redci(61)),
    { type: 'assistant', uuid: 'u-msg', sessionId: S1, cwd: 'X:\\radno\\Lekta', timestamp: TS, message: { content: [{ type: 'tool_use', id: 'm-1', name: 'SendMessage', input: { to: 'x', message: Array(6).fill(TAJNA).join('\n') } }] } },
    // kontrole (0)
    ...poziv(S1, 'Read', { file_path: 'X:\\a\\mala.ts' }, redci(200)),
    ...poziv(S1, 'Read', { file_path: 'X:\\a\\rezana.ts', limit: 400 }, redci(400)),
    ...poziv(S1, 'Bash', { command: 'cat velika.log | head -50' }, redci(300)),
    ...poziv(S1, 'Bash', { command: 'gh pr view 123 --json body --jq .body' }, redci(90)),
    ...poziv(S1, 'Bash', { command: 'gh run view 9 --log-failed' }, redci(90)),
    ...poziv(S1, 'Bash', { command: 'git log -n 200 --stat' }, redci(90)),
    ...poziv(S1, 'Bash', { command: 'git log origin/master..HEAD --oneline' }, redci(3)),
    ...poziv(S1, 'Bash', { command: 'git gc --prune=now' }, redci(300)),
    ...poziv(S1, 'Agent', { subagent_type: 'Explore', prompt: 'x' }, redci(90)),
    ...poziv(S1, 'Bash', { command: 'cat nema.txt' }, redci(300), { error: true }),
    { type: 'assistant', uuid: 'u-msg2', sessionId: S1, cwd: 'X:\\radno\\Lekta', timestamp: TS, message: { content: [{ type: 'tool_use', id: 'm-2', name: 'SendMessage', input: { to: 'x', message: 'a\nb\nc\nd\ne' } }] } },
  ];
  const s2 = poziv(S2, 'Read', { file_path: '/home/u/veca.md' }, redci(400), { uuid: 'u-dupli' });
  return { s1, s2 };
}

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'quality-waste-home-'));
  const proj = join(home, '.claude', 'projects', 'X--radno-Lekta');
  mkdirSync(join(proj, S2, 'subagents'), { recursive: true });
  const { s1, s2 } = fixture();
  writeFileSync(join(proj, `${S1}.jsonl`), jl(s1));
  writeFileSync(join(proj, `${S2}.jsonl`), jl(s2));
  // Isti redci i u transkriptu podagenta: broje se jednom.
  writeFileSync(join(proj, S2, 'subagents', 'agent-x.jsonl'), jl(s2));
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('context waste: klasifikacija poziva', () => {
  it('pragovi su strogi: 200 redaka nije nalaz, 201 jest; limit iskljucuje Read', () => {
    expect(classifyWaste('Read', { file_path: 'a/b.ts' }, 200)).toBeNull();
    expect(classifyWaste('Read', { file_path: 'a/b.ts' }, 201)).toEqual({ vrsta: 'citanje-cijele-datoteke', oznaka: 'b.ts' });
    expect(classifyWaste('Read', { file_path: 'a/b.ts', limit: 50 }, 5000)).toBeNull();
    expect(classifyWaste('SendMessage', {}, 5)).toBeNull();
    expect(classifyWaste('SendMessage', {}, 6)?.vrsta).toBe('poruka-dulja-od-5-redaka');
  });

  it('rez izlaza ili filtar u naredbi skida nalaz', () => {
    expect(classifyWaste('Bash', { command: 'gh run view 1' }, 500)?.vrsta).toBe('gh-view-bez-filtra');
    expect(classifyWaste('Bash', { command: 'gh run view 1 | tail -20' }, 500)).toBeNull();
    expect(classifyWaste('Bash', { command: 'git log' }, 500)?.vrsta).toBe('git-log-bez-granice');
    expect(classifyWaste('Bash', { command: 'git log -5' }, 500)).toBeNull();
    expect(classifyWaste('PowerShell', { command: 'Get-Content a.txt -TotalCount 20' }, 500)).toBeNull();
  });

  it('oznaka nikad nije tekst naredbe', () => {
    const oznake = [
      classifyWaste('Bash', { command: `cat ${TAJNA}` }, 500),
      classifyWaste('Bash', { command: `gh pr view 1 --repo ${TAJNA}` }, 500),
      classifyWaste('Bash', { command: `git log --grep ${TAJNA}` }, 500),
    ].map((x) => x?.oznaka);
    expect(oznake).toEqual(['cat', 'gh pr view', 'git log']);
  });
});

describe('context waste: sinteticki transkript s poznatim brojem', () => {
  it('generator: fixtura ima tocno 7 + 1 rasipnih poziva i svih pet vrsta', () => {
    const { s1, s2 } = fixture();
    const ctx = { seenWaste: new Set<string>(), stats: { malformedLines: 0 } };
    const a = wasteFromLines(jl(s1).split('\n'), ctx);
    const b = wasteFromLines(jl(s2).split('\n'), ctx);
    expect(a).toHaveLength(7);
    expect(b).toHaveLength(1);
    expect([...new Set(a.map((r: { vrsta: string }) => r.vrsta))].sort()).toEqual([
      'citanje-cijele-datoteke', 'codex-pregled-u-cijelosti', 'gh-view-bez-filtra', 'git-log-bez-granice', 'poruka-dulja-od-5-redaka',
    ]);
  });

  it('s diska: 8 poziva, podagent se ne broji dvaput, dva prolaza daju isto', () => {
    const prvi = collectAll({ home });
    expect(prvi.waste).toHaveLength(8);
    expect(collectAll({ home })).toEqual(prvi);
  });

  it('sazetak po sesiji: broj, tri najskuplja primjera, najskuplja sesija prva', () => {
    const sum = summarizeWaste(collectAll({ home }).waste, DAN);
    expect(sum.ukupno).toBe(8);
    expect(sum.sesije.map((s: { session: string; broj: number }) => [s.session, s.broj])).toEqual([['aaaaaaaa Lekta', 7], ['bbbbbbbb Lekta', 1]]);
    const s1 = sum.sesije[0];
    expect(s1.primjeri).toHaveLength(3);
    expect(s1.primjeri.map((p: { tokeni: number }) => p.tokeni)).toEqual([...s1.primjeri.map((p: { tokeni: number }) => p.tokeni)].sort((x, y) => y - x));
    expect(s1.poVrsti['citanje-cijele-datoteke']).toBe(3);
    expect(summarizeWaste(collectAll({ home }).waste, '2026-10-07').ukupno).toBe(0);
  });

  it('izvjestaj ne sadrzi sadrzaj datoteka, tekst naredbi, poruka ni putanju', () => {
    const sum = summarizeWaste(collectAll({ home }).waste, DAN);
    const tekst = `${renderWasteMarkdown(sum)}\n${JSON.stringify(sum)}`;
    expect(tekst).not.toContain(TAJNA);
    expect(tekst).not.toContain('tajna-mapa');
    expect(tekst).toContain('velika.ts');
    expect(tekst).toContain('heuristika');
  });
});
