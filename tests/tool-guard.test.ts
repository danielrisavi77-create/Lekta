import { describe, expect, it } from 'vitest';
import { judgeCommand } from '../scripts/agents/tool-guard.mjs';

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

  it('dopusta obican git commit -m bez -a/--all', () => {
    const r = judgeCommand('Bash', 'git commit -m "x"');
    expect(r.allow).toBe(true);
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
