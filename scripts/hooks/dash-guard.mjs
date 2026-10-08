/**
 * Claude Code PreToolUse hook (Edit|Write): pravilo "Ne koristi em ni en crtice u tekstu" iz CLAUDE.md
 * (Konvencije) do sada je bilo samo uputa. Ovaj hook ga cini deterministickim za NOVI tekst.
 *
 * Mjeri DELTU, ne stanje datoteke: odbija samo zapis koji UVODI nove crtice (U+2013, U+2014), tj. kad
 * novi tekst ima vise crtica od teksta koji zamjenjuje (Edit: `new_string` prema `old_string`;
 * Write: `content` prema postojecoj datoteci). Tako se postojece datoteke s crticama i dalje smiju
 * uredivati, a verbatim citati izvora ostaju netaknuti.
 *
 * Opseg: samo autorske putanje (`src/`, `scripts/`, `tests/`, `docs/`, `supabase/`, `.claude/` skillovi,
 * agenti i workflowi, `.github/` te `.md` u korijenu). Izvan opsega su `data/`, `discovery/`, `design/`,
 * `.claude/katedra-pkg/`, `tests/fixtures/` i `docs/generated/`: ondje crtice dolaze iz izvora ili
 * generatora. Kod koji mora prepoznati znak pise escape `\u2013` / `\u2014`.
 *
 * Izlaz: 0 = dopusteno, 2 = odbijeno (poruka na stderr ide modelu). FAIL-OPEN kao ostali hookovi:
 * vlastita greska hooka nikad ne blokira rad.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readHookInput } from './hook-input.mjs';

const CRTICE = /[\u2013\u2014]/g;

const U_OPSEGU = [/^src\//, /^scripts\//, /^tests\//, /^docs\//, /^supabase\//, /^\.github\//,
  /^\.claude\/(skills|agents|workflows|commands)\//, /^[^/]+\.md$/];
const IZVAN_OPSEGA = [/^tests\/fixtures\//, /^docs\/generated\//];

/** @param {string} tekst */
export function brojCrtica(tekst) {
  return typeof tekst === 'string' ? (tekst.match(CRTICE) ?? []).length : 0;
}

/** @param {string} rel putanja relativna na korijen repozitorija, s `/` */
export function uOpsegu(rel) {
  return U_OPSEGU.some((re) => re.test(rel)) && !IZVAN_OPSEGA.some((re) => re.test(rel));
}

/** Prvi redak novog teksta koji nosi crticu, skracen za poruku. */
function prviRedak(tekst) {
  const redak = tekst.split('\n').find((r) => /[\u2013\u2014]/.test(r)) ?? '';
  const t = redak.trim();
  return t.length > 100 ? t.slice(0, 100) + '...' : t;
}

/**
 * Cista presuda bez nuspojava.
 * @param {{ toolName: string, rel: string | null, toolInput: Record<string, any>, postojeci: string | null }} ulaz
 *   `rel` je null za datoteku izvan repozitorija; `postojeci` je sadrzaj datoteke prije Write (null ako ne postoji).
 * @returns {{ allow: boolean, reason: string }}
 */
export function judgeDashWrite({ toolName, rel, toolInput, postojeci }) {
  if (!rel || !uOpsegu(rel)) return { allow: true, reason: '' };
  let novo = '';
  let staro = 0;
  if (toolName === 'Write') {
    novo = String(toolInput?.content ?? '');
    staro = brojCrtica(postojeci ?? '');
  } else if (toolName === 'Edit') {
    novo = String(toolInput?.new_string ?? '');
    staro = brojCrtica(toolInput?.old_string ?? '');
  } else {
    return { allow: true, reason: '' };
  }
  if (brojCrtica(novo) <= staro) return { allow: true, reason: '' };
  return {
    allow: false,
    reason: rel + ' dobiva novu em ili en crticu (CLAUDE.md, Konvencije): "' + prviRedak(novo) + '". '
      + 'Zamijeni s "-", zarezom ili dvotockom; kod koji mora prepoznati znak koristi escape \\u2013 ili \\u2014.',
  };
}

function findRepoRoot(start) {
  let current = resolve(start || process.cwd());
  while (true) {
    if (existsSync(join(current, 'docs', 'agents', 'tasks.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function main() {
  const payload = await readHookInput('dash-guard');
  if (!payload) process.exit(0);
  let verdict;
  try {
    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath.trim()) process.exit(0);
    const cwd = payload?.cwd || process.cwd();
    const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
    const root = findRepoRoot(dirname(absolute));
    let rel = root ? relative(root, absolute).replace(/\\/g, '/') : null;
    if (rel && (rel.startsWith('../') || isAbsolute(rel))) rel = null;
    const postojeci = payload.tool_name === 'Write' && existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
    verdict = judgeDashWrite({ toolName: String(payload.tool_name ?? ''), rel, toolInput: payload.tool_input ?? {}, postojeci });
  } catch (err) {
    process.stderr.write('dash-guard: interna greska, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  if (!verdict.allow) {
    process.stderr.write('dash-guard: ' + verdict.reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/dash-guard.mjs');
if (isMain) main();
