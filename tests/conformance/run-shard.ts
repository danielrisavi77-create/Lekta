/**
 * Runner jednog sharda pune conformance matrice (NIJE .test. datoteka - ne kolektira se
 * direktno). Shard datoteke su dvolinijske: import + runConformanceShard(N, TOTAL).
 * Interleaved podjela (i % TOTAL) je u conformanceShardIds; vitest paralelizira po
 * datoteci pa 8 shardova dijeli ~744 analize na ~30 s po datoteci.
 */
import { describe, it } from 'vitest';
import { conformanceShardIds, expectProfileConformance } from '../helpers/conformance';

export function runConformanceShard(shard: number, totalShards: number): void {
  const ids = conformanceShardIds(shard, totalShards);
  describe(`conformance matrica shard ${shard}/${totalShards} (${ids.length} profila)`, () => {
    for (const profileId of ids) {
      it(profileId, () => expectProfileConformance(profileId), 30000);
    }
  });
}
