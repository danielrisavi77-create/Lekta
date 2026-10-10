/**
 * Claude Code PreToolUse hook (Edit|Write): pravilo "Ne koristi em ni en crtice u tekstu" iz CLAUDE.md
 * (Konvencije) do sada je bilo samo uputa. Ovaj hook ga cini deterministickim za NOVI tekst.
 *
 * Mjeri DELTU, ne stanje datoteke: odbija samo zapis koji UVODI nove crtice (U+2013, U+2014) prema tekstu
 * koji zamjenjuje (Edit: `new_string` prema `old_string`; Write: `content` prema postojecoj datoteci).
 * Dva uvjeta, oba moraju vrijediti za propustanje: (1) ukupan broj crtica ne raste; (2) svaka crtica u
 * novom tekstu je USIDRENA, tj. ista crtica s barem jednom stranom konteksta (SIDRO znakova lijevo ili
 * desno) vec postoji u starom tekstu. Bez (2) bi zamjena jedne crtice drugom na novom mjestu zadrzala
 * zbroj i prosla (Codex nalaz na PR #326). Uz (2) i dalje prolazi izmjena kraj postojece crtice
 * (`str. 12\u201315` u `str. 12\u201316`), pa se datoteke s verbatim citatima izvora smiju uredivati.
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
/** Broj znakova konteksta s jedne strane crtice koji mora vec postojati u starom tekstu. */
const SIDRO = 3;

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

/**
 * Crtice novog teksta kojima ni lijevi ni desni kontekst (SIDRO znakova uz samu crticu) ne postoji u
 * starom tekstu. Prazan popis znaci da je svaka crtica zatecena, a ne nova.
 * @param {string} novo
 * @param {string} staro
 * @returns {number[]} indeksi neusidrenih crtica u `novo`
 */
export function neusidreneCrtice(novo, staro) {
  const rezultat = [];
  for (const m of novo.matchAll(CRTICE)) {
    const i = m.index ?? 0;
    const lijevo = novo.slice(Math.max(0, i - SIDRO), i + 1);
    const desno = novo.slice(i, i + 1 + SIDRO);
    if (!staro.includes(lijevo) && !staro.includes(desno)) rezultat.push(i);
  }
  return rezultat;
}

/** Redak novog teksta s prvom (neusidrenom) crticom, skracen za poruku. */
function prviRedak(tekst, odCrtice) {
  const pocetak = tekst.length - odCrtice.length;
  const redak = (tekst.slice(0, pocetak).split('\n').pop() ?? '') + (odCrtice.split('\n')[0] ?? '');
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
  let staro = '';
  if (toolName === 'Write') {
    novo = String(toolInput?.content ?? '');
    staro = String(postojeci ?? '');
  } else if (toolName === 'Edit') {
    novo = String(toolInput?.new_string ?? '');
    staro = String(toolInput?.old_string ?? '');
  } else {
    return { allow: true, reason: '' };
  }
  const neusidrene = neusidreneCrtice(novo, staro);
  if (brojCrtica(novo) <= brojCrtica(staro) && neusidrene.length === 0) return { allow: true, reason: '' };
  const primjer = novo.slice(neusidrene[0] ?? Math.max(0, novo.search(/[\u2013\u2014]/)));
  return {
    allow: false,
    reason: rel + ' dobiva novu em ili en crticu (CLAUDE.md, Konvencije): "' + prviRedak(novo, primjer) + '". '
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
