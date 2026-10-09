/**
 * Scenariji za Supabase MCP gard u `scripts/agents/tool-guard.mjs` (odluka vlasnika 2026-10-08).
 * Gard vraca popis problema; prazan popis je cisto. Mutacije su u `tests/gate-mutations.test.ts`.
 *
 * Dva neovisna uvjeta, jer svaki sam po sebi ne stiti nista:
 *  1. presuda (`judgeCommand`) odbija alate i upise koji mijenjaju bazu ili projekt;
 *  2. hook je registriran za te alate (`.claude/settings.json` matcher). Bez toga presuda nikad
 *     ne bude pozvana: do 2026-10-08 matcher je bio samo `Bash|PowerShell`, pa je postojeca zabrana
 *     `apply_migration` bila vakuumska.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Judge = (
  toolName: string,
  command?: string,
  toolInput?: Record<string, unknown>,
) => { allow: boolean; reason: string };

export const SUPABASE_MCP_SCENARIOS: ReadonlyArray<{
  name: string;
  tool: string;
  input?: Record<string, unknown>;
  allow: boolean;
}> = [
  { name: 'deploy_edge_function (konektor)', tool: 'mcp__Supabase__deploy_edge_function', input: { name: 'x' }, allow: false },
  { name: 'deploy_edge_function (lokalni CLI)', tool: 'mcp__claude_ai_Supabase__deploy_edge_function', allow: false },
  { name: 'apply_migration', tool: 'mcp__Supabase__apply_migration', allow: false },
  { name: 'merge_branch', tool: 'mcp__Supabase__merge_branch', allow: false },
  { name: 'reset_branch', tool: 'mcp__Supabase__reset_branch', allow: false },
  { name: 'pause_project', tool: 'mcp__Supabase__pause_project', allow: false },
  { name: 'create_edge_function_secret (nije na popisu zabrana)', tool: 'mcp__Supabase__create_edge_function_secret', input: { name: 'X', value: 'y' }, allow: false },
  { name: 'update_storage_config (Codex bot #327)', tool: 'mcp__Supabase__update_storage_config', input: {}, allow: false },
  { name: "execute_sql select '--'; drop (Codex bot #327)", tool: 'mcp__Supabase__execute_sql', input: { query: "select '--'; drop table t" }, allow: false },
  { name: 'nepoznat buduci alat', tool: 'mcp__Supabase__neki_novi_alat', allow: false },
  { name: 'execute_sql select', tool: 'mcp__Supabase__execute_sql', input: { query: 'select id, created_at from public.orders limit 5' }, allow: true },
  { name: 'execute_sql agregat i now()', tool: 'mcp__Supabase__execute_sql', input: { query: "select count(*) from t where created_at > now() - interval '1 day'" }, allow: true },
  { name: 'execute_sql CTE koji cita, s tockom-zarezom', tool: 'mcp__Supabase__execute_sql', input: { query: 'with x as (select id from t) select * from x;' }, allow: true },
  { name: 'execute_sql explain', tool: 'mcp__Supabase__execute_sql', input: { query: 'explain select * from t' }, allow: true },
  { name: 'execute_sql rijec delete samo u literalu', tool: 'mcp__Supabase__execute_sql', input: { query: "select * from audit where action = 'delete'" }, allow: true },
  { name: 'execute_sql drop samo u ugnijezdenom komentaru', tool: 'mcp__Supabase__execute_sql', input: { query: '/* a /* drop table t */ b */ select 1' }, allow: true },
  { name: 'execute_sql insert', tool: 'mcp__Supabase__execute_sql', input: { query: 'insert into public.orders(id) values (1)' }, allow: false },
  { name: 'execute_sql update velikim slovima', tool: 'mcp__Supabase__execute_sql', input: { query: 'UPDATE public.orders SET status = 1' }, allow: false },
  { name: 'execute_sql delete u CTE-u', tool: 'mcp__Supabase__execute_sql', input: { query: 'with d as (delete from t returning *) select * from d' }, allow: false },
  { name: 'execute_sql drop iza komentara', tool: 'mcp__Supabase__execute_sql', input: { query: 'select 1; -- x\ndrop table t' }, allow: false },
  { name: 'execute_sql dvije naredbe koje citaju', tool: 'mcp__Supabase__execute_sql', input: { query: 'select 1; select 2' }, allow: false },
  { name: "execute_sql E-string skriva update (Codex #327, nalaz 1)", tool: 'mcp__Supabase__execute_sql', input: { query: "SELECT E'foo\\'bar'; UPDATE t SET x=1; SELECT 'z'" }, allow: false },
  { name: 'execute_sql E-string s parnim navodnicima skriva update', tool: 'mcp__Supabase__execute_sql', input: { query: "SELECT E'\\'' ; UPDATE t SET x=1; SELECT E'\\''" }, allow: false },
  { name: "execute_sql '--' u literalu skriva update", tool: 'mcp__Supabase__execute_sql', input: { query: "select '--'\nupdate t set x=1" }, allow: false },
  { name: 'execute_sql nezatvoren literal', tool: 'mcp__Supabase__execute_sql', input: { query: "select 'abc" }, allow: false },
  { name: 'execute_sql pg_notify (Codex #327, nalaz 2)', tool: 'mcp__Supabase__execute_sql', input: { query: "SELECT pg_notify('x','y')" }, allow: false },
  { name: 'execute_sql pg_advisory_lock', tool: 'mcp__Supabase__execute_sql', input: { query: 'select pg_advisory_lock(1)' }, allow: false },
  { name: 'execute_sql vlastiti RPC', tool: 'mcp__Supabase__execute_sql', input: { query: 'select public.moja_funkcija()' }, allow: false },
  { name: 'execute_sql funkcija u navodnicima', tool: 'mcp__Supabase__execute_sql', input: { query: 'select "fn"()' }, allow: false },
  { name: 'execute_sql set_config', tool: 'mcp__Supabase__execute_sql', input: { query: "select set_config('role', 'postgres', false)" }, allow: false },
  { name: 'execute_sql select into (stvara tablicu)', tool: 'mcp__Supabase__execute_sql', input: { query: 'select * into nova from t' }, allow: false },
  { name: 'execute_sql explain analyze (izvrsava)', tool: 'mcp__Supabase__execute_sql', input: { query: 'explain analyze select 1' }, allow: false },
  { name: 'execute_sql bez upita', tool: 'mcp__Supabase__execute_sql', input: {}, allow: false },
  { name: 'list_tables', tool: 'mcp__Supabase__list_tables', input: { schemas: ['public'] }, allow: true },
  { name: 'get_advisors', tool: 'mcp__Supabase__get_advisors', input: { type: 'security' }, allow: true },
  { name: 'query_logs', tool: 'mcp__Supabase__query_logs', input: {}, allow: true },
  { name: 'drugi MCP s istim sufiksom', tool: 'mcp__github__merge_pull_request', allow: true },
];

export function supabaseMcpGuardProblems(judge: Judge): string[] {
  const out: string[] = [];
  for (const { name, tool, input, allow } of SUPABASE_MCP_SCENARIOS) {
    const got = judge(tool, undefined, input).allow;
    if (got !== allow) out.push(`${name}: dobiveno allow=${got}, ocekivano allow=${allow}`);
  }
  return out;
}

/** Imena alata koja hook MORA vidjeti, u oba oblika koja Claude Code koristi. */
export const SUPABASE_MCP_TOOL_NAMES = [
  'mcp__Supabase__apply_migration',
  'mcp__Supabase__execute_sql',
  'mcp__claude_ai_Supabase__deploy_edge_function',
];

type HookSettings = {
  hooks?: { PreToolUse?: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }> };
};

/** tool-guard mora biti registriran s matcherom koji pokriva Bash, PowerShell i Supabase MCP alate. */
export function toolGuardMatcherProblems(settings: HookSettings): string[] {
  const entries = (settings.hooks?.PreToolUse ?? []).filter((entry) =>
    (entry.hooks ?? []).some((hook) => (hook.command ?? '').includes('scripts/agents/tool-guard.mjs')),
  );
  if (entries.length === 0) return ['tool-guard nije registriran u PreToolUse'];
  const covers = (tool: string) =>
    entries.some((entry) => new RegExp(`^(?:${entry.matcher ?? ''})$`).test(tool));
  return ['Bash', 'PowerShell', ...SUPABASE_MCP_TOOL_NAMES]
    .filter((tool) => !covers(tool))
    .map((tool) => `tool-guard matcher ne pokriva ${tool}`);
}

/**
 * Scenariji nad KOPIJOM izvora `tool-guard.mjs` u privremenom direktoriju (mutacija mijenja izvor,
 * ne omotac: `tests/CLAUDE.md`). Presudu racuna cisti node proces, jer Vitestov loader ne ucitava
 * module izvan korijena projekta, a mutirana kopija ne smije u repozitorij.
 */
export function supabaseMcpGuardProblemsForSource(source: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'lekta-tool-guard-mut-'));
  try {
    const file = join(dir, 'tool-guard.mjs');
    writeFileSync(file, source);
    const script =
      `const m = await import(${JSON.stringify(pathToFileURL(file).href)});` +
      `const sc = ${JSON.stringify(SUPABASE_MCP_SCENARIOS)};` +
      'process.stdout.write(JSON.stringify(sc.map((x) => m.judgeCommand(x.tool, undefined, x.input).allow)));';
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
    if (res.status !== 0) return [`mutirani izvor se ne izvrsava: ${res.stderr.trim().split('\n')[0]}`];
    const verdicts = JSON.parse(res.stdout) as boolean[];
    let index = 0;
    return supabaseMcpGuardProblems(() => ({ allow: verdicts[index++], reason: '' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
