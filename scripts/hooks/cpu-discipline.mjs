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
 * Citaci kojima se tijelo heredoca smije preskociti: `cat` ga ispisuje, `git` ga uzima kao poruku
 * (`git commit -F -`), a `python`/`python3` kao Python kod (isti doseg kao `python3 -c "..."`, koji hook vec pusta).
 * Allowlist, ne denylist ljuski: treca runda Grok pregleda #328 pokazala je da svaki program izvan
 * popisa ljuski moze izvrsiti tijelo (`sed e`, `make -f -`, `read` pa `eval`, funkcija, alias, glob).
 */
const HEREDOC_READERS = new Set(['cat', 'git', 'python', 'python3']);
const HEREDOC_WORD_RE = /^[A-Za-z0-9_./:+-]+$/;
const PYTHON_READERS = new Set(['python', 'python3']);
const PYTHON_SAFE_MODULES = new Set([
  'json', 're', 'csv', 'string', 'textwrap', 'datetime', 'math',
  'collections', 'itertools', 'pathlib', 'html', 'unicodedata', 'argparse',
]);
const PYTHON_UNSAFE_RE = /__|\b(?:exec|eval|compile|getattr|setattr|delattr|globals|locals|vars|breakpoint)\b/;
const PYTHON_IMPORT_RE = /\bfrom\s+([^\s]+)\s+import\b|\bimport\s+([^;\r\n#]+)/g;
const UNSAFE_PYTHON_HEREDOC = '__LEKTA_UNSAFE_PYTHON_HEREDOC__';

/**
 * Provjerava sve module u Python import listi, uključujući import json, os.
 * Neparsabilan ili relativan uvoz odbija se; ovo je konzervativna CPU ograda, ne sandbox.
 */
function pythonImportsAreSafe(body) {
  const logical = body.replace(/\\\r?\n/g, ' ');
  for (const match of logical.matchAll(PYTHON_IMPORT_RE)) {
    if (match[1] !== undefined) {
      const module = match[1];
      if (module.startsWith('.') || !PYTHON_SAFE_MODULES.has(module.split('.')[0])) return false;
      continue;
    }
    for (const spec of match[2].split(',')) {
      const imported = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*$/.exec(spec);
      if (!imported || !PYTHON_SAFE_MODULES.has(imported[1].split('.')[0])) return false;
    }
  }
  return true;
}

function unsafePythonBody(body) {
  const normalized = body.normalize('NFKC');
  return PYTHON_UNSAFE_RE.test(normalized) || !pythonImportsAreSafe(normalized);
}

/** Prvi izvrsni Python program nakon varijabli i omotaca, istim pravilima kao judgeTokens. */
function pythonReaderInCommand(tokens) {
  let i = 0;
  while (i < tokens.length && (ENV_ASSIGN_RE.test(tokens[i]) || WRAPPERS.has(programName(tokens[i])))) i += 1;
  return PYTHON_READERS.has(programName(tokens[i] ?? ''));
}

/**
 * Preskače samo jednostavan citirani heredoc. Nesiguran Python dobiva sentinel i kada je naredba
 * složena, ima omotač, nalazi se kasnije u nizu ili koristi delimiter bez navodnika.
 * @param {string} command
 * @param {number} start indeks prvog '<' od '<<'
 * @param {string[]} commandTokens trenutačni tokeni naredbe prije heredoca
 * @returns {{ delim: string, stripTabs: boolean, end: number, unsafePython: boolean, skipBody: boolean } | null}
 */
function simpleQuotedHeredoc(command, start, commandTokens = []) {
  const lineStart = command.lastIndexOf('\n', start - 1) + 1;
  const nl = command.indexOf('\n', start);
  const lineEnd = nl < 0 ? command.length : nl;
  const line = command.slice(lineStart, lineEnd).replace(/\r$/, '');
  const m = /^([^<]*)<<(-?)[ \t]*(?:(['"])([A-Za-z_][A-Za-z0-9_]*)\3|([A-Za-z_][A-Za-z0-9_]*))[ \t]*$/.exec(line);
  if (!m || start - lineStart !== m[1].length) return null;
  const words = m[1].trim().split(/[ \t]+/).filter(Boolean);
  if (!words.length) return null;

  const pythonReader = pythonReaderInCommand(commandTokens);
  const delim = m[4] ?? m[5];
  const stripTabs = m[2] === '-';
  const unsafePython = pythonReader && unsafePythonBody(heredocBody(command, lineEnd, delim, stripTabs));
  const simplePrefix = lineStart === 0
    && words.every((w) => HEREDOC_WORD_RE.test(w) || (pythonReader && ENV_ASSIGN_RE.test(w)))
    && (HEREDOC_READERS.has(programName(words[0])) || pythonReader);
  const skipBody = Boolean(m[3]) && simplePrefix;

  // Even a complex or unquoted Python heredoc must not hide unsafe code from the CPU guard.
  if (unsafePython) return { delim, stripTabs, end: lineEnd, unsafePython: true, skipBody };
  if (!skipBody) return null;
  return { delim, stripTabs, end: lineEnd, unsafePython: false, skipBody: true };
}

/** Tijelo heredoca: retci iza `lineEnd` do retka koji je jednak delimiteru (ili do kraja naredbe). */
function heredocBody(command, lineEnd, delim, stripTabs) {
  const lines = [];
  let pos = lineEnd + 1;
  while (pos > 0 && pos <= command.length) {
    const eol = command.indexOf('\n', pos);
    const end = eol < 0 ? command.length : eol;
    let line = command.slice(pos, end).replace(/\r$/, '');
    if (stripTabs) line = line.replace(/^\t+/, '');
    if (line === delim) break;
    lines.push(line);
    pos = eol < 0 ? command.length + 1 : eol + 1;
  }
  return lines.join('\n');
}

/**
 * Rastavlja naredbu na podnaredbe po `&&`, `||`, `;`, `|`, `&`, novom retku, zagradama i `$(`,
 * postujuci jednostruke i dvostruke navodnike: sadrzaj pod navodnicima je argument, ne naredba.
 * Kao stdin preskače se samo jednostavan citirani heredoc. Nesiguran Python dobiva sentinel i kada je
 * naredba složena, ima omotač, nalazi se kasnije ili koristi delimiter bez navodnika.
 * @param {string} command
 * @returns {string[][]} podnaredbe kao nizovi tokena
 */
export function splitCommand(command) {
  const parts = [];
  let tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;
  /** @type {Array<{ delim: string, stripTabs: boolean }>} */
  let pending = [];
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
    for (const h of pending) {
      let next = command.length;
      while (pos < command.length) {
        const eol = command.indexOf('\n', pos);
        const lineEnd = eol < 0 ? command.length : eol;
        let line = command.slice(pos, lineEnd).replace(/\r$/, '');
        if (h.stripTabs) line = line.replace(/^\t+/, '');
        if (line === h.delim) {
          next = eol < 0 ? command.length : eol + 1;
          break;
        }
        pos = eol < 0 ? command.length : eol + 1;
      }
      pos = next;
    }
    pending = [];
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
    if (ch === '<' && command[i + 1] === '<') {
      const openerTokens = hasToken ? [...tokens, current] : tokens;
      const op = simpleQuotedHeredoc(command, i, openerTokens);
      if (op) {
        endToken();
        if (op.unsafePython) tokens.push(UNSAFE_PYTHON_HEREDOC);
        if (op.skipBody) {
          pending.push({ delim: op.delim, stripTabs: op.stripTabs });
          i = op.end - 1;
        }
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
  if (tokens.includes(UNSAFE_PYTHON_HEREDOC)) return { heavy: true, what: 'nesiguran Python heredoc' };
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
