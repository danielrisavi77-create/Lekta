import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error - Node ESM policy je namjerno plain .mjs bez zasebnih deklaracija.
import {
  ALLOWED_NANOID_ADVISORIES,
  evaluateProductionAudit,
  runAuditPolicyCli,
} from '../scripts/security/npm-audit-policy.mjs';

const lockfile = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
const nodes = [
  'node_modules/emscripten-wasm-loader/node_modules/nanoid',
  'node_modules/hunspell-asm/node_modules/nanoid',
];
const expectedAllowedAdvisories = [
  'GHSA-28wg-ghj8-5hjv',
  'GHSA-2v37-7h3g-55p8',
  'GHSA-mwcw-c2x4-8c55',
];
const expectedAllowedAdvisorySeverities: Record<string, 'moderate' | 'high'> = {
  'GHSA-28wg-ghj8-5hjv': 'high',
  'GHSA-2v37-7h3g-55p8': 'high',
  'GHSA-mwcw-c2x4-8c55': 'moderate',
};
const requiredParentVersions = {
  'node_modules/hunspell-asm': '4.0.2',
  'node_modules/emscripten-wasm-loader': '3.0.3',
};

function advisory(id: string, severity = expectedAllowedAdvisorySeverities[id] ?? 'high') {
  return {
    source: id,
    name: 'nanoid',
    dependency: 'nanoid',
    title: id,
    url: `https://github.com/advisories/${id}`,
    severity,
    range: '<3.3.8',
  };
}

function currentReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      nanoid: {
        name: 'nanoid',
        severity: 'high',
        isDirect: false,
        via: expectedAllowedAdvisories.map((id) => advisory(id)),
        effects: [],
        range: '<3.3.8',
        nodes: [...nodes],
        fixAvailable: true,
      },
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('production npm audit policy', () => {
  it('propušta čist audit i točno trenutni Hunspell nanoid nalaz', () => {
    expect(ALLOWED_NANOID_ADVISORIES).toEqual(expectedAllowedAdvisories);
    expect(expectedAllowedAdvisorySeverities).toEqual({
      'GHSA-28wg-ghj8-5hjv': 'high',
      'GHSA-2v37-7h3g-55p8': 'high',
      'GHSA-mwcw-c2x4-8c55': 'moderate',
    });
    expect(lockfile.packages['node_modules/hunspell-asm'].version).toBe(requiredParentVersions['node_modules/hunspell-asm']);
    expect(lockfile.packages['node_modules/emscripten-wasm-loader'].version).toBe(requiredParentVersions['node_modules/emscripten-wasm-loader']);
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, lockfile)).toEqual({
      ok: true,
      reasons: [],
      allowedAdvisories: [],
    });
    expect(evaluateProductionAudit(currentReport(), lockfile)).toEqual({
      ok: true,
      reasons: [],
      allowedAdvisories: [...expectedAllowedAdvisories],
    });
  });

  it('provjerava zaključani dependency ugovor i kada je audit čist', () => {
    const missingPackage = clone(lockfile);
    delete missingPackage.packages['node_modules/hunspell-asm/node_modules/nanoid'];
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, missingPackage)).toMatchObject({ ok: false });

    const directRootNanoid = clone(lockfile);
    directRootNanoid.packages[''].dependencies.nanoid = '3.3.8';
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, directRootNanoid)).toMatchObject({ ok: false });
  });

  it('odbija ne-record i nepotpune vulnerability unose', () => {
    expect(evaluateProductionAudit({
      auditReportVersion: 2,
      vulnerabilities: { nanoid: [] },
    }, lockfile)).toMatchObject({ ok: false });

    expect(evaluateProductionAudit({
      auditReportVersion: 2,
      vulnerabilities: { nanoid: { name: 'nanoid' } },
    }, lockfile)).toMatchObject({ ok: false });
  });

  it('odbija novi advisory i dodatni high/critical paket', () => {
    const changed = currentReport();
    changed.vulnerabilities.nanoid.via.push(advisory('GHSA-new-1-2'));
    expect(evaluateProductionAudit(changed, lockfile)).toMatchObject({ ok: false });

    const extra = currentReport() as ReturnType<typeof currentReport> & { vulnerabilities: Record<string, unknown> };
    extra.vulnerabilities.other = {
      name: 'other', severity: 'critical', isDirect: false, via: [], nodes: ['node_modules/other'],
    };
    expect(evaluateProductionAudit(extra, lockfile)).toMatchObject({ ok: false });
  });

  it('odbija nepoznatu npm severity vrijednost', () => {
    const unknownSeverity = currentReport();
    unknownSeverity.vulnerabilities.nanoid.severity = 'urgent';
    expect(evaluateProductionAudit(unknownSeverity, lockfile)).toMatchObject({ ok: false });
  });

  it('odbija drift identiteta i severityja dopustenog advisoryja', () => {
    for (const [field, value] of [
      ['name', 'other'],
      ['dependency', 'other'],
      ['severity', 'critical'],
    ] as const) {
      const drifted = currentReport();
      drifted.vulnerabilities.nanoid.via[0][field] = value;
      expect(evaluateProductionAudit(drifted, lockfile)).toMatchObject({ ok: false });
    }
  });

  it('odbija lockfile bez root package zapisa ili root dependencies zapisa', () => {
    const missingRoot = clone(lockfile);
    delete missingRoot.packages[''];
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, missingRoot)).toMatchObject({ ok: false });

    const missingRootDependencies = clone(lockfile);
    delete missingRootDependencies.packages[''].dependencies;
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, missingRootDependencies)).toMatchObject({ ok: false });
  });

  it('odbija nedostajuce i driftane parent dependency edgeove', () => {
    const missingRootHunspell = clone(lockfile);
    delete missingRootHunspell.packages[''].dependencies['hunspell-asm'];
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, missingRootHunspell)).toMatchObject({ ok: false });

    const driftedLoader = clone(lockfile);
    driftedLoader.packages['node_modules/hunspell-asm'].dependencies['emscripten-wasm-loader'] = '^3.0.4';
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, driftedLoader)).toMatchObject({ ok: false });

    const missingHunspellNanoid = clone(lockfile);
    delete missingHunspellNanoid.packages['node_modules/hunspell-asm'].dependencies.nanoid;
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, missingHunspellNanoid)).toMatchObject({ ok: false });

    const driftedLoaderNanoid = clone(lockfile);
    driftedLoaderNanoid.packages['node_modules/emscripten-wasm-loader'].dependencies.nanoid = '^2.0.4';
    expect(evaluateProductionAudit({ auditReportVersion: 2, vulnerabilities: {} }, driftedLoaderNanoid)).toMatchObject({ ok: false });
  });

  it('odbija izravni nanoid, path drift i verzijski drift', () => {
    const direct = currentReport();
    direct.vulnerabilities.nanoid.isDirect = true;
    expect(evaluateProductionAudit(direct, lockfile)).toMatchObject({ ok: false });

    const moved = currentReport();
    moved.vulnerabilities.nanoid.nodes = ['node_modules/nanoid'];
    expect(evaluateProductionAudit(moved, lockfile)).toMatchObject({ ok: false });

    const changedLock = clone(lockfile);
    changedLock.packages['node_modules/hunspell-asm/node_modules/nanoid'].version = '2.1.12';
    expect(evaluateProductionAudit(currentReport(), changedLock)).toMatchObject({ ok: false });

    const changedHunspellParent = clone(lockfile);
    changedHunspellParent.packages['node_modules/hunspell-asm'].version = '4.0.3';
    expect(evaluateProductionAudit(currentReport(), changedHunspellParent)).toMatchObject({ ok: false });

    const changedLoaderParent = clone(lockfile);
    changedLoaderParent.packages['node_modules/emscripten-wasm-loader'].version = '3.0.4';
    expect(evaluateProductionAudit(currentReport(), changedLoaderParent)).toMatchObject({ ok: false });
  });

  it('odbija spojene i ugniježđene nanoid node putanje', () => {
    const joinedPaths = currentReport();
    joinedPaths.vulnerabilities.nanoid.nodes = [nodes.join('\n')];
    expect(evaluateProductionAudit(joinedPaths, lockfile)).toMatchObject({ ok: false });

    const nestedPaths = currentReport();
    nestedPaths.vulnerabilities.nanoid.nodes = [nodes] as unknown as string[];
    expect(evaluateProductionAudit(nestedPaths, lockfile)).toMatchObject({ ok: false });
  });

  it('odbija nevaljan audit JSON i CLI audit proces koji nije završio statusom 0 ili 1', () => {
    expect(evaluateProductionAudit(null, lockfile)).toMatchObject({ ok: false });

    const spawnSyncImpl = vi.fn(() => ({ status: 2, stdout: '', stderr: 'registry unavailable' }));
    const result = runAuditPolicyCli({
      cwd: process.cwd(),
      platform: 'linux',
      spawnSyncImpl,
      readFileSyncImpl: () => JSON.stringify(lockfile),
    });
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'npm',
      ['audit', '--omit=dev', '--json'],
      expect.objectContaining({ cwd: process.cwd(), encoding: 'utf8' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/registry unavailable|status 2/i);

    const invalidJsonResult = runAuditPolicyCli({
      cwd: process.cwd(),
      platform: 'linux',
      spawnSyncImpl: () => ({ status: 0, stdout: '{not-json', stderr: '' }),
      readFileSyncImpl: () => JSON.stringify(lockfile),
    });
    expect(invalidJsonResult.exitCode).toBe(1);
    expect(invalidJsonResult.message).toMatch(/nevaljan.*json|json/i);
  });

  it('na Windowsu pokreće npm CLI kroz Node, dok Linux zadržava npm naredbu', () => {
    const execPath = 'C:\\Program Files\\nodejs\\node.exe';
    const npmCliPath = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }),
      stderr: '',
    }));
    const options = {
      cwd: process.cwd(),
      spawnSyncImpl,
      readFileSyncImpl: () => JSON.stringify(lockfile),
    };

    expect(runAuditPolicyCli({ ...options, platform: 'win32', execPath, npmCliPath }).exitCode).toBe(0);
    expect(spawnSyncImpl).toHaveBeenLastCalledWith(
      execPath,
      [npmCliPath, 'audit', '--omit=dev', '--json'],
      expect.objectContaining({ cwd: process.cwd(), encoding: 'utf8', windowsHide: true }),
    );

    expect(runAuditPolicyCli({ ...options, platform: 'linux' }).exitCode).toBe(0);
    expect(spawnSyncImpl).toHaveBeenLastCalledWith(
      'npm',
      ['audit', '--omit=dev', '--json'],
      expect.objectContaining({ cwd: process.cwd(), encoding: 'utf8', windowsHide: true }),
    );
  });

  it('pretvara throw i ne-record spawn rezultat u deterministički CLI neuspjeh', () => {
    const thrownResult = runAuditPolicyCli({
      cwd: process.cwd(),
      platform: 'linux',
      spawnSyncImpl: () => { throw new Error('spawn failed'); },
      readFileSyncImpl: () => JSON.stringify(lockfile),
    });
    expect(thrownResult).toMatchObject({ exitCode: 1 });
    expect(thrownResult.message).toMatch(/spawn failed/i);

    const nullResult = runAuditPolicyCli({
      cwd: process.cwd(),
      platform: 'linux',
      spawnSyncImpl: () => null,
      readFileSyncImpl: () => JSON.stringify(lockfile),
    });
    expect(nullResult).toMatchObject({ exitCode: 1 });
    expect(nullResult.message).toMatch(/audit|izvršiti/i);
  });
});
