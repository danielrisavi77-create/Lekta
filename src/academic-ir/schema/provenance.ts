import type { PersistenceClass } from './common';

export interface ProvenanceGraph {
  events: ProvenanceEvent[];
}

export interface ProvenanceEvent {
  id: string;
  actor:
    | { type: 'human'; actorId?: string }
    | { type: 'machine'; provider?: string; model?: string }
    | { type: 'system'; system: string };
  action:
    | 'created'
    | 'edited'
    | 'suggested'
    | 'accepted'
    | 'rejected'
    | 'verified'
    | 'generated'
    | 'executed';
  targetIds: string[];
  occurredAt: string;
  inputDigest?: string;
  outputDigest?: string;
  persistence: PersistenceClass;
  metadata?: Record<string, unknown>;
}
