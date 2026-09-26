// @vitest-environment node
/**
 * `formatBootstrap` je cista funkcija (korak 1 routinga): prima vec prikupljene ulaze i vraca
 * najvise 12 redaka. Ovaj test NIKAD ne pokrece git/gh/os; svi ulazi su podmetnuti, ukljucivo
 * slucaj kad `gh` nedostaje (null umjesto praznog niza), da bi test bio deterministican bez obzira
 * na okolinu u kojoj se vrti.
 */
import { describe, expect, it } from 'vitest';
import { formatBootstrap } from '../scripts/agents/session-bootstrap.mjs';

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
});
