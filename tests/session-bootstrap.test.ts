// @vitest-environment node
/**
 * `formatBootstrap` je cista funkcija (korak 1 routinga): prima vec prikupljene ulaze i vraca
 * najvise 12 redaka. Ovaj test NIKAD ne pokrece git/gh/os; svi ulazi su podmetnuti, ukljucivo
 * slucaj kad `gh` nedostaje (null umjesto praznog niza), da bi test bio deterministican bez obzira
 * na okolinu u kojoj se vrti.
 */
import { describe, expect, it } from 'vitest';
import { countTestProcesses, formatBootstrap } from '../scripts/agents/session-bootstrap.mjs';

function baseInputs() {
  return {
    masterSha: 'f728020b',
    treeClean: true,
    openPrs: [],
    testProcessCount: 0,
    resources: { freeMemGb: 8, freeDiskGb: 100 },
    coordinator: { name: 'Fable', source: 'docs/agents/README.md' },
    readyUnownedTasks: [],
  };
}

describe('formatBootstrap: cista funkcija, bez modela', () => {
  it('vraca najvise 12 redaka za potpune ulaze', () => {
    const lines = formatBootstrap(baseInputs());
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.some((line) => line.includes('f728020b'))).toBe(true);
    expect(lines.some((line) => /model/i.test(line))).toBe(false);
  });

  it('gh nedostupan: prijavljuje to izricito, ne kao nula otvorenih PR-ova', () => {
    const lines = formatBootstrap({ ...baseInputs(), openPrs: null });
    expect(lines.some((line) => /gh nedostupan/i.test(line))).toBe(true);
  });

  it('gh dostupan, nula PR-ova: razlicita poruka od "gh nedostupan"', () => {
    const lines = formatBootstrap({ ...baseInputs(), openPrs: [] });
    expect(lines.some((line) => /nema otvorenih/i.test(line))).toBe(true);
    expect(lines.some((line) => /gh nedostupan/i.test(line))).toBe(false);
  });

  it('otvoreni PR-ovi se navode do ogranicenog pregleda, ne izgube se u sumi', () => {
    const openPrs = Array.from({ length: 5 }, (_, i) => ({ number: 100 + i, title: `PR ${i}` }));
    const lines = formatBootstrap({ ...baseInputs(), openPrs });
    const prLine = lines.find((line) => line.startsWith('PR-ovi otvoreni'));
    expect(prLine).toBeTruthy();
    expect(prLine).toMatch(/#100/);
    expect(prLine).toMatch(/\+2 jos/);
  });

  it('nepoznat broj testnih procesa i resursa ne rusi ostatak ispisa (fail-open)', () => {
    const lines = formatBootstrap({
      ...baseInputs(),
      testProcessCount: null,
      resources: null,
      coordinator: null,
      masterSha: null,
      treeClean: null,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines.some((line) => /nepoznato/i.test(line))).toBe(true);
  });

  it('zadaci ready bez ownera se imenuju', () => {
    const lines = formatBootstrap({
      ...baseInputs(),
      readyUnownedTasks: [{ id: 'T50', title: 'Primjer zadatka' }],
    });
    const taskLine = lines.find((line) => line.startsWith('zadaci ready bez ownera'));
    expect(taskLine).toBeTruthy();
    expect(taskLine).toMatch(/T50/);
  });

  it('bez ready zadataka bez ownera javlja "nema", ne prazan redak', () => {
    const lines = formatBootstrap(baseInputs());
    expect(lines.some((line) => /zadaci ready bez ownera: nema/.test(line))).toBe(true);
  });

  it('testProcessCount null: "nije izmjereno", ne lazna nula', () => {
    const lines = formatBootstrap({ ...baseInputs(), testProcessCount: null });
    expect(lines.some((line) => /testni procesi: nije izmjereno/.test(line))).toBe(true);
    expect(lines.some((line) => /testni procesi.*: 0/.test(line))).toBe(false);
  });

  it('testProcessCount 0: doslovna nula, razlicito od "nije izmjereno"', () => {
    const lines = formatBootstrap({ ...baseInputs(), testProcessCount: 0 });
    expect(lines.some((line) => /testni procesi \(vitest\/playwright\): 0/.test(line))).toBe(true);
    expect(lines.some((line) => /nije izmjereno/.test(line))).toBe(false);
  });

  it('testProcessCount broj: ispisuje tocan broj', () => {
    const lines = formatBootstrap({ ...baseInputs(), testProcessCount: 3 });
    expect(lines.some((line) => /testni procesi \(vitest\/playwright\): 3/.test(line))).toBe(true);
  });

  it('freeDiskGb null uz poznat freeMemGb: izostavlja samo disk polovicu, ne pada na "nepoznato"', () => {
    const lines = formatBootstrap({
      ...baseInputs(),
      resources: { freeMemGb: 8, freeDiskGb: null },
    });
    const resLine = lines.find((line) => line.startsWith('resursi'));
    expect(resLine).toBeTruthy();
    expect(resLine).toMatch(/8\.0 GB RAM/);
    expect(resLine).not.toMatch(/disk/);
  });

  it('freeMemGb null uz poznat freeDiskGb: izostavlja samo RAM polovicu', () => {
    const lines = formatBootstrap({
      ...baseInputs(),
      resources: { freeMemGb: null, freeDiskGb: 42 },
    });
    const resLine = lines.find((line) => line.startsWith('resursi'));
    expect(resLine).toBeTruthy();
    expect(resLine).toMatch(/42\.0 GB disk slobodno/);
    expect(resLine).not.toMatch(/RAM/);
  });

  it('freeDiskGb 0: doslovna nula, ne "nepoznato"', () => {
    const lines = formatBootstrap({
      ...baseInputs(),
      resources: { freeMemGb: 8, freeDiskGb: 0 },
    });
    const resLine = lines.find((line) => line.startsWith('resursi'));
    expect(resLine).toMatch(/0\.0 GB disk slobodno/);
  });
});

describe('countTestProcesses: parser za PowerShell/wmic CommandLine izlaz', () => {
  it('null/undefined ulaz (mjerenje nije uspjelo) vraca null, ne 0', () => {
    expect(countTestProcesses(null)).toBeNull();
    expect(countTestProcesses(undefined)).toBeNull();
  });

  it('prazan tekst (izmjereno, nula procesa) vraca 0', () => {
    expect(countTestProcesses('')).toBe(0);
  });

  it('broji retke koji spominju vitest ili playwright, ignorira nevezane node procese', () => {
    const output = [
      'C:\\Program Files\\nodejs\\node.exe C:\\Users\\PC\\Desktop\\Lekta\\node_modules\\.bin\\vitest run',
      'node.exe /path/to/vitest/dist/cli.js run tests/foo.test.ts',
      'node.exe node_modules/.bin/playwright test',
      'node.exe scripts/agents/session-bootstrap.mjs',
    ].join('\n');
    expect(countTestProcesses(output)).toBe(3);
  });

  it('CommandLine podudaranje je case-insensitive', () => {
    expect(countTestProcesses('node VITEST run')).toBe(1);
  });
});
