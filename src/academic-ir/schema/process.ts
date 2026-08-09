import type { PersistenceClass } from './common';

export interface ProcessGraph {
  events: ProcessEvent[];
}

export interface ProcessEvent {
  id: string;
  type:
    | 'version-created'
    | 'decision-recorded'
    | 'mentor-feedback-recorded'
    | 'revision-recorded'
    | 'user-action'
    | 'verification-recorded';
  occurredAt: string;
  targetIds?: string[];
  relatedEventIds?: string[];
  persistence: PersistenceClass;
  metadata?: Record<string, unknown>;
}
