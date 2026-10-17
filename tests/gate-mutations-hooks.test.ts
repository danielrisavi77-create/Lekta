// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compactOutputProblems, compactSettingsProblems, missingHookRegistrations } from './helpers/hook-discipline';

/**
 * COMPACT-STANJE GARD (Stednja konteksta, odluka vlasnika 2026-10-17). Mutira se KOPIJA izvora
 * `scripts/hooks/compact-stanje.mjs` u privremenoj mapi (uz `hook-input.mjs` koji uvozi), nikad
 * izvor u repou. Tvrdnja: datoteka stanja od 60 redaka ulazi u kontekst s najvise 40 redaka.
 */
const HOOKS = resolve('scripts/hooks');
const izvor = readFileSync(join(HOOKS, 'compact-stanje.mjs'), 'utf8').replace(/\r\n/g, '\n');
const root = mkdtempSync(join(tmpdir(), 'lekta-compact-mut-'));
const SESIJA = 'mutacija-compact';
const redci = Array.from({ length: 60 }, (_, i) => `mutacijski redak ${i + 1}`);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Izvrsi (mutiranu) kopiju skripte nad stanjem od 60 redaka i vrati probleme izlaza. */
function problemiKopije(src: string, ime: string): string[] {
  const dir = join(root, ime);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(HOOKS, 'hook-input.mjs'), join(dir, 'hook-input.mjs'));
  writeFileSync(join(dir, 'compact-stanje.mjs'), src);
  const stanjePath = join(dir, 'STANJE.md');
  writeFileSync(stanjePath, redci.join('\n'));
  const env: NodeJS.ProcessEnv = { ...process.env, LEKTA_STANJE: stanjePath };
  const r = spawnSync(process.execPath, [join(dir, 'compact-stanje.mjs')], {
    input: JSON.stringify({ session_id: SESIJA }), encoding: 'utf8', env, timeout: 10_000,
  });
  if (r.status !== 0) return [`izlaz ${String(r.status)}`];
  return compactOutputProblems(r.stdout, redci);
}

const mutiraj = (from: string, to: string): string => {
  const m = izvor.replace(from, to);
  expect(m, from).not.toBe(izvor);
  return m;
};

describe('mutacije: compact-stanje hook (ogranicenje redaka)', () => {
  it('BASELINE: nemutirana kopija i stvarna skripta su ciste', () => {
    expect(problemiKopije(izvor, 'baseline')).toEqual([]);
    const stanjePath = join(root, 'stvarno.md');
    writeFileSync(stanjePath, redci.join('\n'));
    const r = spawnSync(process.execPath, [join(HOOKS, 'compact-stanje.mjs')], {
      input: '{}', encoding: 'utf8', env: { ...process.env, LEKTA_STANJE: stanjePath }, timeout: 10_000,
    });
    expect(r.status).toBe(0);
    expect(compactOutputProblems(r.stdout, redci)).toEqual([]);
  });

  it('mutant: uklonjeno ogranicenje redaka se hvata', () => {
    const m = mutiraj('const prikaz = redci.slice(0, MAX_REDAKA);', 'const prikaz = redci;');
    expect(problemiKopije(m, 'bez-limita')).toEqual(['previse redaka stanja: 60']);
  });

  it('mutant: granica podignuta na 400 se hvata', () => {
    const m = mutiraj('export const MAX_REDAKA = 40;', 'export const MAX_REDAKA = 400;');
    expect(problemiKopije(m, 'limit-400')).toEqual(['previse redaka stanja: 60']);
  });

  it('mutant: bez naslova STANJE SESIJE se hvata', () => {
    const m = mutiraj('return [`${NASLOV} (${found.path}):`, ...prikaz, ...kraj]', 'return [...prikaz, ...kraj]');
    expect(problemiKopije(m, 'bez-naslova')).toEqual(['nema naslova STANJE SESIJE']);
  });

  it('mutant: krivi hookEventName se hvata', () => {
    const m = mutiraj("hookEventName: 'SessionStart'", "hookEventName: 'PostCompact'");
    expect(problemiKopije(m, 'krivi-event')).toEqual(['hookEventName nije SessionStart']);
  });

  it('mutant: stanje se ne ubacuje (uvijek uputa) se hvata', () => {
    const m = mutiraj('context = formatStanje(findStanje(stanjeCandidates(input, deps), deps.read));', 'context = UPUTA;');
    expect(problemiKopije(m, 'uvijek-uputa')).toEqual(['stanje nije ubaceno']);
  });
});

/**
 * REGISTRACIJA COMPACT HOOKA (Stednja konteksta). Mutira se PARSIRANA kopija stvarnog
 * `.claude/settings.json`, nikad datoteka. Prazan matcher pokriva i start sesije, pa ga gard mora
 * odbiti iako ga `missingHookRegistrations` (matcherCovers) propusta.
 */
type Postavke = {
  env?: Record<string, unknown>;
  hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type?: string; command?: string }> }>>;
};
const postavke = (): Postavke => JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8')) as Postavke;
const compactUnos = (p: Postavke) => {
  const unos = p.hooks.SessionStart.find((e) => e.hooks.some((h) => String(h.command).includes('compact-stanje.mjs')));
  if (!unos) throw new Error('compact unos nije u stvarnim postavkama');
  return unos;
};

describe('mutacije: registracija compact hooka i prozora u settings.json', () => {
  it('BASELINE: stvarne postavke su ciste', () => {
    const p = postavke();
    expect(compactSettingsProblems(p)).toEqual([]);
    expect(missingHookRegistrations(p)).toEqual([]);
  });

  it('mutant: uklonjen compact unos se hvata (oba garda)', () => {
    const p = postavke();
    const unos = compactUnos(p);
    p.hooks.SessionStart = p.hooks.SessionStart.filter((e) => e !== unos);
    expect(compactSettingsProblems(p)).toEqual(['SessionStart nema compact-stanje hook']);
    expect(missingHookRegistrations(p)).toContainEqual(expect.stringContaining('SessionStart[compact]'));
  });

  it('mutant: uklonjen matcher compact se hvata (iako ga matcherCovers propusta)', () => {
    const p = postavke();
    delete compactUnos(p).matcher;
    expect(missingHookRegistrations(p)).toEqual([]);
    expect(compactSettingsProblems(p)).toEqual(['compact-stanje hook nije pod matcherom compact: null']);
  });

  it('mutant: matcher startup umjesto compact se hvata', () => {
    const p = postavke();
    compactUnos(p).matcher = 'startup';
    expect(compactSettingsProblems(p)).toEqual(['compact-stanje hook nije pod matcherom compact: "startup"']);
    expect(missingHookRegistrations(p)).toContainEqual(expect.stringContaining('SessionStart[compact]'));
  });

  it('mutant: relativna naredba umjesto sidrene se hvata', () => {
    const p = postavke();
    compactUnos(p).hooks[0].command = 'node scripts/hooks/compact-stanje.mjs';
    expect(compactSettingsProblems(p)).toEqual(['SessionStart nema compact-stanje hook']);
  });

  it('mutant: uklonjen env ili krivi prozor se hvata', () => {
    const bez = postavke();
    delete bez.env;
    expect(compactSettingsProblems(bez)).toEqual(['env.CLAUDE_CODE_AUTO_COMPACT_WINDOW: null']);
    const broj = postavke();
    broj.env = { ...broj.env, CLAUDE_CODE_AUTO_COMPACT_WINDOW: 400000 };
    expect(compactSettingsProblems(broj)).toEqual(['env.CLAUDE_CODE_AUTO_COMPACT_WINDOW: 400000']);
    const veci = postavke();
    veci.env = { ...veci.env, CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000' };
    expect(compactSettingsProblems(veci)).toEqual(['env.CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000"']);
  });
});
