#!/usr/bin/env node
/**
 * Petlja ucenja, korak 1: skupljac ponavljanih kvarova iz agentskih transkripata na ovom stroju.
 *
 * Izvor, SAMO citanje: ~/.claude/projects/**\/*.jsonl (rekurzivno, pa i podagenti i workflowi).
 * Kvar je blok `tool_result` s `is_error: true`. Ime alata dolazi iz `tool_use` bloka istog
 * transkripta s istim `id`. Isti blok se broji jednom po `uuid` retka + `tool_use_id`.
 *
 * Codex i Grok NISU pokriveni u ovoj verziji (Codexov izlaz alata je ugnijezden JSON bez stabilnog
 * oblika). Izvjestaj to izricito navodi, da djelomicna pokrivenost ne izgleda kao potpuna.
 *
 * Klase su izvedene iz stvarne povijesti (laptop, 2026-08-29 do 2026-10-04: 1458 transkripata,
 * 2019 kvarova). Prva klasa ciji uzorak pogodi tekst vrijedi; ostalo se grupira po normaliziranom
 * potpisu (putanje, hashevi i brojevi maskirani) kao `ostalo:<hash>`.
 *
 * Privatnost: izvjestaj po zadanom ne sadrzi tekst poruka, samo klase, hasheve i brojeve. Maskirani
 * potpis neklasificiranog klastera (90 znakova) i dalje moze nositi rijeci iz poruke, pa se ispisuje
 * samo uz izricit `--samples`, za lokalnu dijagnozu na istom stroju. Izlaz ide u
 * %USERPROFILE%\Lekta-quality; `--out-dir` unutar repozitorija se odbija.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDay, sessionLabel } from '../agents/usage-daily.mjs';

/**
 * `gard`: postojeci mehanizam koji vec sprjecava ili hvata klasu (hook, test, skripta), ili null.
 * Klasa s `gard: null` koja se ponavlja u vise sesija je dug lekcije.
 * `vrsta`: hook = nas hook je okinuo (mjeri najam pravila), alat = greska u koristenju alata,
 * okolina = stroj ili ljuska, proces = agentski tok (workflow, shema, worktree).
 */
export const CLASSES = [
  { id: 'hook-cpu-disciplina', vrsta: 'hook', gard: 'scripts/hooks/cpu-discipline.mjs', re: /CPU disciplina:/ },
  { id: 'hook-tool-guard', vrsta: 'hook', gard: 'scripts/agents/tool-guard.mjs', re: /tool-guard:/ },
  { id: 'hook-git-commit-only', vrsta: 'hook', gard: 'lekta-git-guard.mjs', re: /`git commit` bez `--only`|git add -A/ },
  { id: 'hook-worktree-nepoznat', vrsta: 'hook', gard: 'scripts/agents/tool-guard.mjs', re: /Nije se moglo utvrditi radi li se u vlastitom worktreeju/ },
  { id: 'auto-mode-odbijeno', vrsta: 'proces', gard: 'Claude Code auto mode', re: /denied by the Claude Code auto mode classifier/ },
  { id: 'auto-mode-nedostupan', vrsta: 'okolina', gard: null, re: /temporarily unavailable .{0,40}auto mode cannot/ },
  { id: 'korisnik-odbio', vrsta: 'proces', gard: null, re: /The user doesn't want to proceed with this tool use/ },
  { id: 'bash-navodnici', vrsta: 'alat', gard: null, re: /unexpected EOF while looking for matching/ },
  { id: 'citaj-prije-pisanja', vrsta: 'alat', gard: 'Claude Code Edit/Write', re: /File has not been read yet|File has been modified since read/ },
  { id: 'sleep-blokiran', vrsta: 'alat', gard: 'Claude Code Bash', re: /Blocked: (standalone )?sleep/ },
  { id: 'prevelika-datoteka', vrsta: 'alat', gard: 'Claude Code Read', re: /exceeds maximum allowed size/ },
  { id: 'ripgrep-istek', vrsta: 'okolina', gard: null, re: /Ripgrep search timed out/ },
  { id: 'shema-izlaza', vrsta: 'proces', gard: null, re: /Output does not match required schema|StructuredOutput was called with input/ },
  { id: 'naredba-ne-postoji', vrsta: 'okolina', gard: null, re: /: command not found|is not recognized as the name of a cmdlet/ },
  { id: 'cmd-switch', vrsta: 'okolina', gard: null, re: /Invalid switch - "/ },
  { id: 'istek-naredbe', vrsta: 'okolina', gard: null, re: /Command timed out after/ },
  { id: 'worktree-ili-grana-postoji', vrsta: 'proces', gard: null, re: /fatal: '[^']*' already exists|a branch named '[^']*' already exists/ },
  { id: 'esm-url-shema', vrsta: 'alat', gard: null, re: /ERR_UNSUPPORTED_ESM_URL_SCHEME/ },
  { id: 'modul-nije-nadjen', vrsta: 'okolina', gard: null, re: /ERR_MODULE_NOT_FOUND|Cannot find module/ },
  { id: 'python-escape', vrsta: 'alat', gard: null, re: /unicodeescape|invalid escape sequence/ },
  { id: 'disk-pun', vrsta: 'okolina', gard: 'scripts/gate-preflight.mjs', re: /ENOSPC/ },
  { id: 'npm-eperm', vrsta: 'okolina', gard: null, re: /\bEPERM\b/ },
  { id: 'spawn-einval', vrsta: 'okolina', gard: null, re: /\bEINVAL\b|ENAMETOOLONG/ },
  { id: 'supabase-mcp', vrsta: 'okolina', gard: null, re: /"name":"(HttpException|ForbiddenException)"/ },
  { id: 'vitest-pad', vrsta: 'proces', gard: null, re: /Test Files\s+\d+ failed/ },
  { id: 'datoteka-ne-postoji', vrsta: 'alat', gard: null, re: /File does not exist\.|No such file or directory|\bENOENT\b/ },
];

/** Maskira putanje, hasheve i brojeve; vraca prvih 90 znakova. Isti kvar na drugom mjestu daje isti potpis. */
export function normalizeSignature(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/[A-Z]:[\\/][^\s'"`]*/gi, '<P>')
    .replace(/\/[\w.-]+(?:\/[\w.-]+)+/g, '<P>')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '<H>')
    .replace(/\d+/g, 'N')
    .trim()
    .slice(0, 90);
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Je li putanja `p` jednaka korijenu `root` ili unutar njega (na Windowsu bez obzira na velika slova). */
export function isInside(p, root) {
  const norm = (x) => (process.platform === 'win32' ? resolve(x).toLowerCase() : resolve(x));
  const rel = relative(norm(root), norm(p));
  return rel === '' || (!rel.startsWith('..') && !/^[a-z]:/i.test(rel) && !rel.startsWith('/') && !rel.startsWith('\\'));
}

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

/**
 * Razlozi odbijanja auto moda izmjereni u povijesti 2026-10-04. Razlog se NE kopira iz teksta
 * slobodno: `Reason: [...]` moze nositi bilo sto, pa bi kroz ime klase procurio sadrzaj poruke.
 */
export const AUTO_MODE_RAZLOZI = new Set([
  'Auto-Mode Bypass', 'Blind Apply', 'CI Bypass', 'Interfere With Workloads', 'Irreversible Local Destruction',
  'Logging/Audit Tampering', 'Merge Without Review', 'Modify Shared Resources', 'Security Weaken',
  'Self-Modification', 'Untrusted Code Integration',
]);

/** @returns {{ klasa: string, potpis: string }} */
export function classify(text) {
  const t = String(text);
  for (const c of CLASSES) {
    if (!c.re.test(t)) continue;
    if (c.id !== 'auto-mode-odbijeno') return { klasa: c.id, potpis: c.id };
    // Odbijanje auto moda dijeli se po razlogu: to su razliciti uzroci. Nepoznat razlog je `ostalo`.
    const r = t.match(/Reason: \[([^\]]+)\]/)?.[1];
    const razlog = r == null ? 'opce' : AUTO_MODE_RAZLOZI.has(r) ? r : 'ostalo';
    return { klasa: `${c.id}:${razlog}`, potpis: c.id };
  }
  const potpis = normalizeSignature(t);
  return { klasa: `ostalo:${hash(potpis)}`, potpis };
}

const classOf = (klasa) => CLASSES.find((c) => klasa === c.id || klasa.startsWith(`${c.id}:`)) ?? null;

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((x) => (typeof x?.text === 'string' ? x.text : '')).join(' ');
  return '';
}

const IS_ERROR_RE = /"is_error"\s*:\s*true/;

// Datoteka zadnji put mijenjana prije pocetka prozora ne moze imati zapis iz njega: transkripti se
// samo dopisuju. Rucno vracena stara kopija s novim zapisima je izvan opsega; `--all` cita sve.
function* walkJsonl(dir, minMtimeMs) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walkJsonl(p, minMtimeMs);
    else if (name.endsWith('.jsonl') && st.mtimeMs >= minMtimeMs) yield p;
  }
}

/**
 * Cita jedan transkript (vec razbijen na retke) i vraca kvarove. Cista funkcija nad recima,
 * da je testovi i mutacije mogu pozvati bez diska.
 * @param {string[]} lines
 * @param {{ seen: Set<string>, stats: { malformedLines: number } }} ctx
 */
export function failuresFromLines(lines, ctx) {
  const toolNames = new Map();
  const out = [];
  for (const line of lines) {
    // Brzi filtar: vecina redaka nije ni tool_use ni greska, a parsiranje 750 MB je skupo.
    // Claude Code pise kompaktan JSON, ali filtar dopusta i razmak oko dvotocke.
    const imaUse = line.includes('"tool_use"');
    const imaGresku = IS_ERROR_RE.test(line);
    if (!imaUse && !imaGresku) continue;
    let j;
    try { j = JSON.parse(line); } catch { ctx.stats.malformedLines += 1; continue; }
    const content = j?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && b.id) toolNames.set(b.id, b.name ?? '?');
      if (b?.type !== 'tool_result' || b.is_error !== true) continue;
      const key = `${j.uuid ?? ''}|${b.tool_use_id ?? ''}`;
      if (ctx.seen.has(key)) continue;
      ctx.seen.add(key);
      const day = localDay(j.timestamp);
      if (!day) continue;
      const { klasa, potpis } = classify(resultText(b));
      out.push({
        provider: 'claude',
        day,
        sessionId: j.sessionId ?? '?',
        session: sessionLabel(j.sessionId, j.cwd),
        alat: toolNames.get(b.tool_use_id) ?? '?',
        klasa,
        potpis,
      });
    }
  }
  return out;
}

/** @returns {{ failures: object[], stats: { files: number, malformedLines: number, unreadableFiles: number } }} */
export function collectFailures({ home = homedir(), sinceDay = null } = {}) {
  const stats = { files: 0, malformedLines: 0, unreadableFiles: 0 };
  const ctx = { seen: new Set(), stats };
  const minMtimeMs = sinceDay ? new Date(`${sinceDay}T00:00:00`).getTime() : 0;
  const failures = [];
  for (const file of walkJsonl(join(home, '.claude', 'projects'), minMtimeMs)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { stats.unreadableFiles += 1; continue; }
    stats.files += 1;
    for (const f of failuresFromLines(text.split(/\r?\n/), ctx)) {
      if (!sinceDay || f.day >= sinceDay) failures.push(f);
    }
  }
  return { failures, stats };
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/**
 * Klasteri po klasi s brojem pojava u 7 i 30 dana do `day` (ukljucivo), brojem sesija i gardom.
 * Dug lekcije: klasa bez garda koja se pojavila u barem 2 razlicite sesije u 30 dana.
 */
export function summarize(failures, day) {
  const od7 = addDays(day, -6);
  const od30 = addDays(day, -29);
  const map = new Map();
  for (const f of failures) {
    if (f.day > day) continue;
    const c = map.get(f.klasa) ?? {
      klasa: f.klasa, potpis: f.potpis, ukupno: 0, d7: 0, d30: 0,
      sesije30: new Set(), sesije: new Set(), alati: new Map(), prvi: f.day, zadnji: f.day,
    };
    c.ukupno += 1;
    c.sesije.add(f.sessionId);
    if (f.day >= od7) c.d7 += 1;
    if (f.day >= od30) { c.d30 += 1; c.sesije30.add(f.sessionId); }
    c.alati.set(f.alat, (c.alati.get(f.alat) ?? 0) + 1);
    if (f.day < c.prvi) c.prvi = f.day;
    if (f.day > c.zadnji) c.zadnji = f.day;
    map.set(f.klasa, c);
  }
  const clusters = [...map.values()].map((c) => {
    const def = classOf(c.klasa);
    return {
      klasa: c.klasa,
      vrsta: def?.vrsta ?? 'neklasificirano',
      gard: def?.gard ?? null,
      potpis: def ? null : c.potpis,
      ukupno: c.ukupno,
      d7: c.d7,
      d30: c.d30,
      sesije30: c.sesije30.size,
      sesije: c.sesije.size,
      alat: [...c.alati].sort((a, b) => b[1] - a[1])[0][0],
      prvi: c.prvi,
      zadnji: c.zadnji,
    };
  }).sort((a, b) => b.d30 - a.d30 || b.ukupno - a.ukupno || a.klasa.localeCompare(b.klasa));
  const dug = clusters.filter((c) => c.vrsta !== 'neklasificirano' && c.gard === null && c.sesije30 >= 2);
  return { day, clusters, dug, ukupno: failures.filter((f) => f.day <= day).length };
}

const md = (s) => String(s).replace(/\|/g, '\\|');

export function renderMarkdown(sum, stats, { samples = false } = {}) {
  const L = [];
  L.push(`# Ponavljani kvarovi agenata ${sum.day}`, '');
  L.push(`Pokriveno: Claude Code transkripti na ovom stroju (${stats.files} datoteka). NIJE pokriveno: Codex, Grok, radna stanica, cloud sesije.`, '');
  L.push(`Ukupno kvarova: ${sum.ukupno}; klastera: ${sum.clusters.length}; dug lekcija (bez garda, 2+ sesije u 30 dana): ${sum.dug.length}.`, '');
  L.push('## Dug lekcija', '');
  if (!sum.dug.length) L.push('- nema');
  for (const c of sum.dug) L.push(`- ${c.klasa} (${c.vrsta}): ${c.d30} pojava u ${c.sesije30} sesija u 30 dana, zadnja ${c.zadnji}, alat ${c.alat}`);
  L.push('', '## Svi klasteri', '');
  L.push('| Klasa | Vrsta | Gard | 7 d | 30 d | Sesija 30 d | Ukupno | Alat | Zadnja |', '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
  const prikaz = sum.clusters.filter((c) => c.vrsta !== 'neklasificirano' || c.sesije >= 2);
  for (const c of prikaz) {
    const ime = c.vrsta === 'neklasificirano' && samples && c.potpis ? `${c.klasa} \`${md(c.potpis)}\`` : c.klasa;
    L.push(`| ${ime} | ${c.vrsta} | ${c.gard ?? 'nema'} | ${c.d7} | ${c.d30} | ${c.sesije30} | ${c.ukupno} | ${c.alat} | ${c.zadnji} |`);
  }
  const skriveno = sum.clusters.length - prikaz.length;
  L.push('', `Neprikazano neklasificiranih klastera iz samo jedne sesije: ${skriveno}.`);
  L.push(`Preskoceno ostecenih JSON redaka: ${stats.malformedLines}; necitljivih datoteka: ${stats.unreadableFiles}.`, '');
  return L.join('\n');
}

function parseArgs(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    json: argv.includes('--json'),
    samples: argv.includes('--samples'),
    all: argv.includes('--all'),
    since: opt('--since'),
    day: opt('--day'),
    home: opt('--home'),
    outDir: opt('--out-dir'),
  };
}

function main(argv) {
  const a = parseArgs(argv);
  const day = a.day ?? localDay(new Date());
  const sinceDay = a.all ? null : (a.since ?? addDays(day, -29));
  const { failures, stats } = collectFailures({ home: a.home ?? homedir(), sinceDay });
  const sum = summarize(failures, day);
  if (a.json) {
    const clusters = sum.clusters.map((c) => (a.samples ? c : { ...c, potpis: null }));
    const dug = sum.dug.map((c) => (a.samples ? c : { ...c, potpis: null }));
    process.stdout.write(`${JSON.stringify({ ...sum, clusters, dug, stats, pokriveno: ['claude'] }, null, 2)}\n`);
    return;
  }
  const text = renderMarkdown(sum, stats, { samples: a.samples });
  const outDir = resolve(a.outDir ?? join(homedir(), 'Lekta-quality'));
  if (isInside(outDir, ROOT)) {
    process.stderr.write(`--out-dir ${outDir} je unutar repozitorija; izvjestaj nikad ne ide u repo.\n`);
    process.exitCode = 2;
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${day}.md`);
  writeFileSync(out, text, 'utf8');
  process.stdout.write(`${text}\nZapisano: ${out}\n`);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('scripts/quality/harvest.mjs')) main(process.argv.slice(2));
