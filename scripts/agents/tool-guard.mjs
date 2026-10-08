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

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

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
 * Dovrsenja koja, kao i goli `git commit`, commitaju CIJELI indeks.
 * Preneseno iz `~/.claude/hooks/lekta-git-guard.mjs` (2026-10-08), da pravilo vrijedi i u cloud
 * sesijama i na svakoj radnoj stanici, ne samo na stroju gdje je ta datoteka bila ozicena.
 */
const NASTAVCI_SPAJANJA = new Set(['merge', 'rebase', 'cherry-pick', 'revert']);

/**
 * Cinjenicno stanje stabla u kojem bi git radio: `{ izoliran, spajanje }`, ili `null` kad se ne
 * moze utvrditi. Povezani worktree ima `--git-dir` razlicit od `--git-common-dir`; u glavnom stablu
 * su isti. Spajanje se cita iz sekvencerskih tragova, istog izvora iz kojeg ga cita i sam git.
 * @param {string} dir
 * @returns {{izoliran: boolean, spajanje: boolean} | null}
 */
export function stanjeStabla(dir) {
  if (!dir || !existsSync(dir)) return null;
  const r = spawnSync('git', ['rev-parse', '--git-dir', '--git-common-dir'], {
    cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 5000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  const [gitDir, commonDir] = r.stdout.trim().split(/\r?\n/).map((x) => x.trim());
  if (!gitDir || !commonDir) return null;
  const g = resolve(dir, gitDir);
  const c = resolve(dir, commonDir);
  const spajanje = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']
    .some((trag) => existsSync(join(g, trag)));
  return { izoliran: g !== c, spajanje };
}

/**
 * Presuda za naredbu koja commita CIJELI indeks (goli `git commit` ili `<x> --continue`).
 *
 * Prava podjela nije commit vs merge, nego DIJELJENO vs IZOLIRANO stablo: u dijeljenom stablu
 * cijeli indeks povuce tudje stagirane datoteke (2026-08-31: 21 tudja datoteka pod krivom porukom).
 * Tijekom spajanja git odbija `--only` ("cannot do a partial commit during a merge"), pa je jedini
 * valjan put dovrsiti spajanje u vlastitom worktreeju. Cloud sesija (`CLAUDE_CODE_REMOTE=true`) je
 * vlastiti klon s jednim piscem, pa vrijedi kao izolirana.
 *
 * FAIL-CLOSED samo ovdje: kad se stanje ne moze utvrditi, odbija i to kaze, jer bi bez spajanja
 * naredba ionako bila odbijena. Vlastita greska hooka i dalje propusta (vidi `main`).
 * @param {{dir: string, ispitaj: (dir: string) => ({izoliran: boolean, spajanje: boolean} | null), udaljeno: boolean}} okolina
 * @param {boolean} nastavak - `<merge|rebase|cherry-pick|revert> --continue`
 * @returns {{allow: boolean, reason: string} | null}
 */
function judgeWholeIndexCommit(okolina, nastavak) {
  const stanje = okolina.ispitaj(okolina.dir);
  if (!stanje) {
    return {
      allow: false,
      reason:
        'Nije se moglo utvrditi radi li se u vlastitom worktreeju, pa gard odbija umjesto da pogadja. Pokreni naredbu iz direktorija repozitorija (ili s vodecim `cd <put> &&`).',
    };
  }
  const izoliran = stanje.izoliran || okolina.udaljeno;
  if (nastavak) {
    if (izoliran) return null;
    return {
      allow: false,
      reason:
        'Dovrsenje spajanja commita CIJELI indeks, pa u DIJELJENOM stablu povuce tudje stagirane datoteke pod tvoj merge. Spajanje radi u vlastitom `git worktree`.',
    };
  }
  if (stanje.spajanje) {
    if (izoliran) return null;
    return {
      allow: false,
      reason:
        '`git commit` bez `--only` commita CIJELI indeks. Tijekom spajanja `--only` nije moguc (git: "cannot do a partial commit during a merge"), pa se spajanje radi u vlastitom `git worktree`, a ne u dijeljenom stablu.',
    };
  }
  return {
    allow: false,
    reason:
      '`git commit` bez `--only` commita CIJELI indeks, ne samo tvoje putanje. Koristi `git commit --only <putanje>`.',
  };
}

/**
 * Ispituje jednu podnaredbu (vec rastavljenu od `&&`/`;`/...) i vraca presudu ako prepozna opasan
 * obrazac, ili `null` ako podnaredba nije predmet ovog garda.
 * @param {string[]} tokens
 * @param {{dir: string, ispitaj: (dir: string) => ({izoliran: boolean, spajanje: boolean} | null), udaljeno: boolean}} okolina
 * @returns {{allow: boolean, reason: string} | null}
 */
function judgeSingleCommand(tokens, okolina) {
  if (tokens.length === 0) return null;
  const head = tokens[0].toLowerCase();

  if (head === 'git') {
    const sub = (tokens[1] ?? '').toLowerCase();
    const args = tokens.slice(2);

    if (sub === 'add') {
      if (
        hasFlag(args, '-A') ||
        hasFlag(args, '--all') ||
        hasFlag(args, '-u') ||
        hasFlag(args, '--update') ||
        args.some((a) => a === '.')
      ) {
        return {
          allow: false,
          reason:
            'git add -A / git add . / git add --all / git add -u nije dopusten (stagira i tudji necommitani rad). Koristi git add <tocne putanje> i commitaj s git commit --only <putanje>.',
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
      if (!hasOnly) return judgeWholeIndexCommit(okolina, false);
      return null;
    }

    if (NASTAVCI_SPAJANJA.has(sub) && hasFlag(args, '--continue')) {
      return judgeWholeIndexCommit(okolina, true);
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
 * Supabase MCP alati koji samo citaju. Sve ostalo se odbija (fail-closed): nepoznat ili nov alat
 * (npr. `create_edge_function_secret`) ne smije proci samo zato sto ga popis zabrana ne zna.
 * Usporedba je po zadnjem dijelu imena, jer isti alat dolazi kao `mcp__Supabase__list_tables`
 * (claude.ai konektor) i `mcp__claude_ai_Supabase__list_tables` (lokalni CLI). `execute_sql` ima
 * zasebnu presudu nize.
 */
const SUPABASE_MCP_READ_TOOLS = Object.freeze(new Set([
  'list_tables',
  'list_extensions',
  'list_migrations',
  'list_edge_functions',
  'get_edge_function',
  'list_branches',
  'list_projects',
  'get_project',
  'list_organizations',
  'get_organization',
  'get_logs',
  'query_logs',
  'get_advisors',
  'get_project_url',
  'get_anon_key',
  'get_publishable_keys',
  'generate_typescript_types',
  'search_docs',
  'list_storage_buckets',
  'get_storage_config',
]));

/**
 * Rijeci koje znace pisanje, zakljucavanje ili izvrsavanje. Trazi se cijela rijec u kodu nakon
 * `stripSqlNonCode`, pa `created_at` ili 'delete' u literalu ne okidaju. Lazno pozitivan ishod (npr.
 * stupac imena `comment`) samo odbija citanje.
 */
const SQL_WRITE_RE = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|comment|vacuum|reindex|cluster|copy|call|do|refresh|lock|share|into|analyze|analyse|reassign|import|security|set|reset|discard|notify|listen|prepare|execute|begin|commit|rollback|savepoint|checkpoint|load)\b/i;

/**
 * Pozivi oblika `ime(` dopusteni u upitu koji samo cita: SQL kljucne rijeci koje stoje ispred
 * zagrade i mali skup cistih funkcija. Svaki drugi poziv se odbija, jer funkcija moze imati
 * nuspojavu (`pg_notify`, `pg_advisory_lock`, `set_config`, vlastiti RPC). Ime u navodnicima
 * postaje `qid` i nije na popisu.
 */
const SQL_SAFE_CALLS = Object.freeze(new Set([
  'select', 'from', 'join', 'in', 'exists', 'any', 'all', 'some', 'as', 'on', 'where', 'and', 'or',
  'not', 'when', 'then', 'else', 'case', 'by', 'over', 'filter', 'within', 'values', 'array', 'row',
  'using', 'lateral', 'between', 'is', 'distinct', 'union', 'intersect', 'except', 'with', 'having',
  'limit', 'offset', 'cast', 'extract', 'coalesce', 'nullif', 'greatest', 'least',
  'count', 'sum', 'avg', 'min', 'max', 'bool_and', 'bool_or', 'array_agg', 'string_agg', 'json_agg',
  'jsonb_agg', 'lower', 'upper', 'length', 'char_length', 'trim', 'substring', 'replace', 'round',
  'abs', 'floor', 'ceil', 'now', 'date_trunc', 'date_part', 'to_char', 'to_date', 'age',
  'jsonb_array_length', 'jsonb_typeof', 'jsonb_build_object', 'json_build_object', 'row_number',
  'rank', 'dense_rank', 'lag', 'lead', 'pg_size_pretty', 'pg_total_relation_size', 'pg_relation_size',
]));

/** Prva rijec naredbe koja samo cita. `EXPLAIN ANALYZE` izvrsava upit pa ga odbija SQL_WRITE_RE. */
const SQL_READ_START_RE = /^(select|with|show|explain)\b/;

/**
 * Jedan prolaz slijeva nadesno, kao PostgreSQL leksik: komentari (`--`, ugnijezdeni slash-zvjezdica),
 * `$tag$...$tag$`, `E'...'` s backslash escapeom, `'...'` s `''` i `"..."` identifikatori. Literali i
 * komentari postaju razmak, identifikator u navodnicima `qid`. Redoslijed je bitan: odvojeni
 * regexi (prvo komentari, pa literali) sakriju naredbu iza `'--'` ili `E'\''`.
 * @param {string} sql
 * @returns {{code: string, unterminated: boolean}}
 */
export function stripSqlNonCode(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) return { code: out, unterminated: false };
      out += ' ';
      i = end + 1;
      continue;
    }
    if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth += 1; i += 2; continue; }
        if (sql[i] === '*' && sql[i + 1] === '/') { depth -= 1; i += 2; continue; }
        i += 1;
      }
      if (depth > 0) return { code: out, unterminated: true };
      out += ' ';
      continue;
    }
    if (c === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        if (close === -1) return { code: out, unterminated: true };
        out += ' ';
        i = close + tag[0].length;
        continue;
      }
    }
    const prev = i > 0 ? sql[i - 1] : '';
    const eString = (c === 'e' || c === 'E') && next === "'" && !/[A-Za-z0-9_$]/.test(prev);
    if (eString || c === "'") {
      i += eString ? 2 : 1;
      let closed = false;
      while (i < n) {
        if (eString && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) return { code: out, unterminated: true };
      out += ' ';
      continue;
    }
    if (c === '"') {
      i += 1;
      let closed = false;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) return { code: out, unterminated: true };
      out += ' qid ';
      continue;
    }
    out += c;
    i += 1;
  }
  return { code: out, unterminated: false };
}

/**
 * Razlog zbog kojeg `execute_sql` upit nije siguran za citanje, ili `null` kad jest. Ovo je druga
 * razina; jamstvo daje tek konektor s `read_only=true` (izvrsavanje pod korisnikom baze koji samo cita).
 * @param {string} query
 * @returns {string | null}
 */
export function sqlReadOnlyProblem(query) {
  const { code, unterminated } = stripSqlNonCode(query);
  if (unterminated) return 'nezatvoren literal, komentar ili identifikator';
  const body = code.trim().replace(/;\s*$/, '').toLowerCase();
  if (body.length === 0) return 'prazan upit';
  if (body.includes(';')) return 'vise naredbi';
  if (!SQL_READ_START_RE.test(body)) return 'naredba ne pocinje sa SELECT, WITH, SHOW ili EXPLAIN';
  const write = body.match(SQL_WRITE_RE);
  if (write) return `sadrzi "${write[1]}"`;
  for (const call of body.matchAll(/([a-z_][a-z0-9_$]*)\s*\(/g)) {
    if (!SQL_SAFE_CALLS.has(call[1])) return `poziva funkciju "${call[1]}"`;
  }
  return null;
}

/**
 * Presuda za Supabase MCP alat. `null` znaci da alat nije Supabase MCP i odlucuje ostatak garda.
 * @param {string} toolNameLower
 * @param {Record<string, unknown> | undefined} toolInput
 * @returns {{allow: boolean, reason: string} | null}
 */
export function judgeSupabaseMcp(toolNameLower, toolInput) {
  if (!toolNameLower.startsWith('mcp__') || !toolNameLower.includes('supabase')) return null;
  const name = toolNameLower.split('__').pop() ?? '';
  if (name === 'execute_sql') {
    const query = toolInput && typeof toolInput.query === 'string' ? toolInput.query : '';
    const problem = sqlReadOnlyProblem(query);
    if (problem) {
      return {
        allow: false,
        reason: `Supabase MCP execute_sql dopusta samo jednu naredbu koja cita (SELECT, WITH, SHOW, EXPLAIN bez ANALYZE) uz poznate ciste funkcije; upit: ${problem}. Promjena sheme ide kroz migraciju i supabase db push, promjena podataka kroz vlasnika. Puno jamstvo daje konektor s read_only=true.`,
      };
    }
    return { allow: true, reason: 'Supabase MCP execute_sql: upit oblikom samo cita.' };
  }
  if (SUPABASE_MCP_READ_TOOLS.has(name)) return { allow: true, reason: 'Supabase MCP alat samo cita.' };
  return {
    allow: false,
    reason: `Supabase MCP ${name} nije na popisu alata koji samo citaju, pa se odbija. Migracije idu kroz supabase db push, deploy Edge funkcija s dokazom po supabase/CLAUDE.md, a tajne, projekt i grane mijenja samo vlasnik.`,
  };
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
 * @param {{cwd?: string, ispitaj?: (dir: string) => ({izoliran: boolean, spajanje: boolean} | null), udaljeno?: boolean}} [okolina] -
 *   stanje stabla za naredbe koje commitaju cijeli indeks. Bez `ispitaj` stanje je nepoznato, pa
 *   presuda ostaje cista (bez gita) i za takve naredbe odbija; `main` predaje stvarni `stanjeStabla`.
 * @returns {{allow: boolean, reason: string}}
 */
export function judgeCommand(toolName, command, toolInput, okolina = {}) {
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
  const stanje = {
    dir: okolina.cwd || process.cwd(),
    ispitaj: okolina.ispitaj ?? (() => null),
    udaljeno: okolina.udaljeno === true,
  };
  let warning = null;
  for (const sub of subcommands) {
    const tokens = tokenize(sub);
    // `cd <put>` u lancu mijenja gdje sljedeci git stvarno radi.
    if ((tokens[0] ?? '').toLowerCase() === 'cd' && tokens[1]) {
      stanje.dir = isAbsolute(tokens[1]) ? tokens[1] : resolve(stanje.dir, tokens[1]);
      continue;
    }
    const verdict = judgeSingleCommand(tokens, stanje);
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
    verdict = judgeCommand(toolName, command, payload?.tool_input, {
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : undefined,
      ispitaj: stanjeStabla,
      udaljeno: process.env.CLAUDE_CODE_REMOTE === 'true',
    });
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
