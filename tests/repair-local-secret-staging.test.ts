import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildLocalRepairSecretChildEnvironment,
  buildWindowsAclArguments,
  stageLocalRepairSecrets,
} from '../scripts/local-repair-secret-staging';

const PROJECT_REF = 'zrrjttizjyfcxmcpgzml';
const PRIVATE_KEY = 'private_key_fixture_without_padding';

describe('Lekta local-repair secret staging', () => {
  it('predaje vrijednosti samo kroz ograniceni env-file i brise ga nakon jedne naredbe', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'lekta-secret-test-root-'));
    let observedPath = '';
    let observed = '';
    const hardenPath = vi.fn();
    const runSupabase = vi.fn((args: readonly string[]) => {
      expect(args.slice(0, 2)).toEqual(['secrets', 'set']);
      expect(args).toContain('--env-file');
      expect(args).toContain('--project-ref');
      observedPath = args[args.indexOf('--env-file') + 1];
      observed = readFileSync(observedPath, 'utf8');
      expect(dirname(dirname(observedPath))).toBe(temporaryRoot);
    });

    stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      temporaryRoot,
      secrets: {
        REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY,
        REPAIR_LOCAL_DISABLED: 'true',
      },
      runSupabase,
    }, { hardenPath });

    expect(runSupabase).toHaveBeenCalledTimes(1);
    expect(observed).toBe(
      `REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL=${PRIVATE_KEY}\nREPAIR_LOCAL_DISABLED=true\n`,
    );
    expect(JSON.stringify(runSupabase.mock.calls[0][0])).not.toContain(PRIVATE_KEY);
    expect(hardenPath).toHaveBeenCalledTimes(2);
    expect(existsSync(observedPath)).toBe(false);
  });

  it('redigira privatni kljuc i privremenu putanju te cisti nakon pada callbacka', () => {
    let envFilePath = '';
    expect(() => stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY },
      runSupabase(args) {
        envFilePath = args[args.indexOf('--env-file') + 1];
        throw new Error(`CLI leaked ${PRIVATE_KEY} from ${envFilePath}`);
      },
    }, { hardenPath() {} })).toThrow(/\[REDACTED\]/);
    expect(existsSync(envFilePath)).toBe(false);
    try {
      stageLocalRepairSecrets({
        projectRef: PROJECT_REF,
        secrets: { REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: PRIVATE_KEY },
        runSupabase() { throw new Error(PRIVATE_KEY); },
      }, { hardenPath() {} });
    } catch (error) {
      expect(String(error)).not.toContain(PRIVATE_KEY);
      expect(String(error)).not.toContain(envFilePath);
    }
  });

  it('redigira caller temp root kada stvaranje direktorija ne uspije', () => {
    const existingRoot = mkdtempSync(join(tmpdir(), 'lekta-secret-redaction-parent-'));
    const missingRoot = join(existingRoot, 'missing-root');
    try {
      let failure: unknown;
      try {
        stageLocalRepairSecrets({
          projectRef: PROJECT_REF,
          temporaryRoot: missingRoot,
          secrets: { REPAIR_LOCAL_DISABLED: 'true' },
          runSupabase() {},
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain('[REDACTED]');
      expect(String(failure)).not.toContain(missingRoot);
      expect(String(failure)).not.toContain(join(missingRoot, 'lekta-repair-secrets-'));
    } finally {
      rmSync(existingRoot, { recursive: true, force: true });
    }
  });

  it.each(['line1\nline2', 'nul\0value'])('odbija newline ili NUL prije stvaranja datoteke: %j', (value) => {
    const runSupabase = vi.fn();
    const hardenPath = vi.fn();
    expect(() => stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_LOCAL_DISABLED: value },
      runSupabase,
    }, { hardenPath })).toThrow(/Nevaljana vrijednost/);
    expect(hardenPath).not.toHaveBeenCalled();
    expect(runSupabase).not.toHaveBeenCalled();
  });

  it('ne pokrece Supabase ako ogranicavanje pristupa ne uspije', () => {
    const runSupabase = vi.fn();
    expect(() => stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_LOCAL_DISABLED: 'true' },
      runSupabase,
    }, {
      hardenPath() { throw new Error('ACL failure'); },
    })).toThrow(/ACL failure/);
    expect(runSupabase).not.toHaveBeenCalled();
  });

  it('cleanup kvar zaustavlja release nakon uspjesnog callbacka', () => {
    const runSupabase = vi.fn();
    expect(() => stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_LOCAL_DISABLED: 'true' },
      runSupabase,
    }, {
      hardenPath() {},
      removeDirectory() { throw new Error('cleanup failure'); },
    })).toThrow(/cleanup failure/);
    expect(runSupabase).toHaveBeenCalledTimes(1);
  });

  it.skipIf(process.platform === 'win32')('postavlja POSIX 0700 i 0600 prije callbacka', () => {
    stageLocalRepairSecrets({
      projectRef: PROJECT_REF,
      secrets: { REPAIR_LOCAL_DISABLED: 'true' },
      runSupabase(args) {
        const envFilePath = args[args.indexOf('--env-file') + 1];
        expect(statSync(dirname(envFilePath)).mode & 0o777).toBe(0o700);
        expect(statSync(envFilePath).mode & 0o777).toBe(0o600);
      },
    });
  });

  it('gradi Windows ACL samo iz stabilnih SID identiteta', () => {
    expect(buildWindowsAclArguments(
      'C:\\Temp\\repair.env',
      'directory',
      'S-1-5-21-1000',
    )).toEqual([
      'C:\\Temp\\repair.env',
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-21-1000:(OI)(CI)(F)',
      '*S-1-5-18:(OI)(CI)(F)',
      '*S-1-5-32-544:(OI)(CI)(F)',
    ]);
  });

  it('uklanja privatne kljuceve iz oba Windows ACL child procesa', () => {
    expect(buildLocalRepairSecretChildEnvironment({
      PATH: 'C:\\Windows',
      LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: 'release-secret',
      REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: 'runtime-secret',
    })).toEqual({ PATH: 'C:\\Windows' });

    const source = readFileSync(join(import.meta.dirname, '..', 'scripts', 'local-repair-secret-staging.mts'), 'utf8');
    expect(source.match(/spawnSync\(/g)?.length).toBe(2);
    expect(source.match(/env: buildLocalRepairSecretChildEnvironment/g)?.length).toBe(2);
  });

  it('uklanja Windows mixed-case privatne kljuceve i iz stvarnog child procesa', () => {
    const childEnvironment = buildLocalRepairSecretChildEnvironment({
      PATH: process.env.PATH,
      lekta_repair_contract_private_key_pkcs8_b64url: 'mixed-release-secret',
      Repair_Contract_Private_Key_Pkcs8_B64url: 'mixed-runtime-secret',
    });
    expect(Object.keys(childEnvironment).map((name) => name.toUpperCase())).not.toContain(
      'LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
    );
    expect(Object.keys(childEnvironment).map((name) => name.toUpperCase())).not.toContain(
      'REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
    );

    const child = spawnSync(process.execPath, ['-e', [
      'process.stdout.write(JSON.stringify({',
      'release: process.env.LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL,',
      'runtime: process.env.REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
      '}))',
    ].join('')], {
      encoding: 'utf8',
      env: childEnvironment,
      windowsHide: true,
    });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({});
  });
});
