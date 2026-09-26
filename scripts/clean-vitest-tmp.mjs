/**
 * Ciscenje ostataka Vitesta i WordReplica testova iz os.tmpdir() prije gatea.
 *
 * Zasto postoji (izmjereno 2026-09-23 i 2026-09-26): Vitest 2.1.9 s poolom `forks` pise
 * transformirane module u `os.tmpdir()/<21-znakovni nanoid>/<web|ssr>/<sha1>`, a brise ih samo
 * `project.close()`. Run ubijen timeoutom, TaskStopom, OOM-om ili ENOSPC-om ostavi 70 do 100 MB;
 * nadjeno je 1014 takvih mapa (2 GB). WordReplica e2e uz to ostavlja `word-replica-tests-*`.
 *
 * ZAMKA (2026-09-26): brisanje po mtime MAPE ubilo je zivi gate usred runa, jer se mtime mape ne
 * osvjezava dok Vitest pise u postojece podmape. Zato:
 *   1. nista se ne brise dok na stroju radi ijedan vitest ili playwright proces, ni kad se procesi
 *      ne mogu izmjeriti (nepoznato = ne brisi);
 *   2. starost mape je NAJNOVIJI mtime bilo koje datoteke ili podmape unutar nje (rekurzivno, s
 *      gornjom granicom broja unosa), nikad samo mtime korijena mape;
 *   3. brise se iskljucivo `fs.rmSync` nad tocnom putanjom koja je izravno dijete korijena.
 *
 * Izlazni kod je UVIJEK 0: ciscenje je higijena, ne gate, i ne smije srusiti `npm run check`.
 */
import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ime mape koju Vitest stvara nanoidom: tocno 21 znak iz URL-sigurne abecede. */
export const NANOID_NAME = /^[A-Za-z0-9_-]{21}$/;
export const WORD_REPLICA_PREFIX = 'word-replica-tests-';
/** Jedine podmape koje Vitest stvara u svojoj tmp mapi (transformMode). */
export const VITEST_SUBDIRS = new Set(['web', 'ssr']);
export const DEFAULT_THRESHOLD_HOURS = 2;
export const DEFAULT_MAX_ENTRIES = 20_000;
/** Naredbeni redak koji odaje zivi test runner. */
export const RUNNER_PATTERN = /vitest|playwright/i;
/** Ime ove skripte: pozivatelj (ljuska `npm run check`) ga nosi u naredbenom retku. */
const SELF_SCRIPT = 'clean-vitest-tmp.mjs';

/**
 * Je li `candidate` IZRAVNO dijete korijena `root` (nakon resolve)? Stiti od putanje izvan
 * korijena, `..` segmenata i brisanja samog korijena.
 * @param {string} root
 * @param {string} candidate
 */
export function isDirectChildOf(root, candidate) {
  const r = resolve(root);
  const c = resolve(candidate);
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  if (c === r) return false;
  const prefix = r.endsWith(sep) ? r : r + sep;
  if (!norm(c).startsWith(norm(prefix))) return false;
  return norm(dirname(c)) === norm(r);
}

/**
 * Skup PID-ova predaka `selfPid` prema popisu procesa (petlje i duboki lanci su ograniceni).
 * @param {Array<{pid: number, ppid: number | null}>} processes
 * @param {number} selfPid
 */
export function ancestorsOf(processes, selfPid) {
  const parent = new Map(processes.map((p) => [p.pid, p.ppid]));
  const out = new Set();
  let cur = parent.get(selfPid);
  for (let depth = 0; depth < 64 && cur != null && cur > 0 && !out.has(cur); depth++) {
    out.add(cur);
    cur = parent.get(cur);
  }
  return out;
}

/**
 * Odredjuje smije li se brisati s obzirom na zive procese.
 *
 * `processes === null` znaci da popis nije izmjeren i ciscenje se odbija. Ako proces nosi `name`,
 * gledaju se samo `node`/`node.exe` procesi (Vitest i Playwright runner su Node procesi; Windows
 * upit vraca sve procese radi lanca predaka). Iskljucuje se vlastiti proces i predak cija naredba
 * pokrece upravo ovu skriptu (ljuska `npm run check` ovog runa, koja u retku nosi cijeli lanac
 * ukljucujuci `vitest run`). Predak koji je sam vitest NIJE iskljucen.
 *
 * @param {Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null} processes
 * @param {number} selfPid
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function runnerGuard(processes, selfPid) {
  if (processes === null) {
    return { ok: false, reason: 'popis procesa nije izmjeren (nepoznato = ne brisi)' };
  }
  const ancestors = ancestorsOf(processes, selfPid);
  const blockers = [];
  const unreadable = [];
  for (const p of processes) {
    if (p.pid === selfPid) continue;
    if (p.name != null && !/^node(\.exe)?$/i.test(p.name)) continue;
    if (ancestors.has(p.pid) && p.command != null && p.command.includes(SELF_SCRIPT)) continue;
    if (p.command == null) {
      unreadable.push(p.pid);
      continue;
    }
    if (RUNNER_PATTERN.test(p.command)) blockers.push(p);
  }
  if (blockers.length > 0) {
    const opis = blockers
      .slice(0, 5)
      .map((p) => `PID ${p.pid}: ${String(p.command).slice(0, 160)}`)
      .join('; ');
    return { ok: false, reason: `radi ${blockers.length} vitest/playwright proces(a): ${opis}` };
  }
  if (unreadable.length > 0) {
    return {
      ok: false,
      reason: `naredbeni redak Node procesa nije citljiv (PID ${unreadable.slice(0, 5).join(', ')}), nepoznato = ne brisi`,
    };
  }
  return { ok: true };
}

/**
 * Rekurzivno mjeri mapu: najnoviji mtime (korijen, podmape i datoteke), zbroj bajtova i broj
 * unosa. Simbolicke veze i junctioni se ne slijede nego mapu cine neprihvatljivom.
 * @param {string} dir
 * @param {number} maxEntries
 */
export function measureDir(dir, maxEntries = DEFAULT_MAX_ENTRIES) {
  const rootStat = lstatSync(dir);
  let newestMs = rootStat.mtimeMs;
  let bytes = 0;
  let entries = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const ent of readdirSync(cur, { withFileTypes: true })) {
      entries += 1;
      if (entries > maxEntries) return { status: 'too-many', entries };
      const full = join(cur, ent.name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) return { status: 'symlink', path: full };
      if (st.mtimeMs > newestMs) newestMs = st.mtimeMs;
      if (st.isDirectory()) stack.push(full);
      else bytes += st.size;
    }
  }
  return { status: 'ok', newestMs, bytes, entries };
}

/**
 * Klasificira izravno dijete korijena. Vraca `null` za unose koji uopce nisu kandidati (tudje
 * tmp datoteke i mape), inace vrstu ili razlog odbijanja.
 * @param {string} full
 * @param {import('node:fs').Dirent} ent
 * @returns {null | { kind: 'vitest' | 'word-replica' } | { refused: string }}
 */
export function classifyEntry(full, ent) {
  const isWord = ent.name.startsWith(WORD_REPLICA_PREFIX);
  const isNanoid = NANOID_NAME.test(ent.name);
  if (!isWord && !isNanoid) return null;
  if (ent.isSymbolicLink() || !ent.isDirectory()) return null;
  if (isWord) return { kind: 'word-replica' };
  const inner = readdirSync(full, { withFileTypes: true });
  if (inner.length === 0) return { refused: 'prazna mapa (nije Vitest oblik)' };
  for (const e of inner) {
    if (!VITEST_SUBDIRS.has(e.name) || e.isSymbolicLink() || !e.isDirectory()) {
      return { refused: `sadrzi '${e.name}' uz web/ssr (nije Vitest oblik)` };
    }
  }
  return { kind: 'vitest' };
}

/**
 * Cisti plan: sto bi se obrisalo, sto je mlado, sto je odbijeno. Nista ne brise.
 * @param {{
 *   root: string,
 *   nowMs: number,
 *   thresholdMs: number,
 *   listProcesses: () => (Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null),
 *   selfPid?: number,
 *   maxEntries?: number,
 * }} opts
 */
export function planCleanup(opts) {
  const root = resolve(opts.root);
  const selfPid = opts.selfPid ?? process.pid;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const plan = { root, blocked: null, remove: [], young: [], refused: [], errors: [] };

  if (!Number.isFinite(opts.thresholdMs) || opts.thresholdMs <= 0) {
    plan.blocked = `neispravan prag starosti (${opts.thresholdMs} ms)`;
    return plan;
  }
  let processes;
  try {
    processes = opts.listProcesses();
  } catch {
    processes = null;
  }
  const guard = runnerGuard(processes ?? null, selfPid);
  if (!guard.ok) {
    plan.blocked = guard.reason;
    return plan;
  }

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    plan.blocked = `korijen nije citljiv: ${errCode(err)}`;
    return plan;
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    let cls;
    try {
      cls = classifyEntry(full, ent);
    } catch (err) {
      plan.errors.push({ path: full, code: errCode(err) });
      continue;
    }
    if (cls === null) continue;
    if ('refused' in cls) {
      plan.refused.push({ path: full, reason: cls.refused });
      continue;
    }
    if (!isDirectChildOf(root, full)) {
      plan.refused.push({ path: full, reason: 'putanja izvan korijena' });
      continue;
    }
    let m;
    try {
      m = measureDir(full, maxEntries);
    } catch (err) {
      plan.errors.push({ path: full, code: errCode(err) });
      continue;
    }
    if (m.status === 'too-many') {
      plan.refused.push({ path: full, reason: `vise od ${maxEntries} unosa, preskoceno` });
      continue;
    }
    if (m.status === 'symlink') {
      plan.refused.push({ path: full, reason: `sadrzi simbolicku vezu ${m.path}` });
      continue;
    }
    const item = { path: full, kind: cls.kind, newestMs: m.newestMs, bytes: m.bytes };
    if (opts.nowMs - m.newestMs >= opts.thresholdMs) plan.remove.push(item);
    else plan.young.push(item);
  }
  return plan;
}

/**
 * Izvrsava plan. Svaka putanja se prije brisanja ponovno provjerava prema korijenu; greske se
 * zbrajaju po kodu (EBUSY, EPERM, ...) i nikad ne bacaju.
 * @param {ReturnType<typeof planCleanup>} plan
 * @param {{ dryRun?: boolean, rm?: (p: string, o: { recursive: true, force: true }) => void }} [opts]
 */
export function executePlan(plan, opts = {}) {
  const rm = opts.rm ?? rmSync;
  const result = {
    dryRun: Boolean(opts.dryRun),
    removed: 0,
    removedBytes: 0,
    refused: [...plan.refused],
    errorCounts: /** @type {Record<string, number>} */ ({}),
  };
  for (const e of plan.errors) result.errorCounts[e.code] = (result.errorCounts[e.code] ?? 0) + 1;
  if (plan.blocked) return result;
  for (const item of plan.remove) {
    if (!isDirectChildOf(plan.root, item.path)) {
      result.refused.push({ path: item.path, reason: 'putanja izvan korijena' });
      continue;
    }
    if (result.dryRun) {
      result.removed += 1;
      result.removedBytes += item.bytes;
      continue;
    }
    try {
      rm(resolve(item.path), { recursive: true, force: true });
      result.removed += 1;
      result.removedBytes += item.bytes;
    } catch (err) {
      const code = errCode(err);
      result.errorCounts[code] = (result.errorCounts[code] ?? 0) + 1;
    }
  }
  return result;
}

function errCode(err) {
  return err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : 'UNKNOWN';
}

/**
 * Stvarni popis procesa. `null` kad se ne moze izmjeriti.
 * Windows: CIM upit nad SVIM procesima (za lanac predaka), runnerGuard gleda samo node.exe.
 * Linux/mac: `ps -eo pid=,ppid=,args=` bez imena, pa se gledaju svi procesi.
 */
export function listSystemProcesses() {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
    );
    if (r.error || r.status !== 0 || !r.stdout) return null;
    return parseWindowsProcesses(r.stdout);
  }
  const r = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0 || !r.stdout) return null;
  return parsePsOutput(r.stdout);
}

/** @param {string} stdout */
export function parseWindowsProcesses(stdout) {
  let data;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  const rows = Array.isArray(data) ? data : [data];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.ProcessId !== 'number') return null;
    out.push({
      pid: row.ProcessId,
      ppid: typeof row.ParentProcessId === 'number' ? row.ParentProcessId : null,
      name: typeof row.Name === 'string' ? row.Name : null,
      command: typeof row.CommandLine === 'string' ? row.CommandLine : null,
    });
  }
  return out.length > 0 ? out : null;
}

/** @param {string} stdout */
export function parsePsOutput(stdout) {
  const out = [];
  for (const line of stdout.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    const m = /^\s*(\d+)\s+(\d+)\s?(.*)$/.exec(line);
    if (!m) return null;
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return out.length > 0 ? out : null;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const args = { dryRun: false, olderThanHours: DEFAULT_THRESHOLD_HOURS, error: null };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--older-than-hours=')) {
      const n = Number(a.slice('--older-than-hours='.length));
      if (!Number.isFinite(n) || n <= 0) args.error = `neispravan --older-than-hours: ${a}`;
      else args.olderThanHours = n;
    } else args.error = `nepoznat argument: ${a}`;
  }
  return args;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = '[clean-vitest-tmp]';
  if (args.error) {
    console.log(`${tag} ${args.error}; nista nije obrisano.`);
    return;
  }
  const root = resolve(tmpdir());
  const plan = planCleanup({
    root,
    nowMs: Date.now(),
    thresholdMs: args.olderThanHours * 3_600_000,
    listProcesses: listSystemProcesses,
  });
  if (plan.blocked) {
    console.log(`${tag} ${root}: nista nije obrisano, razlog: ${plan.blocked}`);
    return;
  }
  const res = executePlan(plan, { dryRun: args.dryRun });
  const youngBytes = plan.young.reduce((s, i) => s + i.bytes, 0);
  const errs = Object.entries(res.errorCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'nema';
  const verb = args.dryRun ? 'bi se obrisalo (dry-run)' : 'obrisano';
  console.log(`${tag} ${root}, prag ${args.olderThanHours} h`);
  console.log(`${tag} ${verb}: ${res.removed} mapa, ${mb(res.removedBytes)} MB`);
  console.log(`${tag} preskoceno kao mlade: ${plan.young.length} mapa, ${mb(youngBytes)} MB`);
  console.log(`${tag} odbijeno: ${res.refused.length}`);
  for (const r of res.refused.slice(0, 10)) console.log(`${tag}   ${basename(r.path)}: ${r.reason}`);
  console.log(`${tag} greske: ${errs}`);
}

export function isEntryModule(moduleUrl, argv1) {
  if (!argv1) return false;
  const self = resolve(fileURLToPath(moduleUrl));
  const entry = resolve(argv1);
  return process.platform === 'win32' ? self.toLowerCase() === entry.toLowerCase() : self === entry;
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.log(`[clean-vitest-tmp] neocekivana greska, nista dalje ne brisem: ${err && err.message ? err.message : String(err)}`);
  }
  process.exitCode = 0;
}
