#!/usr/bin/env node
/**
 * SessionStart hook s matcherom `compact` (pravilo Stednja konteksta, odluka vlasnika 2026-10-17):
 * nakon compacta ubacuje datoteku stanja sesije u kontekst, da sesija nastavi iz STANJE.md, a ne
 * iz sazetka. Redoslijed trazenja:
 *   (a) varijabla okoline LEKTA_STANJE;
 *   (b) <tmp>/claude/<slug projekta>/<session_id>/scratchpad/STANJE.md, slug iz mape transkripta
 *       (~/.claude/projects/<slug>/<session_id>.jsonl) ili iz cwd kao sto ga pravi Claude Code;
 *   (c) <home>/lekta-wt/stanje/<session_id>.md.
 * Ispisuje JSON `hookSpecificOutput.additionalContext`: naslov STANJE SESIJE i najvise MAX_REDAKA
 * redaka datoteke, ili kratku uputu kad datoteke nema. Nikad ne baca, izlaz je uvijek 0, bez mreze
 * i bez pisanja datoteka.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './hook-input.mjs';

/** Gornja granica redaka datoteke stanja koji ulaze u kontekst. */
export const MAX_REDAKA = 40;

export const NASLOV = 'STANJE SESIJE';

export const UPUTA =
  `${NASLOV}: datoteka stanja nije nadjena. Prije sljedeceg koraka napisi scratchpad/STANJE.md ` +
  '(najvise 20 redaka: zadatak, worktree, head, sljedeci korak, otvoreni nalazi) i drzi je svjezom.';

/** Slug projekta kao u Claude Code: svaki znak osim slova i znamenke postaje `-`. */
export function projectSlug(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

/** session_id ulazi u putanju samo kao jedan siguran segment (bez `..` i separatora). */
function sigurnaSesija(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

/**
 * Kandidati za datoteku stanja, redom prioriteta, bez duplikata.
 * @param {Record<string, any> | null} input JSON ulaz hooka
 * @param {{ env?: Record<string, string | undefined>, tmpRoot?: string, home?: string }} [deps]
 * @returns {string[]}
 */
export function stanjeCandidates(input, deps = {}) {
  const env = deps.env ?? process.env;
  const tmpRoot = deps.tmpRoot ?? tmpdir();
  const home = deps.home ?? homedir();
  const out = [];
  if (env.LEKTA_STANJE) out.push(resolve(env.LEKTA_STANJE));
  const sesija = sigurnaSesija(input?.session_id);
  if (sesija) {
    const slugovi = [];
    if (typeof input?.transcript_path === 'string' && input.transcript_path) {
      slugovi.push(basename(dirname(input.transcript_path)));
    }
    if (typeof input?.cwd === 'string' && input.cwd) slugovi.push(projectSlug(input.cwd));
    for (const slug of slugovi) {
      if (slug && slug !== '.' && slug !== '..') out.push(join(tmpRoot, 'claude', slug, sesija, 'scratchpad', 'STANJE.md'));
    }
    out.push(join(home, 'lekta-wt', 'stanje', `${sesija}.md`));
  }
  return [...new Set(out)];
}

/** Prvi kandidat koji je neprazna datoteka; necitljiv kandidat se preskace. */
export function findStanje(candidates, read = (p) => readFileSync(p, 'utf8')) {
  for (const path of candidates) {
    try {
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      const text = read(path).replace(/\r/g, '');
      if (text.trim()) return { path, text };
    } catch {
      // necitljivo: sljedeci kandidat
    }
  }
  return null;
}

/** Tekst za kontekst: naslov i najvise MAX_REDAKA redaka datoteke stanja. */
export function formatStanje(found) {
  if (!found) return UPUTA;
  const redci = found.text.replace(/\n+$/, '').split('\n');
  const prikaz = redci.slice(0, MAX_REDAKA);
  const kraj = redci.length > prikaz.length ? [`(skraceno: ${prikaz.length} od ${redci.length} redaka)`] : [];
  return [`${NASLOV} (${found.path}):`, ...prikaz, ...kraj].join('\n');
}

export function hookOutput(input, deps = {}) {
  let context = UPUTA;
  try {
    context = formatStanje(findStanje(stanjeCandidates(input, deps), deps.read));
  } catch {
    context = UPUTA;
  }
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
}

async function main() {
  let input = null;
  try {
    input = await readHookInput('compact-stanje');
  } catch {
    input = null;
  }
  try {
    process.stdout.write(`${JSON.stringify(hookOutput(input))}\n`);
  } catch {
    // ispis nije uspio: sesija se nastavlja bez stanja
  }
  process.exitCode = 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 0;
  });
}
