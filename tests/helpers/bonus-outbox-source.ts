/**
 * Izvor modula nagrade bonus outboxa za staticke mutacije. Odvojeno od monetizacija-mutations.ts da
 * tests/gate-mutations.test.ts ne povuce PGlite (T106).
 */
import { resolve } from 'node:path';
import { readTextLf } from './naplata-env';

export function bonusOutboxModuleSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'process-bonus-outbox', 'referrer-reward.ts'));
}
