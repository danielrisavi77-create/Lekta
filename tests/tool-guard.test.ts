import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { judgeCommand, stanjeStabla } from '../scripts/agents/tool-guard.mjs';
import { supabaseMcpGuardProblems, toolGuardMatcherProblems } from './helpers/supabase-mcp-guard';

/**
 * Tablica dopusteno/zabranjeno za deterministicki PreToolUse gard (`scripts/agents/tool-guard.mjs`).
 * Gard postoji zato sto uputa u promptu ("nikad ne koristi git add -A") kosta tokene svaki put i
 * ne drzi 100%; hook drzi jer ODBIJA naredbu prije izvrsenja (exit 2), bez obzira sto model pokusa.
 */
describe('judgeCommand - git add', () => {
  it('blokira git add -A', () => {
    const r = judgeCommand('Bash', 'git add -A');
    expect(r.allow).toBe(false);
  });

  it('blokira git add .', () => {
    const r = judgeCommand('Bash', 'git add .');
    expect(r.allow).toBe(false);
  });

  it('blokira git add --all', () => {
    const r = judgeCommand('Bash', 'git add --all');
    expect(r.allow).toBe(false);
  });

  it('dopusta git add s tocnim putanjama', () => {
    const r = judgeCommand('Bash', 'git add src/foo.ts tests/foo.test.ts');
    expect(r.allow).toBe(true);
  });
});

describe('judgeCommand - git commit', () => {
  it('blokira git commit --amend', () => {
    const r = judgeCommand('Bash', 'git commit --amend -m "x"');
    expect(r.allow).toBe(false);
  });

  it('blokira git commit -a bez --only', () => {
    const r = judgeCommand('Bash', 'git commit -a -m "x"');
    expect(r.allow).toBe(false);
  });

  it('blokira git commit --all bez --only', () => {
    const r = judgeCommand('Bash', 'git commit --all -m "x"');
    expect(r.allow).toBe(false);
  });

  it('dopusta git commit --only', () => {
    const r = judgeCommand('Bash', 'git commit --only src/foo.ts -F msg.txt');
    expect(r.allow).toBe(true);
  });

  it('blokira obican git commit -m bez --only (uzima cijeli indeks)', () => {
    const r = judgeCommand('Bash', 'git commit -m "x"', undefined, { ispitaj: DIJELJENO });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain('`git commit` bez `--only`');
  });

  it('blokira git add -u i --update', () => {
    expect(judgeCommand('Bash', 'git add -u').allow).toBe(false);
    expect(judgeCommand('Bash', 'git add --update').allow).toBe(false);
  });
});

/**
 * Preneseno iz `~/.claude/hooks/lekta-git-guard.mjs` (2026-10-08). Stanje stabla se podmece kroz
 * `ispitaj`, pa presuda ne ovisi o tome gdje test radi; dvije provjere idu nad STVARNIM gitom.
 */
const DIJELJENO = () => ({ izoliran: false, spajanje: false });
const DIJELJENO_U_SPAJANJU = () => ({ izoliran: false, spajanje: true });
const WORKTREE = () => ({ izoliran: true, spajanje: false });
const WORKTREE_U_SPAJANJU = () => ({ izoliran: true, spajanje: true });
const NEPOZNATO = () => null;

describe('judgeCommand - commit cijelog indeksa i dovrsenje spajanja', () => {
  const dopusteno: Array<[string, string, () => { izoliran: boolean; spajanje: boolean } | null, boolean?]> = [
    ['merge --continue u vlastitom worktreeju', 'git merge --continue', WORKTREE],
    ['rebase --continue u vlastitom worktreeju', 'git rebase --continue', WORKTREE],
    ['goli commit tijekom spajanja u worktreeju', 'git commit --no-edit', WORKTREE_U_SPAJANJU],
    ['merge --continue u cloud klonu', 'git merge --continue', DIJELJENO, true],
    ['goli commit tijekom spajanja u cloud klonu', 'git commit --no-edit', DIJELJENO_U_SPAJANJU, true],
    ['commit s --only i nepoznatim stanjem', 'git commit --only a.ts -m x', NEPOZNATO],
  ];
  const blokirano: Array<[string, string, () => { izoliran: boolean; spajanje: boolean } | null, boolean?]> = [
    ['goli commit u worktreeju BEZ spajanja', 'git commit -m x', WORKTREE],
    ['goli commit u cloud klonu BEZ spajanja', 'git commit -m x', DIJELJENO, true],
    ['merge --continue u dijeljenom stablu', 'git merge --continue', DIJELJENO_U_SPAJANJU],
    ['cherry-pick --continue u dijeljenom stablu', 'git cherry-pick --continue', DIJELJENO_U_SPAJANJU],
    ['goli commit tijekom spajanja u dijeljenom stablu', 'git commit --no-edit', DIJELJENO_U_SPAJANJU],
    ['stanje se ne moze utvrditi', 'git commit -m x', NEPOZNATO],
    ['goli commit iza drugog dijela lanca', 'git status && git commit -m x', DIJELJENO],
    ['goli commit s globalnom opcijom -C', 'git -C /shared commit -m x', DIJELJENO],
    ['merge --continue s globalnim -c', 'git -c core.editor=true merge --continue', DIJELJENO_U_SPAJANJU],
    ['am --continue u dijeljenom stablu', 'git am --continue', DIJELJENO_U_SPAJANJU],
    ['am --resolved u dijeljenom stablu', 'git am --resolved', DIJELJENO_U_SPAJANJU],
  ];

  for (const [ime, naredba, ispitaj, udaljeno] of dopusteno) {
    it(`dopusteno: ${ime}`, () => {
      expect(judgeCommand('Bash', naredba, undefined, { cwd: '/x', ispitaj, udaljeno }).allow).toBe(true);
    });
  }
  for (const [ime, naredba, ispitaj, udaljeno] of blokirano) {
    it(`blokirano: ${ime}`, () => {
      expect(judgeCommand('Bash', naredba, undefined, { cwd: '/x', ispitaj, udaljeno }).allow).toBe(false);
    });
  }

  it('poruka tijekom spajanja NE upucuje na --only, jer ga git odbija', () => {
    const r = judgeCommand('Bash', 'git commit --no-edit', undefined, { ispitaj: DIJELJENO_U_SPAJANJU });
    expect(r.reason).toContain('worktree');
    expect(r.reason).not.toMatch(/Koristi `git commit --only/);
  });

  it('poruka commita koja spominje `git commit` nije naredba', () => {
    const naredba = 'git commit --only a.ts -m "prije je git commit uzimao indeks"';
    expect(judgeCommand('Bash', naredba, undefined, { ispitaj: DIJELJENO }).allow).toBe(true);
  });

  it('vodeci `cd` odreduje gdje git STVARNO radi', () => {
    const vidjeno: string[] = [];
    const ispitaj = (dir: string) => {
      vidjeno.push(dir);
      return WORKTREE_U_SPAJANJU();
    };
    judgeCommand('Bash', 'cd /a/b && git commit --no-edit', undefined, { cwd: '/session', ispitaj });
    judgeCommand('Bash', 'git commit --no-edit', undefined, { cwd: '/session', ispitaj });
    judgeCommand('Bash', 'git -C /c/d commit --no-edit', undefined, { cwd: '/session', ispitaj });
    expect(vidjeno.map((d) => d.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''))).toEqual(['/a/b', '/session', '/c/d']);
  });

  it('bez podmetnutog stanja presuda ne poziva git i odbija goli commit', () => {
    expect(judgeCommand('Bash', 'git commit -m x').allow).toBe(false);
  });
});

describe('stanjeStabla nad STVARNIM gitom', () => {
  it('povezani worktree je izoliran, glavno stablo nije', () => {
    const baza = mkdtempSync(join(tmpdir(), 'lekta-gard-'));
    try {
      const repo = join(baza, 'repo');
      const g = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
      execFileSync('git', ['init', '-q', repo], { cwd: baza, windowsHide: true });
      g(['config', 'user.email', 'x@y.z'], repo);
      g(['config', 'user.name', 'Test'], repo);
      g(['config', 'commit.gpgsign', 'false'], repo);
      writeFileSync(join(repo, 'a.txt'), 'a\n');
      g(['add', 'a.txt'], repo);
      g(['commit', '-q', '--only', 'a.txt', '-m', 'prvi'], repo);
      const wt = join(baza, 'wt');
      g(['worktree', 'add', '-q', '--detach', wt], repo);

      // `repo` glumi dijeljeno stablo; povezani worktree i samostalni klon su izolirani.
      expect(stanjeStabla(repo, repo)).toEqual({ izoliran: false, spajanje: false });
      expect(stanjeStabla(wt, repo)).toEqual({ izoliran: true, spajanje: false });
      const klon = join(baza, 'klon');
      execFileSync('git', ['clone', '-q', repo, klon], { cwd: baza, windowsHide: true });
      expect(stanjeStabla(klon, repo)).toEqual({ izoliran: true, spajanje: false });
    } finally {
      rmSync(baza, { recursive: true, force: true });
    }
  });

  it('nepostojeca staza daje null, ne lazno zeleno', () => {
    expect(stanjeStabla(join(tmpdir(), `ovo-ne-postoji-gard-${process.pid}`))).toBeNull();
  });
});

describe('judgeCommand - git push', () => {
  it('blokira git push origin master', () => {
    const r = judgeCommand('Bash', 'git push origin master');
    expect(r.allow).toBe(false);
  });

  it('blokira git push origin HEAD:master', () => {
    const r = judgeCommand('Bash', 'git push origin HEAD:master');
    expect(r.allow).toBe(false);
  });

  it('blokira git push --force bez --force-with-lease', () => {
    const r = judgeCommand('Bash', 'git push --force origin wf/x');
    expect(r.allow).toBe(false);
  });

  it('blokira git push -f bez --force-with-lease', () => {
    const r = judgeCommand('Bash', 'git push -f origin wf/x');
    expect(r.allow).toBe(false);
  });

  it('dopusta git push -u origin wf/x', () => {
    const r = judgeCommand('Bash', 'git push -u origin wf/x');
    expect(r.allow).toBe(true);
  });

  it('dopusta git push --force-with-lease origin wf/x', () => {
    const r = judgeCommand('Bash', 'git push --force-with-lease origin wf/x');
    expect(r.allow).toBe(true);
  });
});

describe('judgeCommand - git reset --hard i rebase', () => {
  it('upozorava (ne blokira) na git reset --hard', () => {
    const r = judgeCommand('Bash', 'git reset --hard origin/wf/tudja-grana');
    expect(r.allow).toBe(true);
    expect(r.reason).toContain('UPOZORENJE');
  });

  it('blokira git rebase -i', () => {
    const r = judgeCommand('Bash', 'git rebase -i HEAD~3');
    expect(r.allow).toBe(false);
  });

  it('dopusta obican git rebase origin/master', () => {
    const r = judgeCommand('Bash', 'git rebase origin/master');
    expect(r.allow).toBe(true);
  });
});

describe('judgeCommand - rm / Remove-Item', () => {
  it('blokira rm -rf izvan repoa/worktreeova', () => {
    const r = judgeCommand('Bash', 'rm -rf C:/Users/PC/Documents');
    expect(r.allow).toBe(false);
  });

  it('blokira rm -rf nad node_modules glavnog stabla', () => {
    const r = judgeCommand('Bash', 'rm -rf C:/Users/PC/Desktop/Lekta/node_modules');
    expect(r.allow).toBe(false);
  });

  it('dopusta rm -rf unutar worktree temp mape', () => {
    const r = judgeCommand(
      'Bash',
      'rm -rf C:/Users/PC/AppData/Local/Temp/claude/lekta-wf/wf-tool-guard-hook/dist'
    );
    expect(r.allow).toBe(true);
  });

  it('dopusta Remove-Item -Recurse unutar lekta-wf', () => {
    const r = judgeCommand(
      'PowerShell',
      'Remove-Item -Recurse -Force C:\\Users\\PC\\AppData\\Local\\Temp\\claude\\lekta-wf\\wf-x\\dist'
    );
    expect(r.allow).toBe(true);
  });

  it('blokira Remove-Item -Recurse izvan repoa/worktreeova', () => {
    const r = judgeCommand('PowerShell', 'Remove-Item -Recurse -Force C:\\Users\\PC\\Documents');
    expect(r.allow).toBe(false);
  });

  it('dopusta obican rm bez -r/-f nad bilo kojom putanjom', () => {
    const r = judgeCommand('Bash', 'rm C:/Users/PC/Documents/note.txt');
    expect(r.allow).toBe(true);
  });
});

describe('judgeCommand - supabase i MCP apply_migration', () => {
  it('blokira supabase db push bez --linked', () => {
    const r = judgeCommand('Bash', 'supabase db push');
    expect(r.allow).toBe(false);
  });

  it('blokira supabase db push --project-ref produkcije', () => {
    const r = judgeCommand('Bash', 'supabase db push --linked --project-ref zrrjttizjyfcxmcpgzml');
    expect(r.allow).toBe(false);
  });

  it('dopusta supabase db push --linked bez produkcijskog ref-a', () => {
    const r = judgeCommand('Bash', 'supabase db push --linked');
    expect(r.allow).toBe(true);
  });

  it('blokira MCP apply_migration po imenu alata', () => {
    const r = judgeCommand('mcp__claude_ai_Supabase__apply_migration', undefined);
    expect(r.allow).toBe(false);
  });

  it('blokira MCP apply_migration i pod imenom lokalno spojenog konektora', () => {
    const r = judgeCommand('mcp__Supabase__apply_migration', undefined);
    expect(r.allow).toBe(false);
    expect(judgeCommand('mcp__supabase__apply_migration', undefined).allow).toBe(false);
  });
});

describe('judgeCommand - opce i fail-open ponasanje', () => {
  it('dopusta naredbe koje se ne poklapaju s nijednim obrascem', () => {
    const r = judgeCommand('Bash', 'npm run orphan-scan');
    expect(r.allow).toBe(true);
  });

  it('dopusta kad alat nije Bash/PowerShell/MCP apply_migration', () => {
    const r = judgeCommand('Read', undefined);
    expect(r.allow).toBe(true);
  });

  it('dopusta kad je naredba prazna', () => {
    const r = judgeCommand('Bash', '');
    expect(r.allow).toBe(true);
  });

  it('blokira drugu opasnu naredbu u lancu i(&&)', () => {
    const r = judgeCommand('Bash', 'npm run build && git push origin master');
    expect(r.allow).toBe(false);
  });
});

describe('Supabase MCP gard (odluka vlasnika 2026-10-08)', () => {
  it('presuda: alati i upisi koji mijenjaju bazu ili projekt se odbijaju, citanje prolazi', () => {
    expect(supabaseMcpGuardProblems(judgeCommand)).toEqual([]);
  });

  it('registracija: hook u .claude/settings.json pokriva Bash, PowerShell i Supabase MCP alate', () => {
    const settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8'));
    expect(toolGuardMatcherProblems(settings)).toEqual([]);
  });
});
