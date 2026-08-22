/**
 * Runner jednog sharda pune conformance matrice (NIJE .test. datoteka - ne kolektira se
 * direktno). Shard datoteke su dvolinijske: import + runConformanceShard(N, TOTAL).
 * Interleaved podjela (i % TOTAL) je u conformanceShardCases; vitest paralelizira po
 * datoteci pa 8 shardova dijeli ~850 analiza na ~30 s po datoteci.
 *
 * Jedinica matrice je (profil, vrsta rada), ne profil: profil s vise vrsta rada dobiva
 * jedan slucaj po vrsti (vidi allConformanceCases).
 */
import { describe, it } from 'vitest';
import { conformanceShardCases, expectConformanceCase } from '../helpers/conformance';

export function runConformanceShard(shard: number, totalShards: number): void {
  const cases = conformanceShardCases(shard, totalShards);
  describe(`conformance matrica shard ${shard}/${totalShards} (${cases.length} slucajeva)`, () => {
    for (const c of cases) {
      it(c.id, () => expectConformanceCase(c), 30000);
    }
  });
}
