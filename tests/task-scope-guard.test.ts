// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  activeTasksMissingWriteScope,
  canonicalScopePattern,
  findTaskWriteConflicts,
  findWriteScopeConflicts,
  scopePathMatches,
  scopePatternsOverlap,
  validateWorkScope,
  writeScopeViolations,
} from '../scripts/agents/task-scope.mjs';
import { judgeGlobalLeaseWrite, judgeTaskWrite } from '../scripts/hooks/task-scope-guard.mjs';

describe('task workScope model', () => {
  it('podrzava tocnu putanju i zavrsni /**', () => {
    expect(canonicalScopePattern('./src/ui/app.ts')).toBe('src/ui/app.ts');
    expect(canonicalScopePattern('src\\ui\\results\\**')).toBe('src/ui/results/**');
    expect(scopePathMatches('src/ui/results/view.ts', 'src/ui/results/**')).toBe(true);
    expect(scopePathMatches('src/ui/app.ts', 'src/ui/results/**')).toBe(false);
  });

  it('odbija siroke ili izlazne globove', () => {
    expect(() => canonicalScopePattern('../src/**')).toThrow();
    expect(() => canonicalScopePattern('src/*/app.ts')).toThrow();
    expect(() => canonicalScopePattern('/tmp/x')).toThrow();
  });

  it('prepoznaje preklapanje write scopeova konzervativno', () => {
    expect(scopePatternsOverlap('src/ui/**', 'src/ui/app.ts')).toBe(true);
    expect(scopePatternsOverlap('src/ui/results/**', 'src/ui/**')).toBe(true);
    expect(scopePatternsOverlap('src/ui/**', 'src/repair/**')).toBe(false);
  });

  it('nalazi konflikt samo medju aktivnim piscima', () => {
    const queue = {
      tasks: [
        { id: 'T01', status: 'in_progress', owner: 'lekta-01', workScope: { write: ['src/ui/**'] } },
        { id: 'T02', status: 'in_progress', owner: 'lekta-02', workScope: { write: ['src/ui/app.ts'] } },
        { id: 'T03', status: 'in_review', owner: 'lekta-03', workScope: { write: ['src/ui/**'] } },
      ],
    };
    expect(findWriteScopeConflicts(queue)).toEqual([
      { taskA: 'T01', taskB: 'T02', pathA: 'src/ui/**', pathB: 'src/ui/app.ts' },
    ]);
  });

  it('blokira novi kandidat ako mu write scope udara u aktivnog pisca', () => {
    const queue = {
      tasks: [
        { id: 'T01', status: 'ready', owner: 'lekta-01', workScope: { write: ['src/ui/app.ts'] } },
        { id: 'T02', status: 'in_progress', owner: 'lekta-02', workScope: { write: ['src/ui/**'] } },
      ],
    };
    expect(findTaskWriteConflicts(queue, 'T01')).toEqual([
      { taskA: 'T01', taskB: 'T02', pathA: 'src/ui/app.ts', pathB: 'src/ui/**' },
    ]);
  });

  it('prijavljuje aktivnog ownera bez write scopea za migraciju', () => {
    const queue = {
      tasks: [
        { id: 'T01', status: 'in_progress', owner: 'lekta-01' },
        { id: 'T02', status: 'ready', owner: 'lekta-02' },
      ],
    };
    expect(activeTasksMissingWriteScope(queue)).toEqual([{ id: 'T01', owner: 'lekta-01' }]);
  });

  it('validira duplikate po tasku', () => {
    expect(() => validateWorkScope({ write: ['src/ui/**', 'src/ui/**'] }, 'T01')).toThrow(/Duplicate/);
  });

  it('provjerava stvarni diff, ukljucujuci Bash/generator promjene', () => {
    expect(writeScopeViolations(
      ['src/ui/app.ts', 'tests/ux/mobile.spec.ts', 'src/repair/fixer.ts', 'src/ui/secrets.ts'],
      { write: ['src/ui/**', 'tests/ux/mobile.spec.ts'], forbidden: ['src/ui/secrets.ts'] },
      'T01',
    )).toEqual([
      { path: 'src/repair/fixer.ts', reason: 'outside_write_scope' },
      { path: 'src/ui/secrets.ts', reason: 'forbidden', pattern: 'src/ui/secrets.ts' },
    ]);
  });
});

describe('task-scope PreToolUse odluka', () => {
  const queue = {
    tasks: [
      {
        id: 'T99',
        status: 'in_progress',
        owner: 'lekta-01',
        workScope: {
          read: ['src/routes/**'],
          write: ['src/ui/**', 'tests/ux/mobile.spec.ts'],
          forbidden: ['src/ui/secrets.ts'],
        },
      },
    ],
  };
  const env = { LEKTA_ROLE: 'implementer', LEKTA_TASK_ID: 'T99', LEKTA_SCOPE_ENFORCED: '1' };

  function judge(filePath: string, tool = 'Edit') {
    return judgeTaskWrite({
      env,
      queue,
      repoRoot: '/repo',
      cwd: '/repo',
      payload: { tool_name: tool, tool_input: { file_path: filePath } },
    });
  }

  it('dopusta write u dodijeljenom scopeu', () => {
    expect(judge('/repo/src/ui/app.ts')).toEqual({ allow: true, reason: '' });
    expect(judge('/repo/tests/ux/mobile.spec.ts', 'Write')).toEqual({ allow: true, reason: '' });
  });

  it('blokira write izvan scopea i trazi expansion', () => {
    const result = judge('/repo/src/repair/fixer.ts');
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('SCOPE EXPANSION');
  });

  it('forbidden ima prednost pred write scopeom', () => {
    const result = judge('/repo/src/ui/secrets.ts');
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('forbidden');
  });

  it('blokira zapis izvan repozitorija', () => {
    expect(judge('/tmp/out.txt').allow).toBe(false);
  });

  it('legacy sesija bez task id-a ostaje kompatibilna', () => {
    expect(judgeTaskWrite({
      env: { LEKTA_ROLE: 'implementer' },
      queue,
      repoRoot: '/repo',
      cwd: '/repo',
      payload: { tool_name: 'Edit', tool_input: { file_path: '/repo/src/repair/fixer.ts' } },
    })).toEqual({ allow: true, reason: '' });
  });

  it('strict sesija blokira task bez workScope.write', () => {
    const result = judgeTaskWrite({
      env: { LEKTA_ROLE: 'implementer', LEKTA_TASK_ID: 'T01', LEKTA_SCOPE_ENFORCED: '1' },
      queue: { tasks: [{ id: 'T01', status: 'in_progress', owner: 'lekta-02' }] },
      repoRoot: '/repo',
      cwd: '/repo',
      payload: { tool_name: 'Write', tool_input: { file_path: '/repo/x.ts' } },
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('nema workScope.write');
  });
});


describe('global lease PreToolUse odluka', () => {
  const queue = {
    tasks: [{
      id: 'T99',
      status: 'in_progress',
      owner: 'lekta-03',
      workScope: { write: ['src/ui/**'] },
    }],
  };
  const payload = {
    tool_name: 'Edit',
    tool_input: { file_path: '/repo/src/ui/app.ts' },
  };
  const enforcedEnv = {
    LEKTA_ROLE: 'implementer',
    LEKTA_TASK_ID: 'T99',
    LEKTA_GLOBAL_LEASE_ENFORCED: '1',
  };

  it('disabled global lease ne radi validator poziv', async () => {
    let calls = 0;
    await expect(judgeGlobalLeaseWrite({
      env: { LEKTA_ROLE: 'implementer', LEKTA_TASK_ID: 'T99' },
      payload,
      queue,
      validate: async () => {
        calls += 1;
        return {};
      },
    })).resolves.toEqual({ allow: true, reason: '' });
    expect(calls).toBe(0);
  });

  it('propusta write kad udaljeni lease vrijedi', async () => {
    await expect(judgeGlobalLeaseWrite({
      env: enforcedEnv,
      payload,
      queue,
      validate: async () => ({ enforced: true, expiresAt: '2026-10-02T22:00:00Z' }),
    })).resolves.toEqual({ allow: true, reason: '' });
  });

  it('blokira write prije mreze ako enforced worker nosi admin token', async () => {
    let calls = 0;
    const result = await judgeGlobalLeaseWrite({
      env: { ...enforcedEnv, LEKTA_CONTROL_PLANE_ADMIN_TOKEN: 'admin-secret' },
      payload,
      queue,
      validate: async () => {
        calls += 1;
        return { enforced: true };
      },
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('LEKTA_CONTROL_PLANE_ADMIN_TOKEN');
    expect(calls).toBe(0);
  });

  it('fail-closed blokira write kad lease validation padne', async () => {
    const result = await judgeGlobalLeaseWrite({
      env: enforcedEnv,
      payload,
      queue,
      validate: async () => {
        throw new Error('lease_expired');
      },
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('lease_expired');
  });

  it('enforcement bez task ID-a blokira write prije mreze', async () => {
    const result = await judgeGlobalLeaseWrite({
      env: { LEKTA_ROLE: 'implementer', LEKTA_GLOBAL_LEASE_ENFORCED: '1' },
      payload,
      queue,
      validate: async () => ({ enforced: true }),
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('LEKTA_TASK_ID');
  });
});
