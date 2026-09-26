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
 *   1. gard procesa je PO VRSTI mape. `<nanoid>/web|ssr` stvara iskljucivo Vitest
 *      (WorkspaceProject.tmpDir, cacheFs u forks poolu), pa te mape cuva samo zivi proces s
 *      `vitest` u naredbenom retku. `word-replica-tests-*` cuvaju zivi `pytest` i `word_replica`
 *      procesi. Playwright se NE broji: VS Code ekstenzija drzi trajni `@playwright/test/cli.js
 *      test-server` (roditelj Code.exe), pa bi gard koji ga broji na vlasnikovom stroju vjecno
 *      blokirao, a Playwright te mape ionako ne stvara. Kad se procesi ne mogu izmjeriti, ne brise
 *      se nista (nepoznato = ne brisi);
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
/**
 * Vrsta mape -> procesi koji je smiju drzati zivom. `name` filtrira po imenu procesa kad ga popis
 * nosi (Windows CIM upit vraca SVE procese radi lanca predaka); bez imena (ps) gledaju se svi.
 * `command` je obrazac naredbenog retka koji odaje zivog pisca te vrste mape.
 * @type {Record<'vitest' | 'word-replica', { label: string, name: RegExp, command: RegExp }>}
 */
export const RUNNER_RULES = {
  vitest: { label: 'vitest', name: /^node(\.exe)?$/i, command: /vitest/i },
  'word-replica': {
    label: 'pytest/word_replica',
    name: /^(python|pythonw|py|pytest)[0-9.]*(\.exe)?$/i,
    command: /pytest|word_replica/i,
  },
};
/** @type {Array<'vitest' | 'word-replica'>} */
export const GUARD_KINDS = ['vitest', 'word-replica'];
/** Ime ove skripte: pozivatelj (ljuska `npm run check`) ga nosi u naredbenom retku. */
const SELF_SCRIPT = 'clean-vitest-tmp.mjs';

/**
 * Minimalno sucelje datotecnog sustava koje skripta koristi. Stvarno je `node:fs`; mutacijski test
 * ubrizgava sustav u memoriji da nista na disku ne dira.
 * @typedef {{ name: string, isDirectory(): boolean, isSymbolicLink(): boolean }} EntryLike
 * @typedef {{ mtimeMs: number, size: number, isDirectory(): boolean, isSymbolicLink(): boolean }} StatLike
 * @typedef {{ readdir(path: string): EntryLike[], lstat(path: string): StatLike }} FsLike
 */
/** @type {FsLike} */
export const REAL_FS = {
  readdir: (p) => readdirSync(p, { withFileTypes: true }),
  lstat: (p) => lstatSync(p),
};

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
 * Odredjuje smije li se brisati mapa vrste `kind` s obzirom na zive procese.
 *
 * `processes === null` znaci da popis nije izmjeren i ciscenje se odbija. Ako proces nosi `name`,
 * gledaju se samo procesi cije ime odgovara pravilu vrste (Node za Vitest, Python za WordReplicu).
 * Iskljucuje se vlastiti proces i predak cija naredba pokrece upravo ovu skriptu (ljuska
 * `npm run check` ovog runa, koja u retku nosi cijeli lanac ukljucujuci `vitest run`). Predak koji
 * je sam vitest NIJE iskljucen. Proces odgovarajuceg imena bez citljivog naredbenog retka znaci
 * nepoznato, dakle ne brisi.
 *
 * @param {Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null} processes
 * @param {number} selfPid
 * @param {'vitest' | 'word-replica'} kind
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function runnerGuard(processes, selfPid, kind) {
  if (processes === null) {
    return { ok: false, reason: 'popis procesa nije izmjeren (nepoznato = ne brisi)' };
  }
  const rule = RUNNER_RULES[kind];
  if (!rule) return { ok: false, reason: `nepoznata vrsta mape '${String(kind)}'` };
  const ancestors = ancestorsOf(processes, selfPid);
  const blockers = [];
  const unreadable = [];
  for (const p of processes) {
    if (p.pid === selfPid) continue;
    if (p.name != null && !rule.name.test(p.name)) continue;
    if (ancestors.has(p.pid) && p.command != null && p.command.includes(SELF_SCRIPT)) continue;
    if (p.command == null) {
      unreadable.push(p.pid);
      continue;
    }
    if (rule.command.test(p.command)) blockers.push(p);
  }
  if (blockers.length > 0) {
    const opis = blockers
      .slice(0, 5)
      .map((p) => `PID ${p.pid}: ${String(p.command).slice(0, 160)}`)
      .join('; ');
    return { ok: false, reason: `radi ${blockers.length} ${rule.label} proces(a): ${opis}` };
  }
  if (unreadable.length > 0) {
    return {
      ok: false,
      reason: `naredbeni redak procesa nije citljiv (PID ${unreadable.slice(0, 5).join(', ')}), nepoznato = ne brisi`,
    };
  }
  return { ok: true };
}

/**
 * Rekurzivno mjeri mapu: najnoviji mtime (korijen, podmape i datoteke), zbroj bajtova i broj
 * unosa. Simbolicke veze i junctioni se ne slijede nego mapu cine neprihvatljivom.
 * @param {string} dir
 * @param {number} maxEntries
 * @param {FsLike} fs
 * @returns {{ status: 'ok', newestMs: number, bytes: number, entries: number }
 *   | { status: 'too-many', entries: number } | { status: 'symlink', path: string }}
 */
export function measureDir(dir, maxEntries = DEFAULT_MAX_ENTRIES, fs = REAL_FS) {
  const rootStat = fs.lstat(dir);
  let newestMs = rootStat.mtimeMs;
  let bytes = 0;
  let entries = 0;
  /** @type {string[]} */
  const stack = [dir];
  while (stack.length > 0) {
    const cur = /** @type {string} */ (stack.pop());
    for (const ent of fs.readdir(cur)) {
      entries += 1;
      if (entries > maxEntries) return { status: 'too-many', entries };
      const full = join(cur, ent.name);
      const st = fs.lstat(full);
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
 * @param {EntryLike} ent
 * @param {FsLike} fs
 * @returns {null | { kind: 'vitest' | 'word-replica' } | { refused: string }}
 */
export function classifyEntry(full, ent, fs = REAL_FS) {
  const isWord = ent.name.startsWith(WORD_REPLICA_PREFIX);
  const isNanoid = NANOID_NAME.test(ent.name);
  if (!isWord && !isNanoid) return null;
  if (ent.isSymbolicLink() || !ent.isDirectory()) return null;
  if (isWord) return { kind: 'word-replica' };
  const inner = fs.readdir(full);
  if (inner.length === 0) return { refused: 'prazna mapa (nije Vitest oblik)' };
  for (const e of inner) {
    if (!VITEST_SUBDIRS.has(e.name) || e.isSymbolicLink() || !e.isDirectory()) {
      return { refused: `sadrzi '${e.name}' uz web/ssr (nije Vitest oblik)` };
    }
  }
  return { kind: 'vitest' };
}

/**
 * Cisti plan: sto bi se obrisalo, sto je mlado, sto zadrzavaju zivi procesi, sto je odbijeno.
 * Nista ne brise.
 *
 * `fs`, `guard` i `measure` su tocke ubrizgavanja za testove i mutacije (sustav u memoriji, gard
 * procesa, mjerenje starosti); produkcija ih ne predaje i koristi stvarne izvedbe.
 * @param {{
 *   root: string,
 *   nowMs: number,
 *   thresholdMs: number,
 *   listProcesses: () => (Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null),
 *   selfPid?: number,
 *   maxEntries?: number,
 *   fs?: FsLike,
 *   guard?: typeof runnerGuard,
 *   measure?: typeof measureDir,
 * }} opts
 */
export function planCleanup(opts) {
  const root = resolve(opts.root);
  const selfPid = opts.selfPid ?? process.pid;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const fs = opts.fs ?? REAL_FS;
  const guardFn = opts.guard ?? runnerGuard;
  const measure = opts.measure ?? measureDir;
  /**
   * @type {{
   *   root: string,
   *   blocked: string | null,
   *   guards: Record<string, { ok: true } | { ok: false, reason: string }>,
   *   remove: Array<{ path: string, kind: 'vitest' | 'word-replica', newestMs: number, bytes: number }>,
   *   young: Array<{ path: string, kind: 'vitest' | 'word-replica', newestMs: number, bytes: number }>,
   *   held: Array<{ path: string, kind: 'vitest' | 'word-replica' }>,
   *   refused: Array<{ path: string, reason: string }>,
   *   errors: Array<{ path: string, code: string }>,
   * }}
   */
  const plan = { root, blocked: null, guards: {}, remove: [], young: [], held: [], refused: [], errors: [] };

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
  if (processes == null) {
    plan.blocked = 'popis procesa nije izmjeren (nepoznato = ne brisi)';
    return plan;
  }
  for (const kind of GUARD_KINDS) plan.guards[kind] = guardFn(processes, selfPid, kind);

  let entries;
  try {
    entries = fs.readdir(root);
  } catch (err) {
    plan.blocked = `korijen nije citljiv: ${errCode(err)}`;
    return plan;
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    let cls;
    try {
      cls = classifyEntry(full, ent, fs);
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
    // Gard procesa PRIJE mjerenja: mapu koju zivi pisac njezine vrste moze drzati ne diramo ni
    // citanjem, i ne ovisi o tome koliko je stara.
    if (!plan.guards[cls.kind].ok) {
      plan.held.push({ path: full, kind: cls.kind });
      continue;
    }
    let m;
    try {
      m = measure(full, maxEntries, fs);
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
 * Windows: CIM upit nad SVIM procesima (za lanac predaka), runnerGuard filtrira po imenu vrste.
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

/**
 * Cijeli CLI tok (argumenti, plan, izvrsenje, ispis) nad ubrizganim ovisnostima. Ulazna tocka ga
 * zove sa stvarnim `tmpdir()`, satom i popisom procesa; test ga zove s kontroliranim popisom
 * procesa, pa mjeri tocno onu granu koju tvrdi (npr. dry-run), a ne onu koju slucajno odabere
 * stanje stroja na kojem se test vrti.
 * @param {{
 *   argv: string[],
 *   root: string,
 *   nowMs: number,
 *   listProcesses: () => (Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null),
 *   selfPid?: number,
 *   log?: (line: string) => void,
 *   rm?: (p: string, o: { recursive: true, force: true }) => void,
 * }} deps
 */
export function runCli(deps) {
  const log = deps.log ?? ((line) => console.log(line));
  const args = parseArgs(deps.argv);
  const tag = '[clean-vitest-tmp]';
  if (args.error) {
    log(`${tag} ${args.error}; nista nije obrisano.`);
    return;
  }
  const root = resolve(deps.root);
  const plan = planCleanup({
    root,
    nowMs: deps.nowMs,
    thresholdMs: args.olderThanHours * 3_600_000,
    listProcesses: deps.listProcesses,
    selfPid: deps.selfPid,
  });
  if (plan.blocked) {
    log(`${tag} ${root}: nista nije obrisano, razlog: ${plan.blocked}`);
    return;
  }
  const res = executePlan(plan, { dryRun: args.dryRun, rm: deps.rm });
  const youngBytes = plan.young.reduce((s, i) => s + i.bytes, 0);
  const errs = Object.entries(res.errorCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'nema';
  const verb = args.dryRun ? 'bi se obrisalo (dry-run)' : 'obrisano';
  log(`${tag} ${root}, prag ${args.olderThanHours} h`);
  for (const kind of GUARD_KINDS) {
    const g = plan.guards[kind];
    if (g && !g.ok) log(`${tag} ${kind}: ne brisem, ${g.reason}`);
  }
  log(`${tag} ${verb}: ${res.removed} mapa, ${mb(res.removedBytes)} MB`);
  log(`${tag} preskoceno kao mlade: ${plan.young.length} mapa, ${mb(youngBytes)} MB`);
  log(`${tag} zadrzano zbog zivih procesa: ${plan.held.length} mapa`);
  log(`${tag} odbijeno: ${res.refused.length}`);
  for (const r of res.refused.slice(0, 10)) log(`${tag}   ${basename(r.path)}: ${r.reason}`);
  log(`${tag} greske: ${errs}`);
}

export function isEntryModule(moduleUrl, argv1) {
  if (!argv1) return false;
  const self = resolve(fileURLToPath(moduleUrl));
  const entry = resolve(argv1);
  return process.platform === 'win32' ? self.toLowerCase() === entry.toLowerCase() : self === entry;
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  try {
    runCli({
      argv: process.argv.slice(2),
      root: tmpdir(),
      nowMs: Date.now(),
      listProcesses: listSystemProcesses,
    });
  } catch (err) {
    console.log(`[clean-vitest-tmp] neocekivana greska, nista dalje ne brisem: ${err && err.message ? err.message : String(err)}`);
  }
  process.exitCode = 0;
}
