/**
 * Meta statusa profila (data/profiles/profile-status.json), izdvojeno iz profile-registry
 * kako analyzeDocx i njegov Web Worker ne bi povlacili cijeli podatkovni korpus registra
 * (verificirani profili, katedre, draftovi) u worker bundle. profile-registry ga
 * re-exporta pa postojeci potrosaci ostaju netaknuti.
 */
import rawStatus from '../../data/profiles/profile-status.json';
import type { ProfileStatusKey, ProfileStatusMeta } from './profile-schema';

export const PROFILE_STATUS =
  rawStatus as unknown as Record<ProfileStatusKey, ProfileStatusMeta>;
