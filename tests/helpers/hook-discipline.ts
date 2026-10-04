/**
 * Gardovi za hookove discipline (odluka vlasnika 2026-09-28): registracija u repo
 * `.claude/settings.json` i sadrzaj pravila koja SessionStart ispisuje.
 */

export const EXPECTED_HOOKS: ReadonlyArray<{ event: string; matcher?: string; command: string }> = [
  // `--worktree-gc` samo u hooku: rucni i testni poziv bootstrapa ne smije uklanjati stabla stroja.
  { event: 'SessionStart', command: 'node scripts/agents/session-bootstrap.mjs --worktree-gc' },
  { event: 'PreToolUse', matcher: 'Bash', command: 'node scripts/hooks/cpu-discipline.mjs' },
  { event: 'PreToolUse', matcher: 'Edit', command: 'node scripts/hooks/task-scope-guard.mjs' },
  { event: 'PreToolUse', matcher: 'Write', command: 'node scripts/hooks/task-scope-guard.mjs' },
  { event: 'Stop', command: 'node scripts/hooks/implementer-stop.mjs' },
];

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

/** Ocekivani hookovi koji u postavkama nedostaju (ili nisu `type: command` pod pravim matcherom). */
export function missingHookRegistrations(settings: unknown): string[] {
  const hooks = (settings as { hooks?: Record<string, HookEntry[]> } | null)?.hooks ?? {};
  const missing: string[] = [];
  for (const want of EXPECTED_HOOKS) {
    const entries = Array.isArray(hooks[want.event]) ? hooks[want.event] : [];
    const found = entries.some((entry) => {
      if (want.matcher !== undefined) {
        const matchers = String(entry.matcher ?? '').split('|');
        if (!matchers.includes(want.matcher)) return false;
      }
      return (entry.hooks ?? []).some((h) => h.type === 'command' && h.command === want.command);
    });
    if (!found) missing.push(`${want.event}${want.matcher ? `[${want.matcher}]` : ''}: ${want.command}`);
  }
  return missing;
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
