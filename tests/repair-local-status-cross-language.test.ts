import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromBase64Url, sha256Hex } from '../src/repair/contract/index.ts';
import {
  recordLocalRepairStatus,
  type LocalRepairState,
  type LocalRepairStatusEvent,
  type LocalRepairStatusInput,
} from '../src/repair/local-runner/status-service.ts';

interface WordReplicaStatusFixture {
  producer: string;
  jobId: string;
  devicePublicKeySpki: string;
  deviceKeySha256: string;
  events: LocalRepairStatusInput[];
}

const NEXT_STATE: Record<LocalRepairStatusEvent, LocalRepairState> = {
  processing: 'processing',
  heartbeat: 'processing',
  retryable: 'retryable',
  completed: 'completed',
  local_failed: 'local_failed',
};

function transitionAllowed(
  current: LocalRepairState,
  event: LocalRepairStatusEvent,
): boolean {
  return (current === 'claimed' && event === 'processing')
    || (current === 'processing' && ['heartbeat', 'retryable', 'completed', 'local_failed'].includes(event))
    || (current === 'retryable' && event === 'processing');
}

describe('WordReplica Python -> Lekta status protocol', () => {
  it('accepts the exact signed lifecycle emitted by the Python runner', async () => {
    const fixturePath = resolve(
      process.cwd(), 'tests/fixtures/repair-local-status-v1/wordreplica-python.json',
    );
    const fixture = JSON.parse(
      await readFile(fixturePath, 'utf8'),
    ) as WordReplicaStatusFixture;

    expect(fixture.producer).toBe(
      'word_replica.runner.lekta_status.build_signed_local_repair_status',
    );
    expect(await sha256Hex(fromBase64Url(fixture.devicePublicKeySpki)))
      .toBe(fixture.deviceKeySha256);

    let localState: LocalRepairState = 'claimed';
    let sequence = 0;
    const accepted: LocalRepairStatusEvent[] = [];

    for (const event of fixture.events) {
      const result = await recordLocalRepairStatus(event, {
        now: () => new Date(event.occurredAt),
        loadBinding: async () => ({
          jobId: fixture.jobId,
          localState,
          devicePublicKeySpki: fixture.devicePublicKeySpki,
          deviceKeySha256: fixture.deviceKeySha256,
        }),
        advanceAtomic: async (atomicEvent) => {
          if (atomicEvent.jobId !== fixture.jobId
            || atomicEvent.deviceKeySha256 !== fixture.deviceKeySha256
            || atomicEvent.sequence !== sequence + 1
            || !transitionAllowed(localState, atomicEvent.event)) return null;
          sequence = atomicEvent.sequence;
          localState = NEXT_STATE[atomicEvent.event];
          accepted.push(atomicEvent.event);
          return { localState, sequence };
        },
      });
      expect(result).toEqual({
        ok: true,
        jobId: fixture.jobId,
        localState,
        sequence,
      });
    }

    expect(accepted).toEqual([
      'processing',
      'heartbeat',
      'retryable',
      'processing',
      'completed',
    ]);
  });
});
