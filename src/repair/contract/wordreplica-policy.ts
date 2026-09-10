import type { FixerId } from '../apply-fixers.ts';
import { CONTRACT_FIXER_IDS } from './request-policy.ts';

export const WORDREPLICA_0_1_0_ENGINE_VERSION = '0.1.0' as const;

/**
 * WordReplica rekonstruira vec generirani, potpisani target. Zato je njegova portable
 * sposobnost jednaka ugovorno dopustenom registru, a ne podskupu fixera iz jednog fixturea.
 */
export const WORDREPLICA_0_1_0_FIXER_IDS: readonly Exclude<FixerId, 'footer-page-fixer'>[] =
  Object.freeze([...CONTRACT_FIXER_IDS]);

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Tripwire: novi ugovorni fixer zahtijeva novu WordReplica engine verziju/policy odluku. */
export const WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT = fnv1a32(
  WORDREPLICA_0_1_0_FIXER_IDS.join('\n'),
);

if (WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT !== '89791f7f') {
  throw new Error('WordReplica 0.1.0 fixer registry changed; publish a new engine policy version.');
}

const WORDREPLICA_0_1_0_FIXER_SET = new Set<string>(WORDREPLICA_0_1_0_FIXER_IDS);

export function wordReplicaSupportsFixer(engineVersion: string, fixerId: string): boolean {
  return engineVersion === WORDREPLICA_0_1_0_ENGINE_VERSION
    && WORDREPLICA_0_1_0_FIXER_SET.has(fixerId);
}
