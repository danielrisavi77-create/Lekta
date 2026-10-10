// DAN-80: vitest je izdvojen iz `build-gate` u shardove. Ova provjera cuva da podjela ne izgubi
// nijedan korak gatea. Cista funkcija nad tekstom, da je mutacije mogu obarati izravno.
import { parse } from 'yaml';

interface Step { name?: string; run?: string; uses?: string }
interface Job {
  if?: string;
  needs?: string | string[];
  strategy?: { matrix?: { node?: number[]; shard?: number[] } };
  steps?: Step[];
}

export function findGateSplitProblems(pkgScripts: Record<string, string>, checkYml: string): string[] {
  const problems: string[] = [];
  const inner = pkgScripts['check:inner'] ?? '';
  const staticInner = pkgScripts['check:static:inner'] ?? '';
  if (!inner.includes(' && vitest run')) problems.push('check:inner nema korak vitest run');
  if (staticInner !== inner.replace(' && vitest run', '')) {
    problems.push('check:static:inner nije check:inner bez vitest run (lanci su se razisli)');
  }
  if (/vitest run/.test(staticInner)) problems.push('check:static:inner sadrzi vitest');
  if (pkgScripts['check:static'] !== 'node scripts/with-gate-lock.mjs check-static -- npm run check:static:inner') {
    problems.push('check:static ne ide kroz with-gate-lock');
  }

  const jobs = (parse(checkYml) as { jobs?: Record<string, Job> }).jobs ?? {};
  const buildGate = jobs['build-gate'];
  const runs = (buildGate?.steps ?? []).map((s) => s.run ?? '');
  if (!runs.includes('npm run check:static')) problems.push('build-gate ne pokrece npm run check:static');
  if (runs.includes('npm run check')) problems.push('build-gate jos pokrece puni npm run check (dupli vitest)');

  const shard = jobs['vitest-shard'];
  const node = shard?.strategy?.matrix?.node ?? [];
  const shards = shard?.strategy?.matrix?.shard ?? [];
  if (!node.includes(20) || !node.includes(24)) problems.push('vitest-shard ne pokriva Node 20 i 24');
  if (shards.length < 2) problems.push('vitest-shard nema vise shardova');
  const expected = Array.from({ length: shards.length }, (_, i) => i + 1);
  if (JSON.stringify(shards) !== JSON.stringify(expected)) problems.push('shardovi nisu 1..N bez rupa');
  const shardRun = (shard?.steps ?? []).map((s) => s.run ?? '').join('\n');
  if (!shardRun.includes(`--shard=\${{ matrix.shard }}/${shards.length}`)) {
    problems.push('nazivnik --shard=i/N ne odgovara broju shardova u matrici');
  }
  if (shard?.if) problems.push('vitest-shard ima if uvjet (mora raditi i na push i na merge_group)');

  const gate = jobs['vitest-gate'];
  if (!gate) problems.push('nema vitest-gate agregata');
  else {
    if (gate.if !== 'always()') problems.push('vitest-gate nema if: always() (preskocen shard bi prosao)');
    const needs = Array.isArray(gate.needs) ? gate.needs : [gate.needs];
    if (!needs.includes('vitest-shard')) problems.push('vitest-gate ne ovisi o vitest-shard');
    const gateRun = (gate.steps ?? []).map((s) => s.run ?? '').join('\n');
    if (!/test "\$SHARD_RESULT" = "success"/.test(gateRun)) problems.push('vitest-gate ne trazi rezultat success');
  }
  return problems;
}
