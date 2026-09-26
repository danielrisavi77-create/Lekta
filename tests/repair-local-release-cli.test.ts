import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  buildLocalRepairDeploymentPlan,
} from '../scripts/local-repair-release-gate';
import { assertLocalRepairReleaseSecrets } from '../scripts/run-local-repair-release';

describe('automatizirani local-repair release CLI', () => {
  it('radi link, regresijski gate, migracijski dry-run, push i funkcije deterministickim redom', () => {
    expect(buildLocalRepairDeploymentPlan()).toEqual([
      ['supabase', 'link', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF, '--yes'],
      ['npm', 'run', 'check:repair-integration'],
      ['supabase', 'db', 'push', '--linked', '--dry-run'],
      ['supabase', 'db', 'push', '--linked', '--yes'],
      ['supabase', 'functions', 'deploy', 'repair-local-claim', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-local-status', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-docx', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
    ]);
  });

  it('prije execute moda zahtijeva obje tajne bez vracanja njihovih vrijednosti', () => {
    expect(() => assertLocalRepairReleaseSecrets({})).toThrow(/SUPABASE_ACCESS_TOKEN/);
    expect(() => assertLocalRepairReleaseSecrets({ SUPABASE_ACCESS_TOKEN: 'token' })).toThrow(/SUPABASE_DB_PASSWORD/);
    expect(assertLocalRepairReleaseSecrets({
      SUPABASE_ACCESS_TOKEN: 'token',
      SUPABASE_DB_PASSWORD: 'password',
    })).toEqual({ accessTokenPresent: true, databasePasswordPresent: true });
  });

  it('izlaze kao preflight i explicit execute npm naredbe bez password argumenta', () => {
    const root = join(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const cli = readFileSync(join(root, 'scripts', 'run-local-repair-release.mts'), 'utf8');

    expect(pkg.scripts?.['release:repair:preflight']).toBe('node scripts/run-local-repair-release.mts');
    expect(pkg.scripts?.['release:repair:deploy']).toBe('node scripts/run-local-repair-release.mts --execute');
    expect(cli).toContain('Get-AuthenticodeSignature');
    expect(cli).toContain('SUPABASE_ACCESS_TOKEN');
    expect(cli).toContain('SUPABASE_DB_PASSWORD');
    expect(cli).not.toContain("'--password'");
    expect(cli).not.toContain('"--password"');
  });
});
