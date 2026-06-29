/**
 * Registar socioloskih metoda i njegov izvor (CLAUDE.md backlog 1 i 3).
 * Hidrira data/methodology/*.json. Tanak prolaz, bez logike.
 */
import rawMethods from '../../data/methodology/social-methods.json';
import rawSource from '../../data/methodology/social-method-source.json';
import type { SocialMethod, SourceRef } from '../profiles/profile-schema';

export const SOCIAL_METHOD_REGISTRY =
  rawMethods as unknown as Record<string, SocialMethod>;

export const SOCIAL_METHOD_SOURCE = rawSource as unknown as SourceRef;
