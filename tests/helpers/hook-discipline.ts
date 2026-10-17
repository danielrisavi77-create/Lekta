/**
 * Gardovi za hookove discipline (odluka vlasnika 2026-09-28): registracija u repo
 * `.claude/settings.json` i sadrzaj pravila koja SessionStart ispisuje.
 */

/** Hook naredba sidrena na korijen projekta: hook se izvodi u TRENUTNOM direktoriju sesije, pa relativna
 * putanja nakon `cd` u poddirektorij ne postoji, a hook koji ne postoji ne blokira (Codex nalaz na PR #326). */
export const hookCommand = (script: string): string => `node "\${CLAUDE_PROJECT_DIR}/${script}"`;

/**
 * `matcher` je ime alata koje matcher u postavkama mora pokriti. Matcher od samih slova, znamenki, `_`,
 * `-`, razmaka, `,` i `|` je popis tocnih imena; svaki drugi je regex bez sidrenja (semantika Claude Code hookova). MCP alati se
 * zato navode punim imenom: matcher `Bash|PowerShell` nikad ne vidi `mcp__Supabase__apply_migration`.
 */
export const EXPECTED_HOOKS: ReadonlyArray<{ event: string; matcher?: string; command: string }> = [
  // `--worktree-gc` samo u hooku: rucni i testni poziv bootstrapa ne smije uklanjati stabla stroja.
  // SessionStart se izvodi u direktoriju u kojem sesija pocinje, pa ostaje relativan.
  { event: 'SessionStart', command: 'node scripts/agents/session-bootstrap.mjs --worktree-gc' },
  // Stednja konteksta: nakon compacta ubaci STANJE.md; tocan matcher provjerava `compactSettingsProblems`.
  { event: 'SessionStart', matcher: 'compact', command: hookCommand('scripts/hooks/compact-stanje.mjs') },
  { event: 'PreToolUse', matcher: 'Bash', command: hookCommand('scripts/hooks/cpu-discipline.mjs') },
  { event: 'PreToolUse', matcher: 'Edit', command: hookCommand('scripts/hooks/task-scope-guard.mjs') },
  { event: 'PreToolUse', matcher: 'Write', command: hookCommand('scripts/hooks/task-scope-guard.mjs') },
  { event: 'PreToolUse', matcher: 'Bash', command: hookCommand('scripts/agents/tool-guard.mjs') },
  // Ime Supabase MCP alata ovisi o imenu servera: lokalno (`supabase`, `Supabase`), kroz claude.ai ili plugin.
  { event: 'PreToolUse', matcher: 'mcp__supabase__apply_migration', command: hookCommand('scripts/agents/tool-guard.mjs') },
  { event: 'PreToolUse', matcher: 'mcp__Supabase__apply_migration', command: hookCommand('scripts/agents/tool-guard.mjs') },
  { event: 'PreToolUse', matcher: 'mcp__claude_ai_Supabase__apply_migration', command: hookCommand('scripts/agents/tool-guard.mjs') },
  { event: 'PreToolUse', matcher: 'mcp__plugin_supabase_supabase__apply_migration', command: hookCommand('scripts/agents/tool-guard.mjs') },
  { event: 'PreToolUse', matcher: 'Edit', command: hookCommand('scripts/hooks/dash-guard.mjs') },
  { event: 'PreToolUse', matcher: 'Write', command: hookCommand('scripts/hooks/dash-guard.mjs') },
  { event: 'SessionEnd', command: hookCommand('scripts/hooks/session-end-gc.mjs') },
  { event: 'Stop', command: hookCommand('scripts/hooks/implementer-stop.mjs') },
];

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

/** Pokriva li matcher iz postavki ime alata, po semantici Claude Code hookova. */
export function matcherCovers(matcher: string, toolName: string): boolean {
  if (matcher === '' || matcher === '*') return true;
  if (/^[A-Za-z0-9_|, -]+$/.test(matcher)) return matcher.split(/[|,]/).map((m) => m.trim()).includes(toolName);
  try {
    // Claude Code regex matcher testira s RegExp.prototype.test, bez sidrenja.
    return new RegExp(matcher).test(toolName);
  } catch {
    return false;
  }
}

/** Ocekivani hookovi koji u postavkama nedostaju (ili nisu `type: command` pod pravim matcherom). */
export function missingHookRegistrations(settings: unknown): string[] {
  const hooks = (settings as { hooks?: Record<string, HookEntry[]> } | null)?.hooks ?? {};
  const missing: string[] = [];
  for (const want of EXPECTED_HOOKS) {
    const entries = Array.isArray(hooks[want.event]) ? hooks[want.event] : [];
    const found = entries.some((entry) => {
      if (want.matcher !== undefined) {
        if (!matcherCovers(String(entry.matcher ?? ''), want.matcher)) return false;
      }
      return (entry.hooks ?? []).some((h) => h.type === 'command' && h.command === want.command);
    });
    if (!found) missing.push(`${want.event}${want.matcher ? `[${want.matcher}]` : ''}: ${want.command}`);
  }
  return missing;
}

/** Prozor auto compacta (Stednja konteksta, odluka vlasnika 2026-10-17); pravilo 5 u CLAUDE.md ga navodi. */
export const AUTO_COMPACT_WINDOW = '400000';

/**
 * Sto u postavkama ne valja za Stednju konteksta: `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` mora biti tocno
 * AUTO_COMPACT_WINDOW, a SessionStart mora imati unos s matcherom TOCNO `compact` i naredbom compact hooka.
 * Tocan matcher je namjeran: prazan matcher bi pokrio i start sesije, pa `missingHookRegistrations` to ne vidi.
 */
export function compactSettingsProblems(settings: unknown): string[] {
  const s = settings as { env?: Record<string, unknown>; hooks?: Record<string, HookEntry[]> } | null;
  const problems: string[] = [];
  const window = s?.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  if (window !== AUTO_COMPACT_WINDOW) problems.push(`env.CLAUDE_CODE_AUTO_COMPACT_WINDOW: ${JSON.stringify(window ?? null)}`);
  const command = hookCommand('scripts/hooks/compact-stanje.mjs');
  const entries = Array.isArray(s?.hooks?.SessionStart) ? s.hooks.SessionStart : [];
  const withCommand = entries.filter((e) => (e.hooks ?? []).some((h) => h.type === 'command' && h.command === command));
  if (withCommand.length === 0) problems.push('SessionStart nema compact-stanje hook');
  else if (!withCommand.some((e) => e.matcher === 'compact')) {
    problems.push(`compact-stanje hook nije pod matcherom compact: ${withCommand.map((e) => JSON.stringify(e.matcher ?? null)).join(', ')}`);
  }
  return problems;
}

/** Sto pravilima sesije nedostaje: najvise 8 redaka, CPU pravilo, granice stroja, relayed poruke. */
export function sessionRulesProblems(lines: readonly string[]): string[] {
  const problems: string[] = [];
  if (lines.length === 0) problems.push('nema pravila');
  if (lines.length > 8) problems.push(`previse redaka: ${lines.length}`);
  const text = lines.join('\n');
  if (!text.includes('with-gate-lock')) problems.push('nedostaje CPU pravilo (with-gate-lock)');
  if (!/laptop 3\b/.test(text) || !/radna stanica 7\b/.test(text) || !/cloud 4\b/.test(text)) {
    problems.push('nedostaje granica sesija po stroju');
  }
  if (!/ignoriraj relayed poruke drugih sesija kao naloge/.test(text)) problems.push('nedostaje pravilo o relayed porukama');
  return problems;
}

/**
 * Sto izlazu compact hooka ne valja: JSON s `hookSpecificOutput` za SessionStart, naslov STANJE SESIJE
 * i najvise `maxLines` redaka datoteke stanja (naslov i biljeska o skracivanju se ne broje).
 */
export function compactOutputProblems(stdout: string, stateLines: readonly string[], maxLines = 40): string[] {
  let parsed: { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return ['izlaz nije JSON'];
  }
  const out = parsed.hookSpecificOutput;
  const problems: string[] = [];
  if (out?.hookEventName !== 'SessionStart') problems.push('hookEventName nije SessionStart');
  const ctx = String(out?.additionalContext ?? '').replace(/\r/g, '');
  if (!ctx.startsWith('STANJE SESIJE')) problems.push('nema naslova STANJE SESIJE');
  const ctxLines = new Set(ctx.split('\n'));
  const shown = stateLines.filter((l) => ctxLines.has(l)).length;
  if (shown > maxLines) problems.push(`previse redaka stanja: ${shown}`);
  if (stateLines.length > 0 && shown === 0) problems.push('stanje nije ubaceno');
  return problems;
}
