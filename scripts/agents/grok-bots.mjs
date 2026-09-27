// Grok botovi (odluka vlasnika 27. 9.): cetiri imenovane uloge nad providerom grok, opisane u
// `config/agent-routing.json` pod `bots`. Cisti modul bez I/O-a: runner (`cli.mjs --bot`) ga zove
// prije pokretanja (je li bot dopusten za agenta i fazu) i nakon pokretanja (jesu li promijenjene
// datoteke unutar dopustenih putanja). Zabrana putanja je tako tehnicki nametnuta, ne samo opisana.

export const BOT_RUNNER_PHASES = Object.freeze(['review', 'implement']);

/** Minimalan glob: `dir/**`, `**\/*.ext`, `*.ext` i tocna staza. Staze su uvijek s kosom crtom. */
export function pathMatches(pattern, file) {
  const f = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  const p = String(pattern).replace(/\\/g, '/');
  if (p.endsWith('/**')) {
    const dir = p.slice(0, -3);
    return f === dir || f.startsWith(`${dir}/`);
  }
  if (p.startsWith('**/*.')) return f.endsWith(p.slice(4));
  if (p.startsWith('*.')) return !f.includes('/') && f.endsWith(p.slice(1));
  return f === p;
}

/**
 * Vraca bot iz configa ili baca gresku s razlogom. `agentCommand` je provider odabranog agenta
 * (`AGENTS[agent].command`), `agentName` ime agenta, `runnerPhase` faza runnera (review|implement).
 */
export function resolveBot(config, botName, { agentName, agentCommand, runnerPhase }) {
  const bots = config && typeof config.bots === 'object' && config.bots ? config.bots : {};
  const bot = Object.prototype.hasOwnProperty.call(bots, botName) ? bots[botName] : null;
  if (!bot || typeof bot !== 'object' || typeof bot.provider !== 'string') {
    throw new Error(`Unknown bot: ${botName}`);
  }
  if (bot.provider !== agentCommand) {
    throw new Error(`Bot ${botName} runs on provider ${bot.provider}, not ${agentCommand}`);
  }
  if (bot.agent && bot.agent !== agentName) {
    throw new Error(`Bot ${botName} requires --agent ${bot.agent}`);
  }
  if (!BOT_RUNNER_PHASES.includes(bot.runnerPhase) || bot.runnerPhase !== runnerPhase) {
    throw new Error(`Bot ${botName} runs only in --phase ${bot.runnerPhase}`);
  }
  if (runnerPhase === 'implement' && !(Array.isArray(bot.allowedPaths) && bot.allowedPaths.length)) {
    throw new Error(`Bot ${botName} implements without an allowedPaths list`);
  }
  if (runnerPhase !== 'implement' && bot.sandbox !== 'read-only') {
    throw new Error(`Bot ${botName} must be read-only outside implement`);
  }
  return { name: botName, ...bot };
}

/** Isto kao `routeIsProtected` u `select-route.mjs`: staza bez kose crte vrijedi kao segment bilo gdje. */
function isUnderProtected(file, protectedPath) {
  const clean = String(protectedPath).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean) return false;
  if (file === clean || file.startsWith(`${clean}/`)) return true;
  return !clean.includes('/') && file.split('/').includes(clean);
}

/**
 * Datoteke koje bot nije smio dirati: izvan `allowedPaths` ili unutar `forbiddenPaths` ili
 * unutar `protectedPaths` configa. Zabrana ima prednost pred dopustenjem (npr. `src/repair/CLAUDE.md`
 * je `*.md`, ali je pod `src/**`). Bot bez `allowedPaths` (read-only) ne smije dirati nista.
 */
export function botPathViolations(bot, files, protectedPaths = []) {
  const allowed = Array.isArray(bot && bot.allowedPaths) ? bot.allowedPaths : [];
  const forbidden = Array.isArray(bot && bot.forbiddenPaths) ? bot.forbiddenPaths : [];
  const guarded = Array.isArray(protectedPaths) ? protectedPaths : [];
  return (Array.isArray(files) ? files : [])
    .map((f) => String(f).replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(
      (f) =>
        f &&
        (forbidden.some((p) => pathMatches(p, f)) ||
          guarded.some((p) => isUnderProtected(f, p)) ||
          !allowed.some((p) => pathMatches(p, f))),
    )
    .sort();
}

/**
 * Staze koje su se promijenile izmedju dvije snimke stabla (`{ staza: hash }`, `deleted` za obrisanu).
 * Runner snima stablo prije i poslije bota, pa vec prljave datoteke iz review faze nisu bot prekrsaj,
 * a dodatna izmjena vec prljave datoteke jest (hash se promijenio).
 */
export function changedPaths(before, after) {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]).sort();
}
