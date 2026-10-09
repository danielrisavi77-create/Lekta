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
const PYTHON_SAFE_MODULES = 'json|re|csv|string|textwrap|datetime|math|collections|itertools|pathlib|html|unicodedata|argparse';
/**
 * T109 (cetvrta runda Grok pregleda #328): Python iz heredoca moze sam izvrsiti naredbu (`os.system`,
 * `subprocess`, `eval`, `__import__`, `breakpoint()`), pa se njegovo tijelo preskace samo kad nema
 * nista od toga: nikakvog dunder imena, izvrsavanja koda iz stringa, refleksije, `breakpoint` ni
 * uvoza izvan malog popisa cistih modula. Provjera je savjetodavna ograda od slucajnog teskog posla,
 * ne sandbox. Tijelo se prije provjere NFKC-normalizira jer Python tako normalizira identifikatore.
 */
const PYTHON_UNSAFE_RE = new RegExp(
  '__|\\b(?:exec|eval|compile|getattr|setattr|delattr|globals|locals|vars|breakpoint)\\b'
  + `|\\bimport\\s+(?!(?:${PYTHON_SAFE_MODULES})\\b)`
  + `|\\bfrom\\s+(?!(?:${PYTHON_SAFE_MODULES})\\b)`,
);

/**
 * T109: tijelo heredoca smije se preskociti kao stdin samo u jednom jednoznacnom obliku (fail-closed):
 * PRVI redak naredbe je `citac arg ... <<'IME'` (ili `<<"IME"`, `<<-'IME'`), operator je zadnji, a
 * svaka rijec ispred njega ima samo slova, znamenke i `_./:+-` (bez prosirenja, globa, `=`, `!`,
 * komentara i nastavka retka), a prva rijec je citac iz `HEREDOC_READERS`. Prvi redak
 * iskljucuje funkciju, alias ili `IFS` definiran ranije u istoj naredbi. U svakom drugom slucaju
 * vrijedi stari rastav po retku, pa se teska naredba u tijelu odbija kao prije T109.
 * @param {string} command
 * @param {number} start indeks prvog `<` od `<<`
 * @returns {{ delim: string, stripTabs: boolean, end: number } | null}
 */
function simpleQuotedHeredoc(command, start) {
  const lineStart = command.lastIndexOf('\n', start - 1) + 1;
  if (lineStart > 0) return null;
  const nl = command.indexOf('\n', start);
  const lineEnd = nl < 0 ? command.length : nl;
  const line = command.slice(lineStart, lineEnd).replace(/\r$/, '');
  const m = /^([^<]*)<<(-?)[ \t]*(['"])([A-Za-z_][A-Za-z0-9_]*)\3[ \t]*$/.exec(line);
  if (!m || start - lineStart !== m[1].length) return null;
  const words = m[1].trim().split(/[ \t]+/).filter(Boolean);
  if (!words.length || !words.every((w) => HEREDOC_WORD_RE.test(w))) return null;
  if (!HEREDOC_READERS.has(words[0])) return null;
  if (PYTHON_READERS.has(words[0]) && PYTHON_UNSAFE_RE.test(heredocBody(command, lineEnd, m[4], m[2] === '-').normalize('NFKC'))) return null;
  return { delim: m[4], stripTabs: m[2] === '-', end: lineEnd };
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
 * Tijelo heredoca je stdin, ne naredba, ali samo u obliku koji prepoznaje `simpleQuotedHeredoc`
 * (T109); svaki drugi heredoc se rastavlja po retku kao i ostatak naredbe.
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
      const op = simpleQuotedHeredoc(command, i);
      if (op) {
        endToken();
        pending.push({ delim: op.delim, stripTabs: op.stripTabs });
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
