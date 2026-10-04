// @vitest-environment node
/**
 * Petlja ucenja: skupljac ponavljanih kvarova (scripts/quality/harvest.mjs). Svi ulazi su
 * SINTETICKI transkripti u privremenom direktoriju, nikad stvarni ~/.claude. Oblici redaka prate
 * ono sto je izmjereno na disku 2026-10-04 (imena polja i tekstovi gresaka alata, bez sadrzaja).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLASSES,
  classify,
  collectFailures,
  failuresFromLines,
  isInside,
  normalizeSignature,
  renderMarkdown,
  summarize,
} from '../scripts/quality/harvest.mjs';

const TAJNA = 'TAJNI-SADRZAJ-RADA-NE-SMIJE-U-IZVJESTAJ';
const DAN = '2026-10-04';

/** Po jedan stvarni oblik teksta za svaku klasu; generator mora pogoditi bas tu klasu. */
const PRIMJERI: Record<string, string> = {
  'hook-cpu-disciplina': 'PreToolUse:Bash hook error: [node scripts/hooks/cpu-discipline.mjs]: CPU disciplina: tezak posao ide kroz `node scripts/with-gate-lock.mjs`',
  'hook-tool-guard': 'PreToolUse:Bash hook error: [node scripts/agents/tool-guard.mjs]: tool-guard: rm -rf izvan repoa/worktreeova',
  'hook-git-commit-only': '`git commit` bez `--only` commita CIJELI indeks, ne samo tvoje putanje.',
  'hook-worktree-nepoznat': 'PreToolUse:Bash hook error: Nije se moglo utvrditi radi li se u vlastitom worktreeju, pa git push nije dopusten',
  'auto-mode-odbijeno': 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: [CI Bypass]. If you have other tasks',
  'auto-mode-nedostupan': 'claude-sonnet-5[1m] is temporarily unavailable (timed out), so auto mode cannot determine the safety',
  'korisnik-odbio': "The user doesn't want to proceed with this tool use. The tool use was rejected",
  'bash-navodnici': "Exit code 2 /usr/bin/bash: -c: line 3: unexpected EOF while looking for matching `''",
  'citaj-prije-pisanja': '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>',
  'sleep-blokiran': '<tool_use_error>Blocked: sleep 30 followed by: tail -5 "x". To wait for a condition, use Monitor',
  'prevelika-datoteka': 'File content (300.1KB) exceeds maximum allowed size (256KB). Use offset and limit parameters',
  'ripgrep-istek': 'Ripgrep search timed out after 20 seconds. The search may have matched files',
  'shema-izlaza': "Output does not match required schema: root: must have required property 'files'",
  'naredba-ne-postoji': 'Exit code 127 /usr/bin/bash: line 1: ls: command not found',
  'cmd-switch': 'Exit code 1 Invalid switch - "/".',
  'istek-naredbe': 'Exit code 143 Command timed out after 2m 0s',
  'worktree-ili-grana-postoji': "Exit code 128 fatal: a branch named 'design/z7' already exists",
  'esm-url-shema': 'Exit code 1 node:internal/modules: throw new ERR_UNSUPPORTED_ESM_URL_SCHEME(parsed, schemes);',
  'modul-nije-nadjen': "Exit code 1 Error: Cannot find module 'C:\\x\\y.mjs'",
  'python-escape': "Exit code 1 SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes",
  'disk-pun': 'Exit code 1 npm error code ENOSPC',
  'npm-eperm': 'Exit code 1 npm error code EPERM npm error syscall unlink',
  'spawn-einval': 'ENAMETOOLONG: name too long, uv_spawn',
  'supabase-mcp': '{"error":{"name":"HttpException","message":"Failed to run sql query"}}',
  'vitest-pad': 'Exit code 1  Test Files  2 failed | 300 passed (302)',
  'datoteka-ne-postoji': 'File does not exist. Note: your current working directory is C:\\x',
};

const jl = (rows: unknown[]) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
let n = 0;
const use = (session: string, ts: string, id: string, name = 'Bash') => ({
  type: 'assistant', uuid: `u-${++n}`, sessionId: session, cwd: 'X:\\radno\\Lekta', timestamp: ts,
  message: { content: [{ type: 'tool_use', id, name, input: { command: TAJNA } }] },
});
const err = (session: string, ts: string, id: string, text: string, uuid = `u-${++n}`) => ({
  type: 'user', uuid, sessionId: session, cwd: 'X:\\radno\\Lekta', timestamp: ts,
  message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: text }] },
});
const ok = (session: string, ts: string, id: string) => ({
  type: 'user', uuid: `u-${++n}`, sessionId: session, timestamp: ts,
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: `uspjeh ${TAJNA}` }] },
});

const S1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const S2 = 'bbbbbbbb-1111-2222-3333-444444444444';
const S3 = 'cccccccc-1111-2222-3333-444444444444';
let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'quality-harvest-home-'));
  const proj = join(home, '.claude', 'projects', 'X--radno-Lekta');
  mkdirSync(join(proj, S1, 'subagents'), { recursive: true });
  const dupl = err(S1, '2026-10-03T10:00:01Z', 't2', PRIMJERI['bash-navodnici'], 'u-dupli');
  writeFileSync(join(proj, `${S1}.jsonl`), jl([
    use(S1, '2026-10-03T10:00:00Z', 't1'),
    ok(S1, '2026-10-03T10:00:00Z', 't1'),
    use(S1, '2026-10-03T10:00:01Z', 't2'),
    dupl,
    use(S1, '2026-10-03T10:00:02Z', 't3', 'Read'),
    err(S1, '2026-10-03T10:00:02Z', 't3', PRIMJERI['citaj-prije-pisanja']),
    use(S1, '2026-10-03T10:00:03Z', 't4'),
    err(S1, '2026-10-03T10:00:03Z', 't4', `Exit code 1 ${TAJNA} jedinstvena greska 4242`),
  // Osteceni redak mora proci brzi filtar (sadrzi is_error), inace se ne parsira ni ne broji.
  ]) + '{"is_error":true, ostecen redak\n');
  // Isti redak (isti uuid i tool_use_id) i u transkriptu podagenta: broji se jednom.
  writeFileSync(join(proj, S1, 'subagents', 'agent-x.jsonl'), jl([use(S1, '2026-10-03T10:00:01Z', 't2'), dupl]));
  writeFileSync(join(proj, `${S2}.jsonl`), jl([
    use(S2, '2026-09-10T08:00:00Z', 'q1'),
    err(S2, '2026-09-10T08:00:00Z', 'q1', PRIMJERI['bash-navodnici']),
    use(S2, '2026-09-10T08:00:01Z', 'q2'),
    err(S2, '2026-09-10T08:00:01Z', 'q2', PRIMJERI['auto-mode-odbijeno']),
    use(S2, '2026-09-10T08:00:02Z', 'q3'),
    err(S2, '2026-09-10T08:00:02Z', 'q3', `Exit code 1 ${TAJNA} jedinstvena greska 77`),
  ]));
  // Stara pojava izvan 30 dana ne ulazi u dug lekcija.
  writeFileSync(join(proj, `${S3}.jsonl`), jl([
    use(S3, '2026-08-01T08:00:00Z', 'r1'),
    err(S3, '2026-08-01T08:00:00Z', 'r1', PRIMJERI['ripgrep-istek']),
    use(S3, '2026-10-04T08:00:00Z', 'r2', 'Glob'),
    err(S3, '2026-10-04T08:00:00Z', 'r2', PRIMJERI['ripgrep-istek']),
  ]));
});

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('quality harvest: klasifikacija', () => {
  it('svaka klasa ima primjer, i generator pogadja bas tu klasu', () => {
    expect(Object.keys(PRIMJERI).sort()).toEqual(CLASSES.map((c) => c.id).sort());
    for (const [id, text] of Object.entries(PRIMJERI)) expect(classify(text).klasa.split(':')[0]).toBe(id);
  });

  it('odbijanje auto moda dijeli se po razlogu', () => {
    expect(classify(PRIMJERI['auto-mode-odbijeno']).klasa).toBe('auto-mode-odbijeno:CI Bypass');
    expect(classify('denied by the Claude Code auto mode classifier. Reason: Blocked by classifier.').klasa).toBe('auto-mode-odbijeno:opce');
  });

  it('nepoznat razlog auto moda ne curi kroz ime klase', () => {
    const k = classify(`denied by the Claude Code auto mode classifier. Reason: [${TAJNA}]`).klasa;
    expect(k).toBe('auto-mode-odbijeno:ostalo');
    expect(k).not.toContain(TAJNA);
  });

  it('isInside: korijen i podmape jesu unutra; susjedna mapa i drugi disk nisu', () => {
    expect(isInside('C:/x/repo', 'C:/x/repo')).toBe(true);
    expect(isInside('C:/x/repo/scripts', 'C:/x/repo')).toBe(true);
    expect(isInside('C:/x/repo2', 'C:/x/repo')).toBe(false);
    expect(isInside('C:/x', 'C:/x/repo')).toBe(false);
  });

  it('neklasificirano: isti kvar na drugoj putanji i s drugim brojem daje isti potpis', () => {
    const a = classify('Exit code 1 fatal: not a git repository C:\\a\\b 12');
    const b = classify('Exit code 128 fatal: not a git repository D:/x/y/z 7');
    expect(a.klasa).toMatch(/^ostalo:[0-9a-f]{10}$/);
    expect(a.klasa).toBe(b.klasa);
    expect(normalizeSignature('x'.repeat(200))).toHaveLength(90);
  });
});

describe('quality harvest: skupljanje', () => {
  it('broji samo is_error, jednom po uuid+tool_use_id, s imenom alata iz tool_use', () => {
    const { failures, stats } = collectFailures({ home });
    expect(failures).toHaveLength(8);
    expect(stats.malformedLines).toBe(1);
    expect(failures.filter((f) => f.klasa === 'bash-navodnici')).toHaveLength(2);
    expect(failures.find((f) => f.klasa === 'citaj-prije-pisanja')?.alat).toBe('Read');
    expect(failures.find((f) => f.klasa === 'citaj-prije-pisanja')?.session).toBe('aaaaaaaa Lekta');
  });

  it('dva prolaza daju isti rezultat (drugi je no-op)', () => {
    expect(collectFailures({ home })).toEqual(collectFailures({ home }));
  });

  it('sinceDay izbacuje starije pojave', () => {
    const { failures } = collectFailures({ home, sinceDay: '2026-10-01' });
    expect(failures.every((f) => f.day >= '2026-10-01')).toBe(true);
    expect(failures).toHaveLength(4);
  });
});

describe('quality harvest: sazetak i izvjestaj', () => {
  // Citanje tek unutar testa: tijelo describe bloka se izvodi prije beforeAll, kad `home` jos ne
  // postoji, pa bi collectFailures pao na stvarni ~/.claude.
  let r: ReturnType<typeof collectFailures> | null = null;
  const podaci = () => {
    expect(home).toBeTruthy();
    r ??= collectFailures({ home });
    return r;
  };

  it('prozori 7 i 30 dana; dug lekcija = bez garda u 2+ sesije unutar 30 dana', () => {
    const sum = summarize(podaci().failures, DAN);
    const nav = sum.clusters.find((c) => c.klasa === 'bash-navodnici');
    expect(nav).toMatchObject({ d7: 1, d30: 2, sesije30: 2, ukupno: 2, gard: null });
    const rg = sum.clusters.find((c) => c.klasa === 'ripgrep-istek');
    expect(rg).toMatchObject({ d7: 1, d30: 1, sesije30: 1, ukupno: 2 });
    expect(sum.dug.map((c) => c.klasa)).toEqual(['bash-navodnici']);
    // Klasa s gardom nije dug ni kad se ponavlja.
    expect(sum.clusters.find((c) => c.klasa === 'citaj-prije-pisanja')?.gard).not.toBeNull();
  });

  it('dan u proslosti ne vidi buduce pojave', () => {
    expect(summarize(podaci().failures, '2026-09-30').ukupno).toBe(4);
  });

  it('uzorak potpisa ide samo u lokalni izvjestaj; --no-samples ga izostavlja', () => {
    const sum = summarize(podaci().failures, DAN);
    const ostalo = sum.clusters.find((c) => c.klasa.startsWith('ostalo:'));
    expect(ostalo).toMatchObject({ sesije: 2, vrsta: 'neklasificirano' });
    const sUzorkom = renderMarkdown(sum, podaci().stats, { samples: true });
    const bez = renderMarkdown(sum, podaci().stats);
    // Maskirani potpis moze nositi rijeci poruke, zato je samo uz izricit --samples; zadano ga nema.
    expect(sUzorkom).toContain(TAJNA);
    expect(bez).toContain(ostalo!.klasa);
    expect(bez).not.toContain(TAJNA);
    expect(bez).not.toContain('`');
    expect(sUzorkom).toContain('NIJE pokriveno: Codex, Grok');
  });
});

describe('quality harvest: failuresFromLines je cista funkcija', () => {
  it('ne cita disk i postuje zajednicki skup vidjenih', () => {
    const ctx = { seen: new Set<string>(), stats: { malformedLines: 0 } };
    const lines = jl([use(S1, '2026-10-03T10:00:00Z', 'z1'), err(S1, '2026-10-03T10:00:00Z', 'z1', PRIMJERI['disk-pun'], 'u-z')]).split('\n');
    expect(failuresFromLines(lines, ctx)).toHaveLength(1);
    expect(failuresFromLines(lines, ctx)).toHaveLength(0);
  });

  it('brzi filtar prihvaca i razmak oko dvotocke u is_error', () => {
    const ctx = { seen: new Set<string>(), stats: { malformedLines: 0 } };
    const redak = JSON.stringify(err(S1, '2026-10-03T10:00:00Z', 'w1', PRIMJERI['disk-pun'], 'u-w')).replace('"is_error":true', '"is_error" : true');
    expect(redak).toContain('"is_error" : true');
    expect(failuresFromLines([redak], ctx)).toHaveLength(1);
  });
});
