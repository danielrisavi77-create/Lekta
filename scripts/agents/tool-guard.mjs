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
 * Supabase MCP alati koji mijenjaju bazu, Edge funkcije ili projekt mimo dokumentiranog puta
 * (migracija kroz `supabase db push`, deploy s dokazom po supabase/CLAUDE.md, projekt i grane
 * samo vlasnik). Usporedba je po sufiksu imena, jer isti alat dolazi kao
 * `mcp__Supabase__deploy_edge_function` (claude.ai konektor) i
 * `mcp__claude_ai_Supabase__deploy_edge_function` (lokalni CLI).
 */
const SUPABASE_MCP_BLOCKED = Object.freeze([
  'apply_migration',
  'deploy_edge_function',
  'create_branch',
  'delete_branch',
  'merge_branch',
  'rebase_branch',
  'reset_branch',
  'create_project',
  'pause_project',
  'restore_project',
]);

/**
 * Kljucne rijeci i funkcije koje znace pisanje ili promjenu stanja. Trazi se cijela rijec nakon
 * uklanjanja komentara, string literala i navodnicima omedjenih identifikatora, pa `created_at` ili
 * 'delete' u tekstu ne okidaju. Lazno pozitivan ishod (npr. stupac imena `comment`) samo odbija
 * citanje, sto je prihvatljivo: gard je fail-closed za `execute_sql`. Funkcija s nuspojavom koju
 * ovaj popis ne zna (npr. vlastiti RPC) nije pokrivena; zato konektor treba i `read_only=true`.
 */
const SQL_WRITE_RE = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|comment|vacuum|reindex|cluster|copy|call|do|refresh|lock|reassign|import|security|set|reset|discard|notify|prepare|execute|set_config|setval|nextval|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|dblink\w*|lo_\w+)\b/i;

/**
 * Uklanja iz SQL-a sve sto nije kod: komentare, '...' literale (s '' unutra), $tag$...$tag$ tijela i
 * "..." identifikatore. Ostaje kostur nad kojim se traze kljucne rijeci.
 * @param {string} sql
 * @returns {string}
 */
export function stripSqlNonCode(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/'(?:[^']|'')*'/g, ' ')
    .replace(/"(?:[^"]|"")*"/g, ' ');
}

/**
 * Presuda za Supabase MCP alat. `null` znaci da alat nije Supabase MCP i odlucuje ostatak garda.
 * @param {string} toolNameLower
 * @param {Record<string, unknown> | undefined} toolInput
 * @returns {{allow: boolean, reason: string} | null}
 */
export function judgeSupabaseMcp(toolNameLower, toolInput) {
  if (!toolNameLower.startsWith('mcp__') || !toolNameLower.includes('supabase')) return null;
  const blocked = SUPABASE_MCP_BLOCKED.find((name) => toolNameLower.endsWith(`__${name}`));
  if (blocked) {
    return {
      allow: false,
      reason: `Supabase MCP ${blocked} nije dopusten agentu: migracije idu kroz supabase db push, deploy Edge funkcija s dokazom po supabase/CLAUDE.md, a projekt i grane mijenja samo vlasnik.`,
    };
  }
  if (toolNameLower.endsWith('__execute_sql')) {
    const query = toolInput && typeof toolInput.query === 'string' ? toolInput.query : '';
    if (query.trim().length === 0) {
      return { allow: false, reason: 'Supabase MCP execute_sql bez upita: nepoznato se odbija.' };
    }
    const hit = stripSqlNonCode(query).match(SQL_WRITE_RE);
    if (hit) {
      return {
        allow: false,
        reason: `Supabase MCP execute_sql smije samo citati; upit sadrzi "${hit[1]}". Promjena sheme ide kroz migraciju i supabase db push, promjena podataka kroz vlasnika.`,
      };
    }
  }
  return { allow: true, reason: 'Supabase MCP alat samo cita.' };
}

/**
 * Cista funkcija bez nuspojava: presuduje smije li se naredba izvrsiti. Ne poziva git/fs; prima
 * samo ime alata i tekst naredbe (za MCP alate poput apply_migration, `command` je izostavljen i
 * odluka se donosi po imenu alata, a za Supabase `execute_sql` po `toolInput.query`).
 *
 * @param {string} toolName - npr. "Bash", "PowerShell", ili ime MCP alata poput
 *   "mcp__claude_ai_Supabase__apply_migration".
 * @param {string | undefined} command - `tool_input.command` za Bash/PowerShell; nedefinirano za
 *   alate bez naredbe u ljusci.
 * @param {Record<string, unknown>} [toolInput] - cijeli `tool_input`; MCP alati nose argumente ovdje.
 * @returns {{allow: boolean, reason: string}}
 */
export function judgeCommand(toolName, command, toolInput) {
  const toolNameLower = (toolName ?? '').toLowerCase();
  if (toolNameLower.includes('apply_migration')) {
    return {
      allow: false,
      reason: 'MCP apply_migration nije dopusten. Migracije idu iskljucivo kroz supabase db push --linked.',
    };
  }
  const supabaseVerdict = judgeSupabaseMcp(toolNameLower, toolInput);
  if (supabaseVerdict) return supabaseVerdict;

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
    verdict = judgeCommand(toolName, command, payload?.tool_input);
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
