// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve('scripts/agents/control-plane-cli.mjs');

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.LEKTA_CONTROL_PLANE_URL;
  delete env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN;
  delete env.LEKTA_GLOBAL_LEASE_TOKEN;
  delete env.LEKTA_GLOBAL_LEASE_ID;
  delete env.LEKTA_GLOBAL_LEASE_ENFORCED;
  delete env.LEKTA_SESSION_NAME;
  delete env.LEKTA_GLOBAL_LEASE_BASE_SHA;
  return env;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: resolve('.'),
    env: cleanEnv(),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('agents:lease CLI boundary', () => {
  it('help je offline i dokumentira heartbeat/claim/validate/expand/release', () => {
    const result = run(['help']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('agents:lease heartbeat');
    expect(result.stdout).toContain('agents:lease claim T01');
    expect(result.stdout).toContain('agents:lease validate T01');
    expect(result.stdout).toContain('agents:lease expand T01');
    expect(result.stdout).toContain('agents:lease release');
  });

  it('mrezna operacija bez konfiguracije pada prije bilo kakvog zahtjeva', () => {
    const result = run(['health']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[agents:lease]');
    expect(result.stderr).toContain('LEKTA_CONTROL_PLANE_URL');
  });

  it('nevaljan machine pada prije potrebe za backendom', () => {
    const result = run([
      'register',
      '--session', 'lekta-03',
      '--machine', 'toaster',
      '--role', 'implementer',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Nepoznat --machine');
    expect(result.stderr).not.toContain('LEKTA_CONTROL_PLANE_URL');
  });

  it('nevaljan session name pada lokalno', () => {
    const result = run(['heartbeat', '--session', 'lekta 03']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sessionName nije valjan');
    expect(result.stderr).not.toContain('LEKTA_CONTROL_PLANE_URL');
  });

  it('nepoznata naredba pada bez mreze', () => {
    const result = run(['explode']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Nepoznata agents:lease naredba');
  });
});
