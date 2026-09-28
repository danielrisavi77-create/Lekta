/**
 * Scenariji za `weakMachineWorkerEnv` (pravilo vlasnika 2026-09-28, ROUTING.md "Teski poslovi na
 * laptopu"). Gard vraca popis problema; prazan popis je cisto. Mutacije su u
 * `tests/gate-mutations.test.ts`.
 */
import { GB } from '../../scripts/gate-preflight.mjs';

type WorkerEnvFn = (input: {
  cpus: number | null;
  totalMemBytes: number | null;
  env: Record<string, string | undefined>;
}) => Record<string, string> | null;

const SET = { VITEST_MAX_THREADS: '1' };

export const WEAK_MACHINE_SCENARIOS: ReadonlyArray<{
  name: string;
  input: Parameters<WorkerEnvFn>[0];
  expected: Record<string, string> | null;
}> = [
  { name: 'jak stroj (8 jezgri, 16 GB): ne dira', input: { cpus: 8, totalMemBytes: 16 * GB, env: {} }, expected: null },
  { name: 'laptop (4 niti, 8 GB): postavlja 1', input: { cpus: 4, totalMemBytes: 8 * GB, env: {} }, expected: SET },
  { name: 'tocno 4 jezgre uz 32 GB: postavlja 1', input: { cpus: 4, totalMemBytes: 32 * GB, env: {} }, expected: SET },
  { name: '8 jezgri uz 8 GB: postavlja 1', input: { cpus: 8, totalMemBytes: 8 * GB, env: {} }, expected: SET },
  { name: 'tocno 12 GB uz 8 jezgri: ne dira', input: { cpus: 8, totalMemBytes: 12 * GB, env: {} }, expected: null },
  { name: 'slab stroj, VITEST_MAX_THREADS vec 3: ne dira', input: { cpus: 4, totalMemBytes: 8 * GB, env: { VITEST_MAX_THREADS: '3' } }, expected: null },
  { name: 'slab stroj na CI-ju: ne dira', input: { cpus: 4, totalMemBytes: 8 * GB, env: { CI: 'true' } }, expected: null },
  { name: 'nemjerljivo (null): ne dira', input: { cpus: null, totalMemBytes: null, env: {} }, expected: null },
];

export function weakMachineProblems(fn: WorkerEnvFn): string[] {
  const out: string[] = [];
  for (const { name, input, expected } of WEAK_MACHINE_SCENARIOS) {
    const got = fn(input);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      out.push(`${name}: dobiveno ${JSON.stringify(got)}, ocekivano ${JSON.stringify(expected)}`);
    }
  }
  return out;
}

/** Omotac mora primijeniti presudu na env djeteta i ispisati tocno jedan redak. */
export function weakMachineWiringProblems(wrapperSource: string): string[] {
  const src = wrapperSource.replace(/\r\n?/g, '\n');
  const out: string[] = [];
  if (!/weakMachineWorkerEnv\(\{ \.\.\.measureMachine\(\), env: childEnv \}\)/.test(src)) {
    out.push('with-gate-lock: presuda se ne racuna nad env-om djeteta');
  }
  if (!src.includes('Object.assign(childEnv, workers)')) out.push('with-gate-lock: presuda se ne primjenjuje na dijete');
  if ((src.match(/preflight: slab stroj, VITEST_MAX_THREADS=1/g) ?? []).length !== 1) {
    out.push('with-gate-lock: redak "preflight: slab stroj, VITEST_MAX_THREADS=1" mora postojati tocno jednom');
  }
  const decide = src.indexOf('weakMachineWorkerEnv(');
  const spawnAt = src.indexOf('spawn(joinCommand');
  if (decide === -1 || spawnAt === -1 || decide > spawnAt) out.push('with-gate-lock: presuda mora biti prije pokretanja djeteta');
  return out;
}
