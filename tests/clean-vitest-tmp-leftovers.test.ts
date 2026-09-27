/**
 * scripts/clean-vitest-tmp.mjs, stavka G (odluka vlasnika 2026-09-26): ostaci testova i alata koji
 * nisu Vitest (lekta-* mkdtemp mape, lekta-oracle-*, playwright_*dev_profile-*). Kategorija
 * tmp*.docx je izbacena u Codex krugu 2 (B2): oblik imena ne dokazuje vlasnistvo.
 *
 * Kao i tests/clean-vitest-tmp.test.ts: sve se mjeri nad `mkdtemp` korijenom, NIKAD nad stvarnim
 * os.tmpdir(), a popis procesa se ubrizgava. Imena fixtura su stvarni oblici izmjereni u %TEMP%
 * 2026-09-27 (Python tempfile, Node mkdtemp, Playwright profil).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LEFTOVER_THRESHOLD_HOURS,
  executePlan,
  isInsideClaudeTemp,
  leftoverHours,
  planCleanup,
  runCli,
} from '../scripts/clean-vitest-tmp.mjs';

type Proc = { pid: number; ppid: number | null; name?: string | null; command: string | null };

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const SELF = 4242;
const QUIET: Proc[] = [{ pid: 7, ppid: 1, name: 'node.exe', command: 'node npm-cli.js run clean:tmp' }];
const VITEST_CMD = '"node" "C:\\Users\\PC\\Desktop\\Lekta\\node_modules\\.bin\\\\..\\vitest\\vitest.mjs" run';
const PLAYWRIGHT_TEST_SERVER =
  '"C:\\Program Files\\nodejs\\node.EXE" node_modules\\@playwright\\test\\cli.js test-server -c playwright.config.ts';

/** Stvarni oblici imena po kategoriji (izmjereno u %TEMP% 2026-09-27). */
const CASES = [
  { kind: 'lekta-test', name: 'lekta-runner-publish-0aZUKz', file: false },
  { kind: 'lekta-test', name: 'lekta-release-gate-WrongSigner-3003h6', file: false },
  { kind: 'lekta-test', name: 'lekta-release-bad-pkcs8-1tyrvW', file: false },
  { kind: 'lekta-test', name: 'lekta-repair-secrets-GyxHHM', file: false },
  { kind: 'lekta-oracle', name: 'lekta-oracle-k2j_8x0q', file: false },
  { kind: 'playwright-profile', name: 'playwright_chromiumdev_profile-3gUVVg', file: false },
] as const;

/** Zivi pisac po kategoriji: proces koji mora zadrzati TU kategoriju. */
const LIVE_WRITER: Record<string, Proc> = {
  'lekta-test': { pid: 802, ppid: 1, name: 'node.exe', command: VITEST_CMD },
  'lekta-oracle': { pid: 803, ppid: 1, name: 'python.exe', command: 'python scripts/corpus-oracle.py --all' },
  'playwright-profile': {
    pid: 804,
    ppid: 1,
    name: 'chrome.exe',
    command: 'chrome.exe --headless --user-data-dir=C:\\Users\\PC\\AppData\\Local\\Temp\\playwright_chromiumdev_profile-3gUVVg',
  },
};

let root = '';

function setTime(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000);
}

/** Stavka `name` u `parent`; sve (i sadrzaj mape) postavljeno na `ageMs` unatrag. */
function make(parent: string, name: string, file: boolean, ageMs: number): string {
  const full = join(parent, name);
  if (file) {
    writeFileSync(full, 'PK docx');
  } else {
    mkdirSync(join(full, 'Default'), { recursive: true });
    writeFileSync(join(full, 'Default', 'Preferences'), '{}');
    setTime(join(full, 'Default', 'Preferences'), NOW - ageMs);
    setTime(join(full, 'Default'), NOW - ageMs);
  }
  setTime(full, NOW - ageMs);
  return full;
}

function plan(listProcesses: () => Proc[] | null = () => QUIET, r = root, extra: Record<string, unknown> = {}) {
  return planCleanup({ root: r, nowMs: NOW, thresholdMs: 2 * HOUR, listProcesses, selfPid: SELF, ...extra });
}

/** Sve putanje u stablu (relativno prema `base`), za brojanje prije/poslije. */
function walk(base: string, dir = base, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    out.push(relative(base, full));
    if (e.isDirectory()) walk(base, full, out);
  }
  return out;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lekta-clean-tmp-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('clean-vitest-tmp stavka G: sto se brise', () => {
  it('prag je imenovana konstanta od 24 h, a --older-than-hours ga moze samo povisiti', () => {
    expect(LEFTOVER_THRESHOLD_HOURS).toBe(24);
    expect(leftoverHours(2)).toBe(24);
    expect(leftoverHours(1)).toBe(24);
    expect(leftoverHours(48)).toBe(48);
  });

  it.each(CASES)('brise staru stavku $name (kategorija $kind, najnovija datoteka 30 h)', ({ kind, name, file }) => {
    const full = make(root, name, file, 30 * HOUR);
    const p = plan();
    expect(p.blocked).toBeNull();
    expect(p.remove.map((i) => [i.path, i.kind])).toEqual([[full, kind]]);
    const res = executePlan(p);
    expect(res.removed).toBe(1);
    expect(existsSync(full)).toBe(false);
  });

  it.each(CASES)('ostavlja svjezu stavku $name (3 h: starija od 2 h Vitest praga, mlada od 24 h)', ({ name, file }) => {
    const full = make(root, name, file, 3 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    expect(p.young.map((i) => i.path)).toEqual([full]);
    executePlan(p);
    expect(existsSync(full)).toBe(true);
  });

  it.each(CASES)('ziv pisac kategorije $kind zadrzava staru stavku $name', ({ kind, name, file }) => {
    const full = make(root, name, file, 30 * HOUR);
    const live = LIVE_WRITER[kind];
    if (!live) throw new Error(`nema zivog pisca za ${kind}`);
    const p = plan(() => [...QUIET, live]);
    expect(p.guards[kind]).toMatchObject({ ok: false });
    expect(p.remove).toEqual([]);
    expect(p.held.map((h) => h.path)).toEqual([full]);
    executePlan(p);
    expect(existsSync(full)).toBe(true);
    // Baseline: ista stavka uz mirno stanje ide u brisanje, pa je gard (a ne fixtura) ono sto je cuva.
    expect(plan().remove.map((i) => i.path)).toEqual([full]);
  });

  it('starost mape je najnovija datoteka unutra, ne mtime mape (klasa ulaza dokazana)', () => {
    const full = make(root, 'playwright_chromiumdev_profile-AGplbU', false, 40 * HOUR);
    const fresh = join(full, 'Default', 'Cookies');
    writeFileSync(fresh, 'x');
    setTime(fresh, NOW - 60_000);
    setTime(join(full, 'Default'), NOW - 40 * HOUR);
    setTime(full, NOW - 40 * HOUR);
    // Generator proizvodi klasu ulaza: mapa i podmapa stare, jedna datoteka svjeza.
    expect(NOW - statSync(full).mtimeMs).toBeGreaterThanOrEqual(24 * HOUR);
    expect(NOW - statSync(fresh).mtimeMs).toBeLessThan(24 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    expect(p.young.map((i) => i.path)).toEqual([full]);
    executePlan(p);
    expect(existsSync(fresh)).toBe(true);
  });

  it('--older-than-hours=48 povisuje prag ostataka, =1 ga ne spusta ispod 24 h', () => {
    const full = make(root, 'lekta-runner-publish-LxVaK7', false, 30 * HOUR);
    expect(plan(() => QUIET, root, { leftoverThresholdMs: leftoverHours(48) * HOUR }).remove).toEqual([]);
    const pNisko = plan(() => QUIET, root, { leftoverThresholdMs: leftoverHours(1) * HOUR });
    expect(pNisko.remove.map((i) => i.path)).toEqual([full]);
    const svjeze = make(root, 'lekta-runner-publish-MCpplg', false, 5 * HOUR);
    expect(plan(() => QUIET, root, { leftoverThresholdMs: leftoverHours(1) * HOUR }).young.map((i) => i.path)).toEqual([svjeze]);
  });
});

describe('clean-vitest-tmp stavka G: sto se NE dira', () => {
  it('Codex krug 2 (B2): tudji tmp*.docx u korijenu se ne dira (oblik imena ne dokazuje vlasnistvo)', async () => {
    // Stvarni oblici Python `tempfile.mkstemp(suffix=".docx")`, stari 90 h, bez ijednog zivog pisca.
    const tudji = ['tmp0a6bn673.docx', 'tmp4segemrf.docx', 'tmpzzzzzzzz.docx'].map((n) => make(root, n, true, 90 * HOUR));
    const kontrola = make(root, 'lekta-runner-publish-0aZUKz', false, 90 * HOUR);
    const p = plan();
    expect(p.remove.map((i) => i.path)).toEqual([kontrola]);
    const lines: string[] = [];
    runCli({ argv: [], root, nowMs: NOW, listProcesses: () => QUIET, selfPid: SELF, log: (l: string) => lines.push(l) });
    for (const t of tudji) expect(existsSync(t)).toBe(true);
    expect(existsSync(kontrola)).toBe(false);
    expect(lines.join('\n')).not.toMatch(/tmp-docx/);
    const mod: Record<string, unknown> = await import('../scripts/clean-vitest-tmp.mjs');
    expect(Object.keys(mod).filter((k) => /DOCX/i.test(k))).toEqual([]);
    expect([...(mod.LEFTOVER_KINDS as Set<string>)].sort()).toEqual(['lekta-oracle', 'lekta-test', 'playwright-profile']);
    expect(mod.GUARD_KINDS).not.toContain('tmp-docx');
  });

  it('ne dira rucne lekta-* datoteke i mape bez poznatog prefiksa ili mkdtemp sufiksa', () => {
    const keep = [
      make(root, 'lekta-t21-prod-policies.sql', true, 90 * HOUR),
      make(root, 'lekta-ai-evidence-check-20260925.log', true, 90 * HOUR),
      make(root, 'lekta-gradri-pdf-check', false, 90 * HOUR),
      make(root, 'lekta-projverify-HkeZmB', false, 90 * HOUR),
      make(root, 'lekta-release-gate-valid-XY', false, 90 * HOUR),
      // Oblik kategorije, ali krivi tip unosa: datoteka umjesto mape i mapa umjesto datoteke.
      make(root, 'lekta-release-gate-valid-0aZUKz', true, 90 * HOUR),
      make(root, 'tmpabcdefgh.docx', false, 90 * HOUR),
      make(root, 'tmpabc.docx', true, 90 * HOUR),
      make(root, 'playwright_chromiumdev_profile-3gUVVgx', false, 90 * HOUR),
    ];
    const p = plan();
    expect(p.remove).toEqual([]);
    executePlan(p);
    for (const k of keep) expect(existsSync(k)).toBe(true);
  });

  it('Playwright test-server iz VS Codea (node, bez profila u retku) NE zadrzava profile', () => {
    const full = make(root, 'playwright_chromiumdev_profile-B0iivQ', false, 30 * HOUR);
    const pw: Proc[] = [...QUIET, { pid: 3176, ppid: 1, name: 'node.exe', command: PLAYWRIGHT_TEST_SERVER }];
    const p = plan(() => pw);
    expect(p.guards['playwright-profile']).toEqual({ ok: true });
    expect(p.remove.map((i) => i.path)).toEqual([full]);
  });

  it('gard je po vrsti: ziv vitest zadrzava lekta-test mape, ne i lekta-oracle ni Playwright profil', () => {
    const lekta = make(root, 'lekta-release-rsa-private-5FOfuf', false, 30 * HOUR);
    const oracle = make(root, 'lekta-oracle-4segemrf', false, 30 * HOUR);
    const prof = make(root, 'playwright_chromiumdev_profile-JYnmWk', false, 30 * HOUR);
    const p = plan(() => [...QUIET, { pid: 900, ppid: 1, name: 'node.exe', command: VITEST_CMD }]);
    expect(p.held.map((h) => h.path)).toEqual([lekta]);
    expect(p.remove.map((i) => i.path).sort()).toEqual([oracle, prof].sort());
  });

  it('necitljiv naredbeni redak pisca iste vrste znaci nepoznato, dakle ne brisi', () => {
    const full = make(root, 'lekta-oracle-abcd1234', false, 30 * HOUR);
    const p = plan(() => [...QUIET, { pid: 905, ppid: 1, name: 'python.exe', command: null }]);
    expect(p.held.map((h) => h.path)).toEqual([full]);
    executePlan(p);
    expect(existsSync(full)).toBe(true);
  });

  it('nista pod <root>/claude/** ni dublje od izravne djece korijena se ne brise (brojanje prije/poslije)', () => {
    // Direktna djeca koja SE brisu (kontrola da run stvarno radi).
    const obrisati = CASES.map(({ name, file }) => make(root, name, file, 30 * HOUR));
    // Temp/claude/**: radni prostor sesija i worktreeovi runova, s imenima koja odgovaraju kategorijama.
    const claude = join(root, 'claude');
    const wf = join(claude, 'lekta-wf', 'wf-g-clean-temp');
    mkdirSync(wf, { recursive: true });
    for (const { name, file } of CASES) {
      make(claude, name, file, 90 * HOUR);
      make(wf, name, file, 90 * HOUR);
    }
    // Ugnijezdjene stavke izvan claude/: nisu izravna djeca korijena.
    const nested = join(root, 'neka-tudja-mapa');
    mkdirSync(nested);
    for (const { name, file } of CASES) make(nested, name, file, 90 * HOUR);
    for (const d of [wf, join(claude, 'lekta-wf'), claude, nested]) setTime(d, NOW - 90 * HOUR);

    const prije = walk(root);
    const zasticeno = prije.filter((p) => p.startsWith('claude') || p.startsWith('neka-tudja-mapa'));
    expect(zasticeno.length).toBeGreaterThan(2 * CASES.length * 2);

    const res = executePlan(plan());
    expect(res.removed).toBe(CASES.length);
    for (const o of obrisati) expect(existsSync(o)).toBe(false);

    const poslije = walk(root);
    const zasticenoPoslije = poslije.filter((p) => p.startsWith('claude') || p.startsWith('neka-tudja-mapa'));
    expect(zasticenoPoslije.sort()).toEqual(zasticeno.sort());
    // Nestalo je tocno ono sto je bilo pod obrisanim izravnim djecom, nista drugo.
    const nestalo = prije.filter((p) => !poslije.includes(p));
    const imena = new Set<string>(CASES.map((c) => c.name));
    expect(nestalo.every((p) => imena.has(p.split(/[\\/]/)[0] ?? ''))).toBe(true);
  });

  it('korijen pod Temp/claude/** se uopce ne cisti, ni stare stavke ni Vitest mape', () => {
    const sesija = join(root, 'Temp', 'claude', 'lekta-wf');
    mkdirSync(sesija, { recursive: true });
    for (const { name, file } of CASES) make(sesija, name, file, 90 * HOUR);
    mkdirSync(join(sesija, 'abcdefghijABCDEFGHIJ_', 'web'), { recursive: true });
    const prije = walk(root);

    const p = plan(() => QUIET, sesija);
    expect(p.blocked).toMatch(/Temp\/claude/);
    const res = executePlan(p);
    expect(res.removed).toBe(0);
    expect(walk(root).sort()).toEqual(prije.sort());

    // Baseline: isti sadrzaj u korijenu izvan Temp/claude se brise, pa je zastita korijena ono sto cuva.
    const izvan = join(root, 'Temp', 'drugo');
    mkdirSync(izvan, { recursive: true });
    for (const { name, file } of CASES) make(izvan, name, file, 90 * HOUR);
    expect(plan(() => QUIET, izvan).remove).toHaveLength(CASES.length);
  });

  it('isInsideClaudeTemp prepoznaje Temp/claude i tmp/claude, ne i slicna imena', () => {
    expect(isInsideClaudeTemp('C:\\Users\\PC\\AppData\\Local\\Temp\\claude\\lekta-wf')).toBe(true);
    expect(isInsideClaudeTemp('C:\\Users\\PC\\AppData\\Local\\Temp\\claude')).toBe(true);
    expect(isInsideClaudeTemp('/tmp/claude/sesija')).toBe(true);
    expect(isInsideClaudeTemp('C:\\Users\\PC\\AppData\\Local\\Temp')).toBe(false);
    expect(isInsideClaudeTemp('C:\\Users\\PC\\AppData\\Local\\Temp\\claudex')).toBe(false);
    expect(isInsideClaudeTemp('C:\\Users\\PC\\Desktop\\claude')).toBe(false);
  });
});

describe('clean-vitest-tmp stavka G: dry-run ispis', () => {
  it('dry-run ispisuje kategoriju i razlog za SVAKU stavku i nista ne brise', () => {
    const stare = CASES.map(({ name, file }) => make(root, name, file, 30 * HOUR));
    const mlada = make(root, 'lekta-runner-publish-zzzzzz', false, 3 * HOUR);
    const lines: string[] = [];
    const rmCalls: string[] = [];
    runCli({
      argv: ['--dry-run'],
      root,
      nowMs: NOW,
      listProcesses: () => QUIET,
      selfPid: SELF,
      log: (l: string) => lines.push(l),
      rm: (p: string) => { rmCalls.push(p); },
    });
    const out = lines.join('\n').replace(/\r/g, '');
    expect(out).toContain(`bi se obrisalo (dry-run): ${CASES.length} mapa`);
    expect(out).toMatch(/po kategoriji: .*lekta-test=4/);
    // Codex krug 2 (B2): kategorija tmp-docx ne postoji, pa je dry-run ne navodi ni u jednom retku.
    expect(out).not.toMatch(/tmp-docx/);
    for (const { kind, name } of CASES) {
      expect(out).toContain(`brisem [${kind}] ${name}: najnovija datoteka stara 30.0 h, prag 24.0 h`);
    }
    expect(out).toContain('ostavljam [lekta-test] lekta-runner-publish-zzzzzz: mlade od praga (3.0 h < 24.0 h)');
    expect(rmCalls).toEqual([]);
    for (const s of [...stare, mlada]) expect(existsSync(s)).toBe(true);
  });

  it('dry-run uz zivog pisca ispisuje zadrzanu stavku s kategorijom i razlogom', () => {
    make(root, 'lekta-oracle-abcd1234', false, 30 * HOUR);
    const lines: string[] = [];
    runCli({
      argv: ['--dry-run'],
      root,
      nowMs: NOW,
      listProcesses: () => [...QUIET, LIVE_WRITER['lekta-oracle'] as Proc],
      selfPid: SELF,
      log: (l: string) => lines.push(l),
    });
    const out = lines.join('\n').replace(/\r/g, '');
    expect(out).toMatch(/zadrzavam \[lekta-oracle\] lekta-oracle-abcd1234: gard procesa \(radi 1 corpus-oracle proces/);
  });

  it('stvarni run (bez dry-run) brise iste stavke', () => {
    const stare = CASES.map(({ name, file }) => make(root, name, file, 30 * HOUR));
    const lines: string[] = [];
    runCli({ argv: [], root, nowMs: NOW, listProcesses: () => QUIET, selfPid: SELF, log: (l: string) => lines.push(l) });
    expect(lines.join('\n')).toContain(`obrisano: ${CASES.length} mapa`);
    for (const s of stare) expect(existsSync(s)).toBe(false);
  });

  it('idempotentno: drugi prolaz nad istim korijenom je no-op', () => {
    for (const { name, file } of CASES) make(root, name, file, 30 * HOUR);
    const svjeza = make(root, 'lekta-runner-publish-Fr35hA', false, 3 * HOUR);
    const prvi = executePlan(plan());
    expect(prvi.removed).toBe(CASES.length);
    const nakonPrvog = walk(root).sort();
    const drugiPlan = plan();
    const drugi = executePlan(drugiPlan);
    expect(drugiPlan.remove).toEqual([]);
    expect(drugi.removed).toBe(0);
    expect(walk(root).sort()).toEqual(nakonPrvog);
    expect(existsSync(svjeza)).toBe(true);
  });
});
