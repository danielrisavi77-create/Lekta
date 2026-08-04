/**
 * Lekta Control Center: centralni state, obican objekt + eksplicitne funkcije (repo nema
 * framework/store; isti imperativni idiom kao src/ui/app.ts). Bez DOM-a, testabilno u izolaciji.
 */

import { SECTION_IDS, type Period, type SectionId, type SectionStatsMap } from './admin-types';

export type SlotStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SectionSlot<K extends SectionId> {
  status: SlotStatus;
  data?: SectionStatsMap[K];
  message?: string;
  fetchedAt?: number;
}

export type SectionSlots = { [K in SectionId]: SectionSlot<K> };

export interface AdminState {
  period: Period;
  section: SectionId;
  token: string;
  slots: SectionSlots;
}

/**
 * TS ne zna suziti SectionSlots[id] preko generickog (ne-literalnog) `id: SectionId` u petlji -
 * poznato ogranicenje mapiranih tipova. Vrijednost je stvarno jednaka za svaki K (samo
 * {status:'idle'}), pa je jedan named cast ovdje ispravniji i citljiviji od ponavljanja `as` na
 * svakom pozivnom mjestu.
 */
function resetSlot(slots: SectionSlots, id: SectionId): void {
  (slots as Record<SectionId, SectionSlot<SectionId>>)[id] = { status: 'idle' };
}

export function createInitialState(): AdminState {
  const slots = {} as SectionSlots;
  for (const id of SECTION_IDS) resetSlot(slots, id);
  return { period: { kind: '7d' }, section: 'overview', token: '', slots };
}

/** Prebacivanje tabova naprijed-natrag unutar ovog prozora ne re-fetcha. */
export const SLOT_FRESH_MS = 60_000;

export function isSlotFresh<K extends SectionId>(slot: SectionSlot<K>, now: number = Date.now()): boolean {
  return slot.status === 'ready' && typeof slot.fetchedAt === 'number' && now - slot.fetchedAt < SLOT_FRESH_MS;
}

/** Promjena perioda nevaljanim cini SVE sekcije (ne samo aktivnu) da sljedeci prelazak taba odmah re-fetcha. */
export function invalidateAllSlots(state: AdminState): void {
  for (const id of SECTION_IDS) resetSlot(state.slots, id);
}
