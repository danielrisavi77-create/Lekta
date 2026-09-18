import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const configPath = join(root, 'vitest.repair-integration.config.ts');
const deploymentPath = join(root, 'src', 'config', 'deployment.ts');
const appPath = join(root, 'src', 'ui', 'app.ts');
const serverPath = join(root, 'supabase', 'functions', 'repair-docx', 'index.ts');

describe('brzi WordReplica-Lekta integracijski gate', () => {
  it('ima zaseban typecheck, fokusirani testni skup i produkcijski build', () => {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['check:repair-integration']).toBe(
      'tsc --noEmit && vitest run --config vitest.repair-integration.config.ts && vite build',
    );
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, 'utf8');
    for (const required of [
      './tests/local-repair-runner-download.test.ts',
      './tests/repair-contract-*.test.ts',
      './tests/repair-local-*.test.ts',
      './tests/repair-package-integrity.test.ts',
      './tests/repair-integration-gate.test.ts',
    ]) {
      expect(config).toContain(required);
    }
    expect(config).not.toContain('repair-closed-loop');
  });

  it('spaja jednokratni lokalni Word popravak na konfiguraciju i uspjesan serverski ishod', () => {
    const deployment = readFileSync(deploymentPath, 'utf8');
    expect(deployment).toContain('VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL');
    expect(deployment).toContain('VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256');

    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('confirmations,words:');
    expect(app).toContain("if(out.localRepair){");
    expect(app).toContain("import('../report/local-repair-runner-download')");
    expect(app).toContain(
      'renderLocalRepairRunnerOffer(summary,out.localRepair,localRepairRunnerConfig())',
    );

    const confirmationBuild = app.indexOf('const confirmations=');
    const upload = app.indexOf('uploadRepair(repairConfig()');
    const offer = app.indexOf('renderLocalRepairRunnerOffer(summary,out.localRepair');
    expect(confirmationBuild).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(confirmationBuild);
    expect(offer).toBeGreaterThan(upload);
  });

  it('izdaje local repair tek uz potvrde i vraca launch tek nakon trajne pohrane', () => {
    const server = readFileSync(serverPath, 'utf8');
    for (const required of [
      'parseRepairConfirmationReceipts(',
      'provisionLocalRepairJob({',
      'localRepairRecord: issuedLocalRepair.record',
      'settleRepairStorageHandoff({',
      'localRepair: handoff.localRepair',
    ]) {
      expect(server).toContain(required);
    }

    const provision = server.indexOf('provisionLocalRepairJob({');
    const store = server.indexOf('storeRepairJob(admin', provision);
    const handoff = server.indexOf('settleRepairStorageHandoff({');
    const response = server.indexOf('localRepair: handoff.localRepair');
    expect(provision).toBeGreaterThan(-1);
    expect(store).toBeGreaterThan(provision);
    expect(handoff).toBeGreaterThan(store);
    expect(response).toBeGreaterThan(handoff);
  });
});
