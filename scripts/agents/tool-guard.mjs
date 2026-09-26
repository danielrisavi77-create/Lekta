#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook koji deterministicki odbija opasne naredbe, umjesto da se oslanja
 * na uputu u promptu (koja ne drzi 100% i kosta tokene svaki put kad se ponovi).
 *
 * Ugovor hooka (Claude Code hooks, PreToolUse): hook dobiva na stdinu JSON s barem poljima
 * `session_id`, `cwd`, `hook_event_name` (ovdje "PreToolUse"), `tool_name` i `tool_input`. Za
 * Bash alat `tool_input.command` nosi ljusku naredbu; za PowerShell alat isto polje `command`
 * nosi PowerShell naredbu (vidi `.claude/settings.json` matcher nize). Ova skripta ne pretpostavlja
 * nijedno drugo polje koje nije provjereno u ovom repozitoriju ili u `~/.claude` konfiguraciji.
 *
 * Odluka se vraca kroz exit kod: 0 = dopusteno (alat se izvrsava), 2 = blokirano (Claude Code
 * poruku sa stderr-a vraca modelu kao razlog odbijanja). Bilo koji drugi exit kod PreToolUse hook
 * ne tretira kao blokadu, pa se koriste iskljucivo 0 i 2.
 *
 * FAIL-OPEN: ako stdin nije valjan JSON ili nedostaju ocekivana polja, hook ispisuje napomenu na
 * stderr i zavrsava s exit 0. Hook nikad ne smije blokirati rad zbog vlastite greske; to bi bilo
 * gore od uputa u promptu koje barem ne rusi alat.
 */

/**
 * Poznati resursi koje gard smije zasticivati. Putanje su Windows stil (repo zivi na Windowsu),
 * usporedba je case-insensitive jer je NTFS neosjetljiv na velicinu slova.
 */
const REPO_ROOT = 'C:\\Users\\PC\\Desktop\\Lekta';
// %TEMP% se u stvarnim naredbama vec razrjesava (npr. C:\Users\PC\AppData\Local\Temp\...), pa se
// prepoznaje po fiksnom repnom dijelu putanje, ne po doslovnoj varijabli.
const WORKTREE_TEMP_MARKER = '\\claude\\lekta-wf';
const CLAUDE_WORKTREES_MARKER = '.claude/worktrees';
const MAIN_NODE_MODULES = `${REPO_ROOT}\\node_modules`;
const SUPABASE_PROD_REF = 'zrrjttizjyfcxmcpgzml';

/**
 * Rastavlja naredbu na podnaredbe po ljuskinim operatorima ulancavanja (`&&`, `||`, `;`, novi
 * redak). Namjerno NE dijeli po `|` (cijev), jer bi to razdvojilo `git log | grep master` na
 * bezopasne dijelove i moglo prikriti opasnu naredbu na desnoj strani cijevi koja ovisi o lijevoj;
 * u praksi to ovom gardu ne smeta jer svaka opasna naredba koju lovimo ima smisla i sama za sebe.
 * @param {string} command
 * @returns {string[]}
 */
function splitChainedCommands(command) {
  return command
    .split(/(?:&&|\|\||;|\r?\n)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Jednostavan tokenizator koji postuje jednostruke i dvostruke navodnike. Dovoljan za prepoznavanje
 * git/rm/Remove-Item potpisa; ne pretendira da je puni shell parser.
 * @param {string} command
 * @returns {string[]}
 */
function tokenize(command) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

/**
 * @param {string[]} tokens
 * @param {string} flag
 * @returns {boolean}
 */
function hasFlag(tokens, flag) {
  return tokens.some((t) => t.toLowerCase() === flag.toLowerCase());
}

/**
 * @param {string[]} tokens
 * @param {string} prefix
 * @returns {boolean}
 */
function hasFlagPrefixed(tokens, prefix) {
  return tokens.some((t) => t.toLowerCase().startsWith(prefix.toLowerCase()));
}

/**
 * Provjerava odgovara li put jednom od dopustenih korijena (repo, worktree temp mapa, .claude
 * worktrees), ali IZRICITO iskljucuje node_modules glavnog stabla, koji je zajednicki resurs i ne
 * smije se brisati rekurzivno cak ni iznutra dopustenog korijena.
 * @param {string} rawPath
 * @returns {boolean}
 */
function isPathInsideAllowedRoots(rawPath) {
  const normalized = rawPath.replace(/\//g, '\\');
  const lower = normalized.toLowerCase();

  if (lower.includes(MAIN_NODE_MODULES.toLowerCase())) {
    return false;
  }

  const allowedRoots = [REPO_ROOT, WORKTREE_TEMP_MARKER, CLAUDE_WORKTREES_MARKER];
  return allowedRoots.some((root) => lower.includes(root.toLowerCase().replace(/\//g, '\\')));
}

/**
 * Ispituje jednu podnaredbu (vec rastavljenu od `&&`/`;`/...) i vraca presudu ako prepozna opasan
 * obrazac, ili `null` ako podnaredba nije predmet ovog garda.
 * @param {string[]} tokens
 * @returns {{allow: boolean, reason: string} | null}
 */
function judgeSingleCommand(tokens) {
  if (tokens.length === 0) return null;
  const head = tokens[0].toLowerCase();

  if (head === 'git') {
    const sub = (tokens[1] ?? '').toLowerCase();
    const args = tokens.slice(2);

    if (sub === 'add') {
      if (
        hasFlag(args, '-A') ||
        hasFlag(args, '--all') ||
        args.some((a) => a === '.')
      ) {
        return {
          allow: false,
          reason:
            'git add -A / git add . / git add --all nije dopusten. Koristi git add <tocne putanje> i commitaj s git commit --only <putanje>.',
        };
      }
      return null;
    }

    if (sub === 'commit') {
      if (hasFlag(args, '--amend')) {
        return {
          allow: false,
          reason: 'git commit --amend nije dopusten u ovom tijeku rada. Napravi novi commit.',
        };
      }
      const hasAllFlag = hasFlag(args, '-a') || hasFlag(args, '--all');
      const hasOnly = hasFlag(args, '--only');
      if (hasAllFlag && !hasOnly) {
        return {
          allow: false,
          reason:
            'git commit s -a/--all bez --only nije dopusten (uzima cijeli indeks). Koristi git commit --only <putanje>.',
        };
      }
      return null;
    }

    if (sub === 'push') {
      const joinedLower = args.join(' ').toLowerCase();
      const targetsMaster =
        args.some((a) => a.toLowerCase() === 'master') ||
        args.some((a) => a.toLowerCase().endsWith(':master')) ||
        /\bhead:master\b/.test(joinedLower);
      if (targetsMaster) {
        return {
          allow: false,
          reason: 'git push izravno na master nije dopusten. Otvori PR s grane u worktreeu.',
        };
      }

      const hasForce = hasFlag(args, '--force') || hasFlag(args, '-f');
      const hasForceWithLease = hasFlagPrefixed(args, '--force-with-lease');
      if (hasForce && !hasForceWithLease) {
        return {
          allow: false,
          reason:
            'git push --force/-f bez --force-with-lease nije dopusten (moze tiho pregaziti tudji rad). Koristi --force-with-lease.',
        };
      }
      return null;
    }

    if (sub === 'reset' && hasFlag(args, '--hard')) {
      return {
        allow: true,
        reason:
          'UPOZORENJE: git reset --hard moze obrisati necommitani rad, osobito na tudjoj grani. Provjeri granu i git status prije nastavka.',
      };
    }

    if (sub === 'rebase' && (hasFlag(args, '-i') || hasFlag(args, '--interactive'))) {
      return {
        allow: false,
        reason: 'git rebase -i nije dopusten (interaktivno, nepodrzano u ovom okruzenju).',
      };
    }

    return null;
  }

  if (head === 'supabase' && (tokens[1] ?? '').toLowerCase() === 'db' && (tokens[2] ?? '').toLowerCase() === 'push') {
    const args = tokens.slice(3);
    const hasLinked = hasFlag(args, '--linked');
    const projectRefIdx = args.findIndex((a) => a.toLowerCase() === '--project-ref');
    const inlineProjectRef = args.find((a) => a.toLowerCase().startsWith('--project-ref='));
    const projectRefValue =
      (projectRefIdx >= 0 ? args[projectRefIdx + 1] : undefined) ??
      (inlineProjectRef ? inlineProjectRef.split('=')[1] : undefined);

    if (!hasLinked) {
      return {
        allow: false,
        reason: 'supabase db push bez --linked nije dopusten. Migracije idu iskljucivo kroz supabase db push --linked.',
      };
    }
    if (projectRefValue && projectRefValue.toLowerCase() === SUPABASE_PROD_REF.toLowerCase()) {
      return {
        allow: false,
        reason: `supabase db push s --project-ref produkcije (${SUPABASE_PROD_REF}) nije dopusten iz ovog tijeka.`,
      };
    }
    return null;
  }

  if (head === 'rm') {
    const args = tokens.slice(1);
    const isRecursiveForce =
      hasFlag(args, '-rf') ||
      hasFlag(args, '-fr') ||
      (hasFlag(args, '-r') && hasFlag(args, '-f')) ||
      (hasFlag(args, '-R') && hasFlag(args, '-f')) ||
      hasFlagPrefixed(args, '-r');
    if (!isRecursiveForce) return null;

    const paths = args.filter((a) => !a.startsWith('-'));
    const outsideAllowed = paths.filter((p) => !isPathInsideAllowedRoots(p));
    if (outsideAllowed.length > 0) {
      return {
        allow: false,
        reason: `rm -rf izvan repoa/worktreeova ili nad node_modules glavnog stabla nije dopusten: ${outsideAllowed.join(', ')}.`,
      };
    }
    return null;
  }

  if (head === 'remove-item' || head === 'ri') {
    const args = tokens.slice(1);
    const isRecursive = hasFlag(args, '-Recurse') || hasFlag(args, '-r');
    if (!isRecursive) return null;

    const paths = args.filter((a) => !a.startsWith('-'));
    const outsideAllowed = paths.filter((p) => !isPathInsideAllowedRoots(p));
    if (outsideAllowed.length > 0) {
      return {
        allow: false,
        reason: `Remove-Item -Recurse izvan repoa/worktreeova ili nad node_modules glavnog stabla nije dopusten: ${outsideAllowed.join(', ')}.`,
      };
    }
    return null;
  }

  return null;
}

/**
 * Cista funkcija bez nuspojava: presuduje smije li se naredba izvrsiti. Ne poziva git/fs; prima
 * samo ime alata i tekst naredbe (za MCP alate poput apply_migration, `command` je izostavljen i
 * odluka se donosi po imenu alata).
 *
 * @param {string} toolName - npr. "Bash", "PowerShell", ili ime MCP alata poput
 *   "mcp__claude_ai_Supabase__apply_migration".
 * @param {string | undefined} command - `tool_input.command` za Bash/PowerShell; nedefinirano za
 *   alate bez naredbe u ljusci.
 * @returns {{allow: boolean, reason: string}}
 */
export function judgeCommand(toolName, command) {
  const toolNameLower = (toolName ?? '').toLowerCase();
  if (toolNameLower.includes('apply_migration')) {
    return {
      allow: false,
      reason: 'MCP apply_migration nije dopusten. Migracije idu iskljucivo kroz supabase db push --linked.',
    };
  }

  if (typeof command !== 'string' || command.trim().length === 0) {
    return { allow: true, reason: 'Nema naredbe za provjeru, propusteno.' };
  }

  const subcommands = splitChainedCommands(command);
  let warning = null;
  for (const sub of subcommands) {
    const tokens = tokenize(sub);
    const verdict = judgeSingleCommand(tokens);
    if (verdict === null) continue;
    if (!verdict.allow) return verdict;
    warning = verdict;
  }

  return warning ?? { allow: true, reason: 'Naredba ne odgovara nijednom zabranjenom obrascu.' };
}

/**
 * Cita cijeli stdin kao tekst.
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch (err) {
    process.stderr.write(`tool-guard: ne mogu procitati stdin, propustam (fail-open). ${String(err)}\n`);
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`tool-guard: stdin nije valjan JSON, propustam (fail-open). ${String(err)}\n`);
    process.exit(0);
  }

  const toolName = payload?.tool_name;
  const command = payload?.tool_input?.command;

  let verdict;
  try {
    verdict = judgeCommand(toolName, command);
  } catch (err) {
    process.stderr.write(`tool-guard: interna greska u judgeCommand, propustam (fail-open). ${String(err)}\n`);
    process.exit(0);
  }

  if (!verdict.allow) {
    process.stderr.write(`tool-guard: ${verdict.reason}\n`);
    process.exit(2);
  }

  if (verdict.reason && verdict.reason.startsWith('UPOZORENJE')) {
    process.stderr.write(`tool-guard: ${verdict.reason}\n`);
  }
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/agents/tool-guard.mjs');
if (isMain) {
  main();
}
