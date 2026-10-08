#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash): CPU disciplina (odluka vlasnika 2026-09-28).
 *
 * Tezak posao (vitest, tsc, playwright, vite-node, closed-loop, knip, jscpd i npm skripte
 * check/test/build/gate/release) smije se pokrenuti samo kroz `scripts/with-gate-lock.mjs`,
 * jer jedino tako prolazi kroz lock i pragove resursa iz `scripts/gate-preflight.mjs`. Do sada je
 * to bila uputa u ROUTING.md ("Pravila za stroj"); ovaj hook je cini deterministickom.
 *
 * Propusta:
 *   - podnaredbu koja sama poziva `with-gate-lock.mjs` (sve iza `--` je pod lockom);
 *   - npm skriptu cija definicija u package.json vec ide kroz `with-gate-lock` (npr. `npm run check`,
 *     `test:ux`, `release:check`): nju ne treba omotati drugi put;
 *   - sve kad je u okolini hooka `LEKTA_GATE_LOCK_TOKEN` (sesija je dijete zauzetog gatea) ili
 *     `GITHUB_ACTIONS` (CI mjeri sam, bez dijeljenog stroja).
 *
 * Prepoznavanje ide po POZICIJI NAREDBE, ne po podnizu: `grep vitest`, `cat tsconfig.json` ili
 * `git log --grep playwright` nisu tezak posao i prolaze.
 *
 * Izlaz: 0 = dopusteno, 2 = odbijeno (poruka na stderr ide modelu). FAIL-OPEN kao
 * `scripts/agents/tool-guard.mjs`: vlastita greska hooka nikad ne blokira rad.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHookInput } from './hook-input.mjs';

export const HEAVY_BINARIES = Object.freeze(['vitest', 'tsc', 'playwright', 'vite-node', 'knip', 'jscpd']);
const HEAVY_SCRIPT_RE = /^(check|test|build|gate|release)(:|$)/;
export const BLOCK_MESSAGE =
  'CPU disciplina: tezak posao ide kroz `node scripts/with-gate-lock.mjs <oznaka> -- <naredba>` (ROUTING.md)';

const WRAPPERS = new Set(['env', 'time', 'nice', 'cross-env', 'exec', 'command', 'sudo', 'nohup']);
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const RUNNERS = new Set(['npx', 'pnpx', 'bunx']);
const ENV_ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Programi koji tijelo heredoca citaju kao naredbe (`bash <<'EOF'`, `cat <<'EOF' | sh`): njihovo
 * tijelo se ocjenjuje i kad je delimiter pod navodnicima.
 */
const SHELL_FED = new Set(['bash', 'sh', 'dash', 'ash', 'zsh', 'ksh', 'fish', 'source', '.', 'eval', 'xargs']);

/**
 * Cita heredoc operator koji pocinje na `start` (prvi `<` od `<<`). Vraca delimiter, je li bio pod
 * navodnicima (tada se tijelo ne prosiruje), smije li zavrsni redak imati vodece tabove (`<<-`) i
 * indeks iza delimitera; null kad to nije heredoc (npr. `<<<` here-string).
 * @param {string} command
 * @param {number} start
 * @returns {{ delim: string, quoted: boolean, stripTabs: boolean, end: number } | null}
 */
function readHeredocOperator(command, start) {
  let i = start + 2;
  if (command[i] === '<') return null;
  const stripTabs = command[i] === '-';
  if (stripTabs) i += 1;
  while (command[i] === ' ' || command[i] === '\t') i += 1;
  let delim = '';
  let quoted = false;
  while (i < command.length && !/[\s;|&()<>]/.test(command[i])) {
    const ch = command[i];
    // `$'EOF'`, `$EOF`, backtick i `\` + novi red ljuska prosiruje ili spaja drukcije nego sto
    // ovdje citamo; krivo procitan delimiter progutao bi naredbe iza tijela (Grok pregled #328).
    if (ch === '$' || ch === '`' || (ch === '\\' && (command[i + 1] === '\n' || command[i + 1] === '\r' || i + 1 >= command.length))) return null;
    if (ch === '"' || ch === "'") {
      const close = command.indexOf(ch, i + 1);
      if (close < 0) return null;
      delim += command.slice(i + 1, close);
      quoted = true;
      i = close + 1;
    } else if (ch === '\\') {
      quoted = true;
      delim += command[i + 1] ?? '';
      i += 2;
    } else {
      delim += ch;
      i += 1;
    }
  }
  return delim ? { delim, quoted, stripTabs, end: i } : null;
}

/**
 * Rastavlja naredbu na podnaredbe po `&&`, `||`, `;`, `|`, `&`, novom retku, zagradama i `$(`,
 * postujuci jednostruke i dvostruke navodnike: sadrzaj pod navodnicima je argument, ne naredba.
 * Tijelo heredoca (`<<EOF` ... `EOF`) je stdin, ne naredba (T109): uz delimiter pod navodnicima
 * preskace se cijelo; bez navodnika je tekst dok u njemu nema `$(` ni backticka, a s njima se cijelo
 * tijelo rastavlja kao naredba. Tijelo koje hrani ljusku (`bash <<'EOF'`, `| sh`) uvijek je naredba.
 * `<<` iza `#` komentara nije heredoc.
 * @param {string} command
 * @returns {string[][]} podnaredbe kao nizovi tokena
 */
export function splitCommand(command) {
  const parts = [];
  let tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;
  /** @type {Array<{ delim: string, quoted: boolean, stripTabs: boolean }>} */
  let pending = [];
  let inComment = false;
  /** Indeks u `parts` gdje pocinje trenutni redak naredbe. */
  let lineStart = 0;
  const endToken = () => {
    if (hasToken) tokens.push(current);
    current = '';
    hasToken = false;
  };
  const endPart = () => {
    endToken();
    if (tokens.length) parts.push(tokens);
    tokens = [];
  };
  /** Preskace tijela heredoca koja pocinju iza novog retka na `nl`; vraca indeks zadnjeg procitanog znaka. */
  const skipHeredocBodies = (nl) => {
    let pos = nl + 1;
    const shellFed = parts.slice(lineStart).some((p) => p.some((t) => SHELL_FED.has(programName(t))));
    for (const h of pending) {
      const bodyStart = pos;
      let bodyEnd = command.length;
      let next = command.length;
      while (pos < command.length) {
        const eol = command.indexOf('\n', pos);
        const lineEnd = eol < 0 ? command.length : eol;
        let line = command.slice(pos, lineEnd).replace(/\r$/, '');
        if (h.stripTabs) line = line.replace(/^\t+/, '');
        if (line === h.delim) {
          bodyEnd = pos;
          next = eol < 0 ? command.length : eol + 1;
          break;
        }
        pos = eol < 0 ? command.length : eol + 1;
      }
      const body = command.slice(bodyStart, bodyEnd);
      if (shellFed || (!h.quoted && /\$\(|`/.test(body))) parts.push(...splitCommand(body));
      pos = next;
    }
    pending = [];
    lineStart = parts.length;
    return pos - 1;
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (ch === '\n') inComment = false;
    if (ch === '#' && !hasToken) inComment = true;
    if (!inComment && ch === '<' && command[i + 1] === '<') {
      const op = readHeredocOperator(command, i);
      if (op) {
        endToken();
        pending.push({ delim: op.delim, quoted: op.quoted, stripTabs: op.stripTabs });
        i = op.end - 1;
        continue;
      }
    }
    if (ch === '\n' && pending.length) {
      endPart();
      i = skipHeredocBodies(i);
      continue;
    }
    if (ch === '$' && command[i + 1] === '(') {
      endPart();
      i += 1;
      continue;
    }
    if (';|&()\n\r`'.includes(ch)) {
      endPart();
      if (ch === '\n') lineStart = parts.length;
      continue;
    }
    if (/\s/.test(ch)) {
      endToken();
      continue;
    }
    current += ch;
    hasToken = true;
  }
  endPart();
  return parts;
}

/** Ime programa bez putanje, verzije i Windows nastavka (`node_modules/.bin/vitest.cmd` -> `vitest`). */
function programName(token) {
  let name = String(token).replace(/\\/g, '/');
  name = name.slice(name.lastIndexOf('/') + 1);
  name = name.replace(/\.(cmd|exe|ps1|js|mjs|cjs|mts|ts)$/i, '');
  const at = name.lastIndexOf('@');
  if (at > 0) name = name.slice(0, at);
  return name.toLowerCase();
}

function firstNonFlag(tokens, from) {
  for (let i = from; i < tokens.length; i += 1) {
    if (!tokens[i].startsWith('-')) return i;
  }
  return -1;
}

/**
 * Ocjena jedne podnaredbe. `readScript(ime)` vraca definiciju npm skripte ili null.
 * @returns {{ heavy: boolean, what?: string }}
 */
function judgeTokens(tokens, readScript, heavyBinaries = HEAVY_BINARIES) {
  if (tokens.some((t) => programName(t) === 'with-gate-lock')) return { heavy: false };
  let i = 0;
  while (i < tokens.length && (ENV_ASSIGN_RE.test(tokens[i]) || WRAPPERS.has(programName(tokens[i])))) i += 1;
  if (i >= tokens.length) return { heavy: false };
  const exe = programName(tokens[i]);
  const rest = tokens.slice(i + 1);

  if (heavyBinaries.includes(exe)) return { heavy: true, what: exe };
  if (exe.includes('closed-loop')) return { heavy: true, what: exe };

  if (RUNNERS.has(exe)) {
    const k = firstNonFlag(rest, 0);
    if (k < 0) return { heavy: false };
    const target = programName(rest[k]);
    if (heavyBinaries.includes(target) || target.includes('closed-loop')) return { heavy: true, what: `${exe} ${target}` };
    return { heavy: false };
  }

  if (exe === 'node' || exe === 'deno' || exe === 'tsx') {
    const k = firstNonFlag(rest, 0);
    if (k < 0) return { heavy: false };
    const script = String(rest[k]).replace(/\\/g, '/');
    const target = programName(script);
    if (script.includes('closed-loop') || heavyBinaries.includes(target) || /node_modules\/(vitest|typescript|@playwright|playwright|vite-node|knip|jscpd)\//.test(script)) {
      return { heavy: true, what: `${exe} ${target}` };
    }
    return { heavy: false };
  }

  if (PACKAGE_MANAGERS.has(exe)) {
    const k = firstNonFlag(rest, 0);
    if (k < 0) return { heavy: false };
    const sub = rest[k];
    let script = null;
    if (sub === 'run' || sub === 'run-script') {
      const s = firstNonFlag(rest, k + 1);
      script = s < 0 ? null : rest[s];
    } else if (sub === 'test' || sub === 't') {
      script = 'test';
    } else if (sub === 'exec' || sub === 'dlx' || sub === 'x') {
      const s = firstNonFlag(rest, k + 1);
      if (s < 0) return { heavy: false };
      const target = programName(rest[s]);
      return heavyBinaries.includes(target) ? { heavy: true, what: `${exe} ${sub} ${target}` } : { heavy: false };
    } else if (exe !== 'npm') {
      // yarn check / pnpm build: skripta bez `run`.
      script = sub;
    }
    if (!script) return { heavy: false };
    if (!HEAVY_SCRIPT_RE.test(script) && !script.includes('closed-loop')) return { heavy: false };
    const definition = readScript(script);
    if (definition && definition.includes('with-gate-lock')) return { heavy: false };
    return { heavy: true, what: `${exe} run ${script}` };
  }

  return { heavy: false };
}

/**
 * @param {string} command
 * @param {{ env?: Record<string, string | undefined>, readScript?: (name: string) => string | null, heavyBinaries?: readonly string[] }} [ctx]
 * @returns {{ allow: boolean, reason: string }}
 */
export function judgeCpuDiscipline(command, ctx = {}) {
  const env = ctx.env ?? {};
  const readScript = ctx.readScript ?? (() => null);
  if (typeof command !== 'string' || !command.trim()) return { allow: true, reason: 'prazna naredba' };
  if (env.GITHUB_ACTIONS) return { allow: true, reason: 'CI (GITHUB_ACTIONS)' };
  if (env.LEKTA_GATE_LOCK_TOKEN) return { allow: true, reason: 'dijete zauzetog gatea (LEKTA_GATE_LOCK_TOKEN)' };
  for (const tokens of splitCommand(command)) {
    const verdict = judgeTokens(tokens, readScript, ctx.heavyBinaries ?? HEAVY_BINARIES);
    if (verdict.heavy) return { allow: false, reason: `${BLOCK_MESSAGE}. Prepoznato: ${verdict.what}.` };
  }
  return { allow: true, reason: 'nema teskog posla izvan locka' };
}

/** Cita definiciju npm skripte iz package.json u `cwd`; bilo koja greska znaci "nepoznato" (null). */
export function packageScriptReader(cwd) {
  let scripts = null;
  return (name) => {
    if (scripts === null) {
      try {
        scripts = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).scripts ?? {};
      } catch {
        scripts = {};
      }
    }
    return typeof scripts[name] === 'string' ? scripts[name] : null;
  };
}

async function main() {
  const payload = await readHookInput('cpu-discipline');
  if (!payload) process.exit(0);
  if (payload?.tool_name !== 'Bash') process.exit(0);
  let verdict;
  try {
    verdict = judgeCpuDiscipline(payload?.tool_input?.command, {
      env: process.env,
      readScript: packageScriptReader(typeof payload?.cwd === 'string' ? payload.cwd : process.cwd()),
    });
  } catch (err) {
    process.stderr.write(`cpu-discipline: interna greska, propustam (fail-open). ${String(err)}\n`);
    process.exit(0);
  }
  if (!verdict.allow) {
    process.stderr.write(`${verdict.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const isMain = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/hooks/cpu-discipline.mjs');
if (isMain) main();
