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
 * Stavka G (odluka vlasnika 2026-09-26): ostaci testova i alata koji nisu Vitest, izmjereni u
 * %TEMP% 2026-09-27, po istom obrascu (izravno dijete korijena, gard po vrsti, starost po
 * najnovijoj datoteci, rmSync nad tocnom putanjom), ali s pragom od 24 h:
 *   - `lekta-<poznati prefiks>-...-<6>`: `mkdtemp` iz testova i pomocnika (release gate, runner
 *     publish, repair secrets, ...); samo MAPE s poznatim prefiksom i mkdtemp sufiksom, jer se u
 *     %TEMP% nalaze i rucno ostavljeni `lekta-t21-*.sql`, `lekta-gradri-pdf-check` i slicno;
 *   - `lekta-oracle-<8>`: `tempfile.mkdtemp(prefix="lekta-oracle-")` iz scripts/corpus-oracle.py;
 *   - `playwright_<preglednik>dev_profile-<6>`: profil preglednika koji Playwright stvara po
 *     pokretanju (14 do 59 MB svaki).
 * Korijen pod `Temp/claude/**` (radni prostor sesija i worktreeovi runova) se NIKAD ne cisti, ni
 * kad je tamo samo po realpathu (junction). Kandidat koji je sam reparse point (junction ili
 * simbolicka veza; Node ih na Windowsu oba prijavljuje kao isSymbolicLink) se nikad ne brise ni
 * slijedi, i provjerava se ponovno lstatom neposredno prije brisanja.
 *
 * Python `tmp<8>.docx` (tempfile.mkstemp) NAMJERNO NIJE kategorija (Codex nalaz, krug 2, B2): oblik
 * imena ne dokazuje da je datoteku ostavio Lektin alat, a ne neki drugi program korisnika, a
 * izmjereno je samo 1,5 MB takvih datoteka. Nedokazivo vlasnistvo = ne brisi.
 *
 * Izlazni kod je UVIJEK 0: ciscenje je higijena, ne gate, i ne smije srusiti `npm run check`.
 */
import { lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
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
/**
 * Prag za ostatke testova i alata (stavka G). 24 h, a ne 2 h kao za Vitest: ove stavke stvaraju
 * pisci koji ne osvjezavaju svaku datoteku stalno (preglednik s profilom, dugi Python run, test
 * koji drzi mkdtemp mapu kroz cijelu datoteku), a dan je dovoljno dug da nijedan zivi run ne
 * ostane bez svoje mape, i dovoljno kratak da se %TEMP% ne puni tjednima. `--older-than-hours`
 * ga moze samo povisiti, nikad spustiti ispod 24 h.
 */
export const LEFTOVER_THRESHOLD_HOURS = 24;
export const DEFAULT_MAX_ENTRIES = 20_000;
/**
 * Mape koje testovi i pomocnici stvaraju s `mkdtemp(join(tmpdir(), 'lekta-...-'))`: poznati
 * prefiks, proizvoljni srednji segmenti i Nodeov mkdtemp sufiks od tocno 6 znakova. Prefiksi su
 * izvedeni iz `grep mkdtemp tests/ scripts/` (2026-09-27); `lekta-repair-secrets-` stvara
 * scripts/local-repair-secret-staging.mts. `lekta-projverify-` (scripts/projection-verify.mjs) je
 * NAMJERNO izostavljen: to je git worktree, a brisanje mape ostavilo bi visecu registraciju.
 *
 * Rizik tudjeg vlasnistva je prihvacen (Codex krug 2, odluka koordinatora): prefiks `lekta-` je
 * prostor imena ovog projekta, prefiksi su tocno nabrojani, a sufiks je tocno Nodeov mkdtemp od 6
 * znakova. Isto obrazlozenje vrijedi za uske uzorke LEKTA_ORACLE_NAME i PLAYWRIGHT_PROFILE_NAME
 * (vlastiti prefiks i sufiks tocne duljine). Za razliku od `tmp<8>.docx`, ovdje ime nosi prostor
 * imena vlasnika.
 */
export const LEKTA_TEST_TMP_NAME =
  /^lekta-(?:release|runner|repair-secrets|secret|migration|real-migration-executor-test|agents|build-production|clean-tmp|preflight|word-outdir)-(?:[A-Za-z0-9]+-)*[A-Za-z0-9]{6}$/;
/** scripts/corpus-oracle.py: `tempfile.mkdtemp(prefix="lekta-oracle-")`, sufiks 8 znakova. */
export const LEKTA_ORACLE_NAME = /^lekta-oracle-[a-z0-9_]{8}$/i;
/** Playwright profil preglednika: `playwright_chromiumdev_profile-XXXXXX` (i firefox, webkit). */
export const PLAYWRIGHT_PROFILE_NAME = /^playwright_[a-z]+dev_profile-[A-Za-z0-9]{6}$/;
/** Vrste s pragom od 24 h; ostale (vitest, word-replica) zadrzavaju prag iz `--older-than-hours`. */
export const LEFTOVER_KINDS = new Set(['lekta-test', 'lekta-oracle', 'playwright-profile']);
/**
 * @typedef {'vitest' | 'word-replica' | 'lekta-test' | 'lekta-oracle' | 'playwright-profile'} Kind
 */
/**
 * Vrsta mape -> procesi koji je smiju drzati zivom. `name` filtrira po imenu procesa kad ga popis
 * nosi (Windows CIM upit vraca SVE procese radi lanca predaka); bez imena (ps) gledaju se svi.
 * `command` je obrazac naredbenog retka koji odaje zivog pisca te vrste mape.
 * @type {Record<Kind, { label: string, name: RegExp, command: RegExp }>}
 */
export const RUNNER_RULES = {
  vitest: { label: 'vitest', name: /^node(\.exe)?$/i, command: /vitest/i },
  'word-replica': {
    label: 'pytest/word_replica',
    name: /^(python|pythonw|py|pytest)[0-9.]*(\.exe)?$/i,
    command: /pytest|word_replica/i,
  },
  'lekta-test': {
    label: 'vitest/repair-local',
    name: /^node(\.exe)?$/i,
    command: /vitest|repair-local|local-repair|release-gate/i,
  },
  'lekta-oracle': {
    label: 'corpus-oracle',
    name: /^(python|pythonw|py)[0-9.]*(\.exe)?$/i,
    command: /corpus[-_]oracle/i,
  },
  'playwright-profile': {
    label: 'playwright preglednik',
    name: /^(chrome|chromium|headless_shell|chrome-headless-shell|msedge|firefox|pw_\w+|webkit\w*)(\.exe)?$/i,
    command: /playwright_[a-z]+dev_profile-/i,
  },
};
/** @type {Kind[]} */
export const GUARD_KINDS = ['vitest', 'word-replica', 'lekta-test', 'lekta-oracle', 'playwright-profile'];

/**
 * Je li korijen unutar `Temp/claude/**` (ili `tmp/claude/**`)? Tamo zive radni prostori Claude
 * sesija i worktreeovi workflow runova (`Temp/claude/lekta-wf/...`); njih cisti drugi proces i ova
 * skripta ih ne smije dirati ni kad bi `os.tmpdir()` pokazivao unutra.
 * @param {string} root
 */
export function isInsideClaudeTemp(root) {
  const segs = resolve(root).split(/[\\/]+/).map((s) => s.toLowerCase());
  for (let i = 0; i + 1 < segs.length; i++) {
    if ((segs[i] === 'temp' || segs[i] === 'tmp') && segs[i + 1] === 'claude') return true;
  }
  return false;
}
/** Razlog odbijanja kandidata koji je sam junction ili simbolicka veza (Codex krug 2, M1). */
const LINK_REFUSED = 'kandidat je simbolicka veza ili junction, ne brisem ga ni ne slijedim';
/** Ime ove skripte: pozivatelj (ljuska `npm run check`) ga nosi u naredbenom retku. */
const SELF_SCRIPT = 'clean-vitest-tmp.mjs';

/**
 * Minimalno sucelje datotecnog sustava koje skripta koristi. Stvarno je `node:fs`; mutacijski test
 * ubrizgava sustav u memoriji da nista na disku ne dira.
 * @typedef {{ name: string, isDirectory(): boolean, isSymbolicLink(): boolean }} EntryLike
 * @typedef {{ mtimeMs: number, size: number, isDirectory(): boolean, isSymbolicLink(): boolean }} StatLike
 * `realpath` razrjesava junctione i simbolicke veze (za izuzece Temp/claude/**). Stvarni sustav ga
 * uvijek ima; sustav u memoriji koji ga ne preda nema veza, pa je tamo realpath sama putanja.
 * @typedef {{ readdir(path: string): EntryLike[], lstat(path: string): StatLike, realpath?(path: string): string }} FsLike
 */
/** @type {FsLike} */
export const REAL_FS = {
  readdir: (p) => readdirSync(p, { withFileTypes: true }),
  lstat: (p) => lstatSync(p),
  realpath: (p) => realpathSync.native(p),
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
 * @param {Kind} kind
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
  if (rootStat.isSymbolicLink()) return { status: 'symlink', path: dir };
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
 * @returns {null | { kind: Kind } | { refused: string, kind: Kind }}
 */
export function classifyEntry(full, ent, fs = REAL_FS) {
  const leftover = classifyLeftover(ent);
  if (leftover !== undefined) return leftover;
  const isWord = ent.name.startsWith(WORD_REPLICA_PREFIX);
  const isNanoid = NANOID_NAME.test(ent.name);
  if (!isWord && !isNanoid) return null;
  if (ent.isSymbolicLink()) return { refused: LINK_REFUSED, kind: isWord ? 'word-replica' : 'vitest' };
  if (!ent.isDirectory()) return null;
  if (isWord) return { kind: 'word-replica' };
  const inner = fs.readdir(full);
  if (inner.length === 0) return { refused: 'prazna mapa (nije Vitest oblik)', kind: 'vitest' };
  for (const e of inner) {
    if (!VITEST_SUBDIRS.has(e.name) || e.isSymbolicLink() || !e.isDirectory()) {
      return { refused: `sadrzi '${e.name}' uz web/ssr (nije Vitest oblik)`, kind: 'vitest' };
    }
  }
  return { kind: 'vitest' };
}

/**
 * Vrste iz stavke G (sve su mape). `undefined` znaci da ime ne pripada nijednoj od njih
 * (klasifikacija ide dalje na Vitest i WordReplicu); `null` da ime odgovara, ali je unos datoteka,
 * pa nije kandidat. Simbolicka veza ili junction s imenom kategorije je odbijena s razlogom.
 * @param {EntryLike} ent
 * @returns {undefined | null | { kind: Kind } | { refused: string, kind: Kind }}
 */
export function classifyLeftover(ent) {
  /** @type {Kind | null} */
  let kind = null;
  if (LEKTA_ORACLE_NAME.test(ent.name)) kind = 'lekta-oracle';
  else if (LEKTA_TEST_TMP_NAME.test(ent.name)) kind = 'lekta-test';
  else if (PLAYWRIGHT_PROFILE_NAME.test(ent.name)) kind = 'playwright-profile';
  if (kind === null) return undefined;
  if (ent.isSymbolicLink()) return { refused: LINK_REFUSED, kind };
  if (!ent.isDirectory()) return null;
  return { kind };
}

/**
 * Cisti plan: sto bi se obrisalo, sto je mlado, sto zadrzavaju zivi procesi, sto je odbijeno.
 * Nista ne brise.
 *
 * `fs`, `guard`, `measure` i `protectedRoot` su tocke ubrizgavanja za testove i mutacije (sustav u
 * memoriji, gard procesa, mjerenje starosti, zastita korijena pod Temp/claude); produkcija ih ne
 * predaje i koristi stvarne izvedbe.
 * @param {{
 *   root: string,
 *   nowMs: number,
 *   thresholdMs: number,
 *   leftoverThresholdMs?: number,
 *   listProcesses: () => (Array<{pid: number, ppid: number | null, name?: string | null, command: string | null}> | null),
 *   selfPid?: number,
 *   maxEntries?: number,
 *   fs?: FsLike,
 *   guard?: typeof runnerGuard,
 *   measure?: typeof measureDir,
 *   protectedRoot?: typeof isInsideClaudeTemp,
 * }} opts
 */
export function planCleanup(opts) {
  const root = resolve(opts.root);
  const selfPid = opts.selfPid ?? process.pid;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const fs = opts.fs ?? REAL_FS;
  const guardFn = opts.guard ?? runnerGuard;
  const measure = opts.measure ?? measureDir;
  const leftoverThresholdMs = opts.leftoverThresholdMs ?? LEFTOVER_THRESHOLD_HOURS * 3_600_000;
  /**
   * @type {{
   *   root: string,
   *   rootRealpath: string | null,
   *   protectedRoot: (p: string) => boolean,
   *   blocked: string | null,
   *   guards: Record<string, { ok: true } | { ok: false, reason: string }>,
   *   remove: Array<{ path: string, kind: Kind, newestMs: number, bytes: number, thresholdMs?: number }>,
   *   young: Array<{ path: string, kind: Kind, newestMs: number, bytes: number, thresholdMs?: number }>,
   *   held: Array<{ path: string, kind: Kind }>,
   *   refused: Array<{ path: string, reason: string, kind?: Kind }>,
   *   errors: Array<{ path: string, code: string }>,
   *   fs: FsLike,
   * }}
   */
  const plan = {
    root, rootRealpath: null, protectedRoot: opts.protectedRoot ?? isInsideClaudeTemp,
    blocked: null, guards: {}, remove: [], young: [], held: [], refused: [], errors: [], fs,
  };
  const isProtected = plan.protectedRoot;
  const realpath = fs.realpath ?? ((p) => p);

  if (!Number.isFinite(opts.thresholdMs) || opts.thresholdMs <= 0) {
    plan.blocked = `neispravan prag starosti (${opts.thresholdMs} ms)`;
    return plan;
  }
  if (!Number.isFinite(leftoverThresholdMs) || leftoverThresholdMs <= 0) {
    plan.blocked = `neispravan prag starosti ostataka (${leftoverThresholdMs} ms)`;
    return plan;
  }
  if (isProtected(root)) {
    plan.blocked = 'korijen je pod Temp/claude (radni prostor sesija i worktreeovi runova), ne diram nista';
    return plan;
  }
  // Isto i po realpathu: korijen moze biti junction ili simbolicka veza u Temp/claude/**. Rezultat
  // se pamti (rootRealpath) da izvrsavanje moze ponovno izracunati i usporediti (TOCTOU izmedju
  // planiranja i izvrsenja: korijen zamijenjen vezom prema Temp/claude).
  try {
    const rrp = resolve(realpath(root));
    plan.rootRealpath = rrp;
    if (isProtected(rrp)) {
      plan.blocked = 'korijen je po realpathu pod Temp/claude (junction ili veza), ne diram nista';
      return plan;
    }
  } catch (err) {
    plan.blocked = `realpath korijena nije izmjeren (${errCode(err)}), nepoznato = ne brisi`;
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
      plan.refused.push({ path: full, reason: cls.refused, kind: cls.kind });
      continue;
    }
    if (!isDirectChildOf(root, full)) {
      plan.refused.push({ path: full, reason: 'putanja izvan korijena', kind: cls.kind });
      continue;
    }
    // Kandidat se mjeri SAM (lstat), ne po unosu direktorija: junction ili simbolicka veza se ne
    // brise ni ne slijedi, a ni kandidat koji po realpathu vodi u Temp/claude/**.
    const linkReason = candidateLinkReason(full, fs, realpath, isProtected);
    if (linkReason !== null) {
      plan.refused.push({ path: full, reason: linkReason, kind: cls.kind });
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
      plan.refused.push({ path: full, reason: `vise od ${maxEntries} unosa, preskoceno`, kind: cls.kind });
      continue;
    }
    if (m.status === 'symlink') {
      plan.refused.push({ path: full, reason: `sadrzi simbolicku vezu ${m.path}`, kind: cls.kind });
      continue;
    }
    const thresholdMs = LEFTOVER_KINDS.has(cls.kind) ? leftoverThresholdMs : opts.thresholdMs;
    const item = { path: full, kind: cls.kind, newestMs: m.newestMs, bytes: m.bytes, thresholdMs };
    if (opts.nowMs - m.newestMs >= thresholdMs) plan.remove.push(item);
    else plan.young.push(item);
  }
  return plan;
}

/**
 * Razlog zbog kojeg se kandidat ne smije dirati, ili `null`. Kvar mjerenja je razlog (nepoznato =
 * ne brisi).
 * @param {string} full
 * @param {FsLike} fs
 * @param {(p: string) => string} realpath
 * @param {(root: string) => boolean} isProtected
 * @returns {string | null}
 */
function candidateLinkReason(full, fs, realpath, isProtected) {
  try {
    if (fs.lstat(full).isSymbolicLink()) return LINK_REFUSED;
    if (isProtected(resolve(realpath(full)))) return 'kandidat je po realpathu pod Temp/claude, ne diram ga';
  } catch (err) {
    return `stanje kandidata nije izmjereno (${errCode(err)}), nepoznato = ne brisi`;
  }
  return null;
}

/**
 * Izvrsava plan. Svaka putanja se prije brisanja ponovno provjerava prema korijenu i ponovno
 * lstatom istog sustava kojim je plan izmjeren (kandidat zamijenjen junctionom
 * izmedju plana i brisanja se ne dira); greske se zbrajaju po kodu (EBUSY, EPERM, ...) i nikad ne
 * bacaju.
 *
 * Realpath korijena i svakog kandidata te izuzece Temp/claude ponovno se izracunavaju ovdje, tik
 * prije svakog rmSync (Codex krug 3, M3): planCleanup ih mjeri samo pri planiranju, a izmedju
 * planiranja i izvrsenja korijen ili kandidat mogu biti zamijenjeni vezom/junctionom prema
 * Temp/claude (radni prostor sesija). Nepoznato (realpath baci) znaci ne brisi.
 * @param {ReturnType<typeof planCleanup>} plan
 * @param {{ dryRun?: boolean, rm?: (p: string, o: { recursive: true, force: true }) => void }} [opts]
 */
export function executePlan(plan, opts = {}) {
  const rm = opts.rm ?? rmSync;
  const fs = plan.fs ?? REAL_FS;
  const realpath = fs.realpath ?? ((p) => p);
  const isProtected = plan.protectedRoot ?? isInsideClaudeTemp;
  const result = {
    dryRun: Boolean(opts.dryRun),
    removed: 0,
    removedBytes: 0,
    refused: [...plan.refused],
    errorCounts: /** @type {Record<string, number>} */ ({}),
  };
  for (const e of plan.errors) result.errorCounts[e.code] = (result.errorCounts[e.code] ?? 0) + 1;
  if (plan.blocked) return result;
  if (plan.remove.length === 0) return result;

  let rootRealpathNow;
  try {
    rootRealpathNow = resolve(realpath(plan.root));
  } catch (err) {
    result.refused.push({
      path: plan.root,
      reason: `realpath korijena nije izmjeren pri izvrsenju (${errCode(err)}), nepoznato = ne brisi`,
    });
    return result;
  }
  if (plan.rootRealpath != null && rootRealpathNow !== plan.rootRealpath) {
    result.refused.push({
      path: plan.root,
      reason: 'realpath korijena se promijenio izmedju planiranja i izvrsenja, ne diram nista',
    });
    return result;
  }
  if (isProtected(rootRealpathNow)) {
    result.refused.push({
      path: plan.root,
      reason: 'korijen je pri izvrsenju po realpathu pod Temp/claude, ne diram nista',
    });
    return result;
  }

  for (const item of plan.remove) {
    if (!isDirectChildOf(plan.root, item.path)) {
      result.refused.push({ path: item.path, reason: 'putanja izvan korijena' });
      continue;
    }
    // lstat kandidata: junction/veza podmetnuta izmedju plana i brisanja se ne dira ni ne slijedi.
    const linkReason = candidateLinkReason(item.path, fs, (p) => p, () => false);
    if (linkReason !== null) {
      result.refused.push({ path: item.path, reason: linkReason });
      continue;
    }
    let candRealpathNow;
    try {
      candRealpathNow = resolve(realpath(item.path));
    } catch (err) {
      result.refused.push({
        path: item.path,
        reason: `realpath kandidata nije izmjeren pri izvrsenju (${errCode(err)}), nepoznato = ne brisi`,
      });
      continue;
    }
    if (isProtected(candRealpathNow)) {
      result.refused.push({ path: item.path, reason: 'kandidat je pri izvrsenju po realpathu pod Temp/claude, ne diram ga' });
      continue;
    }
    if (!isDirectChildOf(rootRealpathNow, candRealpathNow)) {
      result.refused.push({ path: item.path, reason: 'kandidat pri izvrsenju po realpathu nije izravno dijete korijena' });
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
    leftoverThresholdMs: leftoverHours(args.olderThanHours) * 3_600_000,
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
  log(`${tag} ${root}, prag ${args.olderThanHours} h (vitest, word-replica), ${leftoverHours(args.olderThanHours)} h (ostaci testova i alata)`);
  for (const kind of GUARD_KINDS) {
    const g = plan.guards[kind];
    if (g && !g.ok) log(`${tag} ${kind}: ne brisem, ${g.reason}`);
  }
  log(`${tag} ${verb}: ${res.removed} mapa/datoteka, ${mb(res.removedBytes)} MB`);
  log(`${tag} po kategoriji: ${countByKind(plan.remove)}`);
  log(`${tag} preskoceno kao mlade: ${plan.young.length} mapa, ${mb(youngBytes)} MB`);
  log(`${tag} zadrzano zbog zivih procesa: ${plan.held.length} mapa`);
  log(`${tag} odbijeno: ${res.refused.length}`);
  for (const r of res.refused.slice(0, 10)) log(`${tag}   ${basename(r.path)}: ${r.reason}`);
  log(`${tag} greske: ${errs}`);
  if (args.dryRun) for (const line of describePlan(plan, deps.nowMs)) log(`${tag}   ${line}`);
}

/**
 * Prag ostataka u satima: 24 h, ili vise ako je `--older-than-hours` vise.
 * @param {number} olderThanHours
 */
export function leftoverHours(olderThanHours) {
  return Math.max(LEFTOVER_THRESHOLD_HOURS, olderThanHours);
}

/** @param {Array<{ kind: Kind }>} items */
function countByKind(items) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'nista';
}

const hours = (ms) => (ms / 3_600_000).toFixed(1);

/**
 * Jedan redak po stavci plana: odluka, kategorija, ime i razlog. Dry-run ga ispisuje za SVAKU
 * stavku, da se prije stvarnog brisanja vidi zasto je sto odabrano ili ostavljeno.
 * @param {ReturnType<typeof planCleanup>} plan
 * @param {number} nowMs
 * @returns {string[]}
 */
export function describePlan(plan, nowMs) {
  const out = [];
  for (const i of plan.remove) {
    const thr = i.thresholdMs ?? 0;
    out.push(`brisem [${i.kind}] ${basename(i.path)}: najnovija datoteka stara ${hours(nowMs - i.newestMs)} h, prag ${hours(thr)} h`);
  }
  for (const i of plan.young) {
    const thr = i.thresholdMs ?? 0;
    out.push(`ostavljam [${i.kind}] ${basename(i.path)}: mlade od praga (${hours(nowMs - i.newestMs)} h < ${hours(thr)} h)`);
  }
  for (const i of plan.held) {
    const g = plan.guards[i.kind];
    const reason = g && !g.ok ? g.reason.slice(0, 120) : 'gard procesa';
    out.push(`zadrzavam [${i.kind}] ${basename(i.path)}: gard procesa (${reason})`);
  }
  for (const r of plan.refused) {
    out.push(`odbijam [${r.kind ?? 'nepoznato'}] ${basename(r.path)}: ${r.reason}`);
  }
  for (const e of plan.errors) out.push(`greska ${basename(e.path)}: ${e.code}`);
  return out;
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
