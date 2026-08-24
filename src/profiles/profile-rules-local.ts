/**
 * LOKALNI provider pravila profila (faza B, prijelazna dvojna putanja).
 *
 * Kad DEV okruzenje nema backend (npm run dev bez env varijabli, Playwright UX
 * suite), pravila se isporucuju iz lokalnih lazy chunkova (verified-profiles-heavy
 * + repair-map), isto kao prije rules-on-demand migracije. FAZA B3 (tvrdi rez):
 * wiring u app.ts gata granu s import.meta.env.DEV, pa je u produkcijskom buildu
 * cijeli ovaj modul (i heavy/repair-map chunkovi s njim) TREE-SHAKEAN iz dista;
 * bundleSizeGuard sada PADA ako se ti chunkovi ipak pojave.
 *
 * Testovi i skripte ga ne trebaju: oni idu kroz drafts-runtime/golden-entry
 * (eager merge) odnosno ensureRepairMapHeavy fallback u repairEntriesFor.
 */
import { setProfileRulesProvider } from './profile-registry';
import { ensureRepairMapHeavy, repairEntriesFor } from './profile-runtime-maps';
import type { VerifiedProfile } from './profile-schema';

export function installLocalRulesProvider(): void {
  setProfileRulesProvider(async (profileId) => {
    const mod = await import('../../data/profiles/verified-profiles-heavy.json');
    const heavy = ((mod as { default?: unknown }).default ?? mod) as Record<string, VerifiedProfile>;
    const full = heavy[profileId];
    if (!full) return { kind: 'failed', reason: 'nepoznat profil u lokalnom heavyju' };
    await ensureRepairMapHeavy();
    return {
      kind: 'ok',
      profile: full as unknown as Record<string, unknown>,
      repairEntries: repairEntriesFor(profileId),
    };
  });
}
